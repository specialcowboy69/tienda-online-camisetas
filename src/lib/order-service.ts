import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { buildOrderItems, calculateTotals, createDraftOrder, priceCustomerShippingRate } from "./checkout-calculator";
import { CheckoutValidationError, evaluatePaidCheckout, getPrintfulSubmissionEligibility } from "./checkout-validation";
import {
  beginWebhookEventProcessing,
  claimOrderProcessing,
  createOrder,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  findOrderByStripePaymentIntentId,
  getCatalogProduct,
  getOrder,
  releaseOrderProcessing,
  renewOrderProcessing,
  updateClaimedOrder,
  updateOrder,
  updateOrderStatus
} from "./firestore";
import { jsonError, summarizeError } from "./http";
import { assertSameCurrency } from "./money";
import { createPrintfulOrder, findPrintfulOrderByExternalId, getPrintfulExternalId, getShippingRates, PrintfulApiError } from "./printful";
import { createStripeCheckoutSession, getStripe } from "./stripe";
import { assertAllowedCountry } from "./validation";
import { sendOrderConfirmationEmail } from "./email";
import { isStripeTaxEnabled, requiredEnv } from "./env";
import { CartItemInput, Recipient, ShippingRate, StoreOrder } from "./types";
import { ProcessingBusyError, ProcessingOwnershipLostError } from "./processing-errors";

export async function quoteShipping(input: { recipient: Recipient; items: CartItemInput[] }): Promise<ShippingRate[]> {
  assertAllowedCountry(input.recipient.countryCode);
  const products = await loadProductsForCart(input.items);
  const orderItems = buildOrderItems(input.items, products);
  assertSameCurrency(orderItems.map((item) => item.currency));
  const shippingRates = await getShippingRates(input.recipient, orderItems);
  return shippingRates.map((rate) => priceCustomerShippingRate(rate, input.recipient.countryCode));
}

export async function createCheckout(input: {
  recipient: Recipient;
  items: CartItemInput[];
  shippingRateId: string;
}): Promise<{ order: StoreOrder; checkoutUrl: string }> {
  assertAllowedCountry(input.recipient.countryCode);

  const products = await loadProductsForCart(input.items);
  const orderItems = buildOrderItems(input.items, products);
  assertSameCurrency(orderItems.map((item) => item.currency));
  const shippingRates = await getShippingRates(input.recipient, orderItems);
  const customerShippingRates = shippingRates.map((rate) => priceCustomerShippingRate(rate, input.recipient.countryCode));
  const selectedShippingRate = customerShippingRates.find((rate) => rate.id === input.shippingRateId);

  if (!selectedShippingRate) {
    throw new Error("Selected shipping rate is no longer available.");
  }

  const totals = calculateTotals(orderItems, selectedShippingRate);
  const order = createDraftOrder({
    recipient: input.recipient,
    items: orderItems,
    shippingRate: selectedShippingRate,
    totals
  });

  await createOrder(order);
  const session = await createStripeCheckoutSession(order);

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  await updateOrder(order.id, {
    status: "checkout_created",
    stripeSessionId: session.id
  });

  return {
    order: { ...order, status: "checkout_created", stripeSessionId: session.id },
    checkoutUrl: session.url
  };
}

export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  if (!signature) {
    return jsonError(new Error("Missing Stripe signature."), 400);
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (error) {
    return jsonError(error, 400);
  }

  const claim = await beginWebhookEventProcessing("stripe", event.id, event);
  if (claim.kind === "processed") {
    return Response.json({ received: true, duplicate: true });
  }
  if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutUnpaid(session, "failed");
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutUnpaid(session, "expired");
    }

    if (event.type === "charge.refunded" || event.type === "refund.updated") {
      await handleRefundEvent(event);
    }

    if (!await finishWebhookEventProcessing("stripe", event.id, claim.lease.token)) throw new ProcessingOwnershipLostError();
    return Response.json({ received: true });
  } catch (error) {
    if (!await failWebhookEventProcessing("stripe", event.id, claim.lease.token, summarizeError(error))) throw new ProcessingOwnershipLostError();
    throw error;
  }
}

export async function submitOrderToPrintful(orderId: string): Promise<StoreOrder> {
  return withOrderProcessing(orderId, submitClaimedOrderToPrintful);
}

async function withOrderProcessing<T>(orderId: string, work: (order: StoreOrder, token: string) => Promise<T>): Promise<T> {
  const claim = await claimOrderProcessing(orderId);
  if (claim.kind === "missing") throw new Error(`Order ${orderId} not found.`);
  if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);
  const token = claim.lease.token;
  try {
    // Claim value is a snapshot. Read again before making business decisions.
    const order = await getOrder(orderId);
    if (!order) throw new Error(`Order ${orderId} not found.`);
    return await work(order, token);
  } finally {
    if (!await releaseOrderProcessing(orderId, token)) throw new ProcessingOwnershipLostError();
  }
}

