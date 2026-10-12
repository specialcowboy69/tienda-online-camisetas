import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { memoryAlertDb, sourceAt, T0 } from "./test-support";
import { projectSource } from "./detect";
import { observeCommittedChange } from "./observe";
import { GET } from "../../app/api/operations/digest/route";
import type { AlertConfig } from "./types";
import type { sendEmail } from "../email";

const boundary = vi.hoisted(() => ({
  db: vi.fn(), after: vi.fn(), send: vi.fn<typeof sendEmail>(),
  stripe: vi.fn(), printful: vi.fn(), config: {} as AlertConfig
}));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: boundary.after }));
vi.mock("../firebase-admin", () => ({ getDb: boundary.db }));
vi.mock("./config", async original => ({ ...await original<typeof import("./config")>(), readAlertConfig: () => boundary.config }));
vi.mock("../env", async original => ({ ...await original<typeof import("../env")>(), env: { ADMIN_SECRET: "synthetic-admin", CRON_SECRET: "synthetic-cron" } }));
vi.mock("../email", async original => ({ ...await original<typeof import("../email")>(), sendEmail: boundary.send }));
vi.mock("../stripe", async original => Object.fromEntries(Object.entries(await original<typeof import("../stripe")>()).map(([name, value]) =>
  [name, typeof value === "function" ? (...args: unknown[]) => { boundary.stripe(name, ...args); throw new Error("Unexpected Stripe operation"); } : value])));
vi.mock("../printful", async original => Object.fromEntries(Object.entries(await original<typeof import("../printful")>()).map(([name, value]) =>
  [name, typeof value === "function" && name !== "PrintfulApiError" ? (...args: unknown[]) => { boundary.printful(name, ...args); throw new Error("Unexpected Printful operation"); } : value])));

