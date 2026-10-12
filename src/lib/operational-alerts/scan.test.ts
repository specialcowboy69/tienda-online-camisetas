import { describe, expect, it, vi } from "vitest";
import { createAlertStore } from "./store";
import { scanOperationalIncidents } from "./scan";
import { runOperationalDigest } from "./digest";
import { memoryAlertDb, sourceAt, T0 } from "./test-support";
import type { AlertConfig, EmailMessage } from "./types";
import type { EmailSendResult } from "../email";
import { Timestamp } from "firebase-admin/firestore";
import { projectSource } from "./detect";
import { dispatchAlert } from "./dispatch";

function harness() {
  const memory = memoryAlertDb(); let time = T0;
  const config: AlertConfig = { enabled: true, environment: "production", recipient: "operator@example.com", sender: "Store <alerts@example.com>", siteUrl: "https://shop.example.com" };
  const now = () => time;
  const store = createAlertStore(memory.db, now, config);
  const send = vi.fn<(message: EmailMessage, key: string) => Promise<EmailSendResult>>().mockResolvedValue({ kind: "accepted", providerEmailId: "synthetic-receipt" });
  memory.documents.set("syncRuns/latest", { status: "success", createdAt: new Date(T0 - 1000).toISOString() });
  const deps = { db: memory.db, store, config, send, now };
  return { ...memory, ...deps, deps, tick: (value: number) => { time = value; }, scan: async () => {
    const claim = await store.claimDailyRun(new Date(time).toISOString().slice(0, 10));
    if (!claim) throw new Error("Synthetic lease unavailable");
    const result = await scanOperationalIncidents({ db: memory.db, store, now, runToken: claim.token });
    await store.finishDailyRun(new Date(time).toISOString().slice(0, 10), claim.token, result);
    return result;
  } };
}

