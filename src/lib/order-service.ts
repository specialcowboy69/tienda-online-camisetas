import Stripe from "stripe";
import { addressesMateriallyMatch, buildOrderItems, calculateTotals, createDraftOrder } from "./checkout-calculator";
import {
  beginWebhookEventProcessing,
  createOrder,
  failWebhookEventProcessing,
  finishWebhookEventProcessing,
  findOrderByStripePaymentIntentId,
  getCatalogProduct,
  getOrder,
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

export async function quoteShipping(input: { recipient: Recipient; items: CartItemInput[] }): Promise<ShippingRate[]> {
  assertAllowedCountry(input.recipient.countryCode);
  const products = await loadProductsForCart(input.items);
  const orderItems = buildOrderItems(input.items, products);
  assertSameCurrency(orderItems.map((item) => item.currency));
  return getShippingRates(input.recipient, orderItems);
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
  const selectedShippingRate = shippingRates.find((rate) => rate.id === input.shippingRateId);

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

  const shouldProcess = await beginWebhookEventProcessing("stripe", event.id, event);
  if (!shouldProcess) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (orderId) {
        await updateOrderStatus(orderId, "failed", {
          error: {
            type: "StripeAsyncPaymentFailed",
            message: "Stripe reported that an asynchronous payment failed."
          }
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id || session.client_reference_id;
      if (orderId) {
        await updateOrderStatus(orderId, "expired");
      }
    }

    if (event.type === "charge.refunded" || event.type === "refund.updated") {
      await handleRefundEvent(event);
    }

    await finishWebhookEventProcessing("stripe", event.id);
    return Response.json({ received: true });
  } catch (error) {
    await failWebhookEventProcessing("stripe", event.id, summarizeError(error));
    throw error;
  }
}

export async function submitOrderToPrintful(orderId: string): Promise<StoreOrder> {
  const order = await getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found.`);
  }

  if (order.printfulOrderId) {
    return order;
  }

  await updateOrderStatus(order.id, "printful_pending");

  try {
    const printfulOrder = await createPrintfulOrder(order);
    return finishPrintfulOrder(order, printfulOrder);
  } catch (error) {
    if (error instanceof PrintfulApiError && error.status === 400) {
      const existingOrder = await findPrintfulOrderByExternalId(getPrintfulExternalId(order));
      if (existingOrder) {
        return finishPrintfulOrder(order, existingOrder);
      }
    }

    const summary = summarizeError(error);

    if (error instanceof PrintfulApiError && error.isTemporary) {
      await updateOrderStatus(order.id, "failed", { error: summary });
      throw error;
    }

    await updateOrderStatus(order.id, "manual_review", { error: summary });
    return { ...order, status: "manual_review", error: summary };
  }
}

async function finishPrintfulOrder(
  order: StoreOrder,
  printfulOrder: { id: number; status: string; external_id?: string }
): Promise<StoreOrder> {
  await updateOrderStatus(order.id, "printful_confirmed", {
    printfulOrderId: printfulOrder.id,
    printfulExternalId: printfulOrder.external_id || getPrintfulExternalId(order),
    printfulStatus: printfulOrder.status
  });

  const updated = await getOrder(order.id);
  if (updated) {
    await sendOrderConfirmationEmail(updated);
    return updated;
  }

  return order;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) {
    throw new Error("Stripe Checkout Session is missing order_id metadata.");
  }

  const order = await getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} does not exist.`);
  }

  if (order.printfulOrderId || order.status === "printful_confirmed" || order.status === "shipped") {
    return;
  }

  if (session.payment_status !== "paid") {
    await updateOrder(order.id, {
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
    });
    return;
  }

  const paidTotal = session.amount_total;
  const paidCurrency = session.currency?.toLowerCase();
  const stripeTaxAmount = session.total_details?.amount_tax || 0;
  const expectedStripeTotal = order.totals.total + (isStripeTaxEnabled() ? stripeTaxAmount : 0);

  if (paidTotal !== expectedStripeTotal || paidCurrency !== order.totals.currency.toLowerCase()) {
    await updateOrderStatus(order.id, "manual_review", {
      stripeSessionId: session.id,
      stripeAmountTotal: paidTotal || undefined,
      stripeTaxAmount,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      error: {
        type: "PaymentMismatch",
        message: "Stripe paid amount or currency does not match the stored order snapshot.",
        details: {
          paidTotal,
          expectedTotal: expectedStripeTotal,
          paidCurrency,
          expectedCurrency: order.totals.currency
        }
      }
    });
    return;
  }

  if (!addressesMateriallyMatch(order.recipient, session.shipping_details?.address)) {
    await updateOrderStatus(order.id, "manual_review", {
      stripeSessionId: session.id,
      error: {
        type: "ShippingAddressChanged",
        message: "Stripe shipping address differs from the address used to quote Printful shipping."
      }
    });
    return;
  }

  await updateOrderStatus(order.id, "paid", {
    stripeSessionId: session.id,
    stripeAmountTotal: paidTotal || undefined,
    stripeTaxAmount,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined
  });

  await submitOrderToPrintful(order.id);
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
