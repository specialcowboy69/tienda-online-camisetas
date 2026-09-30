import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { CatalogProduct, ClaimResult, EmailJob, OrderStatus, ProcessingLease, RefundSnapshot, StoreOrder, WebhookSource } from "./types";
import { ProcessingBusyError } from "./processing-errors";

const productsCollection = "products";
const ordersCollection = "orders";
const webhookEventsCollection = "webhookEvents";
const syncRunsCollection = "syncRuns";
const processingLeaseMs = 120000;

export async function completeClaimedFulfillment(orderId: string, token: string, update: StoreOrderUpdate, job?: EmailJob): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(ordersCollection).doc(orderId);
  if (job && job.orderId !== orderId) throw new Error("Email job belongs to another order.");
  const jobRef = job ? db.collection("emailJobs").doc(job.id) : null;
  return db.runTransaction(async (transaction) => {
    const order = await transaction.get(ref);
    const existingJob = jobRef ? await transaction.get(jobRef) : null;
    const now = Date.now();
    if (!ownsProcessingLease(order.data()?.orderProcessingLease, token, now)) return false;
    transaction.set(ref, { ...update, updatedAt: new Date(now).toISOString() }, { merge: true });
    if (jobRef && !existingJob?.exists) transaction.set(jobRef, job!);
    return true;
  });
}

export const applyClaimedShipment = completeClaimedFulfillment;

export async function persistClaimedRefundSnapshots(orderId: string, token: string, snapshots: RefundSnapshot[]): Promise<boolean> {
  const db = getDb();
  const orderRef = db.collection(ordersCollection).doc(orderId);
  // Keep well below transaction write limits for arbitrarily many refund pages.
  // Each chunk checks and renews the same lease; the caller commits the summary last.
  for (let index = 0; index < snapshots.length; index += 100) {
    const chunk = snapshots.slice(index, index + 100);
    const saved = await db.runTransaction(async (transaction) => {
      const order = await transaction.get(orderRef);
      const now = Date.now();
      if (!ownsProcessingLease(order.data()?.orderProcessingLease, token, now)) return false;
      for (const snapshot of chunk) transaction.set(db.collection(`${ordersCollection}/${orderId}/refunds`).doc(snapshot.id), snapshot);
      transaction.set(orderRef, { orderProcessingLease: { token, expiresAtMs: now + processingLeaseMs } }, { merge: true });
      return true;
    });
    if (!saved) return false;
  }
  return true;
}

export async function listOrderEmailJobs(orderId: string): Promise<EmailJob[]> {
  const snapshot = await getDb().collection("emailJobs").where("orderId", "==", orderId).limit(100).get();
  return snapshot.docs.map((doc) => doc.data() as EmailJob);
}

export async function claimEmailJob(jobId: string): Promise<ClaimResult<EmailJob> | { kind: "accepted" | "manual_review" | "missing" }> {
  const db = getDb(); const ref = db.collection("emailJobs").doc(jobId); const token = randomUUID();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { kind: "missing" };
    const job = snapshot.data() as EmailJob;
    if (job.status === "accepted" || job.status === "manual_review") return { kind: job.status };
    const now = Date.now(); const lease = readProcessingLease(job.lease);
    if (lease && lease.expiresAtMs > now) return busyClaim(lease.expiresAtMs, now);
    const claimedLease = { token, expiresAtMs: now + processingLeaseMs };
    transaction.set(ref, { status: "processing", lease: claimedLease, updatedAt: new Date(now).toISOString() }, { merge: true });
    return { kind: "claimed", lease: claimedLease, value: { ...job, lease: claimedLease } };
  });
}

// The only permitted payload change is filling the sender before first dispatch.
// Persist the clock before HTTP so a crash cannot reopen the provider window.
export async function prepareEmailDispatch(jobId: string, token: string, sender: string): Promise<EmailJob | null> {
  const db = getDb(); const ref = db.collection("emailJobs").doc(jobId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref); const job = snapshot.data() as EmailJob | undefined; const now = Date.now();
    if (!job || job.status !== "processing" || !ownsProcessingLease(job.lease, token, now)) return null;
    if (job.firstDispatchAtMs !== undefined && (now - job.firstDispatchAtMs >= 82800000 || !job.message.from)) return null;
    const updated = { ...job, message: { ...job.message, from: job.message.from || sender }, firstDispatchAtMs: job.firstDispatchAtMs ?? now, attempts: job.attempts + 1, updatedAt: new Date(now).toISOString() };
    transaction.set(ref, updated);
    return updated;
  });
}

