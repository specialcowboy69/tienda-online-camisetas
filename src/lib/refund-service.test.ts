import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { StoreOrder } from "./types";
import { FieldValue } from "firebase-admin/firestore";
import * as service from "./refund-service";

const mocks = vi.hoisted(() => ({ pi: vi.fn(), refunds: vi.fn(), sessions: vi.fn(), charge: vi.fn(), claim: vi.fn(), renew: vi.fn(), release: vi.fn(), update: vi.fn(), snapshots: vi.fn(), get: vi.fn(), find: vi.fn(), refundCreate: vi.fn(), cancel: vi.fn() }));
vi.mock("./stripe", async (original) => ({ ...await original<typeof import("./stripe")>(), getStripe: () => ({ paymentIntents: { retrieve: mocks.pi, cancel: mocks.cancel }, refunds: { list: mocks.refunds, create: mocks.refundCreate }, charges: { retrieve: mocks.charge }, checkout: { sessions: { list: mocks.sessions } } }) }));
vi.mock("./firestore", () => ({ claimOrderProcessing: mocks.claim, renewOrderProcessing: mocks.renew, releaseOrderProcessing: mocks.release, updateClaimedOrder: mocks.update, persistClaimedRefundSnapshots: mocks.snapshots, getOrder: mocks.get, findOrderByStripePaymentIntentId: mocks.find }));

const base = { id: "order1", status: "paid", stripeSessionId: "cs_1", stripePaymentIntentId: "pi_1", totals: { total: 2000, currency: "eur" } } as StoreOrder;
const pi = { id: "pi_1", status: "succeeded", currency: "eur", amount: 2200, amount_received: 2200, metadata: { order_id: "order1" } };
const session = { id: "cs_1", mode: "payment", payment_intent: "pi_1", metadata: { order_id: "order1" }, client_reference_id: "order1" };
const refund = (id: string, amount: number, status = "succeeded", patch = {}) => ({ id, amount, currency: "eur", status, payment_intent: "pi_1", charge: "ch_1", ...patch });
const event = (object = refund("re_1", 2200), type = "refund.created") => ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;
let current: StoreOrder;

async function reconcile() { expect(service).toHaveProperty("reconcileOrderRefunds"); return service.reconcileOrderRefunds(current, "owner"); }
async function handle(value = event()) { expect(service).toHaveProperty("handleStripeRefundEvent"); return service.handleStripeRefundEvent(value); }