async function renewOrderOwnership(orderId: string, token: string): Promise<void> {
  if (!await renewOrderProcessing(orderId, token)) throw new ProcessingOwnershipLostError();
}

async function writeClaimedOrder(orderId: string, token: string, patch: Parameters<typeof updateClaimedOrder>[2]): Promise<void> {
  if (!await updateClaimedOrder(orderId, token, patch)) throw new ProcessingOwnershipLostError();
}

async function submitClaimedOrderToPrintful(order: StoreOrder, token: string): Promise<StoreOrder> {
  if (order.printfulOrderId) return order;
  const eligibility = getPrintfulSubmissionEligibility(order);
  if (!eligibility.allowed) {
    throw new CheckoutValidationError(eligibility.reason, eligibility.message);
  }
  const externalId = getPrintfulExternalId(order);
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(externalId)) {
    const error = { type: "PrintfulExternalIdInvalid", message: "The persisted Printful identity requires manual review." };
    await writeClaimedOrder(order.id, token, { status: "manual_review", error });
    return { ...order, status: "manual_review", error };
  }
  await writeClaimedOrder(order.id, token, { status: "printful_pending", printfulExternalId: externalId });
  const pending: StoreOrder = { ...order, status: "printful_pending", printfulExternalId: externalId };
  let remote: Awaited<ReturnType<typeof createPrintfulOrder>> | null;

  // An unavailable lookup never authorizes creation. Only the provider helper's
  // explicit HTTP404/null does; recovery always uses the same persisted ID.
  try {
    await renewOrderOwnership(order.id, token);
    remote = await findPrintfulOrderByExternalId(externalId);
  } catch (error) {
    if (error instanceof ProcessingOwnershipLostError) throw error;
    await writeClaimedOrder(order.id, token, { error: summarizeError(error) });
    throw error;
  }
  if (!remote) {
    await renewOrderOwnership(order.id, token);
    try {
      // Task5 adds authoritative refund reconciliation and the eligibility veto
      // here, under this same held lease, immediately before fresh creation.
      remote = await createPrintfulOrder(pending);
    } catch (error) {
      // HTTP400 can be OR-13/EXTERNAL_ID_IN_USE. Read-only reconciliation is
      // safe after any create rejection, including timeout/network/5xx/409.
      await renewOrderOwnership(order.id, token);
      try {
        remote = await findPrintfulOrderByExternalId(externalId);
      } catch (lookupError) {
        await writeClaimedOrder(order.id, token, { error: summarizeError(lookupError) });
        throw lookupError;
      }
      if (!remote) {
        const definitiveRejection = error instanceof PrintfulApiError && !error.isTemporary && !error.isDuplicateExternalId;
        const status = definitiveRejection ? "manual_review" : "printful_pending";
        const summary = summarizeError(error);
        await writeClaimedOrder(order.id, token, { status, error: summary });
        if (!definitiveRejection) throw error;
        return { ...pending, status, error: summary };
      }
    }
  }
  // Deliberately await completion outside the create-recovery catch. Database
  // and email failures must never be mislabeled as a rejected Printful create.
  return await finishPrintfulOrder(pending, token, remote);
}

