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

type OwnershipCheckpoint = () => Promise<void>;
const noCheckpoint: OwnershipCheckpoint = async () => {};
async function readOwnedStripe<T>(read: (options: Stripe.RequestOptions) => PromiseLike<T>, checkpoint: OwnershipCheckpoint): Promise<T> {
  await checkpoint();
  const result = await readStripeWithinDeadline(read);
  await checkpoint();
  return result;
}

// Consumes the caller's generic order lease. It must never acquire recursively.
export async function reconcileOrderRefunds(order: StoreOrder, token: string, checkpoint: OwnershipCheckpoint = noCheckpoint): Promise<RefundSummary> {
  const renewOwnership = async () => { await checkpoint(); await renew(order, token); };
  let sawRefund = false;
  try {
    const paymentIntentId = order.stripePaymentIntentId;
    if (!paymentIntentId?.startsWith("pi_")) invalid("missing persisted PaymentIntent");
    const stripe = getStripe();
    const payment = await readOwnedStripe((options) => stripe.paymentIntents.retrieve(paymentIntentId, options), renewOwnership);
    if (payment.id !== paymentIntentId || (payment.metadata.order_id && payment.metadata.order_id !== order.id)
      || payment.status !== "succeeded" || payment.currency !== order.totals.currency.toLowerCase()
      || !Number.isSafeInteger(payment.amount_received) || payment.amount_received <= 0) invalid("invalid captured payment");
    const snapshots = new Map<string, RefundSnapshot>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    const reconciledAt = new Date().toISOString();
    for (;;) {
      const page = await readOwnedStripe((options) => stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options), renewOwnership);
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
    await renewOwnership();
    // Mark financial state unresolved until every snapshot chunk and the final
    // summary commit succeeds. A crashed pagination/persistence cannot clear it.
    await write(order, token, { refundReviewReason: "Refund reconciliation is incomplete.", ...(fulfillmentBlocked ? { fulfillmentBlocked: true } : {}) });
    if (!await persistClaimedRefundSnapshots(order.id, token, values)) throw new ProcessingOwnershipLostError();
    await renewOwnership();
    await write(order, token, { refundSummary: summary, refundReviewReason: FieldValue.delete() });
    return summary;
  } catch (error) {
    if (error instanceof ProcessingOwnershipLostError) throw error;
    await renewOwnership();
    const safe = safeReadError(error);
    await write(order, token, { refundReviewReason: safe.message, ...(sawRefund && !order.printfulOrderId ? { fulfillmentBlocked: true } : {}) });
    throw safe;
  }
}

async function resolveEventOrder(event: Stripe.Event, onStoredOrder: (order: StoreOrder) => Promise<void>, checkpoint: OwnershipCheckpoint): Promise<{ order: StoreOrder; paymentIntentId: string } | null> {
  const stripe = getStripe();
  const object = event.data.object as Stripe.Refund | Stripe.Charge;
  const references = orderReferences(object.metadata?.order_id);
  let paymentIntentId = identity(object.payment_intent);
  const chargeId = event.type === "charge.refunded" ? object.id : identity((object as Stripe.Refund).charge);
  if (!paymentIntentId && chargeId) {
    const charge = await readOwnedStripe((options) => stripe.charges.retrieve(chargeId, options), checkpoint);
    if (charge.id !== chargeId) invalid("charge identity mismatch");
    paymentIntentId = identity(charge.payment_intent);
    references.push(...orderReferences(charge.metadata.order_id));
  }
  if (!paymentIntentId?.startsWith("pi_")) invalid("event has no identifiable payment");
  const stored = await findOrderByStripePaymentIntentId(paymentIntentId);
  if (stored) { references.push(stored.id); await onStoredOrder(stored); }
  const payment = await readOwnedStripe((options) => stripe.paymentIntents.retrieve(paymentIntentId!, options), checkpoint);
  if (payment.id !== paymentIntentId) invalid("PaymentIntent identity mismatch");
  references.push(...orderReferences(payment.metadata.order_id));
  const sessions: Stripe.Checkout.Session[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  for (;;) {
    const page = await readOwnedStripe((options) => stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, options), checkpoint);
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

export async function handleStripeRefundEvent(event: Stripe.Event, checkpoint: OwnershipCheckpoint = noCheckpoint): Promise<"reconciled" | "unrelated"> {
  let held: { id: string; token: string } | undefined;
  let verifiedOrder: StoreOrder | undefined;
  const renewOwnership = async () => {
    await checkpoint();
    if (held && !await renewOrderProcessing(held.id, held.token)) throw new ProcessingOwnershipLostError();
  };
  async function claimFresh(expected: StoreOrder): Promise<StoreOrder> {
    await checkpoint();
    const claim = await claimOrderProcessing(expected.id);
    if (claim.kind === "missing") invalid("order disappeared");
    if (claim.kind === "busy") throw new ProcessingBusyError(claim.retryAfterSeconds);
    held = { id: expected.id, token: claim.lease.token };
    const order = await getOrder(expected.id);
    if (!order || order.stripeSessionId !== expected.stripeSessionId || order.stripePaymentIntentId !== expected.stripePaymentIntentId) invalid("stored association changed while claiming");
    verifiedOrder = order;
    return order;
  }
  try {
    const resolved = await resolveEventOrder(event, async (stored) => {
      // A persisted PI mapping is enough to record the observation. Own the
      // order before any further provider wait can let local fulfillment race.
      const order = await claimFresh(stored);
      const fulfillmentBlocked = Boolean(order.fulfillmentBlocked || order.refundSummary?.fulfillmentBlocked || !order.printfulOrderId || ["refunded", "canceled"].includes(order.status));
      await renewOwnership();
      await write(order, held!.token, {
        refundReviewReason: "Refund event association could not be verified. Manual review required.",
        ...(fulfillmentBlocked ? { fulfillmentBlocked: true } : {})
      });
    }, renewOwnership);
    if (!resolved) return "unrelated";
    // Metadata-only associations acquire authority only after canonical checks.
    if (!held) await claimFresh(resolved.order);
    const token = held!.token;
    const order = await getOrder(resolved.order.id);
    if (!order || order.stripeSessionId !== resolved.order.stripeSessionId || (order.stripePaymentIntentId && order.stripePaymentIntentId !== resolved.paymentIntentId)) invalid("stored association changed while claiming");
    const fulfillmentBlocked = Boolean(order.fulfillmentBlocked || order.refundSummary?.fulfillmentBlocked || !order.printfulOrderId || ["refunded", "canceled"].includes(order.status));
    await renewOwnership();
    await write(order, token, { stripePaymentIntentId: resolved.paymentIntentId, ...(fulfillmentBlocked ? { fulfillmentBlocked: true } : {}) });
    await reconcileOrderRefunds({ ...order, stripePaymentIntentId: resolved.paymentIntentId, fulfillmentBlocked }, token, checkpoint);
    return "reconciled";
  } catch (error) {
    if (!(error instanceof ProcessingOwnershipLostError) && held && verifiedOrder) {
      await renewOwnership();
      await write(verifiedOrder, held.token, { refundReviewReason: safeReadError(error).message });
    }
    throw safeReadError(error);
  } finally {
    if (held && !await releaseOrderProcessing(held.id, held.token)) throw new ProcessingOwnershipLostError();
  }
}
