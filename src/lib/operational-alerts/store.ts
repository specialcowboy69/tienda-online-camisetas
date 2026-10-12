import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { canRunAlerts, readAlertConfig } from "./config";
import { detectIncidents } from "./detect";
import type { AlertCategory, AlertConfig, AlertDelivery, AlertRecord, AlertStore, DeliveryClaim, Incident, ScanProgress, SourceProjection } from "./types";

const LEASE_MS = 120000;
const SAFE_RETRY_MS = 82800000;
type SourceState = { categories: AlertCategory[]; sourceVersionMs: number | null; fingerprint: string | null; catalogLastSuccessAtMs?: number | null };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const deliveryId = (logicalId: string, generation: number) => `operationalAlerts/${logicalId}/deliveries/${generation}`;
const validId = (id: string) => /^operationalAlerts\/[a-f0-9]{64}\/deliveries\/[1-9]\d*$/.test(id)
  || /^operationalAlertRuns\/day-\d{4}-\d{2}-\d{2}\/deliveries\/summary$/.test(id);

function fingerprint(source: SourceProjection): string {
  const common = [source.kind, source.status, source.readable];
  switch (source.kind) {
    // Leases gate age detection but are not business-version identity: order
    // claim/renew/release can legitimately leave updatedAt unchanged.
    case "order": return hash([...common, source.emailReview, source.refundReview, source.fulfillmentBlocked]);
    case "email": return hash(common);
    // Only busy changes webhook classification. Unselected arbitrary error
    // detail must not contradict the scanner's allowlisted projection.
    case "webhook": return hash([...common, source.errorCode === "busy"]);
    case "catalog": return hash([...common, source.lastSuccessAtMs]);
  }
}

function safeIncident(incident: Incident): Incident {
  return { ref: { kind: incident.ref.kind, id: incident.ref.id }, category: incident.category,
    observedAtMs: incident.observedAtMs, sourceVersionMs: incident.sourceVersionMs, trigger: incident.trigger };
}

function owns(delivery: AlertDelivery, token: string, nowMs: number): boolean {
  return delivery.status === "processing" && delivery.lease?.token === token && delivery.lease.expiresAtMs > nowMs;
}
function expired(delivery: AlertDelivery, nowMs: number): boolean {
  return delivery.firstDispatchAtMs !== undefined && (nowMs < delivery.firstDispatchAtMs || nowMs - delivery.firstDispatchAtMs >= SAFE_RETRY_MS);
}
function withoutLease(delivery: AlertDelivery): AlertDelivery {
  const value = { ...delivery }; delete value.lease; return value;
}