async function finishPrintfulOrder(
  order: StoreOrder,
  token: string,
  printfulOrder: { id: number; status: string; external_id?: string }
): Promise<StoreOrder> {
  if (printfulOrder.external_id !== order.printfulExternalId) {
    const error = { type: "PrintfulIdentityMismatch", message: "Printful returned an order with a different or missing external identity." };
    await writeClaimedOrder(order.id, token, { status: "manual_review", error });
    return { ...order, status: "manual_review", error };
  }
  const needsReview = ["canceled", "failed"].includes(printfulOrder.status);
  const status = needsReview ? "manual_review" : "printful_confirmed";
  await writeClaimedOrder(order.id, token, {
    status,
    error: needsReview ? { type: "PrintfulRemoteStatusReview", message: `Printful reports this order as ${printfulOrder.status}. Review fulfillment before continuing.` } : FieldValue.delete(),
    printfulOrderId: printfulOrder.id,
    printfulExternalId: order.printfulExternalId,
    printfulStatus: printfulOrder.status
  });

  const updated = await getOrder(order.id);
  if (updated) {
    if (!needsReview) {
      await renewOrderOwnership(order.id, token);
      // Task4 replaces this non-durable dispatch with an atomic email job.
      await sendOrderConfirmationEmail(updated);
    }
    return updated;
  }

  return order;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) {
    throw new Error("Stripe Checkout Session is missing order_id metadata.");
  }

  await withOrderProcessing(orderId, async (order, token) => {
    if (order.printfulOrderId || ["printful_confirmed", "shipped", "returned", "manual_review", "canceled", "refunded", "expired"].includes(order.status)) return;
    if (order.status === "failed" && !getPrintfulSubmissionEligibility(order).allowed) return;
    const validation = evaluatePaidCheckout(order, session, { source: "stripe_webhook", stripeTaxEnabled: isStripeTaxEnabled(), validatedAt: new Date().toISOString() });
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const correlation = {
      stripeSessionId: session.id,
      stripePaymentIntentId: order.stripePaymentIntentId || paymentIntentId,
      stripeAmountTotal: session.amount_total ?? undefined,
      stripeTaxAmount: session.total_details?.amount_tax ?? 0
    };
    if (!validation.valid) {
      if (validation.reason === "PaymentNotCompleted" && session.payment_status !== "paid") {
        await writeClaimedOrder(order.id, token, correlation);
        return;
      }
      await writeClaimedOrder(order.id, token, {
        status: "manual_review",
        ...(validation.reason === "SessionMismatch" ? {} : correlation),
        error: { type: validation.reason, message: validation.message }
      });
      return;
    }

    if (order.status === "printful_pending") {
      // Recovery still requires the proof and identity persisted before the
      // interrupted attempt; a new paid event cannot manufacture that proof.
      await submitClaimedOrderToPrintful(order, token);
      return;
    }

    const patch = {
      status: "paid" as const,
      ...correlation,
      checkoutValidation: validation.evidence
    };
    await writeClaimedOrder(order.id, token, patch);
    await submitClaimedOrderToPrintful({ ...order, ...patch }, token);
  });
}

async function handleCheckoutUnpaid(session: Stripe.Checkout.Session, status: "failed" | "expired"): Promise<void> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return;
  await withOrderProcessing(orderId, async (order, token) => {
    const references = [session.metadata?.order_id, session.client_reference_id].filter((value) => value != null);
    if (session.id !== order.stripeSessionId || references.some((value) => value !== order.id)
      || order.printfulOrderId || !["draft", "checkout_created"].includes(order.status)) return;
    await writeClaimedOrder(order.id, token, {
      status,
      ...(status === "failed" ? { error: { type: "StripeAsyncPaymentFailed", message: "Stripe reported that an asynchronous payment failed." } } : {})
    });
  });
}

export async function revalidatePaidCheckout(orderId: string): Promise<StoreOrder> {
  return withOrderProcessing(orderId, async (order, token) => {
    if (!order.stripeSessionId) {
      throw new CheckoutValidationError("SessionMismatch", "The order has no persisted Stripe Checkout session to revalidate.");
    }
    await renewOrderOwnership(order.id, token);
    const session = await retrieveCheckoutWithinDeadline(order.stripeSessionId);
    const validation = evaluatePaidCheckout(order, session, { source: "admin_revalidation", stripeTaxEnabled: isStripeTaxEnabled(), validatedAt: new Date().toISOString() });
    if (!validation.valid) throw new CheckoutValidationError(validation.reason, validation.message);
    const patch = {
      checkoutValidation: validation.evidence,
      stripePaymentIntentId: validation.evidence.stripePaymentIntentId,
      stripeAmountTotal: validation.evidence.paidAmount,
      stripeTaxAmount: validation.evidence.taxAmount
    };
    await writeClaimedOrder(order.id, token, patch);
    return { ...order, ...patch };
  });
}

async function retrieveCheckoutWithinDeadline(sessionId: string): Promise<Stripe.Checkout.Session> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Stripe Checkout revalidation exceeded its read deadline.");
      error.name = "StripeReadDeadlineExceeded";
      reject(error);
    }, 20000);
  });
  try {
    // This bounds our wait; it does not cancel the SDK transport. A late read
    // cannot resume this caller or authorize a fenced evidence write.
    return await Promise.race([
      getStripe().checkout.sessions.retrieve(sessionId, { timeout: 20000, maxNetworkRetries: 0 }),
      deadline
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function handleRefundEvent(event: Stripe.Event): Promise<void> {
  const stripeObject = event.data.object as { metadata?: { order_id?: string }; payment_intent?: string };
  let orderId = stripeObject.metadata?.order_id;

  if (!orderId && stripeObject.payment_intent) {
    const order = await findOrderByStripePaymentIntentId(stripeObject.payment_intent);
    orderId = order?.id;
  }

  if (orderId) {
    await updateOrderStatus(orderId, "refunded");
  }
}

async function loadProductsForCart(items: CartItemInput[]) {
  const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
  const products = await Promise.all(uniqueProductIds.map((productId) => getCatalogProduct(productId)));

  return products.map((product, index) => {
    if (!product) {
      throw new Error(`Product ${uniqueProductIds[index]} is not available.`);
    }
    return product;
  });
}
