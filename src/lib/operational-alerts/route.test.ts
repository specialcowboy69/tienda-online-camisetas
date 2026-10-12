import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import type { AlertConfig } from "./types";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn(), run: vi.fn(), config: {} as AlertConfig }));
vi.mock("@/lib/auth", () => ({ isCronOrAdminRequest: mocks.auth }));
vi.mock("@/lib/firebase-admin", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/operational-alerts/config", async () => ({ ...await import("./config"), readAlertConfig: () => mocks.config }));
vi.mock("@/lib/operational-alerts/store", () => ({ createAlertStore: vi.fn(() => ({})) }));
vi.mock("@/lib/operational-alerts/digest", () => ({ runOperationalDigest: mocks.run }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

describe("protected operational digest", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.mockReturnValue(true); mocks.getDb.mockReturnValue({});
    mocks.config = { enabled: true, environment: "production", recipient: "ops@example.com", sender: "store@example.com", siteUrl: "https://example.com" };
    mocks.run.mockResolvedValue({ status: "complete", delivery: "accepted" });
  });
  const request = () => new NextRequest("https://example.com/api/operations/digest?payload=private");
  it("rejects unauthenticated input before touching operational storage", async () => {
    mocks.auth.mockReturnValue(false);
    const { GET } = await import("../../app/api/operations/digest/route");
    expect((await GET(request())).status).toBe(401); expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each(["disabled", "preview"])("returns disabled without DB for %s", async mode => {
    if (mode === "disabled") mocks.config.enabled = false; else mocks.config.environment = "preview";
    const { GET } = await import("../../app/api/operations/digest/route");
    const response = await GET(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "disabled" }); expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(["busy", "partial", "complete"])("reports %s explicitly", async status => {
    mocks.run.mockResolvedValue({ status, delivery: "skipped" });
    const { GET } = await import("../../app/api/operations/digest/route");
    const response = await GET(request()); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status, delivery: "skipped" });
  });
  it("sanitizes unexpected failures as 503", async () => {
    mocks.run.mockRejectedValue(new Error("secret-provider-payload"));
    const { GET } = await import("../../app/api/operations/digest/route");
    const response = await GET(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "failed", code: "operational_digest_failed" });
  });
  it("preserves catalog scheduling alongside the bounded daily digest", async () => {
    const route = await import("../../app/api/operations/digest/route");
    expect([route.runtime, route.dynamic, route.maxDuration]).toEqual(["nodejs", "force-dynamic", 60]);
    const deployment = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(deployment.crons).toEqual([{ path: "/api/catalog/sync", schedule: "0 3 * * *" }, { path: "/api/operations/digest", schedule: "0 8 * * *" }]);
  });
});
