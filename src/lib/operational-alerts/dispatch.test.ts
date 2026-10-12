import { describe, expect, it, vi } from "vitest";
import { EmailDispatchError } from "../email";
import type { EmailSendResult } from "../email";
import { dispatchAlert } from "./dispatch";
import { renderOperationalMessage } from "./render";
import { createAlertStore } from "./store";
import { memoryAlertDb, T0 } from "./test-support";
import type { AlertConfig, AlertDelivery, AlertStore, EmailMessage } from "./types";

const id = `operationalAlerts/${"a".repeat(64)}/deliveries/1`;
function fixture(): AlertDelivery {
  return { id, kind: "incident", generation: 1, attempts: 0, status: "pending", snapshot: { incidents: [
    { ref: { kind: "order", id: "order-internal-1" }, category: "order_review", observedAtMs: T0, sourceVersionMs: T0, trigger: "immediate" }
  ] } };
}
function harness() {
  const memory = memoryAlertDb(); let time = T0;
  const config: AlertConfig = { enabled: true, environment: "production", recipient: "operator@example.com", sender: "Store <alerts@example.com>", siteUrl: "https://shop.example.com" };
  memory.documents.set(id, fixture());
  const store = createAlertStore(memory.db, () => time, config);
  const send = vi.fn<(message: EmailMessage, key: string) => Promise<EmailSendResult>>().mockResolvedValue({ kind: "accepted", providerEmailId: "receipt-1" });
  const deps = { store, config, send, now: () => time };
  return { ...memory, deps, send, config, store, tick: (value: number) => { time = value; }, dispatch: () => dispatchAlert(id, deps) };
}

describe("operational message rendering", () => {
  it("renders digest coverage, counts, and capped safe references", () => {
    const h = harness(); const delivery = fixture(); delivery.kind = "digest";
    delivery.snapshot = { incidents: [], scan: { pendingCount: 42, counts: { order_review: 42 }, references: [{ kind: "order", id: "<internal>" }], partial: true, unchecked: ["orders"], examined: 999 } };
    const message = renderOperationalMessage(delivery, h.config);
    expect(message.text).toContain("parcial"); expect(message.text).toContain("42"); expect(message.text).toContain("999");
    expect(message.text).toContain("order_review: 42"); expect(message.text).toContain("orders");
    expect(message.html).toContain("&lt;internal&gt;"); expect(message.html).not.toContain("<internal>");
  });
  it("escapes internal references and exposes only the admin panel destination", () => {
    const h = harness(); const delivery = fixture();
    delivery.snapshot.incidents[0].ref.id = '<script>alert("unsafe")</script>&\'';
    const message = renderOperationalMessage(delivery, { ...h.config, siteUrl: "https://shop.example.com/?x-admin-secret=token#retry" });
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain('href="https://shop.example.com/admin"');
    expect(message.text).toContain("https://shop.example.com/admin");
    expect(message.html).not.toContain("x-admin-secret");
    expect(message.html).not.toContain("token");
    expect(message.html).not.toContain("/retry");
    expect(message.html).toContain('<html lang="es" dir="ltr">');
    expect(message.html).toContain('<main lang="es" dir="ltr"');
    expect(message.html).toContain("<title>");
    expect(message.text).toContain("order_review");
    expect(message.to).toBe("operator@example.com");
    expect(message.from).toBe("Store <alerts@example.com>");
  });
  it("caps digest references at twenty and gives the operator a closed explanation", () => {
    const h = harness(); const delivery = fixture(); delivery.kind = "digest";
    delivery.snapshot.incidents = Array.from({ length: 21 }, (_, n) => ({ ...fixture().snapshot.incidents[0], ref: { kind: "order", id: `internal-${n}` } }));
    const message = renderOperationalMessage(delivery, h.config);
    expect(message.subject).toContain("Resumen");
    expect(message.text).toContain("internal-19");
    expect(message.text).not.toContain("internal-20");
    expect(message.html.match(/<li>/g)).toHaveLength(20);
    expect(message.text).toContain("revision manual");
  });
  it.each(["javascript:alert(1)", "https://user:password@shop.example.com", "https://shop.example.com/a/path"])("rejects unsafe panel origin %s", origin => {
    expect(() => renderOperationalMessage(fixture(), { ...harness().config, siteUrl: origin })).toThrow();
  });
});

