import { FieldPath, Timestamp } from "firebase-admin/firestore";
import type { Firestore, Query } from "firebase-admin/firestore";
import { detectIncidents, projectSource } from "./detect";
import type { AlertCategory, AlertDelivery, AlertRecord, AlertStore, CatalogCursor, InspectionBudget, ScanPartition, ScanProgress, ScanResult, SourceRef } from "./types";

const partitions: ScanPartition[] = ["orders", "emailJobs", "webhookEvents", "catalog", "ledger", "deliveries"];
const sourceKinds = { orders: "order", emailJobs: "email", webhookEvents: "webhook" } as const;
const sourceCollections = { order: "orders", email: "emailJobs", webhook: "webhookEvents" } as const;
const fields = {
  orders: ["status", "updatedAt", "emailReviewReason", "refundReviewReason", "fulfillmentBlocked", "refundSummary.fulfillmentBlocked", "orderProcessingLease", "error.type", "error.name"],
  emailJobs: ["status", "updatedAt", "lease", "error.type", "error.name"],
  webhookEvents: ["status", "updatedAt", "processedAt", "lease", "error.type", "error.name"],
  catalog: ["status", "createdAt", "lastSuccessAt"]
};
const fresh = (): ScanProgress => ({ phase: "sources", next: 0, cursors: {}, covered: [], counts: {}, references: [], provisional: null,
  catalog: { cursor: null, lastSuccessAtMs: null, head: null, prefix: null, historyComplete: false, nextPrefix: true } });
const compareCatalogCursor = (a: CatalogCursor, b: CatalogCursor) => a.seconds - b.seconds || a.nanoseconds - b.nanoseconds || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function catalogCursor(id: string, raw: unknown): CatalogCursor | null {
  // Firestore orders values by storage type. Converting a string/date/number
  // into a Timestamp cursor can skip records; refuse unsupported history.
  return raw instanceof Timestamp ? { id, seconds: raw.seconds, nanoseconds: raw.nanoseconds } : null;
}
const safeRef = (value: SourceRef | undefined): value is SourceRef => !!value && ["order", "email", "webhook", "catalog"].includes(value.kind)
  && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 300 && !value.id.includes("/");
const ownDelivery = (path: string) => /^operationalAlerts\/[a-f0-9]{64}\/deliveries\/[1-9]\d*$/.test(path)
  || /^operationalAlertRuns\/day-\d{4}-\d{2}-\d{2}\/deliveries\/summary$/.test(path);

