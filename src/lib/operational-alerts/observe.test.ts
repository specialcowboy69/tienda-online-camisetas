import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectSource } from "./detect";
import type { AlertConfig, Observation } from "./types";

const mocks = vi.hoisted(() => ({ config: {} as AlertConfig, getDb: vi.fn(), record: vi.fn(), dispatch: vi.fn(), after: vi.fn() }));
vi.mock("./config", async importOriginal => ({ ...await importOriginal<typeof import("./config")>(), readAlertConfig: () => mocks.config }));
vi.mock("../firebase-admin", () => ({ getDb: mocks.getDb }));
vi.mock("./store", () => ({ createAlertStore: () => ({ recordObservation: mocks.record }) }));
vi.mock("./dispatch", () => ({ dispatchAlert: mocks.dispatch }));
vi.mock("next/server", () => ({ after: mocks.after }));

const time = Date.parse("2026-10-12T08:00:00Z");
const observation: Observation = { source: projectSource({ kind: "order", id: "one" }, { status: "failed", updatedAt: new Date(time).toISOString() }), previous: null, mode: "event", observedAtMs: time };
describe("post-commit observer", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.useFakeTimers(); vi.setSystemTime(time);
    mocks.config = { enabled: true, environment: "production", recipient: "ops@example.com", sender: "store@example.com", siteUrl: "https://example.com" };
    mocks.getDb.mockReturnValue({}); mocks.record.mockResolvedValue(["delivery"]); mocks.dispatch.mockResolvedValue("accepted"); mocks.after.mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it.each(["disabled", "preview"])("does no operational I/O when %s", async mode => {
    if (mode === "disabled") mocks.config.enabled = false; else mocks.config.environment = "preview";
    const { observeCommittedChange } = await import("./observe");
    await observeCommittedChange(observation);
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.record).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("persists before returning and awaits transport only in the after callback", async () => {
    const { observeCommittedChange } = await import("./observe");
    await observeCommittedChange(observation);
    expect(mocks.record).toHaveBeenCalledWith(observation, expect.objectContaining({ reserve: expect.any(Function) }));
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).toHaveBeenCalledWith("delivery", expect.objectContaining({ config: mocks.config }));
  });
  it("keeps the persisted delivery recoverable when scheduling throws", async () => {
    mocks.after.mockImplementation(() => { throw new Error("sensitive provider payload"); });
    const { observeCommittedChange } = await import("./observe");
    await expect(observeCommittedChange(observation)).resolves.toBeUndefined();
    expect(mocks.record).toHaveBeenCalledOnce(); expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce(); expect(console.warn).toHaveBeenCalledWith("operational_observation_failed");
  });
  it("contains persistence and background errors without logging exception data", async () => {
    mocks.record.mockRejectedValueOnce(new Error("private customer data"));
    const { observeCommittedChange } = await import("./observe");
    await expect(observeCommittedChange(observation)).resolves.toBeUndefined();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce(); expect(console.warn).toHaveBeenCalledWith("operational_observation_failed");
    mocks.dispatch.mockRejectedValue(new Error("private transport data"));
    await observeCommittedChange(observation);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenLastCalledWith("operational_delivery_failed");
  });
  it("bounds observation latency and fences a late transaction before its writes", async () => {
    let resume!: () => void;
    mocks.record.mockImplementation(async (_input, budget) => { await new Promise<void>(resolve => { resume = resolve; }); budget.reserve(0); return ["late"]; });
    const { observeCommittedChange } = await import("./observe");
    const pending = observeCommittedChange(observation);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeUndefined();
    resume(); await vi.runAllTimersAsync();
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