describe("recoverable operational dispatch", () => {
  it("persists preparation before sending and retains an accepted provider receipt", async () => {
    const h = harness();
    h.send.mockImplementation(async (message, key) => {
      expect(h.documents.get(id)).toMatchObject({ firstDispatchAtMs: T0, message, idempotencyKey: key, attempts: 1 });
      return { kind: "accepted", providerEmailId: "receipt-1" };
    });
    expect(await h.dispatch()).toBe("accepted");
    expect(h.documents.get(id)).toMatchObject({ status: "accepted", providerEmailId: "receipt-1" });
    expect(await h.dispatch()).toBe("skipped");
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.writtenPaths.every(path => /^(operationalAlerts|operationalAlertRuns)\//.test(path))).toBe(true);
  });
  it("reuses the exact message and key when receipt persistence fails and configuration changes", async () => {
    const h = harness(); const finish = h.store.finishDelivery;
    h.deps.store = { ...h.store, finishDelivery: async (...args) => { h.deps.store = h.store; throw new Error(`receipt persistence unavailable ${args[0]}`); } };
    expect(await h.dispatch()).toBe("retry");
    const first = structuredClone(h.send.mock.calls[0]);
    expect(h.documents.get(id)).toMatchObject({ status: "processing", firstDispatchAtMs: T0 });
    h.config.recipient = "changed@example.com"; h.config.sender = "Changed <changed@example.com>";
    h.tick(T0 + 120001); h.deps.store.finishDelivery = finish;
    expect(await h.dispatch()).toBe("accepted");
    expect(h.send.mock.calls[1][0]).toEqual(first[0]);
    expect(h.send.mock.calls[1][1]).toBe(first[1]);
    expect(h.send.mock.calls[1][0].to).toBe("operator@example.com");
    expect(h.send.mock.calls[1][0].from).toBe("Store <alerts@example.com>");
  });
  it("stops retrying at 23 hours even when the first acceptance receipt is unknown", async () => {
    const h = harness(); h.send.mockRejectedValue(new EmailDispatchError());
    expect(await h.dispatch()).toBe("retry");
    h.tick(T0 + 82800000);
    expect(await h.dispatch()).toBe("review");
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.documents.get(id)).toMatchObject({ status: "review", outcomeCode: "window_expired" });
  });
  it.each(["", " "])("requires a nonempty provider ID (%j)", async providerEmailId => {
    const h = harness(); h.send.mockResolvedValue({ kind: "accepted", providerEmailId });
    expect(await h.dispatch()).toBe("retry");
    expect(h.documents.get(id)).toMatchObject({ status: "pending", outcomeCode: "receipt_unknown" });
    expect(h.documents.get(id)).not.toHaveProperty("providerEmailId");
  });
  it("records a closed transport code for a transient 503 without copying provider errors", async () => {
    const h = harness(); h.send.mockRejectedValue(new Error("503 provider payload customer@example.com secret-token"));
    expect(await h.dispatch()).toBe("retry");
    expect(h.documents.get(id)).toMatchObject({ status: "pending", outcomeCode: "transport_failed" });
    expect(JSON.stringify([...h.documents])).not.toContain("secret-token");
    expect(await h.dispatch()).toBe("retry");
    expect(h.send.mock.calls[1]).toEqual(h.send.mock.calls[0]);
  });
  it("retains a frozen attempt for an ambiguous timeout", async () => {
    const h = harness(); h.send.mockRejectedValue(new EmailDispatchError());
    expect(await h.dispatch()).toBe("retry");
    expect(h.documents.get(id)).toMatchObject({ status: "pending", outcomeCode: "receipt_unknown", firstDispatchAtMs: T0 });
  });
  it("moves idempotency conflicts to review without automatic resend", async () => {
    const h = harness(); h.send.mockRejectedValue(new EmailDispatchError(true));
    expect(await h.dispatch()).toBe("review");
    expect(await h.dispatch()).toBe("review");
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.documents.get(id)).toMatchObject({ status: "review", outcomeCode: "receipt_unknown" });
  });
  it("keeps blocked transport recoverable without claiming acceptance", async () => {
    const h = harness(); h.send.mockResolvedValue({ kind: "blocked", reason: "missing_configuration" });
    expect(await h.dispatch()).toBe("retry");
    expect(h.documents.get(id)).toMatchObject({ status: "pending", outcomeCode: "configuration_missing" });
  });
  it("does not send when another worker takes the lease before preparation", async () => {
    const h = harness(); const prepare = h.store.prepareDelivery;
    h.deps.store = { ...h.store, prepareDelivery: async (...args) => { h.tick(T0 + 120001); await h.store.claimDelivery(id); return prepare(...args); } };
    expect(await h.dispatch()).toBe("skipped");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.documents.get(id)).toMatchObject({ attempts: 0 });
  });
  it("does not send when the lease expires after preparation", async () => {
    const h = harness(); const prepare = h.store.prepareDelivery;
    h.deps.store = { ...h.store, prepareDelivery: async (...args) => { const value = await prepare(...args); h.tick(T0 + 120000); return value; } };
    expect(await h.dispatch()).toBe("retry");
    expect(h.send).not.toHaveBeenCalled();
  });
  it("does not claim accepted if the lease is lost while transport is pending", async () => {
    const h = harness();
    h.send.mockImplementation(async () => { h.tick(T0 + 120001); await h.store.claimDelivery(id); return { kind: "accepted", providerEmailId: "receipt-1" }; });
    expect(await h.dispatch()).toBe("retry");
    expect(h.documents.get(id)).not.toHaveProperty("providerEmailId");
  });
  it("rechecks activation immediately before sending", async () => {
    const h = harness(); const prepare = h.store.prepareDelivery;
    h.deps.store = { ...h.store, prepareDelivery: async (...args) => { const value = await prepare(...args); h.config.enabled = false; return value; } };
    expect(await h.dispatch()).toBe("skipped");
    expect(h.send).not.toHaveBeenCalled();
  });
  it.each([{ enabled: false }, { environment: "preview" }, { sender: "" }, { recipient: "" }])("does no ledger I/O when configuration is inactive: %j", async changed => {
    const h = harness(); Object.assign(h.config, changed);
    expect(await h.dispatch()).toBe("skipped");
    expect(h.transactionAttempts).toEqual([]); expect(h.send).not.toHaveBeenCalled();
  });
  it("returns retry if preparation persistence fails without sending", async () => {
    const h = harness(); h.deps.store = { ...h.store, prepareDelivery: async () => { throw new Error("database unavailable"); } } as AlertStore;
    expect(await h.dispatch()).toBe("retry");
    expect(h.send).not.toHaveBeenCalled();
  });
});