describe("bounded operational scan", () => {
  it("counts active incidents once and caps safe references at twenty", async () => {
    const h = harness();
    for (let n = 0; n < 25; n++) h.documents.set(`orders/order-${String(n).padStart(4, "0")}`, sourceAt("manual_review"));
    const result = await h.scan();
    expect(result).toMatchObject({ pendingCount: 25, counts: { order_review: 25 }, partial: false, unchecked: [] });
    expect(result.references).toHaveLength(20);
    expect(result.examined).toBeLessThanOrEqual(1000);
  });
  it("makes durable progress through more than a thousand documents without starving other sources", async () => {
    const h = harness();
    for (let n = 0; n < 1500; n++) h.documents.set(`orders/order-${String(n).padStart(4, "0")}`, sourceAt("paid"));
    h.documents.set("emailJobs/blocked", sourceAt("blocked"));
    h.documents.set("webhookEvents/failed", sourceAt("failed"));
    const first = await h.scan();
    expect(first.partial).toBe(true); expect(first.examined).toBeLessThanOrEqual(1000);
    let result = first;
    for (let n = 0; n < 20 && result.partial; n++) result = await h.scan();
    expect(result).toMatchObject({ partial: false, pendingCount: 2, counts: { email_blocked: 1, webhook_failed: 1 } });
    expect([...h.documents.values()].some(value => value.category === "email_blocked")).toBe(true);
    expect([...h.documents.values()].some(value => value.category === "webhook_failed")).toBe(true);
  });
  it("fences progress from expired workers", async () => {
    const h = harness(); const first = await h.store.claimDailyRun("2026-10-12");
    expect(first).not.toBeNull(); expect(await h.store.claimDailyRun("2026-10-12")).toBeNull();
    h.tick(T0 + 120001); const second = await h.store.claimDailyRun("2026-10-12");
    expect(second).not.toBeNull();
    expect(await h.store.readScanProgress(first!.token)).toBeNull();
    expect(await h.store.finishDailyRun("2026-10-12", first!.token, { pendingCount: 0, counts: {}, references: [], partial: false, unchecked: [], examined: 0 })).toBe(false);
  });
  it("keeps a known active incident visible when the origin cannot be read", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review"));
    expect((await h.scan()).pendingCount).toBe(1);
    h.failures.add("orders");
    const result = await h.scan();
    expect(result.partial).toBe(true); expect(result.pendingCount).toBeGreaterThanOrEqual(1);
    expect([...h.documents.values()].find(value => value.category === "order_review")).toMatchObject({ status: "active" });
  });
  it("resolves an incident only after reading a newer healthy source", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review")); await h.scan();
    h.tick(T0 + 1000); h.documents.set("orders/review", sourceAt("paid", { updatedAt: new Date(T0 + 1000).toISOString() }));
    expect(await h.scan()).toMatchObject({ pendingCount: 0, partial: false });
    expect([...h.documents.values()].find(value => value.category === "order_review")).toMatchObject({ status: "resolved" });
  });
  it("accounts for internal ledger reads and limits every page to one hundred", async () => {
    const h = harness();
    for (let n = 0; n < 1200; n++) h.documents.set(`orders/order-${String(n).padStart(4, "0")}`, sourceAt("manual_review"));
    const result = await h.scan();
    // claimDailyRun and finishDailyRun each read one control document outside inspection.
    expect(h.readPaths.length - 2).toBeLessThanOrEqual(result.examined);
    expect(result.examined).toBeLessThanOrEqual(1000); expect(result.partial).toBe(true);
    expect(h.queryCalls.every(query => query.maximum! <= 100)).toBe(true);
  });
  it("stops starting new reads at thirty seconds and retains the unfinished source cursor", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review"));
    h.hooks.beforeRead = path => { if (path === "orders") h.tick(T0 + 30000); };
    const result = await h.scan();
    expect(result).toMatchObject({ partial: true }); expect(result.unchecked).toContain("deadline");
    h.hooks.beforeRead = undefined;
    expect((await h.scan()).pendingCount).toBe(1);
  });
  it("times out a hung inspection read without waiting indefinitely", async () => {
    vi.useFakeTimers();
    try {
      const h = harness(); h.hooks.beforeRead = path => path === "orders" ? new Promise<void>(() => undefined) : undefined;
      const running = h.scan(); await vi.advanceTimersByTimeAsync(5001);
      expect(await running).toMatchObject({ partial: true, unchecked: expect.arrayContaining(["orders"]) });
    } finally { vi.useRealTimers(); }
  });
  it("retains delivery failures from old generations after their source resolves", async () => {
    const h = harness(); const path = `operationalAlerts/${"b".repeat(64)}/deliveries/1`;
    h.documents.set(path, { environment: "production", kind: "incident", status: "review", firstDispatchAtMs: T0 - 1000,
      snapshot: { incidents: [{ ref: { kind: "order", id: "resolved-order" } }] } });
    h.documents.set(`operationalAlertRuns/day-2026-10-11/deliveries/summary`, { environment: "production", kind: "digest", status: "pending", firstDispatchAtMs: T0 - 1000, snapshot: { incidents: [] } });
    h.documents.set(`other/${"b".repeat(64)}/deliveries/1`, { environment: "production", status: "review", firstDispatchAtMs: T0 });
    expect(await h.scan()).toMatchObject({ pendingCount: 2, counts: { alert_delivery_review: 2 }, partial: false });
    expect([...h.documents.values()].filter(value => value.category === "alert_delivery_review")).toHaveLength(0);
  });
  it("uses aggregate catalog identity and does not reset the stale-success clock after failures", async () => {
    const h = harness(); h.documents.delete("syncRuns/latest");
    h.documents.set("syncRuns/old-success", { status: "success", createdAt: new Date(T0 - 40 * 3600000).toISOString() });
    h.documents.set("syncRuns/new-failure", { status: "failed", createdAt: new Date(T0 - 1000).toISOString() });
    expect(await h.scan()).toMatchObject({ pendingCount: 2, counts: { catalog_failed: 1, catalog_stale: 1 }, references: [{ kind: "catalog", id: "catalog" }] });
    h.tick(T0 + 1000); h.documents.set("syncRuns/new-success", { status: "success", createdAt: new Date(T0 + 1000).toISOString() });
    expect(await h.scan()).toMatchObject({ pendingCount: 0, partial: false });
  });
  it("never treats failure-only or future catalog history as healthy", async () => {
    const h = harness(); h.documents.delete("syncRuns/latest");
    h.documents.set("syncRuns/failure", { status: "failed", createdAt: new Date(T0 - 1000).toISOString() });
    expect(await h.scan()).toMatchObject({ partial: true, counts: { source_unreadable: 1, catalog_failed: 1 } });
    h.documents.set("syncRuns/future", { status: "success", createdAt: new Date(T0 + 100000).toISOString() });
    const result = await h.scan();
    expect(result.pendingCount).toBeGreaterThan(0);
    expect([...h.documents.values()].find(value => value.category === "catalog_failed")).toMatchObject({ status: "active" });
  });
  it("does not replace malformed or future lastSuccessAt evidence with a historical success", async () => {
    for (const lastSuccessAt of ["invalid", T0 + 1000]) {
      const h = harness(); h.documents.set("syncRuns/latest", { status: "success", createdAt: new Date(T0 - 10000).toISOString() });
      h.documents.set("syncRuns/failed", { status: "failed", createdAt: new Date(T0 - 1000).toISOString(), lastSuccessAt });
      expect((await h.scan()).counts.source_unreadable).toBe(1);
    }
  });
  it("continues catalog history by native timestamp and ID and rechecks a new successful head", async () => {
    const h = harness(); h.documents.delete("syncRuns/latest");
    for (let n = 0; n < 1500; n++) h.documents.set(`syncRuns/failure-${String(n).padStart(4, "0")}`, { status: "failed", createdAt: Timestamp.fromMillis(T0 - n - 1000) });
    h.documents.set("syncRuns/old-success", { status: "success", createdAt: Timestamp.fromMillis(T0 - 40 * 3600000) });
    const first = await h.scan(); expect(first.partial).toBe(true); expect(first.examined).toBeLessThanOrEqual(1000);
    const second = await h.scan(); expect(second).toMatchObject({ counts: { catalog_failed: 1, catalog_stale: 1 }, partial: false });
    h.documents.set("syncRuns/new-success", { status: "success", createdAt: Timestamp.fromMillis(T0) });
    expect(await h.scan()).toMatchObject({ pendingCount: 0, partial: false });
  });
  it("rechecks a new catalog head while its old history cursor is still unfinished", async () => {
    const h = harness(); h.documents.delete("syncRuns/latest");
    for (let n = 0; n < 1500; n++) h.documents.set(`syncRuns/failure-${n}`, { status: "failed", createdAt: new Date(T0 - n - 1000).toISOString() });
    expect((await h.scan()).partial).toBe(true);
    h.documents.set("syncRuns/new-success", { status: "success", createdAt: new Date(T0).toISOString() });
    expect(await h.scan()).toMatchObject({ pendingCount: 0, partial: false });
  });
  it("never persists provider errors or customer fields from projected sources", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review", { email: "private-customer@example.com", address: "private-address", error: { message: "private-provider-payload" } }));
    await h.scan();
    const ledger = JSON.stringify([...h.documents].filter(([path]) => path.startsWith("operational")));
    expect(ledger).not.toContain("private-");
    expect(h.queryCalls.filter(query => query.path === "orders").every(query => query.fields && !query.fields.includes("error") && !query.fields.includes("email") && !query.fields.includes("address"))).toBe(true);
  });
  it("aborts a budget-starved observation transaction without ledger writes", async () => {
    const h = harness(); let remaining = 2;
    await expect(h.store.recordObservation({ source: projectSource({ kind: "order", id: "review" }, sourceAt("manual_review")), previous: "unknown", observedAtMs: T0, mode: "daily" }, {
      reserve: amount => { if (amount > remaining) throw new Error("Synthetic exhausted"); remaining -= amount; }
    })).rejects.toThrow("Synthetic exhausted");
    expect(h.writtenPaths).toEqual([]);
  });
  it("does not let a different-day claim or expired token overwrite progress", async () => {
    const h = harness(); const claim = await h.store.claimDailyRun("2026-10-12");
    const progress = await h.store.readScanProgress(claim!.token);
    expect(await h.store.claimDailyRun("2026-10-13")).toBeNull();
    h.tick(T0 + 120001); await h.store.claimDailyRun("2026-10-13");
    expect(await h.store.saveScanProgress(claim!.token, progress!)).toBe(false);
  });
  it("inspects a changed catalog head before completing a resumed final ledger pass", async () => {
    const h = harness();
    h.documents.set("syncRuns/latest", { status: "failed", createdAt: new Date(T0 - 1000).toISOString() });
    h.documents.set("syncRuns/success", { status: "success", createdAt: new Date(T0 - 5000).toISOString() });
    const claim = await h.store.claimDailyRun("2026-10-12");
    const progress = (await h.store.readScanProgress(claim!.token))!;
    progress.phase = "final"; progress.covered = ["orders", "emailJobs", "webhookEvents", "catalog"]; progress.provisional = { counts: {}, references: [] };
    await h.store.saveScanProgress(claim!.token, progress);
    const result = await scanOperationalIncidents({ db: h.db, store: h.store, now: h.now, runToken: claim!.token });
    expect(result).toMatchObject({ partial: false, pendingCount: 1, counts: { catalog_failed: 1 } });
  });
  it("finds a new success between failures while retaining an unfinished historical cursor", async () => {
    const h = harness(); h.documents.delete("syncRuns/latest");
    for (let n = 0; n < 1600; n++) h.documents.set(`syncRuns/failure-${n}`, { status: "failed", createdAt: Timestamp.fromMillis(T0 - n - 1000) });
    h.documents.set("syncRuns/old-success", { status: "success", createdAt: Timestamp.fromMillis(T0 - 40 * 3600000) });
    expect((await h.scan()).partial).toBe(true);
    h.documents.set("syncRuns/hidden-new-success", { status: "success", createdAt: Timestamp.fromMillis(T0 - 500) });
    h.documents.set("syncRuns/new-failure", { status: "failed", createdAt: Timestamp.fromMillis(T0 - 100) });
    const result = await h.scan();
    expect(result).toMatchObject({ partial: false, pendingCount: 1, counts: { catalog_failed: 1 } });
    expect(result.counts.catalog_stale).toBeUndefined();
  });
  it("reconciles same-run catalog evidence after an event lacked a known success", async () => {
    const h = harness(); h.documents.set("syncRuns/latest", { status: "success", createdAt: new Date(T0 - 10000).toISOString() });
    const failure = { status: "failed", createdAt: new Date(T0 - 1000).toISOString() };
    h.documents.set("syncRuns/failure", failure);
    await h.store.recordObservation({ source: projectSource({ kind: "catalog", id: "catalog" }, failure), previous: "unknown", observedAtMs: T0, mode: "event" });
    expect([...h.documents.values()].find(value => value.category === "source_unreadable")).toMatchObject({ status: "active" });
    expect(await h.scan()).toMatchObject({ pendingCount: 1, counts: { catalog_failed: 1 }, partial: false });
    expect([...h.documents.values()].find(value => value.category === "source_unreadable")).toMatchObject({ status: "resolved" });
  });
  it("resolves stale catalog evidence when a newer known success is established for the same failed head", async () => {
    const h = harness(); const ref = { kind: "catalog" as const, id: "catalog" };
    const createdAt = new Date(T0 - 1000).toISOString();
    await h.store.recordObservation({ source: projectSource(ref, { status: "failed", createdAt, lastSuccessAt: T0 - 40 * 3600000 }), previous: "unknown", mode: "daily", observedAtMs: T0 });
    expect([...h.documents.values()].find(value => value.category === "catalog_stale")).toMatchObject({ status: "active" });
    await h.store.recordObservation({ source: projectSource(ref, { status: "failed", createdAt, lastSuccessAt: T0 - 5000 }), previous: "unknown", mode: "daily", observedAtMs: T0 });
    expect([...h.documents.values()].find(value => value.category === "catalog_stale")).toMatchObject({ status: "resolved" });
    expect([...h.documents.values()].find(value => value.category === "catalog_failed")).toMatchObject({ status: "active" });
    await h.store.recordObservation({ source: projectSource(ref, { status: "failed", createdAt, lastSuccessAt: T0 - 40 * 3600000 }), previous: "unknown", mode: "daily", observedAtMs: T0 });
    expect([...h.documents.values()].find(value => value.category === "catalog_stale")).toMatchObject({ status: "resolved" });
    await h.store.recordObservation({ source: projectSource(ref, { status: "success", createdAt, lastSuccessAt: T0 - 2000 }), previous: "unknown", mode: "daily", observedAtMs: T0 });
    expect([...h.documents.values()].find(value => value.category === "catalog_failed")).toMatchObject({ status: "active" });
  });
});