/** Counts are observations from a bounded ledger sweep, not a global transactional snapshot. */
export async function scanOperationalIncidents(deps: { db: Firestore; store: AlertStore; now: () => number; runToken: string }): Promise<ScanResult> {
  const deadline = deps.now() + 30000;
  // Reserve all three possible checkpoint transaction attempts before spending on inspection.
  let examined = 3;
  const unchecked = new Set<string>(); const failed = new Set<ScanPartition>();
  let unverifiedRecord: AlertRecord | undefined;
  const exhausted = new Error("inspection_budget");
  const budget: InspectionBudget = { reserve: count => {
    if (deps.now() >= deadline || examined + count > 1000) throw exhausted;
    examined += count;
  } };
  const bounded = async <T>(operation: () => Promise<T>, remaining = deadline - deps.now()): Promise<T> => {
    if (remaining <= 0) throw exhausted;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("inspection_timeout")), Math.min(5000, remaining)); })]); }
    finally { if (timer) clearTimeout(timer); }
  };
  let progress: ScanProgress;
  try {
    const stored = await bounded(() => deps.store.readScanProgress(deps.runToken, budget));
    if (!stored) return { pendingCount: 0, counts: {}, references: [], partial: true, unchecked: ["lease"], examined };
    progress = stored.phase === "complete" ? fresh() : stored;
  } catch { return { pendingCount: 0, counts: {}, references: [], partial: true, unchecked: ["checkpoint"], examined }; }
  const count = (category: AlertCategory, ref: SourceRef) => {
    progress.counts[category] = (progress.counts[category] ?? 0) + 1;
    if (progress.references.length < 20 && !progress.references.some(item => item.kind === ref.kind && item.id === ref.id)) progress.references.push({ ...ref });
  };
  const observe = async (ref: SourceRef, raw: unknown) => {
    let active = true;
    try { await bounded(() => deps.store.recordObservation({ source: projectSource(ref, raw), previous: "unknown", mode: "daily", observedAtMs: deps.now() }, {
      reserve: amount => { if (!active) throw exhausted; budget.reserve(amount); }
    })); } finally { active = false; }
  };
  const page = async (query: Query, maximum = 100) => {
    const limit = Math.min(maximum, 1000 - examined); if (limit < 1) throw exhausted;
    budget.reserve(limit);
    const result = await bounded(() => query.limit(limit).get());
    examined -= limit - result.size;
    return { docs: result.docs, complete: result.size < limit };
  };
  const get = async (path: string) => { budget.reserve(1); return bounded(() => deps.db.doc(path).get()); };
  const queryForCatalog = () => deps.db.collection("syncRuns").select(...fields.catalog).orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  let catalogHead: Record<string, unknown> | undefined;
  const finishCatalog = async () => {
    await observe({ kind: "catalog", id: "catalog" }, { ...catalogHead,
      ...(progress.catalog.lastSuccessAtMs === null || catalogHead?.lastSuccessAt !== undefined ? {} : { lastSuccessAt: progress.catalog.lastSuccessAtMs }) });
    if (progress.catalog.historyComplete && !progress.catalog.prefix) {
      progress.covered = [...new Set([...progress.covered, "catalog" as const])];
      if (progress.catalog.lastSuccessAtMs === null) unchecked.add("catalog");
    }
  };
  // A new successful run must be visible even while an old history cursor continues.
  try {
    const head = await page(queryForCatalog(), 1); catalogHead = head.docs[0]?.data();
    const projected = projectSource({ kind: "catalog", id: "catalog" }, catalogHead);
    const cursor = head.docs[0] ? catalogCursor(head.docs[0].id, catalogHead?.createdAt) : null;
    if (head.docs[0] && !cursor) throw new Error("invalid_catalog_cursor");
    if (cursor && progress.catalog.head && compareCatalogCursor(cursor, progress.catalog.head) !== 0) {
      // Restart only the new prefix; the deep history cursor keeps advancing.
      progress.catalog.prefix = { cursor: null, until: progress.catalog.prefix?.until ?? progress.catalog.head };
      progress.catalog.nextPrefix = true;
    }
    progress.catalog.head = cursor;
    if (projected.kind === "catalog" && projected.lastSuccessAtMs !== null
      && !detectIncidents(projected, deps.now()).some(incident => incident.category === "source_unreadable")) {
      progress.catalog.lastSuccessAtMs = projected.lastSuccessAtMs;
      progress.catalog.historyComplete = true; progress.catalog.prefix = null;
    }
    await finishCatalog();
    if (!progress.catalog.historyComplete || progress.catalog.prefix) {
      progress.covered = progress.covered.filter(part => part !== "catalog");
      if (progress.phase === "final") progress.phase = "sources";
    }
  } catch { unchecked.add("catalog"); failed.add("catalog"); }

  while (deps.now() < deadline && examined < 1000) {
    if (progress.phase === "sources" && partitions.every(part => progress.covered.includes(part))) {
      progress.provisional = { counts: progress.counts, references: progress.references };
      progress.counts = {}; progress.references = []; progress.phase = "final";
      delete progress.cursors.ledger; delete progress.cursors.deliveries;
      progress.covered = progress.covered.filter(part => part !== "ledger" && part !== "deliveries");
    }
    if (progress.phase === "final" && progress.covered.includes("ledger") && progress.covered.includes("deliveries")) { progress.phase = "complete"; break; }
    const candidates = progress.phase === "final" ? partitions.filter(part => part === "ledger" || part === "deliveries") : partitions;
    const available = candidates.filter(part => !progress.covered.includes(part) && !failed.has(part));
    if (!available.length) break;
    let partition = partitions[progress.next % partitions.length];
    while (!available.includes(partition)) { progress.next = (progress.next + 1) % partitions.length; partition = partitions[progress.next]; }
    progress.next = (progress.next + 1) % partitions.length;
    try {
      if (partition === "catalog") {
        let query: Query = queryForCatalog();
        const prefix = progress.catalog.prefix && (progress.catalog.nextPrefix || progress.catalog.historyComplete) ? progress.catalog.prefix : null;
        progress.catalog.nextPrefix = !prefix;
        const cursor = prefix ? prefix.cursor : progress.catalog.cursor;
        if (cursor) query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
        const result = await page(query);
        let success = false;
        for (const doc of result.docs) {
          const data = doc.data(); const projected = projectSource({ kind: "catalog", id: "catalog" }, data);
          const cursor = catalogCursor(doc.id, data.createdAt);
          if (!cursor) { unchecked.add("catalog"); throw new Error("invalid_catalog_cursor"); }
          if (prefix && compareCatalogCursor(cursor, prefix.until) <= 0) { progress.catalog.prefix = null; break; }
          // Validate against this historical run before moving its evidence to
          // the newer head, where the original timestamp relationship is lost.
          if (projected.kind === "catalog" && projected.lastSuccessAtMs !== null
            && !detectIncidents(projected, deps.now()).some(incident => incident.category === "source_unreadable")) {
            progress.catalog.lastSuccessAtMs = Math.max(progress.catalog.lastSuccessAtMs ?? 0, projected.lastSuccessAtMs); success = true; break;
          }
          if (prefix) prefix.cursor = cursor; else progress.catalog.cursor = cursor;
        }
        if (success || result.complete) {
          if (prefix) progress.catalog.prefix = null;
          if (!prefix || success) progress.catalog.historyComplete = true;
        }
        await finishCatalog();
        continue;
      }
      let query: Query;
      if (partition === "ledger") query = deps.db.collection("operationalAlerts").where("status", "==", "active").select("logicalId", "ref", "category", "generation", "status").orderBy(FieldPath.documentId());
      else if (partition === "deliveries") query = deps.db.collectionGroup("deliveries").where("status", "in", ["pending", "processing", "review"]).select("environment", "status", "kind", "firstDispatchAtMs", "snapshot.incidents", "snapshot.scan.references").orderBy(FieldPath.documentId());
      else query = deps.db.collection(partition).select(...fields[partition]).orderBy(FieldPath.documentId());
      const cursor = progress.cursors[partition]; if (cursor) query = query.startAfter(cursor);
      const result = await page(query);
      for (const doc of result.docs) {
        budget.reserve(0);
        if (partition === "ledger") {
          const record = doc.data() as AlertRecord;
          if (!safeRef(record.ref) || !/^[a-f0-9]{64}$/.test(doc.id)) throw new Error("invalid_ledger");
          unverifiedRecord = record;
          if (record.ref.kind !== "catalog") {
            // Select at the query boundary for sources; a singleton ID query also avoids reading PII here.
            budget.reserve(1);
            const collection = sourceCollections[record.ref.kind];
            const source = await bounded(() => deps.db.collection(collection).where(FieldPath.documentId(), "==", record.ref.id).select(...fields[collection]).limit(1).get());
            await observe(record.ref, source.docs[0]?.data());
          }
          const current = (await get(doc.ref.path)).data() as AlertRecord | undefined;
          if (current?.status === "active") count(current.category, current.ref);
          unverifiedRecord = undefined;
        } else if (partition === "deliveries") {
          const delivery = doc.data() as AlertDelivery;
          if (ownDelivery(doc.ref.path) && delivery.environment === "production" && delivery.firstDispatchAtMs !== undefined) {
            const ref = delivery.snapshot?.incidents?.[0]?.ref ?? delivery.snapshot?.scan?.references?.[0] ?? { kind: "catalog" as const, id: "catalog" };
            if (safeRef(ref)) count("alert_delivery_review", ref);
          }
        } else await observe({ kind: sourceKinds[partition], id: doc.id }, doc.data());
        progress.cursors[partition] = partition === "deliveries" ? doc.ref.path : doc.id;
      }
      if (result.complete) progress.covered.push(partition);
    } catch (error) {
      unchecked.add(partition); failed.add(partition);
      if (error === exhausted) break;
    }
  }
  if (deps.now() >= deadline) unchecked.add("deadline");
  if (progress.phase !== "complete") {
    for (const partition of partitions) if (!progress.covered.includes(partition)) unchecked.add(partition);
  }
  try { if (!await bounded(() => deps.store.saveScanProgress(deps.runToken, progress), 3000)) unchecked.add("lease"); }
  catch { unchecked.add("checkpoint"); }
  const summary = progress.phase === "final" && progress.provisional ? progress.provisional : progress;
  const counts = { ...summary.counts }; const references = [...summary.references];
  // A failed reread is not evidence of resolution. Keep this known ledger fact
  // visible without advancing its cursor or accumulating it again next round.
  if (unverifiedRecord) {
    counts[unverifiedRecord.category] = Math.max(counts[unverifiedRecord.category] ?? 0, 1);
    if (references.length < 20 && !references.some(ref => ref.kind === unverifiedRecord!.ref.kind && ref.id === unverifiedRecord!.ref.id)) references.push(unverifiedRecord.ref);
  }
  return { pendingCount: Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0), counts, references: references.slice(0, 20),
    partial: progress.phase !== "complete" || unchecked.size > 0, unchecked: [...unchecked].sort(), examined };
}