export async function finishEmailJob(jobId: string, token: string, status: "pending" | "blocked" | "accepted" | "manual_review", details: { providerEmailId?: string; lastError?: string } = {}): Promise<boolean> {
  const db = getDb(); const ref = db.collection("emailJobs").doc(jobId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref); const job = snapshot.data() as EmailJob | undefined;
    if (!job || job.status !== "processing" || !ownsProcessingLease(job.lease, token, Date.now())) return false;
    transaction.set(ref, { status, ...details, lease: FieldValue.delete(), updatedAt: new Date().toISOString(), ...(status === "accepted" ? { lastError: FieldValue.delete() } : {}) }, { merge: true });
    return true;
  });
}

type StoreOrderUpdate = Partial<Omit<StoreOrder, "error" | "refundReviewReason">> & {
  error?: StoreOrder["error"] | FieldValue;
  refundReviewReason?: string | FieldValue;
};

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  const snapshot = await getDb().collection(productsCollection).orderBy("name", "asc").get();
  return snapshot.docs.map((doc) => doc.data() as CatalogProduct).filter((product) => !product.isIgnored);
}

export async function getCatalogProduct(productId: string): Promise<CatalogProduct | null> {
  const doc = await getDb().collection(productsCollection).doc(productId).get();
  return doc.exists ? (doc.data() as CatalogProduct) : null;
}

export async function saveCatalogProducts(products: CatalogProduct[]): Promise<void> {
  const db = getDb();
  const productsRef = db.collection(productsCollection);
  const batch = db.batch();
  const incomingIds = new Set(products.map((product) => product.id));
  const incomingSyncProductIds = new Set(products.map((product) => product.syncProductId));
  const existingSnapshot = await productsRef.get();
  const now = new Date().toISOString();

  for (const product of products) {
    batch.set(productsRef.doc(product.id), product, { merge: true });
  }

  for (const doc of existingSnapshot.docs) {
    const product = doc.data() as Partial<CatalogProduct>;
    const existsInPrintfulCatalog =
      incomingIds.has(doc.id) ||
      (typeof product.syncProductId === "number" && incomingSyncProductIds.has(product.syncProductId));

    if (!existsInPrintfulCatalog && !product.isIgnored) {
      batch.set(doc.ref, { isIgnored: true, updatedAt: now }, { merge: true });
    }
  }

  await batch.commit();
}

export async function markCatalogProductDeleted(syncProductId: number): Promise<void> {
  const db = getDb();
  const snapshot = await db.collection(productsCollection).where("syncProductId", "==", syncProductId).get();
  const batch = db.batch();

  for (const doc of snapshot.docs) {
    batch.set(doc.ref, { isIgnored: true, updatedAt: new Date().toISOString() }, { merge: true });
  }

  await batch.commit();
}

export async function createOrder(order: StoreOrder): Promise<void> {
  await getDb().collection(ordersCollection).doc(order.id).set(order);
}

export async function getOrder(orderId: string): Promise<StoreOrder | null> {
  const doc = await getDb().collection(ordersCollection).doc(orderId).get();
  return doc.exists ? (doc.data() as StoreOrder) : null;
}

export async function findOrderByStripePaymentIntentId(paymentIntentId: string): Promise<StoreOrder | null> {
  const snapshot = await getDb()
    .collection(ordersCollection)
    .where("stripePaymentIntentId", "==", paymentIntentId)
    .limit(2)
    .get();

  if (snapshot.docs.length > 1) throw new Error("Multiple orders reference the same Stripe PaymentIntent; manual review required.");
  return snapshot.empty ? null : (snapshot.docs[0].data() as StoreOrder);
}

export async function findOrderByPrintfulExternalId(printfulExternalId: string): Promise<StoreOrder | null> {
  const snapshot = await getDb()
    .collection(ordersCollection)
    .where("printfulExternalId", "==", printfulExternalId)
    .limit(1)
    .get();

  return snapshot.empty ? null : (snapshot.docs[0].data() as StoreOrder);
}