describe("daily operational digest", () => {
  it("skips a complete empty scan", async () => {
    const h = harness();
    expect(await runOperationalDigest(h.deps)).toEqual({ status: "complete", delivery: "skipped" });
    expect(h.send).not.toHaveBeenCalled();
  });
  it("freezes a summary before sending and never repeats an accepted daily summary", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review"));
    expect(await runOperationalDigest(h.deps)).toEqual({ status: "complete", delivery: "accepted" });
    h.documents.set("orders/new", sourceAt("failed"));
    await runOperationalDigest(h.deps);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.documents.get("operationalAlertRuns/day-2026-10-12/deliveries/summary")).toMatchObject({ status: "accepted", kind: "digest", snapshot: { scan: { pendingCount: 1 } } });
  });
  it.each([{ enabled: false }, { environment: "preview" }])("does zero I/O when disabled: %j", async changed => {
    const h = harness(); Object.assign(h.config, changed);
    expect(await runOperationalDigest(h.deps)).toEqual({ status: "disabled", delivery: "skipped" });
    expect(h.transactionAttempts).toEqual([]); expect(h.send).not.toHaveBeenCalled();
  });
  it("sends an explicit partial digest after a query fails", async () => {
    const h = harness(); h.failures.add("orders");
    expect(await runOperationalDigest(h.deps)).toEqual({ status: "partial", delivery: "accepted" });
    expect(h.send.mock.calls[0][0].text).toContain("parcial");
    expect(h.send.mock.calls[0][0].text).toContain("orders");
  });
  it("retries with the frozen daily message/key and sends no later than the 23 hour boundary", async () => {
    const h = harness(); h.documents.set("orders/review", sourceAt("manual_review")); h.send.mockRejectedValue(new Error("Synthetic transport"));
    expect(await runOperationalDigest(h.deps)).toMatchObject({ delivery: "retry" });
    const first = h.send.mock.calls[0]; h.documents.set("orders/new", sourceAt("failed"));
    expect(await runOperationalDigest(h.deps)).toMatchObject({ delivery: "retry" });
    expect(h.send.mock.calls[1]).toEqual(first);
    h.tick(T0 + 82800000);
    const id = "operationalAlertRuns/day-2026-10-12/deliveries/summary";
    expect(await h.store.claimDelivery(id)).toMatchObject({ kind: "skip", reason: "review" });
    expect(h.send).toHaveBeenCalledTimes(2);
  });
  it("summarizes excess incidents even after twenty hourly initial notices", async () => {
    const h = harness();
    for (let n = 0; n < 21; n++) {
      const id = `operationalAlerts/${String(n).padStart(64, "0")}/deliveries/1`;
      h.documents.set(id, { id, kind: "incident", environment: "production", generation: 1, attempts: 0, status: "pending", snapshot: { incidents: [{ ref: { kind: "order", id: `order-${n}` }, category: "order_review", trigger: "immediate", observedAtMs: T0, sourceVersionMs: T0 }] } });
      await dispatchAlert(id, h.deps);
      if (n === 20) expect(h.documents.get(id)).toMatchObject({ status: "digest_only" });
    }
    expect(h.send).toHaveBeenCalledTimes(20);
    h.documents.set("orders/review", sourceAt("manual_review"));
    expect(await runOperationalDigest(h.deps)).toMatchObject({ delivery: "accepted" });
    expect(h.send).toHaveBeenCalledTimes(21);
    expect(h.documents.get("operationalAlertRuns/hour-2026-10-12T08")).toMatchObject({ initialDispatches: 20 });
  });
});
