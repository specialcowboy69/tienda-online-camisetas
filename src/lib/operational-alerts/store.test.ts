import { describe, expect, it } from "vitest";
import { projectSource } from "./detect";
import { createAlertStore } from "./store";
import { memoryAlertDb, sourceAt, T0 } from "./test-support";
import type { Observation } from "./types";
import type { EmailMessage } from "../types";

const message: EmailMessage = { from: "alerts@example.com", to: "operator@example.com", subject: "Operational alert", text: "Internal reference", html: "<p>Internal reference</p>", tags: [] };
const config = { enabled: true, environment: "production", recipient: "operator@example.com", sender: "alerts@example.com", siteUrl: "https://shop.example.com" };
function projection(status: string, time: number, id = "order-1", extras = {}) {
  return projectSource({ kind: "order", id }, sourceAt(status, { updatedAt: time, ...extras }));
}
function observation(status: string, time: number, previous: Observation["previous"] = "unknown", id = "order-1", extras = {}): Observation {
  return { source: projection(status, time, id, extras), previous, mode: "event", observedAtMs: time };
}
function harness(replayCallbacks = 0) {
  const memory = memoryAlertDb({ replayCallbacks }); let clock = T0;
  const store = createAlertStore(memory.db, () => clock, config);
  return { ...memory, store, tick: (time: number) => { clock = time; } };
}
async function activate(h: ReturnType<typeof harness>) {
  await h.store.recordObservation(observation("paid", T0)); h.tick(T0 + 1);
}
async function immediate(h: ReturnType<typeof harness>, id = "order-1", time = T0 + 1) {
  h.tick(time);
  return h.store.recordObservation(observation("manual_review", time, projection("paid", time - 1, id), id));
}
function parents(h: ReturnType<typeof harness>) {
  return [...h.documents].filter(([path]) => /^operationalAlerts\/[^/]+$/.test(path)).map(([, data]) => data);
}
function deliveries(h: ReturnType<typeof harness>) {
  return [...h.documents].filter(([path]) => path.includes("/deliveries/")).map(([, data]) => data);
}
async function claimed(h: ReturnType<typeof harness>, id: string) {
  const claim = await h.store.claimDelivery(id);
  if (claim.kind !== "claimed") throw new Error(`Expected claim, got ${claim.reason}`);
  return claim;
}