export async function updateOrder(orderId: string, update: StoreOrderUpdate): Promise<void> {
  await getDb()
    .collection(ordersCollection)
    .doc(orderId)
    .set({ ...update, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, update: StoreOrderUpdate = {}): Promise<void> {
  await updateOrder(orderId, { ...update, status });
}

export type ReviewOrder = StoreOrder & { emailJobs: Array<Pick<EmailJob, "id" | "kind" | "status" | "attempts" | "providerEmailId" | "lastError">> };
export async function listOrdersForReview(limit = 50): Promise<ReviewOrder[]> {
  const bound = Math.max(1, Math.min(100, Math.floor(limit) || 50));
  const db = getDb();
  // Each query has one filter and a limit: no composite index deployment needed.
  const [orders, reviews, jobs, refundHolds, refundReviews, refundedOrders] = await Promise.all([
    db.collection(ordersCollection).where("status", "in", ["failed", "manual_review", "printful_pending"]).limit(bound).get(),
    db.collection(ordersCollection).where("emailReviewReason", ">", "").limit(bound).get(),
    db.collection("emailJobs").where("status", "in", ["pending", "processing", "blocked", "manual_review"]).limit(bound).get(),
    db.collection(ordersCollection).where("fulfillmentBlocked", "==", true).limit(bound).get(),
    db.collection(ordersCollection).where("refundReviewReason", ">", "").limit(bound).get(),
    db.collection(ordersCollection).where("refundSummary.refundCount", ">", 0).limit(bound).get()
  ]);
  const selected = new Map<string, StoreOrder>();
  for (const doc of [...orders.docs, ...reviews.docs, ...refundHolds.docs, ...refundReviews.docs, ...refundedOrders.docs]) { const order = doc.data() as StoreOrder; selected.set(order.id, order); }
  const missingIds = [...new Set(jobs.docs.map((doc) => (doc.data() as EmailJob).orderId))].filter((id) => !selected.has(id));
  for (const order of await Promise.all(missingIds.map(getOrder))) if (order) selected.set(order.id, order);
  return Promise.all([...selected.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, bound).map(async (order) => ({
    ...order,
    emailJobs: (await listOrderEmailJobs(order.id)).map(({ id, kind, status, attempts, providerEmailId, lastError }) => ({ id, kind, status, attempts, ...(providerEmailId ? { providerEmailId } : {}), ...(lastError ? { lastError } : {}) }))
  })));
}

export async function recordWebhookEventOnce(source: WebhookSource, eventId: string, payload: unknown): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(webhookEventsCollection).doc(`${source}:${eventId}`);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      return false;
    }

    transaction.set(ref, {
      source,
      eventId,
      payload,
      processedAt: Timestamp.now()
    });

    return true;
  });
}

export async function beginWebhookEventProcessing(source: WebhookSource, eventId: string, payload: unknown): Promise<ClaimResult<null> | { kind: "processed" }> {
  const db = getDb();
  const ref = db.collection(webhookEventsCollection).doc(`${source}:${eventId}`);
  const token = randomUUID();
  const result = await db.runTransaction(async (transaction): Promise<ClaimResult<null> | { kind: "processed" } | { kind: "quarantined" }> => {
    const existing = await transaction.get(ref);
    const data = existing.data();
    const now = Date.now();
    if (data?.status === "processed" || (data?.status === undefined && data?.processedAt instanceof Timestamp)) {
      return { kind: "processed" };
    }
    const lease = readProcessingLease(data?.lease);
    if (lease && lease.expiresAtMs > now) return busyClaim(lease.expiresAtMs, now);

    if (existing.exists) {
      const legacyUpdatedAt = data?.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : NaN;
      const legacyProcessing = data?.status === "processing" && data?.lease === undefined && Number.isFinite(legacyUpdatedAt);
      if (legacyProcessing && legacyUpdatedAt + processingLeaseMs > now) return busyClaim(legacyUpdatedAt + processingLeaseMs, now);
      const malformed = (data?.lease !== undefined && !lease)
        || (data?.status === "processing" && !lease && !legacyProcessing)
        || !["processing", "failed"].includes(data?.status);
      if (malformed) {
        // Commit the quarantine before throwing: throwing inside a transaction
        // would roll back the protective lease and its diagnostic.
        transaction.set(ref, {
          status: "failed", lease: { token, expiresAtMs: now + processingLeaseMs },
          error: { type: "MalformedProcessingLease", message: "Malformed webhook ownership was quarantined for recovery." },
          updatedAt: Timestamp.fromMillis(now)
        }, { merge: true });
        return { kind: "quarantined" };
      }
    }
    const claimedLease = { token, expiresAtMs: now + processingLeaseMs };
    transaction.set(
      ref,
      {
        source,
        eventId,
        payload,
        status: "processing",
        lease: claimedLease,
        attempts: FieldValue.increment(1),
        updatedAt: Timestamp.fromMillis(now)
      },
      { merge: true }
    );

    return { kind: "claimed", lease: claimedLease, value: null };
  });
  if (result.kind === "quarantined") throw new ProcessingBusyError(processingLeaseMs / 1000);
  return result;
}

