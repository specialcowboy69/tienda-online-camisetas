import { afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { ProcessingBusyError } from "../processing-errors";
import { canRunAlerts } from "./config";
import { detectIncidents, projectSource } from "./detect";
import { preventiveRefund, sourceAt, T0 } from "./test-support";
import type { AlertConfig, SourceRef } from "./types";

const order: SourceRef = { kind: "order", id: "synthetic-order" };
const email: SourceRef = { kind: "email", id: "synthetic-email" };
const webhook: SourceRef = { kind: "webhook", id: "stripe:synthetic-event" };
const catalog: SourceRef = { kind: "catalog", id: "catalog" };
const validConfig: AlertConfig = {
  enabled: true, environment: "production", recipient: "operator@example.com",
  sender: "No Context Club <orders@example.com>", siteUrl: "https://www.funnyteesforall.com"
};
const categories = (ref: SourceRef, raw: unknown, nowMs = T0) =>
  detectIncidents(projectSource(ref, raw), nowMs).map(incident => incident.category);

describe("operational alert configuration gate", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("allows the explicitly enabled production configuration", () => {
    expect(canRunAlerts(validConfig)).toBe(true);
  });

  it.each(["preview", "development", "", "Production"])("disables environment %s", environment => {
    expect(canRunAlerts({ ...validConfig, environment })).toBe(false);
  });

  it.each([
    { enabled: false }, { recipient: undefined }, { sender: undefined },
    { recipient: "a@example.com,b@example.com" }, { recipient: "Name <a@example.com>" },
    { recipient: "a@example.com\r\nBcc:b@example.com" }, { sender: "bad" },
    { sender: "a@example.com,b@example.com" }, { sender: "Name <a@example.com> extra" },
    { sender: "Name\n<a@example.com>" }, { sender: "Name\t <a@example.com>" },
    { siteUrl: "http://www.funnyteesforall.com" }, { siteUrl: "https://example.com\n" },
    { siteUrl: "https://localhost" }, { siteUrl: "https://127.0.0.1" },
    { siteUrl: "https://user:password@example.com" }, { siteUrl: "https://example.com?token=private" },
    { siteUrl: "https://example.com/#fragment" }, { siteUrl: "https://example.com/subpath" }
  ])("disables unsafe or incomplete configuration %j", change => {
    expect(canRunAlerts({ ...validConfig, ...change })).toBe(false);
  });

  it.each([undefined, "false", "TRUE", "1", " true", "junk"])("only enables the exact flag true, not %s", async flag => {
    vi.resetModules();
    vi.stubEnv("OPERATIONAL_ALERTS_ENABLED", flag);
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPERATIONAL_ALERTS_TO", "operator@example.com");
    vi.stubEnv("RESEND_FROM_EMAIL", "No Context Club <orders@example.com>");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.funnyteesforall.com");
    const { readAlertConfig } = await import("./config");
    expect(canRunAlerts(readAlertConfig())).toBe(false);
  });

  it("reads the current sender and recipient without requiring commercial secrets", async () => {
    vi.resetModules();
    vi.stubEnv("OPERATIONAL_ALERTS_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("OPERATIONAL_ALERTS_TO", "operator@example.com");
    vi.stubEnv("RESEND_FROM_EMAIL", "No Context Club <orders@example.com>");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://www.funnyteesforall.com/");
    const { readAlertConfig } = await import("./config");
    expect(readAlertConfig()).toEqual(validConfig);
  });

  it("invalid optional alert settings do not prevent the storefront env loading", async () => {
    vi.resetModules();
    vi.stubEnv("OPERATIONAL_ALERTS_ENABLED", "garbage");
    vi.stubEnv("OPERATIONAL_ALERTS_TO", "invalid");
    const { env } = await import("../env");
    expect(env.OPERATIONAL_ALERTS_ENABLED).toBe("garbage");
    const { readAlertConfig } = await import("./config");
    expect(readAlertConfig().enabled).toBe(false);
  });
});

describe("safe source projection and incident detection", () => {
  it.each([
    [order, sourceAt("manual_review"), "order_review"],
    [order, sourceAt("failed"), "order_failed"],
    [order, sourceAt("shipped", { emailReviewReason: "Untrusted text" }), "email_review"],
    [order, sourceAt("paid", { refundReviewReason: "Untrusted text" }), "refund_review"],
    [email, sourceAt("blocked"), "email_blocked"],
    [email, sourceAt("manual_review"), "email_manual_review"],
    [webhook, sourceAt("failed"), "webhook_failed"],
    [catalog, { status: "failed", createdAt: Timestamp.fromMillis(T0), lastSuccessAt: T0 }, "catalog_failed"]
  ])("detects %s source incident %s", (ref, raw, category) => {
    expect(detectIncidents(projectSource(ref as SourceRef, raw), T0)).toEqual([{
      ref, category, observedAtMs: T0, sourceVersionMs: T0, trigger: "immediate"
    }]);
  });

  it("never alerts just because a completed refund has a preventive hold", () => {
    expect(categories(order, preventiveRefund())).toEqual([]);
    expect(categories(order, sourceAt("printful_pending", { fulfillmentBlocked: true }), T0 + 900001)).toEqual([]);
  });

  it("does not suppress review discrepancies on a refunded order", () => {
    expect(categories(order, { ...preventiveRefund(), refundReviewReason: "needs reconciliation" })).toEqual(["refund_review"]);
    expect(categories(order, { ...preventiveRefund(), emailReviewReason: "legacy send unknown" })).toEqual(["email_review"]);
  });

  it.each([order, email])("requires more than 15 minutes without progress for %j", ref => {
    const raw = sourceAt(ref.kind === "order" ? "printful_pending" : "pending");
    expect(categories(ref, raw, T0 + 900000)).toEqual([]);
    expect(detectIncidents(projectSource(ref, raw), T0 + 900001)).toEqual([{
      ref, category: ref.kind === "order" ? "order_stale" : "email_stale",
      observedAtMs: T0 + 900001, sourceVersionMs: T0, trigger: "daily"
    }]);
  });

  it("checks stalled processing email jobs only after their lease expires", () => {
    expect(categories(email, sourceAt("processing", { lease: { token: "private", expiresAtMs: T0 + 1000000 } }), T0 + 900001)).toEqual([]);
    expect(categories(email, sourceAt("processing", { lease: { token: "private", expiresAtMs: T0 + 900001 } }), T0 + 900001)).toEqual(["email_stale"]);
  });

  it("requires more than five minutes and an expired webhook lease", () => {
    const raw = sourceAt("processing", { lease: { token: "private", expiresAtMs: T0 + 120000 } });
    expect(categories(webhook, raw, T0 + 300000)).toEqual([]);
    expect(categories(webhook, raw, T0 + 300001)).toEqual(["webhook_stale"]);
    expect(categories(webhook, { ...raw, lease: { token: "private", expiresAtMs: T0 + 400000 } }, T0 + 300001)).toEqual([]);
  });

  it("supports legacy processing webhooks without a lease", () => {
    expect(categories(webhook, { status: "processing", updatedAt: Timestamp.fromMillis(T0) }, T0 + 300001)).toEqual(["webhook_stale"]);
  });

  it("uses the last successful catalog run, never a recent failed run, for the 36 hour clock", () => {
    const raw = { status: "failed", createdAt: T0 + 129600000, lastSuccessAt: T0 };
    expect(categories(catalog, raw, T0 + 129600000)).toEqual(["catalog_failed"]);
    expect(categories(catalog, raw, T0 + 129600001)).toEqual(["catalog_failed", "catalog_stale"]);
    expect(categories(catalog, { status: "success", createdAt: T0 }, T0 + 129600000)).toEqual([]);
    expect(categories(catalog, { status: "success", createdAt: T0 }, T0 + 129600001)).toEqual(["catalog_stale"]);
  });

  it("a failed catalog with no known success cannot be treated as healthy", () => {
    expect(categories(catalog, { status: "failed", createdAt: T0 })).toEqual(["source_unreadable", "catalog_failed"]);
  });

  it("excludes a normal ProcessingBusyError without suppressing a persisted quarantine", () => {
    expect(categories(webhook, sourceAt("failed", { error: new ProcessingBusyError(2) }))).toEqual([]);
    expect(categories(webhook, sourceAt("failed", { error: { type: "ProcessingBusyError", message: "private" } }))).toEqual([]);
    expect(categories(webhook, sourceAt("failed", {
      lease: { token: "private", expiresAtMs: T0 + 120000 },
      error: { type: "MalformedProcessingLease", message: "private" }
    }))).toEqual(["webhook_failed"]);
  });

  it("categorizes unknown exception types without preserving arbitrary error strings", () => {
    const source = projectSource(webhook, sourceAt("failed", { error: { type: "private-customer@example.com", message: "secret", details: { token: "secret" } } }));
    expect(source.errorCode).toBe("processing_failed");
    expect(categories(webhook, sourceAt("failed", { error: new Error("secret") }))).toEqual(["webhook_failed"]);
  });

  it.each([null, undefined, "invalid", "2026-02-30T00:00:00.000Z", "2026-10-12T24:00:00.000Z", NaN, Infinity, -1, {}])("marks invalid source time %s unreadable", updatedAt => {
    expect(categories(order, sourceAt("printful_pending", { updatedAt }), T0 + 172800000)).toEqual(["source_unreadable"]);
  });

  it("does not fall back to createdAt when the current version time is absent", () => {
    expect(categories(email, { status: "pending", createdAt: new Date(T0).toISOString() }, T0 + 900001)).toEqual(["source_unreadable"]);
  });

  it("normalizes ISO, epoch milliseconds, Date and Firestore timestamps", () => {
    for (const updatedAt of [T0, new Date(T0), new Date(T0).toISOString(), Timestamp.fromMillis(T0)]) {
      expect(projectSource(order, sourceAt("paid", { updatedAt })).sourceVersionMs).toBe(T0);
    }
    expect(categories(webhook, { processedAt: Timestamp.fromMillis(T0) })).toEqual([]);
  });

  it("marks future version times unreadable without inventing an age", () => {
    expect(categories(order, sourceAt("printful_pending", { updatedAt: T0 + 1 }))).toEqual(["source_unreadable"]);
  });

  it("normalizes a real Firestore server timestamp containing nanoseconds", () => {
    const timestamp = new Timestamp(Math.floor(T0 / 1000), 123456000);
    expect(projectSource(webhook, sourceAt("processed", { updatedAt: timestamp })).sourceVersionMs).toBe(T0 + 123);
    expect(categories(webhook, sourceAt("processed", { updatedAt: timestamp }), T0 + 124)).toEqual([]);
  });

  it("rejects nonnumeric lease expiration even if it looks like an ISO timestamp", () => {
    expect(categories(webhook, sourceAt("processing", { lease: { token: "private", expiresAtMs: new Date(T0).toISOString() } }))).toEqual(["source_unreadable"]);
  });

  it("a current order lease prevents an age-only alert during legitimate work", () => {
    const raw = sourceAt("printful_pending", { orderProcessingLease: { token: "private", expiresAtMs: T0 + 1000000 } });
    expect(categories(order, raw, T0 + 900001)).toEqual([]);
  });

  it.each([
    [order, "checkout_created"], [order, "paid"], [order, "printful_confirmed"],
    [order, "shipped"], [email, "accepted"], [webhook, "processed"]
  ])("does not alert on a known healthy state %s %s", (ref, status) => {
    expect(categories(ref as SourceRef, sourceAt(status), T0 + 129600001)).toEqual([]);
  });

  it.each([null, [], "private", sourceAt("unknown-private-status"), sourceAt("processing", { lease: { token: "private", expiresAtMs: "broken" } })])("marks malformed webhook data unreadable", raw => {
    expect(categories(webhook, raw)).toEqual(["source_unreadable"]);
  });

  it("serializes only allowlisted non-PII fields for every source kind", () => {
    const privateFixture = {
      recipient: { name: "PRIVATE_NAME", email: "private@example.com", address1: "PRIVATE_ADDRESS" },
      message: { from: "private@example.com", to: "private@example.com", html: "PRIVATE_PAYLOAD" },
      payload: "PRIVATE_PAYLOAD", lease: { token: "PRIVATE_TOKEN", expiresAtMs: T0 + 1000 },
      orderProcessingLease: { token: "PRIVATE_TOKEN", expiresAtMs: T0 + 1000 },
      refundReviewReason: "PRIVATE_NAME", emailReviewReason: "PRIVATE_ADDRESS",
      error: { type: "PRIVATE_NAME", message: "PRIVATE_TOKEN", details: "PRIVATE_PAYLOAD" }
    };
    const projections = [
      projectSource(order, sourceAt("manual_review", privateFixture)),
      projectSource(email, sourceAt("blocked", privateFixture)),
      projectSource(webhook, sourceAt("failed", privateFixture)),
      projectSource(catalog, { ...privateFixture, status: "failed", createdAt: T0, lastSuccessAt: T0 })
    ];
    const serialized = JSON.stringify(projections);
    for (const forbidden of ["PRIVATE_NAME", "private@example.com", "PRIVATE_ADDRESS", "PRIVATE_PAYLOAD", "PRIVATE_TOKEN", "details", "recipient", "payload", "message"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(projections[0]).toMatchObject({ emailReview: true, refundReview: true });
  });
});
