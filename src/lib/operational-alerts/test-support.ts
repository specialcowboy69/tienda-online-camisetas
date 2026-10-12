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
import { FieldValue, Timestamp } from "firebase-admin/firestore";

function copy<T>(value: T): T {
  if (value instanceof Timestamp) return new Timestamp(value.seconds, value.nanoseconds) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) as T;
  return value;
}

type TestDocument = Record<string, unknown>;
type TestRef = { path: string; id: string; collection: (name: string) => TestCollection; get: () => Promise<ReturnType<typeof makeSnapshot>> };
type QuerySpec = { path: string; group?: boolean; fields?: string[]; orders: [string, string][]; cursor?: unknown[]; maximum?: number; filters: [string, string, unknown][] };
type TestCollection = {
  doc: (id: string) => TestRef;
  select: (...fields: string[]) => TestCollection;
  orderBy: (field: unknown, direction?: string) => TestCollection;
  startAfter: (...values: unknown[]) => TestCollection;
  limit: (maximum: number) => TestCollection;
  where: (field: unknown, op: string, value: unknown) => TestCollection;
  get: () => Promise<{ docs: ReturnType<typeof makeSnapshot>[]; empty: boolean; size: number }>;
};
function makeSnapshot(reference: TestRef, data?: TestDocument) { return { exists: data !== undefined, ref: reference, id: reference.id, data: () => data === undefined ? undefined : copy(data) }; }

export function memoryAlertDb(options: { replayCallbacks?: number } = {}) {
  const documents = new Map<string, TestDocument>();
  const writtenPaths: string[] = [];
  const transactionAttempts: number[] = [];
  const readPaths: string[] = [];
  const queryCalls: QuerySpec[] = [];
  const failures = new Set<string>();
  const hooks: { beforeRead?: (path: string) => void | Promise<void> } = {};
  const read = async (path: string) => { await hooks.beforeRead?.(path); if (failures.has(path)) throw new Error("Synthetic unavailable"); };
  let queue: Promise<unknown> = Promise.resolve();
  const ref = (path: string): TestRef => ({ path, id: path.split("/").at(-1)!, collection: name => collection(`${path}/${name}`), get: async () => { await read(path); readPaths.push(path); return snapshot(ref(path)); } });
  const field = (data: TestDocument, key: string): unknown => key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as TestDocument)[part] : undefined, data);
  const compare = (a: unknown, b: unknown): number => {
    // Model the storage types used by these queries, including Timestamp's
    // nanoseconds. ISO strings are strings, not Firestore date values.
    const rank = (value: unknown) => value === null ? 0 : typeof value === "boolean" ? 1
      : typeof value === "number" ? 2 : value instanceof Timestamp ? 3 : typeof value === "string" ? 4 : 5;
    const differentType = rank(a) - rank(b); if (differentType) return differentType;
    if (a instanceof Timestamp && b instanceof Timestamp) return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
    return (a as string | number) < (b as string | number) ? -1 : (a as string | number) > (b as string | number) ? 1 : 0;
  };
  const query = (spec: QuerySpec): TestCollection => ({
    doc: id => ref(`${spec.path}/${id}`),
    select: (...fields) => query({ ...spec, fields }),
    orderBy: (key, direction = "asc") => query({ ...spec, orders: [...spec.orders, [typeof key === "string" ? key : "__name__", direction]] }),
    startAfter: (...values) => query({ ...spec, cursor: values }),
    limit: maximum => query({ ...spec, maximum }),
    where: (key, op, value) => query({ ...spec, filters: [...spec.filters, [typeof key === "string" ? key : "__name__", op, value]] }),
    get: async () => {
      queryCalls.push(spec); await read(spec.path);
      const valueAt = (entry: [string, TestDocument], key: string) => key === "__name__" ? (spec.group ? entry[0] : entry[0].split("/").at(-1)!) : field(entry[1], key);
      let values = [...documents.entries()].filter(([path]) => spec.group ? path.split("/").at(-2) === spec.path : path.startsWith(`${spec.path}/`) && path.split("/").length === spec.path.split("/").length + 1);
      values = values.filter(entry => spec.filters.every(([key, op, value]) => op === "in" ? (value as unknown[]).includes(valueAt(entry, key)) : valueAt(entry, key) === value));
      values = values.filter(entry => spec.orders.every(([key]) => valueAt(entry, key) !== undefined));
      values.sort((a, b) => { for (const [key, direction] of spec.orders) { const result = compare(valueAt(a, key), valueAt(b, key)) * (direction === "desc" ? -1 : 1); if (result) return result; } return 0; });
      if (spec.cursor) values = values.filter(entry => { for (let index = 0; index < spec.orders.length; index++) { const [key, direction] = spec.orders[index]; const result = compare(valueAt(entry, key), spec.cursor![index]) * (direction === "desc" ? -1 : 1); if (result) return result > 0; } return false; });
      values = values.slice(0, spec.maximum);
      const docs = values.map(([path, data]) => {
        readPaths.push(path);
        const projected: TestDocument = spec.fields ? {} : data;
        for (const key of spec.fields ?? []) {
          const value = field(data, key); if (value === undefined) continue;
          const parts = key.split("."); let target = projected;
          for (const part of parts.slice(0, -1)) { target[part] ??= {}; target = target[part] as TestDocument; }
          target[parts.at(-1)!] = value;
        }
        return makeSnapshot(ref(path), projected);
      });
      return { docs, empty: docs.length === 0, size: docs.length };
    }
  });
  const collection = (path: string) => query({ path, orders: [], filters: [] });
  const snapshot = (reference: TestRef) => ({ exists: documents.has(reference.path), ref: reference, id: reference.id,
    data: () => documents.has(reference.path) ? copy(documents.get(reference.path)) : undefined });
  const db = {
    collection,
    collectionGroup: (path: string) => query({ path, group: true, orders: [], filters: [] }),
    doc: ref,
    runTransaction: <T>(callback: (transaction: unknown) => Promise<T>, settings?: { maxAttempts: number }) => {
      transactionAttempts.push(settings?.maxAttempts ?? 5);
      const execute = async () => {
        let result!: T;
        for (let iteration = 0; iteration <= (options.replayCallbacks ?? 0); iteration++) {
          const writes = new Map<string, TestDocument>();
          const transaction = {
            get: async (reference: TestRef) => {
              if (writes.size) throw new Error("Transaction must read before writing");
              await read(reference.path); readPaths.push(reference.path);
              return snapshot(reference);
            },
            getAll: async (...references: TestRef[]) => {
              if (writes.size) throw new Error("Transaction must read before writing");
              for (const reference of references) { await read(reference.path); readPaths.push(reference.path); }
              return references.map(snapshot);
            },
            set: (reference: TestRef, data: TestDocument, settings?: { merge?: boolean }) => {
              const hasUndefined = (value: unknown): boolean => value === undefined || (value !== null && typeof value === "object" && Object.values(value).some(hasUndefined));
              if (hasUndefined(data)) throw new Error("Invalid document");
              const next = settings?.merge ? { ...documents.get(reference.path) } : {};
              for (const [key, value] of Object.entries(data)) {
                if (value instanceof FieldValue && value.isEqual(FieldValue.delete())) delete next[key];
                else next[key] = copy(value);
              }
              writes.set(reference.path, next);
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
  return { db: db as unknown as Firestore, documents, writtenPaths, transactionAttempts, readPaths, queryCalls, failures, hooks };
}
