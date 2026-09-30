import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import type { EmailJob, StoreOrder } from "./types";

const state = vi.hoisted(() => ({ records: new Map<string, Record<string, unknown>>(), queries: [] as Array<{ name: string; field: string; op: string; limit: number }>, delayJobRead: false, failCommit: false, sender: "Club <first@example.com>", apiKey: "synthetic-key" }));
vi.mock("./env", () => ({ env: { get RESEND_FROM_EMAIL() { return state.sender; }, get RESEND_API_KEY() { return state.apiKey; } } }));
vi.mock("./firebase-admin", () => ({ getDb: () => ({
  collection: (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }),
    where: (field: string, op: string, value: unknown) => ({ limit: (limit: number) => ({ get: async () => { state.queries.push({ name, field, op, limit }); return { docs: [...state.records.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && (op === "in" ? (value as unknown[]).includes(data[field]) : op === ">" ? String(data[field] || "") > String(value) : data[field] === value)).slice(0, limit).map(([path]) => snapshot(path)) }; } }) })
  }),
  runTransaction: (callback: (transaction: unknown) => Promise<unknown>) => transaction(callback)
}) }));
function snapshot(path: string) { return { exists: state.records.has(path), data: () => structuredClone(state.records.get(path)) }; }
let queue = Promise.resolve();
function transaction(callback: (transaction: unknown) => Promise<unknown>) {
  const result = queue.then(async () => {
    const writes: Array<[string, Record<string, unknown>]> = [];
    const value = await callback({ get: async (ref: { path: string }) => { if (state.delayJobRead && ref.path.startsWith("emailJobs/")) vi.advanceTimersByTime(120000); return snapshot(ref.path); }, set: (ref: { path: string }, patch: Record<string, unknown>, options?: { merge: boolean }) => {
      const next = options?.merge ? { ...state.records.get(ref.path) } : {};
      for (const [key, item] of Object.entries(patch)) {
        if (item instanceof FieldValue && item.isEqual(FieldValue.delete())) delete next[key];
        else next[key] = item;
      }
      writes.push([ref.path, next]);
    } });
    if (state.failCommit) { state.failCommit = false; throw new Error("synthetic commit failure"); }
    for (const [path, data] of writes) state.records.set(path, data);
    return value;
  });
  queue = result.then(() => undefined, () => undefined);
  return result;
}
const order = { id: "order1", status: "paid", orderProcessingLease: { token: "owner", expiresAtMs: 1120000 } } as StoreOrder;
const job: EmailJob = { id: "job1", orderId: "order1", kind: "order_confirmation", message: { to: "ada@example.com", subject: "Receipt", text: "Paid", html: "<p>Paid</p>", tags: [] }, idempotencyKey: "email-job1", status: "pending", attempts: 0, createdAt: "2026-09-30", updatedAt: "2026-09-30" };
async function worker() {
  return import("./email-jobs");
}
describe("durable email jobs with real persistence and transport boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(1000000); state.records.clear(); state.queries = []; state.delayJobRead = false; state.failCommit = false;
    state.sender = "Club <first@example.com>"; state.apiKey = "synthetic-key";
    state.records.set("orders/order1", structuredClone(order) as unknown as Record<string, unknown>);
    state.records.set("emailJobs/job1", structuredClone(job) as unknown as Record<string, unknown>);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response('{"id":"provider1"}', { status: 200 })));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("atomically creates a job with the fulfillment receipt and never replaces its message", async () => {
    const db = await import("./firestore");
    state.records.delete("emailJobs/job1"); state.failCommit = true;
    await expect(db.completeClaimedFulfillment("order1", "owner", { status: "printful_confirmed", printfulOrderId: 7 }, job)).rejects.toThrow("commit");
    expect(state.records.get("orders/order1")?.status).toBe("paid"); expect(state.records.has("emailJobs/job1")).toBe(false);
    expect(await db.completeClaimedFulfillment("order1", "owner", { status: "printful_confirmed", printfulOrderId: 7 }, job)).toBe(true);
    expect(state.records.get("emailJobs/job1")?.message).toEqual(job.message);
    await db.completeClaimedFulfillment("order1", "owner", {}, { ...job, message: { ...job.message, text: "changed" } });
    expect(state.records.get("emailJobs/job1")?.message).toEqual(job.message);
    expect(await db.completeClaimedFulfillment("order1", "stale", { status: "failed" }, { ...job, id: "job2" })).toBe(false);
    expect(state.records.has("emailJobs/job2")).toBe(false);
  });
  it("atomically applies shipment and job or neither at a crash boundary", async () => {
    const db = await import("./firestore");
    state.failCommit = true;
    await expect(db.applyClaimedShipment("order1", "owner", { status: "shipped" }, { ...job, id: "shipment1", kind: "shipment" })).rejects.toThrow("commit");
    expect(state.records.get("orders/order1")?.status).toBe("paid"); expect(state.records.has("emailJobs/shipment1")).toBe(false);
    expect(await db.applyClaimedShipment("order1", "owner", { status: "shipped" }, { ...job, id: "shipment1", kind: "shipment" })).toBe(true);
    expect(state.records.get("orders/order1")?.status).toBe("shipped"); expect(state.records.has("emailJobs/shipment1")).toBe(true);
  });
  it("never repeats an accepted job even after the provider idempotency window", async () => {
    const { processEmailJob } = await worker();
    expect(await processEmailJob("job1")).toBe("accepted");
    vi.advanceTimersByTime(86400000 * 2);
    expect(await processEmailJob("job1")).toBe("accepted");
    expect(fetch).toHaveBeenCalledTimes(1); expect(state.records.get("emailJobs/job1")).toMatchObject({ status: "accepted", providerEmailId: "provider1", attempts: 1 });
  });
  it("returns retry when the claim cannot commit, without making an HTTP request", async () => {
    const { processEmailJob } = await worker(); state.failCommit = true;
    expect(await processEmailJob("job1")).toBe("retry"); expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps a response without provider ID pending for safe recovery", async () => {
    const { processEmailJob } = await worker(); vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    expect(await processEmailJob("job1")).toBe("retry");
    expect(state.records.get("emailJobs/job1")).toMatchObject({ status: "pending", firstDispatchAtMs: 1000000 });
    expect(state.records.get("emailJobs/job1")).not.toHaveProperty("providerEmailId");
  });
  it("rejects an expired order owner before either atomic result or job write", async () => {
    const db = await import("./firestore"); vi.advanceTimersByTime(120000);
    expect(await db.completeClaimedFulfillment("order1", "owner", { status: "printful_confirmed" }, { ...job, id: "newjob" })).toBe(false);
    expect(await db.applyClaimedShipment("order1", "owner", { status: "shipped" }, { ...job, id: "newjob" })).toBe(false);
    expect(state.records.get("orders/order1")?.status).toBe("paid"); expect(state.records.has("emailJobs/newjob")).toBe(false);
  });
  it("checks the order lease after all transaction reads before atomically writing", async () => {
    const db = await import("./firestore"); state.delayJobRead = true;
    expect(await db.completeClaimedFulfillment("order1", "owner", { status: "printful_confirmed" }, { ...job, id: "newjob" })).toBe(false);
    expect(state.records.get("orders/order1")?.status).toBe("paid"); expect(state.records.has("emailJobs/newjob")).toBe(false);
  });
  it("blocks missing configuration without starting the dispatch clock", async () => {
    const { processEmailJob } = await worker(); state.apiKey = "";
    expect(await processEmailJob("job1")).toBe("blocked");
    expect(fetch).not.toHaveBeenCalled(); expect(state.records.get("emailJobs/job1")).not.toHaveProperty("firstDispatchAtMs");
    state.apiKey = "restored"; expect(await processEmailJob("job1")).toBe("accepted");
  });
  it("retries lost acceptance persistence with the identical frozen sender, body and key", async () => {
    const { processEmailJob } = await worker();
    vi.mocked(fetch).mockImplementationOnce(async () => { state.failCommit = true; return new Response('{"id":"provider1"}', { status: 200 }); });
    expect(await processEmailJob("job1")).toBe("retry");
    state.sender = "Club <changed@example.com>"; vi.advanceTimersByTime(120000);
    expect(await processEmailJob("job1")).toBe("accepted");
    const first = vi.mocked(fetch).mock.calls[0][1]!; const second = vi.mocked(fetch).mock.calls[1][1]!;
    expect(second.body).toBe(first.body); expect(second.headers).toEqual(first.headers);
    expect(JSON.parse(String(second.body)).from).toBe("Club <first@example.com>");
    expect(state.records.get("emailJobs/job1")?.firstDispatchAtMs).toBe(1000000);
  });
  it("quarantines ambiguous acceptance at the 23-hour boundary without another HTTP request", async () => {
    const { processEmailJob } = await worker();
    vi.mocked(fetch).mockRejectedValue(new Error("sensitive provider detail"));
    expect(await processEmailJob("job1")).toBe("retry"); vi.advanceTimersByTime(82800000);
    expect(await processEmailJob("job1")).toBe("manual_review"); expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.records.get("emailJobs/job1"))).not.toContain("sensitive");
  });
  it("allows only one concurrent dispatcher and fences a stale response", async () => {
    const { processEmailJob } = await worker();
    let release!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = processEmailJob("job1");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(await processEmailJob("job1")).toBe("busy");
    state.records.set("emailJobs/job1", { ...state.records.get("emailJobs/job1"), lease: { token: "replacement", expiresAtMs: 1300000 } });
    release(new Response('{"id":"old-receipt"}', { status: 200 }));
    expect(await first).toBe("retry"); expect(state.records.get("emailJobs/job1")).not.toHaveProperty("providerEmailId");
  });
  it.each([["concurrent_idempotent_requests", "retry"], ["invalid_idempotent_request", "manual_review"]])("handles Resend %s without rotating its key", async (name, result) => {
    const { processEmailJob } = await worker(); vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ name, message: "secret body" }), { status: 409 }));
    expect(await processEmailJob("job1")).toBe(result); expect(state.records.get("emailJobs/job1")?.idempotencyKey).toBe("email-job1");
    expect(JSON.stringify(state.records.get("emailJobs/job1"))).not.toContain("secret body");
  });
  it("independent recovery processes only existing jobs and never creates a legacy email", async () => {
    const { retryOrderEmails } = await worker();
    expect(await retryOrderEmails("legacy")).toEqual([]); expect(fetch).not.toHaveBeenCalled();
    expect(await retryOrderEmails("order1")).toEqual([{ jobId: "job1", result: "accepted" }]);
    expect(state.records.get("orders/order1")?.status).toBe("paid");
  });
  it("lists pending fulfillment and email recovery through bounded single-filter queries", async () => {
    const db = await import("./firestore");
    state.records.set("orders/order1", { ...order, status: "shipped", updatedAt: "2026-09-30" });
    state.records.set("orders/pending", { id: "pending", status: "printful_pending", updatedAt: "2026-09-29" });
    state.records.set("orders/legacy", { id: "legacy", status: "shipped", emailReviewReason: "Legacy", updatedAt: "2026-09-28" });
    const list = await db.listOrdersForReview(10);
    expect(list.map((item) => item.id)).toEqual(["order1", "pending", "legacy"]);
    expect(list[0]).toMatchObject({ emailJobs: [{ id: "job1", status: "pending" }] });
    expect(state.queries.every((query) => query.limit > 0 && query.limit <= 100)).toBe(true);
  });
  it("keeps a shipped order with a missing confirmation visible after all existing email jobs are accepted", async () => {
    const db = await import("./firestore");
    state.records.set("orders/order1", { ...order, status: "shipped", emailPolicyVersion: 1, emailReviewReason: "Order confirmation email is missing. Manual review required.", updatedAt: "2026-09-30" });
    state.records.set("emailJobs/job1", { ...job, kind: "shipment", status: "accepted", providerEmailId: "provider1" });
    expect(await db.listOrdersForReview()).toMatchObject([{ id: "order1", emailReviewReason: expect.stringContaining("confirmation"), emailJobs: [{ status: "accepted" }] }]);
  });
});