export async function finishWebhookEventProcessing(source: WebhookSource, eventId: string, token: string): Promise<boolean> {
  return changeWebhookEvent(source, eventId, token, true);
}

export async function failWebhookEventProcessing(source: WebhookSource, eventId: string, token: string, error: unknown): Promise<boolean> {
  return changeWebhookEvent(source, eventId, token, false, error);
}

async function changeWebhookEvent(source: WebhookSource, eventId: string, token: string, processed: boolean, error?: unknown): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(webhookEventsCollection).doc(`${source}:${eventId}`);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const data = existing.data();
    const now = Date.now();
    if (data?.status !== "processing" || !ownsProcessingLease(data?.lease, token, now)) return false;
    transaction.set(ref, {
      status: processed ? "processed" : "failed",
      ...(processed ? { processedAt: Timestamp.fromMillis(now), error: FieldValue.delete() } : { error }),
      lease: FieldValue.delete(), updatedAt: Timestamp.fromMillis(now)
    }, { merge: true });
    return true;
  });
}

export async function claimOrderProcessing(orderId: string): Promise<ClaimResult<StoreOrder> | { kind: "missing" }> {
  const db = getDb();
  const ref = db.collection(ordersCollection).doc(orderId);
  const token = randomUUID();
  const result = await db.runTransaction(async (transaction): Promise<ClaimResult<StoreOrder> | { kind: "missing" } | { kind: "quarantined" }> => {
    const existing = await transaction.get(ref);
    if (!existing.exists) return { kind: "missing" };
    const order = existing.data() as StoreOrder;
    const now = Date.now();
    const lease = readProcessingLease(order.orderProcessingLease);
    if (lease && lease.expiresAtMs > now) return busyClaim(lease.expiresAtMs, now);
    const claimedLease = { token, expiresAtMs: now + processingLeaseMs };
    transaction.set(ref, { orderProcessingLease: claimedLease }, { merge: true });
    if (order.orderProcessingLease !== undefined && !lease) return { kind: "quarantined" };
    return { kind: "claimed", lease: claimedLease, value: { ...order, orderProcessingLease: claimedLease } };
  });
  if (result.kind === "quarantined") throw new ProcessingBusyError(processingLeaseMs / 1000);
  return result;
}

export async function renewOrderProcessing(orderId: string, token: string): Promise<boolean> {
  return changeClaimedOrder(orderId, token, "renew");
}

export async function updateClaimedOrder(orderId: string, token: string, update: Omit<StoreOrderUpdate, "orderProcessingLease">): Promise<boolean> {
  return changeClaimedOrder(orderId, token, "update", update);
}

export async function releaseOrderProcessing(orderId: string, token: string): Promise<boolean> {
  return changeClaimedOrder(orderId, token, "release");
}

async function changeClaimedOrder(orderId: string, token: string, operation: "renew" | "update" | "release", update: Omit<StoreOrderUpdate, "orderProcessingLease"> = {}): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(ordersCollection).doc(orderId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const now = Date.now();
    if (!ownsProcessingLease(existing.data()?.orderProcessingLease, token, now)) return false;
    const patch = operation === "renew" ? { orderProcessingLease: { token, expiresAtMs: now + processingLeaseMs } }
      : operation === "release" ? { orderProcessingLease: FieldValue.delete() }
      : { ...update, updatedAt: new Date(now).toISOString() };
    transaction.set(ref, patch, { merge: true });
    return true;
  });
}

function readProcessingLease(value: unknown): ProcessingLease | null {
  if (!value || typeof value !== "object") return null;
  const lease = value as Partial<ProcessingLease>;
  return typeof lease.token === "string" && lease.token.length > 0
    && typeof lease.expiresAtMs === "number" && Number.isFinite(lease.expiresAtMs) && lease.expiresAtMs > 0
    ? lease as ProcessingLease : null;
}

function ownsProcessingLease(value: unknown, token: string, now: number): boolean {
  const lease = readProcessingLease(value);
  return !!lease && lease.token === token && lease.expiresAtMs > now;
}

function busyClaim(expiresAtMs: number, now: number): { kind: "busy"; retryAfterSeconds: number } {
  return { kind: "busy", retryAfterSeconds: Math.max(1, Math.ceil((expiresAtMs - now) / 1000)) };
}

export async function createSyncRun(input: {
  status: "success" | "failed";
  productCount?: number;
  variantCount?: number;
  error?: unknown;
}): Promise<void> {
  await getDb().collection(syncRunsCollection).add({
    ...input,
    createdAt: FieldValue.serverTimestamp()
  });
}
