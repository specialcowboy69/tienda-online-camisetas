import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { CatalogProduct, ClaimResult, OrderStatus, ProcessingLease, StoreOrder, WebhookSource } from "./types";
import { ProcessingBusyError } from "./processing-errors";

const productsCollection = "products";
const ordersCollection = "orders";
const webhookEventsCollection = "webhookEvents";
const syncRunsCollection = "syncRuns";
const processingLeaseMs = 120000;

type StoreOrderUpdate = Partial<Omit<StoreOrder, "error">> & {
  error?: StoreOrder["error"] | FieldValue;
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
    .limit(1)
    .get();

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

export async function listOrdersForReview(limit = 50): Promise<StoreOrder[]> {
  const snapshot = await getDb()
    .collection(ordersCollection)
    .where("status", "in", ["failed", "manual_review"])
    .limit(limit)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as StoreOrder)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
