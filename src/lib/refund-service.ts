import type Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { claimOrderProcessing, findOrderByStripePaymentIntentId, getOrder, persistClaimedRefundSnapshots, releaseOrderProcessing, renewOrderProcessing, updateClaimedOrder } from "./firestore";
import { ProcessingBusyError, ProcessingOwnershipLostError } from "./processing-errors";
import { getStripe, readStripeWithinDeadline } from "./stripe";
import type { RefundSnapshot, RefundSummary, StoreOrder } from "./types";

function identity(value: string | { id: string } | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}
class RefundReconciliationError extends Error {}
function invalid(message: string): never { throw new RefundReconciliationError(`Refund reconciliation requires review: ${message}`); }
function safeReadError(error: unknown): Error {
  if (error instanceof RefundReconciliationError || error instanceof ProcessingOwnershipLostError || error instanceof ProcessingBusyError) return error;
  const safe = new Error("Stripe financial state could not be verified. Retry reconciliation.");
  safe.name = error instanceof Error && error.name === "StripeReadDeadlineExceeded" ? "StripeReadDeadlineExceeded" : "RefundReconciliationUnavailable";
  return safe;
}
function orderReferences(...values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
async function renew(order: StoreOrder, token: string) {
  if (!await renewOrderProcessing(order.id, token)) throw new ProcessingOwnershipLostError();
}
async function write(order: StoreOrder, token: string, patch: Parameters<typeof updateClaimedOrder>[2]) {
  if (!await updateClaimedOrder(order.id, token, patch)) throw new ProcessingOwnershipLostError();
}

// Consumes the caller's generic order lease. It must never acquire recursively.
export async function reconcileOrderRefunds(order: StoreOrder, token: string): Promise<RefundSummary> {
  let sawRefund = false;
  try {
    await renew(order, token);
    const paymentIntentId = order.stripePaymentIntentId;
    if (!paymentIntentId?.startsWith("pi_")) invalid("missing persisted PaymentIntent");
    const stripe = getStripe();
    const payment = await readStripeWithinDeadline((options) => stripe.paymentIntents.retrieve(paymentIntentId, options));
    if (payment.id !== paymentIntentId || (payment.metadata.order_id && payment.metadata.order_id !== order.id)
      || payment.status !== "succeeded" || payment.currency !== order.totals.currency.toLowerCase()
      || !Number.isSafeInteger(payment.amount_received) || payment.amount_received <= 0) invalid("invalid captured payment");
    const snapshots = new Map<string, RefundSnapshot>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    const reconciledAt = new Date().toISOString();
    for (;;) {
      await renew(order, token);
      const page = await readStripeWithinDeadline((options) => stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options));
      if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") invalid("incomplete refund page");
      for (const refund of page.data) {
        sawRefund = true;
        if (!/^re_[A-Za-z0-9_]+$/.test(refund.id) || identity(refund.payment_intent) !== paymentIntentId
          || refund.currency !== payment.currency || !Number.isSafeInteger(refund.amount) || refund.amount < 0
          || !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refund.status || "")) invalid("invalid refund identity, amount, currency or status");
        const snapshot: RefundSnapshot = { id: refund.id, amount: refund.amount, currency: refund.currency, status: refund.status as RefundSnapshot["status"], paymentIntentId, reconciledAt };
        const previous = snapshots.get(snapshot.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(snapshot)) invalid("contradictory duplicate refund");
        snapshots.set(snapshot.id, snapshot);
      }
      if (!page.has_more) break;
      const next = page.data.at(-1)?.id;
      if (!next || cursors.has(next)) invalid("refund pagination did not advance");
      cursors.add(next); cursor = next;
    }
    const values = [...snapshots.values()];
    const refundedAmount = values.filter((refund) => refund.status === "succeeded").reduce((total, refund) => total + refund.amount, 0);
    if (!Number.isSafeInteger(refundedAmount) || refundedAmount > payment.amount_received) invalid("successful refunds exceed captured payment");
    const fulfillmentBlocked = Boolean(order.fulfillmentBlocked || order.refundSummary?.fulfillmentBlocked || (sawRefund && !order.printfulOrderId) || ["refunded", "canceled"].includes(order.status));
    const summary: RefundSummary = { paymentIntentId, status: refundedAmount === 0 ? "none" : refundedAmount === payment.amount_received ? "full" : "partial", refundedAmount, paidAmount: payment.amount_received, currency: payment.currency,
      pendingCount: values.filter((refund) => ["pending", "requires_action"].includes(refund.status)).length,
      failedCount: values.filter((refund) => refund.status === "failed").length,
      canceledCount: values.filter((refund) => refund.status === "canceled").length,
      fulfillmentBlocked, refundCount: values.length, reconciledAt };
    await renew(order, token);
    // Mark financial state unresolved until every snapshot chunk and the final
    // summary commit succeeds. A crashed pagination/persistence cannot clear it.
    await write(order, token, { refundReviewReason: "Refund reconciliation is incomplete.", ...(fulfillmentBlocked ? { fulfillmentBlocked: true } : {}) });
    if (!await persistClaimedRefundSnapshots(order.id, token, values)) throw new ProcessingOwnershipLostError();
    await write(order, token, { refundSummary: summary, refundReviewReason: FieldValue.delete() });
    return summary;
  } catch (error) {
    if (error instanceof ProcessingOwnershipLostError) throw error;
    const safe = safeReadError(error);
    await write(order, token, { refundReviewReason: safe.message, ...(sawRefund && !order.printfulOrderId ? { fulfillmentBlocked: true } : {}) });
    throw safe;
  }
}

