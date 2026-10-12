// Synthetic source fixtures. Import only from tests, never from production.
export const T0 = Date.parse("2026-10-12T08:00:00.000Z");

export function sourceAt(status: string, extras: Record<string, unknown> = {}) {
  return {
    status,
    createdAt: new Date(T0 - 60000).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...extras
  };
}

export function preventiveRefund() {
  return sourceAt("refunded", {
    fulfillmentBlocked: true,
    refundSummary: { status: "full", fulfillmentBlocked: true, pendingCount: 0, failedCount: 0, refundCount: 1 }
  });
}

// In-memory Firestore boundary: staged writes commit atomically, callbacks can be
// replayed, and reads after writes fail like real Firestore transactions.
import type { Firestore } from "firebase-admin/firestore";

type TestDocument = Record<string, unknown>;
type TestRef = { path: string; id: string; collection: (name: string) => TestCollection };
type TestCollection = { doc: (id: string) => TestRef };

export function memoryAlertDb(options: { replayCallbacks?: number } = {}) {
  const documents = new Map<string, TestDocument>();
  const writtenPaths: string[] = [];
  const transactionAttempts: number[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const ref = (path: string): TestRef => ({ path, id: path.split("/").at(-1)!, collection: name => collection(`${path}/${name}`) });
  const collection = (path: string): TestCollection => ({ doc: id => ref(`${path}/${id}`) });
  const snapshot = (reference: TestRef) => ({ exists: documents.has(reference.path), ref: reference, id: reference.id,
    data: () => documents.has(reference.path) ? structuredClone(documents.get(reference.path)) : undefined });
  const db = {
    collection,
    doc: ref,
    runTransaction: <T>(callback: (transaction: unknown) => Promise<T>, settings: { maxAttempts: number }) => {
      transactionAttempts.push(settings.maxAttempts);
      const execute = async () => {
        let result!: T;
        for (let iteration = 0; iteration <= (options.replayCallbacks ?? 0); iteration++) {
          const writes = new Map<string, TestDocument>();
          const transaction = {
            get: async (reference: TestRef) => {
              if (writes.size) throw new Error("Transaction must read before writing");
              return snapshot(reference);
            },
            getAll: async (...references: TestRef[]) => {
              if (writes.size) throw new Error("Transaction must read before writing");
              return references.map(snapshot);
            },
            set: (reference: TestRef, data: TestDocument, settings?: { merge?: boolean }) => {
              if (JSON.stringify(data).includes("undefined")) throw new Error("Invalid document");
              writes.set(reference.path, structuredClone(settings?.merge ? { ...documents.get(reference.path), ...data } : data));
              return transaction;
            }
          };
          result = await callback(transaction);
          if (iteration === (options.replayCallbacks ?? 0)) {
            for (const [path, data] of writes) { documents.set(path, data); writtenPaths.push(path); }
          }
        }
        return result;
      };
      const result = queue.then(execute);
      queue = result.catch(() => undefined);
      return result;
    }
  };
  return { db: db as unknown as Firestore, documents, writtenPaths, transactionAttempts };
}
