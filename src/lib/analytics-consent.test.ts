import { describe, expect, it, vi } from "vitest";
import { createConsent, parseConsent, readStoredConsent, resolveAnalyticsConfig, resolveAnalyticsPage, resolveAnalyticsDestination, sanitizeAnalyticsReferrer } from "./analytics-consent";

const now = 1791849600000;
const config = { enabled: "true", measurementId: "G-4JDZCBK8SY", deployment: "production", origin: "https://www.funnyteesforall.com" };

describe("analytics permission policy", () => {
  it.each(["granted", "denied"] as const)("keeps %s for exactly 180 days without renewing it", (choice) => {
    const record = createConsent(choice, now);
    expect(record).toEqual({ version: 1, choice, decidedAt: now });
    expect(parseConsent(JSON.stringify(record), now + 15551999999)).toEqual(record);
    expect(parseConsent(JSON.stringify(record), now + 15552000000)).toBeNull();
  });
  it.each([null, "broken", "null", "[]", "{}", '{"version":2,"choice":"granted","decidedAt":1791849600000}', '{"version":1,"choice":"yes","decidedAt":1791849600000}', '{"version":1,"choice":"granted","decidedAt":1791849600001}', '{"version":1,"choice":"granted","decidedAt":null}', '{"version":1,"choice":"granted","decidedAt":-1}', '{"version":1,"choice":"granted","decidedAt":1791849600000,"email":"x"}'])("denies malformed or unsafe preference %s", (raw) => {
    expect(parseConsent(raw, now)).toBeNull();
  });
  it("rejects a nonfinite clock", () => expect(parseConsent(JSON.stringify(createConsent("granted", now)), NaN)).toBeNull());
  it("removes an expired browser preference instead of leaving the record stored indefinitely", () => {
    const storage = { getItem: () => JSON.stringify(createConsent("granted", now)), removeItem: vi.fn() };
    expect(readStoredConsent(storage, now + 15552000000)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith("ncc.analytics-consent.v1");
  });
  it("enables only the explicit production canonical configuration", () => {
    expect(resolveAnalyticsConfig(config)).toEqual({ measurementId: "G-4JDZCBK8SY", origin: "https://www.funnyteesforall.com" });
  });
  it.each([{ enabled: undefined }, { enabled: "false" }, { enabled: "TRUE" }, { measurementId: undefined }, { measurementId: "G-X&x=y" }, { deployment: "preview" }, { deployment: undefined }, { origin: "http://localhost:3000" }, { origin: "https://funnyteesforall.com" }])("fails closed for configuration %j", (change) => {
    expect(resolveAnalyticsConfig({ ...config, ...change })).toBeNull();
  });
  it.each([["/", "Home"], ["/products", "Products"], ["/products/falling-apart-cat-graphic-tee", "Product"]] as const)("allows registered public page %s", (path, title) => {
    expect(resolveAnalyticsPage(path, { path, title })).toEqual({ path, title });
    expect(resolveAnalyticsPage(path, null)).toBeNull();
    expect(resolveAnalyticsDestination(path)).toEqual({ path, title });
  });
  it.each(["/admin", "/success", "/cancel", "/api/products", "/products/person@example.com", "/products/%66alling-apart-cat-graphic-tee", "/products/", "/?email=x", "/#x"])("denies unapproved path %s even when registered", (path) => {
    expect(resolveAnalyticsPage(path, { path, title: "Product" })).toBeNull();
    expect(resolveAnalyticsDestination(path)).toBeNull();
  });
  it("denies stale registration and wrong title", () => {
    expect(resolveAnalyticsPage("/products", { path: "/", title: "Home" })).toBeNull();
    expect(resolveAnalyticsPage("/", { path: "/", title: "Product" })).toBeNull();
  });
  it.each([
    ["https://example.com/private?email=x#y", "https://example.com"],
    ["https://www.funnyteesforall.com/products?email=x#y", "https://www.funnyteesforall.com/products"],
    ["https://www.funnyteesforall.com/success?order_id=x", ""],
    ["https://www.funnyteesforall.com/products/unknown", ""],
    ["https://user:password@example.com/path", ""],
    ["javascript:alert(1)", ""], ["not a URL", ""], ["", ""]
  ])("sanitizes referrer %s", (raw, safe) => expect(sanitizeAnalyticsReferrer(raw)).toBe(safe));
});