describe("operational alert lifecycle through real observer and digest handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.config = { enabled: true, environment: "production", recipient: "ops@example.com", sender: "alerts@example.com", siteUrl: "https://shop.example.com" };
    boundary.send.mockResolvedValue({ kind: "accepted", providerEmailId: "synthetic-receipt" });
    boundary.after.mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  // Missing observation, broken deduplication, false resolution or generation
  // reuse must break this end-to-end state/transport contract.
  it("records, dispatches, deduplicates, summarizes, resolves and reopens a synthetic failure without business effects", async () => {
    const memory = memoryAlertDb({ replayCallbacks: 1 });
    boundary.db.mockReturnValue(memory.db);
    const network = vi.fn(() => { throw new Error("Unexpected external request"); });
    vi.stubGlobal("fetch", network);
    let time = T0;
    vi.spyOn(Date, "now").mockImplementation(() => time);
    const ref = { kind: "order" as const, id: "synthetic-order" };
    const healthyRaw = sourceAt("paid");
    const healthy = projectSource(ref, healthyRaw);
    memory.documents.set("orders/synthetic-order", healthyRaw);
    memory.documents.set("syncRuns/latest", { status: "success", createdAt: Timestamp.fromMillis(T0) });
    await observeCommittedChange({ source: healthy, previous: "unknown", mode: "event", observedAtMs: time });
    expect(memory.documents.get("operationalAlertRuns/config")).toEqual({ activatedAtMs: T0 });

    time += 1000;
    const failedRaw = sourceAt("failed", { updatedAt: new Date(time).toISOString(), recipient: { email: "private-customer@example.com" }, error: { message: "PRIVATE-PROVIDER-DATA" } });
    const failed = projectSource(ref, failedRaw);
    memory.documents.set("orders/synthetic-order", failedRaw);
    const fault = { source: failed, previous: healthy, mode: "event" as const, observedAtMs: time };
    await observeCommittedChange(fault);
    const incidentEntry = [...memory.documents].find(([path, value]) => path.split("/").length === 2 && value.category === "order_failed");
    expect(incidentEntry?.[1]).toMatchObject({ status: "active", generation: 1 });
    const incidentPath = incidentEntry![0];
    const firstDelivery = `${incidentPath}/deliveries/1`;
    expect(memory.documents.get(firstDelivery)).toMatchObject({ status: "pending", attempts: 0 });
    expect(boundary.send).not.toHaveBeenCalled();
    expect(boundary.after).toHaveBeenCalledOnce();
    await boundary.after.mock.calls[0][0]();
    expect(memory.documents.get(firstDelivery)).toMatchObject({ status: "accepted", attempts: 1, providerEmailId: "synthetic-receipt" });
    expect(boundary.send).toHaveBeenCalledOnce();
    expect(boundary.send.mock.calls[0][0]).toMatchObject({ to: "ops@example.com", subject: "Aviso operativo: order_failed" });

    await observeCommittedChange(fault);
    await boundary.after.mock.calls[0][0](); // Replay an already completed callback too.
    expect(boundary.after).toHaveBeenCalledOnce();
    expect(boundary.send).toHaveBeenCalledOnce();

    const request = () => new NextRequest("https://shop.example.com/api/operations/digest", { headers: { authorization: "Bearer synthetic-cron" } });
    const digest = await GET(request());
    expect(digest.status).toBe(200);
    expect(await digest.json()).toEqual({ status: "complete", delivery: "accepted" });
    expect(boundary.send).toHaveBeenCalledTimes(2);
    expect(memory.documents.get("operationalAlertRuns/day-2026-10-12")).toMatchObject({ result: { partial: false, pendingCount: 1, counts: { order_failed: 1 } }, finishedAtMs: time });
    const summaryPath = "operationalAlertRuns/day-2026-10-12/deliveries/summary";
    expect(memory.documents.get(summaryPath)).toMatchObject({ status: "accepted", attempts: 1, providerEmailId: "synthetic-receipt" });
    expect(await (await GET(request())).json()).toEqual({ status: "complete", delivery: "skipped" });
    expect(boundary.send).toHaveBeenCalledTimes(2);

    time += 1000;
    const resolvedRaw = sourceAt("paid", { updatedAt: new Date(time).toISOString() });
    const resolved = projectSource(ref, resolvedRaw);
    memory.documents.set("orders/synthetic-order", resolvedRaw);
    await observeCommittedChange({ source: resolved, previous: failed, mode: "event", observedAtMs: time });
    expect(memory.documents.get(incidentPath)).toMatchObject({ status: "resolved", generation: 1 });
    expect(await (await GET(request())).json()).toEqual({ status: "complete", delivery: "skipped" });
    expect(memory.documents.get("operationalAlertRuns/day-2026-10-12")).toMatchObject({ result: { partial: false, pendingCount: 0 } });
    expect(boundary.send).toHaveBeenCalledTimes(2);

    time += 1000;
    const reopenedRaw = sourceAt("failed", { updatedAt: new Date(time).toISOString() });
    memory.documents.set("orders/synthetic-order", reopenedRaw);
    await observeCommittedChange({ source: projectSource(ref, reopenedRaw), previous: resolved, mode: "event", observedAtMs: time });
    expect(memory.documents.get(incidentPath)).toMatchObject({ status: "active", generation: 2 });
    expect(boundary.after).toHaveBeenCalledTimes(2);
    await boundary.after.mock.calls[1][0]();
    expect(boundary.send).toHaveBeenCalledTimes(3);
    expect(memory.documents.get(`${incidentPath}/deliveries/2`)).toMatchObject({ status: "accepted", attempts: 1 });
    expect(boundary.send.mock.calls[2][1]).not.toBe(boundary.send.mock.calls[0][1]);
    expect(memory.documents.get(firstDelivery)).toMatchObject({ status: "accepted", generation: 1 });
    expect(memory.documents.get("orders/synthetic-order")).toEqual(reopenedRaw);
    expect(memory.writtenPaths.every(path => path.startsWith("operationalAlerts/") || path.startsWith("operationalAlertRuns/"))).toBe(true);
    const storedAlerts = [...memory.documents].filter(([path]) => path.startsWith("operationalAlert"));
    for (const value of [JSON.stringify(storedAlerts), JSON.stringify(boundary.send.mock.calls)]) {
      expect(value).not.toContain("private-customer@example.com");
      expect(value).not.toContain("PRIVATE-PROVIDER-DATA");
    }
    expect(boundary.stripe).not.toHaveBeenCalled();
    expect(boundary.printful).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
});