async function resolveEventOrder(event: Stripe.Event, onStoredOrder: (order: StoreOrder) => void): Promise<{ order: StoreOrder; paymentIntentId: string } | null> {
  const stripe = getStripe();
  const object = event.data.object as Stripe.Refund | Stripe.Charge;
  const references = orderReferences(object.metadata?.order_id);
  let paymentIntentId = identity(object.payment_intent);
  const chargeId = event.type === "charge.refunded" ? object.id : identity((object as Stripe.Refund).charge);
  if (!paymentIntentId && chargeId) {
    const charge = await readStripeWithinDeadline((options) => stripe.charges.retrieve(chargeId, options));
    if (charge.id !== chargeId) invalid("charge identity mismatch");
    paymentIntentId = identity(charge.payment_intent);
    references.push(...orderReferences(charge.metadata.order_id));
  }
  if (!paymentIntentId?.startsWith("pi_")) invalid("event has no identifiable payment");
  const stored = await findOrderByStripePaymentIntentId(paymentIntentId);
  if (stored) { references.push(stored.id); onStoredOrder(stored); }
  const payment = await readStripeWithinDeadline((options) => stripe.paymentIntents.retrieve(paymentIntentId!, options));
  if (payment.id !== paymentIntentId) invalid("PaymentIntent identity mismatch");
  references.push(...orderReferences(payment.metadata.order_id));
  const sessions: Stripe.Checkout.Session[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  for (;;) {
    const page = await readStripeWithinDeadline((options) => stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options));
    if (!Array.isArray(page.data) || typeof page.has_more !== "boolean") invalid("incomplete Checkout page");
    for (const session of page.data) {
      if (identity(session.payment_intent) !== paymentIntentId) invalid("filtered Checkout payment mismatch");
      sessions.push(session);
      references.push(...orderReferences(session.metadata?.order_id, session.client_reference_id));
    }
    if (!page.has_more) break;
    const next = page.data.at(-1)?.id;
    if (!next || cursors.has(next)) invalid("Checkout pagination did not advance");
    cursors.add(next); cursor = next;
  }
  if (!references.length) return null;
  const ids = [...new Set(references)];
  if (ids.length !== 1 || !/^[A-Za-z0-9_-]+$/.test(ids[0])) invalid("ambiguous order association");
  const order = await getOrder(ids[0]);
  if (!order) invalid("own order is not stored yet");
  verifyAssociation(order, paymentIntentId, sessions);
  return { order, paymentIntentId };
}

function verifyAssociation(order: StoreOrder, paymentIntentId: string, sessions: Stripe.Checkout.Session[]) {
  if (order.stripePaymentIntentId && order.stripePaymentIntentId !== paymentIntentId) invalid("stored payment mismatch");
  const matching = sessions.filter((session) => session.id === order.stripeSessionId);
  if (matching.length !== 1 || matching[0].mode !== "payment") invalid("stored Checkout reference mismatch");
  const refs = orderReferences(matching[0].metadata?.order_id, matching[0].client_reference_id);
  if (!refs.length || refs.some((ref) => ref !== order.id)) invalid("Checkout order references mismatch");
}

export async function handleStripeRefundEvent(event: Stripe.Event): Promise<"reconciled" | "unrelated"> {
  let knownOrder: StoreOrder | undefined;
  let resolved: Awaited<ReturnType<typeof resolveEventOrder>>;
  try {
    resolved = await resolveEventOrder(event, (order) => { knownOrder = order; });
  } catch (error) {
    // A persisted PI mapping establishes a refund observation even if the
    // canonical read fails. Latch it from fresh leased state before retrying.
    // Event metadata alone must never target an arbitrary order for writes.
    if (knownOrder) {
      const claim = await claimOrderProcessing(knownOrder.id);
      if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);
      if (claim.kind === "claimed") {
        try {
          const order = await getOrder(knownOrder.id);
          if (!order || order.stripePaymentIntentId !== knownOrder.stripePaymentIntentId) invalid("stored association changed while claiming");
          await write(order, claim.lease.token, {
            refundReviewReason: "Refund event association could not be verified. Manual review required.",
            ...(!order.printfulOrderId || ["refunded", "canceled"].includes(order.status) ? { fulfillmentBlocked: true } : {})
          });
        } finally {
          if (!await releaseOrderProcessing(knownOrder.id, claim.lease.token)) throw new ProcessingOwnershipLostError();
        }
      }
    }
    throw safeReadError(error);
  }
  if (!resolved) return "unrelated";
  const claim = await claimOrderProcessing(resolved.order.id);
  if (claim.kind === "missing") invalid("order disappeared");
  if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);
  const token = claim.lease.token;
  try {
    const order = await getOrder(resolved.order.id);
    if (!order || order.stripeSessionId !== resolved.order.stripeSessionId || (order.stripePaymentIntentId && order.stripePaymentIntentId !== resolved.paymentIntentId)) invalid("stored association changed while claiming");
    const fulfillmentBlocked = Boolean(order.fulfillmentBlocked || order.refundSummary?.fulfillmentBlocked || !order.printfulOrderId || ["refunded", "canceled"].includes(order.status));
    await write(order, token, { stripePaymentIntentId: resolved.paymentIntentId, ...(fulfillmentBlocked ? { fulfillmentBlocked: true } : {}) });
    await reconcileOrderRefunds({ ...order, stripePaymentIntentId: resolved.paymentIntentId, fulfillmentBlocked }, token);
    return "reconciled";
  } finally {
    if (!await releaseOrderProcessing(resolved.order.id, token)) throw new ProcessingOwnershipLostError();
  }
}
