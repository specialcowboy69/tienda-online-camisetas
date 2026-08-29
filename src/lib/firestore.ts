import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "./firebase-admin";
import { CatalogProduct, OrderStatus, StoreOrder, WebhookSource } from "./types";

const productsCollection = "products";
const ordersCollection = "orders";
const webhookEventsCollection = "webhookEvents";
const syncRunsCollection = "syncRuns";

type StoreOrderUpdate = Partial<Omit<StoreOrder, "error">> & {
  error?: StoreOrder["error"] | FieldValue;
};

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  const snapshot = await getDb().collection(productsCollection).orderBy("name", "asc").get();
  return snapshot.docs.map((doc) => doc.data() as CatalogProduct);
}

export async function getCatalogProduct(productId: string): Promise<CatalogProduct | null> {
  const doc = await getDb().collection(productsCollection).doc(productId).get();
  return doc.exists ? (doc.data() as CatalogProduct) : null;
}

export async function saveCatalogProducts(products: CatalogProduct[]): Promise<void> {
  const db = getDb();
  const batch = db.batch();

  for (const product of products) {
    batch.set(db.collection(productsCollection).doc(product.id), product, { merge: true });
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

export async function beginWebhookEventProcessing(source: WebhookSource, eventId: string, payload: unknown): Promise<boolean> {
  const db = getDb();
  const ref = db.collection(webhookEventsCollection).doc(`${source}:${eventId}`);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists && existing.data()?.status === "processed") {
      return false;
    }

    transaction.set(
      ref,
      {
        source,
        eventId,
        payload,
        status: "processing",
        attempts: FieldValue.increment(1),
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );

    return true;
  });
}

export async function finishWebhookEventProcessing(source: WebhookSource, eventId: string): Promise<void> {
  await getDb()
    .collection(webhookEventsCollection)
    .doc(`${source}:${eventId}`)
    .set(
      {
        status: "processed",
        processedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
}

export async function failWebhookEventProcessing(source: WebhookSource, eventId: string, error: unknown): Promise<void> {
  await getDb()
    .collection(webhookEventsCollection)
    .doc(`${source}:${eventId}`)
    .set(
      {
        status: "failed",
        error,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );
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