describe("authoritative refund reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks(); current = structuredClone(base);
    mocks.pi.mockResolvedValue(pi); mocks.refunds.mockResolvedValue({ data: [], has_more: false });
    mocks.sessions.mockResolvedValue({ data: [session], has_more: false });
    mocks.renew.mockResolvedValue(true); mocks.release.mockResolvedValue(true); mocks.snapshots.mockResolvedValue(true);
    mocks.update.mockImplementation(async (_id, _token, patch) => {
      current = { ...current, ...patch };
      if (patch.refundReviewReason instanceof FieldValue && patch.refundReviewReason.isEqual(FieldValue.delete())) delete current.refundReviewReason;
      return true;
    });
    mocks.get.mockImplementation(async (id) => id === "order1" ? current : null); mocks.find.mockImplementation(async () => current);
    mocks.claim.mockImplementation(async () => ({ kind: "claimed", lease: { token: "owner", expiresAtMs: Date.now() + 120000 }, value: current }));
  });
  afterEach(() => { expect(mocks.refundCreate).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled(); vi.useRealTimers(); });
  it.each([
    [[], "none", 0, 0], [[refund("re_1", 1100)], "partial", 1100, 0],
    [[refund("re_1", 2200)], "full", 2200, 0], [[refund("re_1", 1100), refund("re_2", 1100)], "full", 2200, 0],
    [[refund("re_1", 2200, "pending"), refund("re_2", 2200, "requires_action")], "none", 0, 2],
    [[refund("re_1", 2200, "failed"), refund("re_2", 2200, "canceled"), refund("re_3", 2200)], "full", 2200, 0]
  ])("rebuilds financial totals for fixture %# without changing fulfillment", async (refunds, state, refundedAmount, pendingCount) => {
    mocks.refunds.mockResolvedValue({ data: refunds, has_more: false });
    expect(await reconcile()).toMatchObject({ status: state, refundedAmount, pendingCount, paidAmount: 2200, currency: "eur", paymentIntentId: "pi_1", fulfillmentBlocked: refunds.length > 0 });
    expect(current.status).toBe("paid"); expect(current.fulfillmentBlocked === true).toBe(refunds.length > 0);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("reads beyond 100 refunds and deduplicates identical IDs", async () => {
    const first = Array.from({ length: 100 }, (_, index) => refund(`re_${index}`, 10));
    mocks.refunds.mockResolvedValueOnce({ data: first, has_more: true }).mockResolvedValueOnce({ data: [first[99], refund("re_last", 1200)], has_more: false });
    expect(await reconcile()).toMatchObject({ status: "full", refundedAmount: 2200 });
    expect(mocks.refunds).toHaveBeenLastCalledWith({ payment_intent: "pi_1", limit: 100, starting_after: "re_99" }, { timeout: 20000, maxNetworkRetries: 0 });
    expect(mocks.snapshots.mock.calls[0][2]).toHaveLength(101);
  });
  it("replays events against current canonical state and keeps the hold after reversal", async () => {
    mocks.refunds.mockResolvedValueOnce({ data: [refund("re_1", 2200, "pending")], has_more: false }).mockResolvedValueOnce({ data: [refund("re_1", 2200)], has_more: false }).mockResolvedValueOnce({ data: [refund("re_1", 2200, "failed")], has_more: false });
    await handle(event(refund("re_1", 2200, "succeeded"), "refund.updated"));
    expect(current.refundSummary).toMatchObject({ status: "none", pendingCount: 1 });
    await handle(); expect(current.refundSummary).toMatchObject({ status: "full" });
    await handle(); expect(current.refundSummary).toMatchObject({ status: "none", refundedAmount: 0, failedCount: 1, fulfillmentBlocked: true });
    expect(current.fulfillmentBlocked).toBe(true);
  });
  it.each([
    [refund("re_1", 1, "succeeded", { currency: "usd" })], [refund("re_1", 1, "succeeded", { payment_intent: "pi_other" })],
    [refund("re_1", -1)], [refund("re_1", 0.5)], [refund("re_1", 2201)], [refund("re_1", 1, "unknown")],
    [refund("re_1", 1), refund("re_1", 2)]
  ])("leaves invalid canonical data in review %#", async (...data) => {
    mocks.refunds.mockResolvedValue({ data, has_more: false });
    await expect(reconcile()).rejects.toThrow(); expect(current.refundReviewReason).toBeTruthy(); expect(current.fulfillmentBlocked).toBe(true);
  });
  it.each([{ data: [], has_more: true }, { data: [refund("re_1", 1)], has_more: true }])("rejects pagination that cannot advance", async (page) => {
    mocks.refunds.mockResolvedValue(page); await expect(reconcile()).rejects.toThrow(); expect(mocks.refunds.mock.calls.length).toBeLessThan(4);
  });
  it("fails closed on unavailable Stripe without overwriting the last summary", async () => {
    mocks.pi.mockRejectedValue(new Error("sensitive customer@example.com provider body")); await expect(reconcile()).rejects.toThrow("could not be verified");
    expect(current.refundReviewReason).toBeTruthy(); expect(mocks.snapshots).not.toHaveBeenCalled();
    expect(current.refundReviewReason).not.toContain("customer@example.com");
  });
  it("sanitizes association read errors before callers can persist them", async () => {
    mocks.pi.mockRejectedValue(new Error("sensitive provider body"));
    await expect(handle()).rejects.toThrow("could not be verified");
    expect(current.refundReviewReason).toBeTruthy(); expect(current.refundReviewReason).not.toContain("sensitive");
  });
  it("rejects incomplete list pagination rather than claiming no refunds", async () => {
    mocks.refunds.mockResolvedValue({ data: [] }); await expect(reconcile()).rejects.toThrow(); expect(current.refundReviewReason).toBeTruthy();
  });
  it("retains a prior summary latch when all canonical attempts are canceled", async () => {
    current = { ...current, refundSummary: { paymentIntentId: "pi_1", status: "full", paidAmount: 2200, refundedAmount: 2200, currency: "eur", fulfillmentBlocked: true, pendingCount: 0, canceledCount: 0, failedCount: 0, refundCount: 1, reconciledAt: "before" } };
    mocks.refunds.mockResolvedValue({ data: [refund("re_1", 2200, "canceled")], has_more: false });
    expect(await reconcile()).toMatchObject({ status: "none", canceledCount: 1, fulfillmentBlocked: true });
  });
  it("fences a stale owner before persistence", async () => {
    mocks.renew.mockResolvedValue(false); await expect(reconcile()).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(mocks.snapshots).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("retains review and the hold if snapshot persistence loses ownership", async () => {
    mocks.refunds.mockResolvedValue({ data: [refund("re_1", 2200)], has_more: false }); mocks.snapshots.mockResolvedValue(false);
    await expect(reconcile()).rejects.toMatchObject({ name: "ProcessingOwnershipLostError" });
    expect(current.refundSummary).toBeUndefined(); expect(current.refundReviewReason).toBeTruthy(); expect(current.fulfillmentBlocked).toBe(true);
  });
  it.each([{ status: "processing" }, { amount_received: 0 }, { amount_received: 1.5 }, { currency: "usd" }, { metadata: { order_id: "other" } }, { id: "pi_other" }])("rejects invalid authoritative captured payment %#", async (patch) => {
    mocks.pi.mockResolvedValue({ ...pi, ...patch }); await expect(reconcile()).rejects.toThrow("invalid captured payment"); expect(current.refundReviewReason).toBeTruthy();
  });
  it("latches a verified refund event even while the canonical list is empty", async () => {
    await handle(); expect(current.fulfillmentBlocked).toBe(true); expect(current.refundSummary).toMatchObject({ status: "none", refundCount: 0, fulfillmentBlocked: true });
  });
  it("surfaces known payment association contradictions without altering fulfillment", async () => {
    mocks.sessions.mockResolvedValue({ data: [{ ...session, id: "cs_other" }], has_more: false });
    await expect(handle()).rejects.toThrow(); expect(current.refundReviewReason).toBeTruthy(); expect(current.status).toBe("paid");
  });
  it("acknowledges a charge event using the canonical refund list instead of embedded totals", async () => {
    mocks.refunds.mockResolvedValue({ data: [refund("re_1", 1100)], has_more: false });
    await handle(event({ id: "ch_1", payment_intent: { id: "pi_1" }, amount_refunded: 2200, metadata: {} } as unknown as ReturnType<typeof refund>, "charge.refunded"));
    expect(current.refundSummary).toMatchObject({ status: "partial", refundedAmount: 1100 });
  });
  it("follows legacy Checkout pages until the persisted session is found", async () => {
    mocks.pi.mockResolvedValue({ ...pi, metadata: {} }); mocks.find.mockResolvedValue(null);
    mocks.sessions.mockResolvedValueOnce({ data: [{ ...session, id: "cs_old", metadata: {}, client_reference_id: null }], has_more: true }).mockResolvedValueOnce({ data: [session], has_more: false });
    await expect(handle()).resolves.toBe("reconciled");
    expect(mocks.sessions.mock.calls[1][0]).toEqual({ payment_intent: "pi_1", limit: 100, starting_after: "cs_old" });
  });
  it("never resumes persistence after a late SDK read", async () => {
    expect(service).toHaveProperty("reconcileOrderRefunds");
    vi.useFakeTimers(); let finish!: (value: unknown) => void; mocks.pi.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const task = expect(reconcile()).rejects.toMatchObject({ name: "StripeReadDeadlineExceeded" }); await vi.advanceTimersByTimeAsync(20000); await task;
    const count = mocks.update.mock.calls.length; finish(pi); await vi.advanceTimersByTimeAsync(1); expect(mocks.snapshots).not.toHaveBeenCalled(); expect(mocks.update).toHaveBeenCalledTimes(count);
  });
  it("reconciles after shipment without downgrading its operational status", async () => {
    current = { ...current, status: "shipped", printfulOrderId: 123 }; mocks.refunds.mockResolvedValue({ data: [refund("re_1", 2200)], has_more: false });
    await handle(); expect(current.status).toBe("shipped"); expect(current.refundSummary).toMatchObject({ status: "full" });
  });
  it.each(["refunded", "canceled"] as const)("keeps legacy %s blocked", async (status) => { current.status = status; await reconcile(); expect(current.fulfillmentBlocked).toBe(true); });
  it("normalizes expanded PI and resolves an own event before the paid webhook", async () => {
    current = { ...current, stripePaymentIntentId: undefined, status: "checkout_created" }; mocks.find.mockResolvedValue(null);
    await handle(event(refund("re_1", 2200, "pending", { payment_intent: { id: "pi_1" } })));
    expect(current.stripePaymentIntentId).toBe("pi_1"); expect(current.status).toBe("checkout_created");
  });
  it("resolves legacy metadata through filtered checkout sessions", async () => {
    mocks.pi.mockResolvedValue({ ...pi, metadata: {} }); mocks.find.mockResolvedValue(null); current.stripePaymentIntentId = undefined;
    await expect(handle()).resolves.toBe("reconciled"); expect(mocks.sessions.mock.calls[0][0]).toEqual({ payment_intent: "pi_1", limit: 100 });
  });
  it("retries own events whose order is not stored yet", async () => { mocks.find.mockResolvedValue(null); mocks.get.mockResolvedValue(null); await expect(handle()).rejects.toThrow(); });
  it.each([
    { metadata: { order_id: "other" } }, { payment_intent: "pi_other" }, { id: "cs_other" }
  ])("rejects contradictory stored session associations %#", async (patch) => { mocks.sessions.mockResolvedValue({ data: [{ ...session, ...patch }], has_more: false }); await expect(handle()).rejects.toThrow(); });
  it("acknowledges only positively unrelated payments", async () => { mocks.find.mockResolvedValue(null); mocks.pi.mockResolvedValue({ ...pi, metadata: {} }); mocks.sessions.mockResolvedValue({ data: [], has_more: false }); await expect(handle()).resolves.toBe("unrelated"); expect(mocks.claim).not.toHaveBeenCalled(); });
  it("retrieves a charge when a refund omits its payment intent", async () => { mocks.charge.mockResolvedValue({ id: "ch_1", payment_intent: { id: "pi_1" }, metadata: {} }); await expect(handle(event(refund("re_1", 2200, "succeeded", { payment_intent: null })))).resolves.toBe("reconciled"); });
  it("leaves contention retryable using the generic order lease", async () => { mocks.claim.mockResolvedValue({ kind: "busy", retryAfterSeconds: 42 }); await expect(handle()).rejects.toMatchObject({ retryAfterSeconds: 42 }); expect(mocks.snapshots).not.toHaveBeenCalled(); });
});