/** No business Firestore module import: configuration guards all ledger I/O. */
export function createAlertStore(db: Firestore, now: () => number, config: AlertConfig = readAlertConfig()): AlertStore {
  const enabled = () => canRunAlerts(config);
  const scanRef = () => db.doc("operationalAlertRuns/scan");
  const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`));
  const ownsScan = (data: FirebaseFirestore.DocumentData | undefined, token: string) => data?.lease?.token === token && data.lease.expiresAtMs > now();
  return {
    async recordObservation(input, budget) {
      if (!enabled()) return [];
      const source = input.source;
      const sourceKey = hash([config.environment, source.ref.kind, source.ref.id]);
      const sourceRef = db.doc(`operationalAlertRuns/source-${sourceKey}`);
      const activationRef = db.doc("operationalAlertRuns/config");
      return db.runTransaction(async transaction => {
        const time = now();
        budget?.reserve(2);
        const [activationSnapshot, stateSnapshot] = await transaction.getAll(activationRef, sourceRef);
        const activatedAtMs = activationSnapshot.exists ? activationSnapshot.data()!.activatedAtMs as number : time;
        const state = stateSnapshot.data() as SourceState | undefined;
        const detected = detectIncidents(source, Math.min(input.observedAtMs, time)).map(safeIncident);
        const version = source.sourceVersionMs;
        if (version !== null && state?.sourceVersionMs !== null && state?.sourceVersionMs !== undefined && version < state.sourceVersionMs) return [];
        const readable = !detected.some(i => i.category === "source_unreadable");
        const identity = fingerprint(source);
        // A catalog aggregate can gain a newer proven success while its failed
        // head remains unchanged. Accept only that monotonic evidence update.
        const catalogEvidenceAdvanced = readable && source.kind === "catalog" && version === state?.sourceVersionMs
          && typeof state?.catalogLastSuccessAtMs === "number" && source.lastSuccessAtMs !== null
          && source.lastSuccessAtMs > state.catalogLastSuccessAtMs
          && fingerprint({ ...source, lastSuccessAtMs: state.catalogLastSuccessAtMs }) === state.fingerprint;
        const contradictory = readable && version !== null && version === state?.sourceVersionMs && state.fingerprint !== identity && !catalogEvidenceAdvanced;
        const ordered = readable && !contradictory;
        // Preserve uncertainty even when this source had no previous incident.
        const incidents: Incident[] = contradictory ? [{ ref: source.ref, category: "source_unreadable",
          observedAtMs: input.observedAtMs, sourceVersionMs: version, trigger: "daily" }] : detected;
        const categories = [...new Set([...(state?.categories ?? []), ...incidents.map(i => i.category)])];
        const logicalId = (category: AlertCategory) => hash([config.environment, source.ref.kind, source.ref.id, category]);
        const parentRefs = categories.map(category => db.doc(`operationalAlerts/${logicalId(category)}`));
        budget?.reserve(parentRefs.length);
        const parentSnapshots = parentRefs.length ? await transaction.getAll(...parentRefs) : [];
        const parents = parentSnapshots.map(snapshot => snapshot.data() as AlertRecord | undefined);
        const currentRefs = parents.flatMap(parent => parent?.status === "active" ? [db.doc(deliveryId(parent.logicalId, parent.generation))] : []);
        budget?.reserve(currentRefs.length);
        const currentSnapshots = currentRefs.length ? await transaction.getAll(...currentRefs) : [];
        const current = new Map(currentSnapshots.map(snapshot => [snapshot.ref.path, snapshot.data() as AlertDelivery]));
        const previous = input.previous;
        const previousValid = previous !== null && previous !== "unknown"
          && previous.ref.kind === source.ref.kind && previous.ref.id === source.ref.id
          && previous.sourceVersionMs !== null && version !== null && previous.sourceVersionMs < version
          && !detectIncidents(previous, Math.min(input.observedAtMs, time)).some(i => i.category === "source_unreadable");
        const previousCategories = previousValid ? detectIncidents(previous as SourceProjection, input.observedAtMs).map(i => i.category) : [];
        const eligible: string[] = [];
        budget?.reserve(0);
        if (!activationSnapshot.exists) transaction.set(activationRef, { activatedAtMs });
        for (let index = 0; index < categories.length; index++) {
          const category = categories[index]; const parent = parents[index];
          const incident = incidents.find(i => i.category === category);
          if (!incident) {
            if (!parent) continue;
            if (!ordered) { transaction.set(parentRefs[index], { ...parent, needsReconciliation: true }); continue; }
            // Close only on a newer read version or the catalog evidence advance above.
            if (parent.status === "active" && (parent.sourceVersionMs === null || version! > parent.sourceVersionMs || catalogEvidenceAdvanced)) {
              transaction.set(parentRefs[index], { ...parent, status: "resolved", sourceVersionMs: version,
                observedAtMs: input.observedAtMs, needsReconciliation: false });
              const id = deliveryId(parent.logicalId, parent.generation); const delivery = current.get(id);
              if (delivery && delivery.firstDispatchAtMs === undefined && (delivery.status === "pending" || delivery.status === "processing")) {
                transaction.set(db.doc(id), { ...withoutLease(delivery), status: "digest_only" });
              }
            }
            continue;
          }
          if (parent?.status === "active") {
            transaction.set(parentRefs[index], { ...parent, sourceVersionMs: ordered || contradictory ? version : parent.sourceVersionMs,
              observedAtMs: input.observedAtMs, needsReconciliation: !ordered });
            const id = deliveryId(parent.logicalId, parent.generation); const delivery = current.get(id);
            if (delivery && (delivery.status === "pending" || delivery.status === "processing")) eligible.push(id);
            continue;
          }
          if (parent && !ordered && !contradictory) {
            transaction.set(parentRefs[index], { ...parent, needsReconciliation: true }); continue;
          }
          const generation = (parent?.generation ?? 0) + 1;
          const id = deliveryId(logicalId(category), generation);
          const immediate = ordered && input.mode === "event" && incident.trigger === "immediate"
            && version !== null && version > activatedAtMs
            && (previous === null || (previousValid && !previousCategories.includes(category)))
            && (state?.sourceVersionMs === null || state?.sourceVersionMs === undefined || version > state.sourceVersionMs);
          const record: AlertRecord = { logicalId: logicalId(category), sourceKey, ref: { ...incident.ref }, category,
            generation, status: "active", sourceVersionMs: ordered || contradictory ? version : null, observedAtMs: input.observedAtMs, needsReconciliation: !ordered };
          const delivery: AlertDelivery = { id, environment: config.environment, kind: "incident", generation, snapshot: { incidents: [incident] },
            status: immediate ? "pending" : "digest_only", attempts: 0 };
          transaction.set(parentRefs[index], record); transaction.set(db.doc(id), delivery);
          if (immediate) eligible.push(id);
        }
        transaction.set(sourceRef, { categories, sourceVersionMs: ordered ? version : state?.sourceVersionMs ?? null,
          fingerprint: ordered ? identity : state?.fingerprint ?? null,
          catalogLastSuccessAtMs: ordered && source.kind === "catalog" ? source.lastSuccessAtMs : state?.catalogLastSuccessAtMs ?? null });
        return eligible;
      }, { maxAttempts: 3 });
    },
    async claimDailyRun(dayUtc) {
      if (!enabled() || !validDay(dayUtc)) return null;
      const reference = scanRef(); const token = randomUUID();
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference); const data = snapshot.data(); const time = now();
        if (data?.lease?.expiresAtMs > time) return null;
        transaction.set(reference, { ...data, dayUtc, lease: { token, expiresAtMs: time + LEASE_MS } });
        return { token };
      }, { maxAttempts: 3 });
    },
    async readScanProgress(token, budget) {
      if (!enabled()) return null;
      budget?.reserve(1);
      const snapshot = await scanRef().get(); const data = snapshot.data();
      if (!ownsScan(data, token)) return null;
      return data?.progress as ScanProgress ?? { phase: "sources", next: 0, cursors: {}, covered: [], counts: {}, references: [], provisional: null,
        catalog: { cursor: null, lastSuccessAtMs: null, head: null, prefix: null, historyComplete: false, nextPrefix: true } };
    },
    async saveScanProgress(token, progress, budget) {
      if (!enabled()) return false;
      const reference = scanRef();
      return db.runTransaction(async transaction => {
        budget?.reserve(1);
        const snapshot = await transaction.get(reference); const data = snapshot.data();
        if (!ownsScan(data, token)) return false;
        transaction.set(reference, { ...data, progress }); return true;
      }, { maxAttempts: 3 });
    },
    async prepareDigest(dayUtc, token, result) {
      if (!enabled() || !validDay(dayUtc)) return null;
      const reference = db.doc(`operationalAlertRuns/day-${dayUtc}/deliveries/summary`);
      return db.runTransaction(async transaction => {
        const [scan, delivery] = await transaction.getAll(scanRef(), reference);
        if (!ownsScan(scan.data(), token) || scan.data()?.dayUtc !== dayUtc) return null;
        if (delivery.exists) return reference.path;
        if (!result.partial && result.pendingCount === 0) return null;
        const value: AlertDelivery = { id: reference.path, environment: config.environment, kind: "digest", generation: 1, status: "pending", attempts: 0,
          snapshot: { incidents: [], scan: { ...result, references: result.references.slice(0, 20) } } };
        transaction.set(reference, value); return reference.path;
      }, { maxAttempts: 3 });
    },
    async finishDailyRun(dayUtc, token, result) {
      if (!enabled() || !validDay(dayUtc)) return false;
      return db.runTransaction(async transaction => {
        const reference = scanRef(); const snapshot = await transaction.get(reference); const data = snapshot.data();
        if (!ownsScan(data, token) || data?.dayUtc !== dayUtc) return false;
        const rest = { ...data }; delete rest.lease;
        transaction.set(reference, rest);
        transaction.set(db.doc(`operationalAlertRuns/day-${dayUtc}`), { result, finishedAtMs: now() }); return true;
      }, { maxAttempts: 3 });
    },
    async claimDelivery(id) {
      if (!enabled() || !validId(id)) return { kind: "skip", reason: "missing" };
      const token = randomUUID(); const reference = db.doc(id);
      return db.runTransaction(async (transaction): Promise<DeliveryClaim> => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return { kind: "skip", reason: "missing" };
        const delivery = snapshot.data() as AlertDelivery; const time = now();
        if (["accepted", "review", "digest_only"].includes(delivery.status)) {
          return { kind: "skip", reason: delivery.status as "accepted" | "review" | "digest_only" };
        }
        if (delivery.lease && delivery.lease.expiresAtMs > time) return { kind: "skip", reason: "busy" };
        if (expired(delivery, time)) {
          transaction.set(reference, { ...withoutLease(delivery), status: "review", outcomeCode: "window_expired" });
          return { kind: "skip", reason: "review" };
        }
        const value: AlertDelivery = { ...delivery, status: "processing", lease: { token, expiresAtMs: time + LEASE_MS } };
        transaction.set(reference, value);
        return { kind: "claimed", token, delivery: value };
      }, { maxAttempts: 3 });
    },
    async prepareDelivery(id, token, message) {
      if (!enabled() || !validId(id)) return null;
      const reference = db.doc(id);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return null;
        const delivery = snapshot.data() as AlertDelivery; const time = now();
        if (!owns(delivery, token, time)) return null;
        if (expired(delivery, time)) {
          transaction.set(reference, { ...withoutLease(delivery), status: "review", outcomeCode: "window_expired" }); return { reason: "review" as const };
        }
        const hourRef = db.doc(`operationalAlertRuns/hour-${new Date(time).toISOString().slice(0, 13)}`);
        const first = delivery.firstDispatchAtMs === undefined;
        const initialIncident = first && delivery.kind === "incident";
        const hourSnapshot = initialIncident ? await transaction.get(hourRef) : null;
        const count = (hourSnapshot?.data()?.initialDispatches as number | undefined) ?? 0;
        if (initialIncident && count >= 20) {
          transaction.set(reference, { ...withoutLease(delivery), status: "digest_only" }); return null;
        }
        const frozen = delivery.message ?? { ...(message.from === undefined ? {} : { from: message.from }),
          to: message.to, subject: message.subject, text: message.text, html: message.html,
          tags: message.tags.map(tag => ({ name: tag.name, value: tag.value })) };
        const idempotencyKey = delivery.idempotencyKey ?? `operational-${hash([config.environment, id])}`;
        if (initialIncident) transaction.set(hourRef, { initialDispatches: count + 1 });
        transaction.set(reference, { ...delivery, message: frozen, idempotencyKey,
          firstDispatchAtMs: delivery.firstDispatchAtMs ?? time, attempts: delivery.attempts + 1 });
        return { message: frozen, idempotencyKey };
      }, { maxAttempts: 3 });
    },
    async finishDelivery(id, token, outcome) {
      if (!enabled() || !validId(id)) return false;
      const reference = db.doc(id);
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return false;
        const delivery = snapshot.data() as AlertDelivery;
        if (!owns(delivery, token, now())) return false;
        if (outcome.kind === "accepted" && (!outcome.providerEmailId.trim() || delivery.firstDispatchAtMs === undefined || !delivery.message || !delivery.idempotencyKey)) return false;
        const rest = withoutLease(delivery);
        transaction.set(reference, outcome.kind === "accepted"
          ? { ...rest, status: "accepted", providerEmailId: outcome.providerEmailId }
          : { ...rest, status: outcome.kind === "retry" ? "pending" : "review", outcomeCode: outcome.code });
        return true;
      }, { maxAttempts: 3 });
    }
  };
}
