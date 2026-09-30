import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { buildOrderItems, calculateTotals, createDraftOrder, priceCustomerShippingRate } from "./checkout-calculator";
import { CheckoutValidationError, evaluatePaidCheckout, getPrintfulSubmissionEligibility } from "./checkout-validation";
import {
  beginWebhookEventProcessing,
  claimOrderProcessing,
  completeClaimedFulfillment,
  createOrder,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  getCatalogProduct,
  getOrder,
  listOrderEmailJobs,
  releaseOrderProcessing,
  renewOrderProcessing,
  renewWebhookEventProcessing,
  updateClaimedOrder,
  updateOrder
} from "./firestore";
import { jsonError, summarizeError } from "./http";
import { assertSameCurrency } from "./money";
import { createPrintfulOrder, findPrintfulOrderByExternalId, getPrintfulExternalId, getShippingRates, PrintfulApiError } from "./printful";
import { createStripeCheckoutSession, getStripe } from "./stripe";
import { assertAllowedCountry } from "./validation";
import { buildEmailJob, processEmailJob, requireEmailRecovery, retryOrderEmails } from "./email-jobs";
import { isStripeTaxEnabled, requiredEnv } from "./env";
import { CartItemInput, Recipient, ShippingRate, StoreOrder } from "./types";
import { ProcessingBusyError, ProcessingOwnershipLostError } from "./processing-errors";
import { handleStripeRefundEvent, reconcileOrderRefunds } from "./refund-service";

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
  const checkpoint = async () => {
    if (!await renewWebhookEventProcessing("stripe", event.id, claim.lease.token)) throw new ProcessingOwnershipLostError();
  };

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session, checkpoint);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutUnpaid(session, "failed");
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutUnpaid(session, "expired");
    }

    if (["charge.refunded", "refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
      await handleStripeRefundEvent(event, checkpoint);
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

async function submitClaimedOrderToPrintful(order: StoreOrder, token: string, checkpoint?: () => Promise<void>): Promise<StoreOrder> {
  const renewOwnership = async () => { await checkpoint?.(); await renewOrderOwnership(order.id, token); };
  await renewOwnership();
  if (order.printfulOrderId) {
    await recoverExistingOrderEmails(order, token, checkpoint);
    return order;
  }
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
    await renewOwnership();
    remote = await findPrintfulOrderByExternalId(externalId);
    await renewOwnership();
  } catch (error) {
    if (error instanceof ProcessingOwnershipLostError) throw error;
    await writeClaimedOrder(order.id, token, { error: summarizeError(error) });
    throw error;
  }
  if (!remote) {
    const refundSummary = await reconcileOrderRefunds(pending, token, checkpoint);
    const financialEligibility = getPrintfulSubmissionEligibility({ ...pending, refundSummary, refundReviewReason: undefined });
    if (!financialEligibility.allowed) throw new CheckoutValidationError(financialEligibility.reason, financialEligibility.message);
    await renewOwnership();
    try {
      // A Dashboard refund can still race this remote request; the shared local
      // lease serializes our workers, not Stripe/Printful provider operations.
      remote = await createPrintfulOrder(pending);
    } catch (error) {
      // HTTP400 can be OR-13/EXTERNAL_ID_IN_USE. Read-only reconciliation is
      // safe after any create rejection, including timeout/network/5xx/409.
      await renewOwnership();
      try {
        remote = await findPrintfulOrderByExternalId(externalId);
        await renewOwnership();
      } catch (lookupError) {
        if (lookupError instanceof ProcessingOwnershipLostError) throw lookupError;
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
  await renewOwnership();
  return await finishPrintfulOrder(pending, token, remote, checkpoint);
}

async function finishPrintfulOrder(
  order: StoreOrder,
  token: string,
  printfulOrder: { id: number; status: string; external_id?: string },
  checkpoint?: () => Promise<void>
): Promise<StoreOrder> {
  if (printfulOrder.external_id !== order.printfulExternalId) {
    const error = { type: "PrintfulIdentityMismatch", message: "Printful returned an order with a different or missing external identity." };
    await writeClaimedOrder(order.id, token, { status: "manual_review", error });
    return { ...order, status: "manual_review", error };
  }
  const needsReview = ["canceled", "failed"].includes(printfulOrder.status);
  const status = needsReview ? "manual_review" : "printful_confirmed";
  const patch = {
    status,
    ...(!needsReview ? { emailPolicyVersion: 1 as const } : {}),
    error: needsReview ? { type: "PrintfulRemoteStatusReview", message: `Printful reports this order as ${printfulOrder.status}. Review fulfillment before continuing.` } : FieldValue.delete(),
    printfulOrderId: printfulOrder.id,
    printfulExternalId: order.printfulExternalId,
    printfulStatus: printfulOrder.status
  } satisfies Parameters<typeof updateClaimedOrder>[2];
  const job = needsReview ? undefined : buildEmailJob({ ...order, status, printfulOrderId: printfulOrder.id, printfulStatus: printfulOrder.status }, "order_confirmation");
  if (!await completeClaimedFulfillment(order.id, token, patch, job)) throw new ProcessingOwnershipLostError();
  if (job) {
    await checkpoint?.();
    requireEmailRecovery([{ result: await processEmailJob(job.id) }]);
  }

  const updated = await getOrder(order.id);
  if (updated) {
    return updated;
  }

  return order;
}

async function recoverExistingOrderEmails(order: StoreOrder, token: string, checkpoint?: () => Promise<void>): Promise<void> {
  const jobs = await listOrderEmailJobs(order.id);
  await checkpoint?.();
  const missingConfirmation = order.emailPolicyVersion === 1 ? !jobs.some((job) => job.kind === "order_confirmation") : jobs.length === 0;
  if (missingConfirmation && !["canceled", "failed"].includes(order.printfulStatus || "")) {
    await writeClaimedOrder(order.id, token, { emailReviewReason: order.emailPolicyVersion === 1 ? "Order confirmation email is missing. Manual review required; no historical email was created." : "Legacy fulfilled order has no durable email record. Manual review required; no historical email was created." });
  }
  requireEmailRecovery(await retryOrderEmails(order.id));
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, checkpoint: () => Promise<void>): Promise<void> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) {
    throw new Error("Stripe Checkout Session is missing order_id metadata.");
  }

  await withOrderProcessing(orderId, async (order, token) => {
    await checkpoint();
    if (order.printfulOrderId || ["printful_confirmed", "shipped", "returned"].includes(order.status)) {
      await recoverExistingOrderEmails(order, token, checkpoint);
      return;
    }
    if (["manual_review", "canceled", "refunded", "expired"].includes(order.status)) return;
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
      await submitClaimedOrderToPrintful(order, token, checkpoint);
      return;
    }

    const patch = {
      status: "paid" as const,
      ...correlation,
      checkoutValidation: validation.evidence
    };
    await writeClaimedOrder(order.id, token, patch);
    await submitClaimedOrderToPrintful({ ...order, ...patch }, token, checkpoint);
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
    const refundSummary = await reconcileOrderRefunds({ ...order, ...patch }, token);
    return { ...order, ...patch, refundSummary, fulfillmentBlocked: Boolean(order.fulfillmentBlocked || refundSummary.fulfillmentBlocked), refundReviewReason: undefined };
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