describe("durable operational alert ledger", () => {
  it.each([{ ...config, enabled: false }, { ...config, environment: "preview" }, { ...config, sender: "" }])("avoids every Firestore access when configuration is disabled", async disabled => {
    const memory = memoryAlertDb(); const store = createAlertStore(memory.db, () => T0, disabled);
    expect(await store.recordObservation(observation("failed", T0))).toEqual([]);
    expect(await store.claimDelivery("operationalAlerts/missing/deliveries/1")).toEqual({ kind: "skip", reason: "missing" });
    expect(await store.prepareDelivery("operationalAlerts/missing/deliveries/1", "token", message)).toBeNull();
    expect(await store.finishDelivery("operationalAlerts/missing/deliveries/1", "token", { kind: "retry", code: "transport_failed" })).toBe(false);
    expect(memory.transactionAttempts).toEqual([]); expect(memory.documents.size).toBe(0);
  });
  it("creates one eligible generation for a repeated incident", async () => {
    const h = harness(); await activate(h);
    const first = await immediate(h); const second = await immediate(h);
    expect(first).toHaveLength(1); expect(second).toEqual(first);
    expect(parents(h)).toMatchObject([{ status: "active", generation: 1 }]);
    expect(deliveries(h)).toHaveLength(1);
  });
  it("preserves old accepted receipts when a resolved incident reopens", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const claim = await claimed(h, id);
    await h.store.prepareDelivery(id, claim.token, message);
    await h.store.finishDelivery(id, claim.token, { kind: "accepted", providerEmailId: "receipt-1" });
    h.tick(T0 + 2); await h.store.recordObservation(observation("paid", T0 + 2, projection("manual_review", T0 + 1)));
    const [next] = await immediate(h, "order-1", T0 + 3);
    expect(next).not.toBe(id); expect(parents(h)).toMatchObject([{ status: "active", generation: 2 }]);
    expect(h.documents.get(id)).toMatchObject({ status: "accepted", providerEmailId: "receipt-1" });
    expect(h.documents.get(next)).toMatchObject({ generation: 2, attempts: 0 });
  });
  it("does not resurrect a category from an observation older than a resolution", async () => {
    const h = harness(); await activate(h); await immediate(h);
    h.tick(T0 + 3); await h.store.recordObservation(observation("paid", T0 + 3));
    expect(await h.store.recordObservation(observation("manual_review", T0 + 2))).toEqual([]);
    expect(parents(h)).toMatchObject([{ status: "resolved", generation: 1 }]);
  });
  it("invalidates an unprepared claim when its source resolves", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const claim = await claimed(h, id);
    h.tick(T0 + 2); await h.store.recordObservation(observation("paid", T0 + 2));
    expect(await h.store.prepareDelivery(id, claim.token, message)).toBeNull();
    expect(await h.store.finishDelivery(id, claim.token, { kind: "retry", code: "transport_failed" })).toBe(false);
    expect(await h.store.claimDelivery(id)).toEqual({ kind: "skip", reason: "digest_only" });
    expect(h.documents.get(id)).not.toHaveProperty("lease");
  });
  it("preserves a prepared attempt and its ownership when its source resolves", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const claim = await claimed(h, id);
    const prepared = await h.store.prepareDelivery(id, claim.token, message);
    h.tick(T0 + 2); await h.store.recordObservation(observation("paid", T0 + 2));
    expect(await h.store.prepareDelivery(id, claim.token, { ...message, text: "changed" })).toEqual(prepared);
    expect(await h.store.finishDelivery(id, claim.token, { kind: "accepted", providerEmailId: "already-sent" })).toBe(true);
    expect(h.documents.get(id)).toMatchObject({ status: "accepted", firstDispatchAtMs: T0 + 1, providerEmailId: "already-sent" });
  });
  it("keeps raw fields and arbitrary exception payloads out of ledger snapshots", async () => {
    const h = harness(); await activate(h); h.tick(T0 + 1);
    const source = projectSource({ kind: "order", id: "safe-internal-id" }, sourceAt("manual_review", { updatedAt: T0 + 1,
      recipient: { email: "customer@example.com", name: "Customer Name" }, error: { message: "secret-token", body: "provider-payload" } }));
    await h.store.recordObservation({ source, previous: null, observedAtMs: T0 + 1, mode: "event" });
    const stored = JSON.stringify([...h.documents]);
    for (const forbidden of ["customer@example.com", "Customer Name", "secret-token", "provider-payload"]) expect(stored).not.toContain(forbidden);
  });
  it("rejects an old category never seen before using the source high watermark", async () => {
    const h = harness(); await activate(h); h.tick(T0 + 3);
    await h.store.recordObservation(observation("paid", T0 + 3));
    expect(await h.store.recordObservation(observation("failed", T0 + 2))).toEqual([]);
    expect(parents(h)).toEqual([]);
  });
  it("keeps first legacy failures and unknown transitions exclusively in the digest", async () => {
    const h = harness();
    for (let n = 0; n < 3; n++) {
      expect(await h.store.recordObservation(observation("failed", T0 - 1000, "unknown", `legacy-${n}`))).toEqual([]);
    }
    expect(deliveries(h)).toHaveLength(3);
    expect(deliveries(h).every(d => d.status === "digest_only")).toBe(true);
    expect(h.documents.get("operationalAlertRuns/config")).toMatchObject({ activatedAtMs: T0 });
    h.tick(T0 + 100); await h.store.recordObservation(observation("paid", T0 + 100));
    expect(h.documents.get("operationalAlertRuns/config")).toMatchObject({ activatedAtMs: T0 });
  });
  it("only alerts immediately for a proven transition after activation", async () => {
    const h = harness(); await activate(h);
    expect(await h.store.recordObservation(observation("failed", T0 + 1))).toEqual([]);
    expect(await immediate(h, "created", T0 + 2)).toHaveLength(1);
    h.tick(T0 + 3);
    expect(await h.store.recordObservation(observation("failed", T0 + 3, null, "new"))).toHaveLength(1);
  });
  it("does not promote a daily or previously recorded incident to an immediate burst", async () => {
    const h = harness(); await activate(h); h.tick(T0 + 1);
    const input = observation("failed", T0 + 1, projection("paid", T0));
    expect(await h.store.recordObservation({ ...input, mode: "daily" })).toEqual([]);
    expect(await h.store.recordObservation(input)).toEqual([]);
    expect(deliveries(h)).toMatchObject([{ status: "digest_only" }]);
  });
  it("opens a newly appearing category without duplicating an existing one", async () => {
    const h = harness(); await activate(h); await immediate(h); h.tick(T0 + 2);
    const ids = await h.store.recordObservation(observation("manual_review", T0 + 2, projection("manual_review", T0 + 1), "order-1", { refundReviewReason: "synthetic" }));
    expect(ids).toHaveLength(2); expect(deliveries(h)).toHaveLength(2);
    expect(parents(h).map(x => x.category).sort()).toEqual(["order_review", "refund_review"]);
  });
  it.each(["missing", "future"])("never resolves active incidents from a %s timestamp", async kind => {
    const h = harness(); await activate(h); await immediate(h); h.tick(T0 + 3);
    const input = observation("paid", kind === "future" ? T0 + 1000 : T0 + 2);
    if (kind === "missing") input.source.sourceVersionMs = null;
    input.observedAtMs = T0 + 3;
    expect(await h.store.recordObservation(input)).toEqual([]);
    expect(parents(h).find(x => x.category === "order_review")).toMatchObject({ status: "active", needsReconciliation: true });
    expect(parents(h).find(x => x.category === "source_unreadable")).toMatchObject({ status: "active" });
  });
  it("does not resolve on a contradictory equal version", async () => {
    const h = harness(); await activate(h); await immediate(h);
    expect(await h.store.recordObservation(observation("paid", T0 + 1))).toEqual([]);
    expect(parents(h)).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "order_review", status: "active", needsReconciliation: true }),
      expect.objectContaining({ category: "source_unreadable", status: "active", needsReconciliation: true })
    ]));
  });
  it("can reconcile an unreadable future timestamp after a valid source is read", async () => {
    const h = harness(); await activate(h); h.tick(T0 + 2);
    const invalid = observation("paid", T0 + 1000); invalid.observedAtMs = T0 + 2;
    await h.store.recordObservation(invalid);
    h.tick(T0 + 3); await h.store.recordObservation(observation("paid", T0 + 3));
    expect(parents(h)).toMatchObject([{ category: "source_unreadable", status: "resolved", needsReconciliation: false }]);
  });
  it("does not accept a previous projection for a different reference as proof", async () => {
    const h = harness(); await activate(h); h.tick(T0 + 2);
    expect(await h.store.recordObservation(observation("failed", T0 + 2, projection("paid", T0 + 1, "other")))).toEqual([]);
  });
  it("allows only one simultaneous claim and rejects stale prepare/finish tokens", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h);
    const claims = await Promise.all([h.store.claimDelivery(id), h.store.claimDelivery(id)]);
    expect(claims.filter(c => c.kind === "claimed")).toHaveLength(1);
    expect(claims.find(c => c.kind === "skip")).toEqual({ kind: "skip", reason: "busy" });
    const first = claims.find(c => c.kind === "claimed")!;
    h.tick(T0 + 120001); const next = await claimed(h, id);
    expect(next.token).not.toBe(first.token);
    expect(await h.store.prepareDelivery(id, first.token, message)).toBeNull();
    expect(await h.store.finishDelivery(id, first.token, { kind: "accepted", providerEmailId: "old" })).toBe(false);
    expect(await h.store.prepareDelivery(id, next.token, message)).not.toBeNull();
    expect(await h.store.finishDelivery(id, next.token, { kind: "accepted", providerEmailId: "new" })).toBe(true);
    expect(await h.store.claimDelivery(id)).toEqual({ kind: "skip", reason: "accepted" });
  });
  it("does not allow prepare or finish after a lease expires without a successor", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    h.tick(T0 + 120001);
    expect(await h.store.prepareDelivery(id, first.token, message)).toBeNull();
    expect(await h.store.finishDelivery(id, first.token, { kind: "retry", code: "transport_failed" })).toBe(false);
  });
  it("freezes the first message and idempotency key across retries", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    const prepared = await h.store.prepareDelivery(id, first.token, message);
    await h.store.finishDelivery(id, first.token, { kind: "retry", code: "receipt_unknown" });
    h.tick(T0 + 100); const second = await claimed(h, id);
    expect(await h.store.prepareDelivery(id, second.token, { ...message, to: "changed@example.com", from: "changed@example.com", text: "changed" })).toEqual(prepared);
    expect(h.documents.get(id)).toMatchObject({ firstDispatchAtMs: T0 + 1, attempts: 2 });
  });
  it("moves an unknown receipt to review at the exact 23-hour boundary", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    await h.store.prepareDelivery(id, first.token, message);
    await h.store.finishDelivery(id, first.token, { kind: "retry", code: "receipt_unknown" });
    h.tick(T0 + 1 + 82800000);
    expect(await h.store.claimDelivery(id)).toEqual({ kind: "skip", reason: "review" });
    expect(h.documents.get(id)).toMatchObject({ status: "review", outcomeCode: "window_expired" });
  });
  it("cannot prepare a claimed retry if its safe window expires while owned", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    await h.store.prepareDelivery(id, first.token, message);
    await h.store.finishDelivery(id, first.token, { kind: "retry", code: "receipt_unknown" });
    h.tick(T0 + 82800000); const second = await claimed(h, id); h.tick(T0 + 82800001);
    expect(await h.store.prepareDelivery(id, second.token, message)).toEqual({ reason: "review" });
    expect(h.documents.get(id)).toMatchObject({ status: "review" });
  });
  it("caps first dispatches at 20 per UTC hour without a deferred excess burst", async () => {
    const h = harness(); await activate(h); const accepted: string[] = []; let excess = "";
    for (let n = 0; n < 21; n++) {
      const [id] = await immediate(h, `quota-${n}`); const claim = await claimed(h, id);
      const prepared = await h.store.prepareDelivery(id, claim.token, message);
      if (prepared) accepted.push(id); else excess = id;
    }
    expect(accepted).toHaveLength(20);
    expect(h.documents.get(excess)).toMatchObject({ status: "digest_only", attempts: 0 });
    h.tick(T0 + 3600000);
    expect(await h.store.claimDelivery(excess)).toEqual({ kind: "skip", reason: "digest_only" });
  });
  it("does not spend another hourly slot retrying the same delivery", async () => {
    const h = harness(); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    await h.store.prepareDelivery(id, first.token, message); await h.store.finishDelivery(id, first.token, { kind: "retry", code: "transport_failed" });
    const second = await claimed(h, id); await h.store.prepareDelivery(id, second.token, message);
    const hour = [...h.documents].find(([path]) => path.startsWith("operationalAlertRuns/hour-"))![1];
    expect(hour).toMatchObject({ initialDispatches: 1 });
  });
  it("does not commit duplicate generations or quota after Firestore callback replay", async () => {
    const h = harness(2); await activate(h); const [id] = await immediate(h); const first = await claimed(h, id);
    await h.store.prepareDelivery(id, first.token, message);
    expect(deliveries(h)).toHaveLength(1);
    expect(h.documents.get(id)).toMatchObject({ attempts: 1 });
    expect([...h.documents].find(([path]) => path.startsWith("operationalAlertRuns/hour-"))![1]).toMatchObject({ initialDispatches: 1 });
    expect(h.transactionAttempts.every(x => x === 3)).toBe(true);
    expect(h.writtenPaths.every(path => /^(operationalAlerts|operationalAlertRuns)\//.test(path))).toBe(true);
  });
  it("skips missing deliveries and never accepts a receipt without a prepared send", async () => {
    const h = harness(); await activate(h);
    expect(await h.store.claimDelivery("operationalAlerts/missing/deliveries/1")).toEqual({ kind: "skip", reason: "missing" });
    const [id] = await immediate(h); const claim = await claimed(h, id);
    expect(await h.store.finishDelivery(id, claim.token, { kind: "accepted", providerEmailId: "unprepared" })).toBe(false);
    await h.store.prepareDelivery(id, claim.token, message);
    expect(await h.store.finishDelivery(id, claim.token, { kind: "accepted", providerEmailId: " " })).toBe(false);
  });
});
