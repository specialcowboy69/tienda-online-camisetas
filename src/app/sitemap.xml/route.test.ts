import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicCatalog } from "../../lib/public-catalog";
import { GET } from "./route";
vi.mock("../../lib/public-catalog", () => ({ getPublicCatalog: vi.fn() }));
describe("sitemap response", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns a noncached retriable 503 when catalog is unavailable", async () => {
    vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "unavailable" });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Sitemap temporarily unavailable.");
  });
  it("returns UTF-8 XML and static routes for available empty catalog", async () => {
    vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "available" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const xml = await response.text();
    expect(xml.match(/<loc>/g)).toHaveLength(4);
    expect(xml).toContain("<loc>https://www.funnyteesforall.com/privacy</loc>");
    expect(xml).toContain("<loc>https://www.funnyteesforall.com/cookies</loc>");
  });
});
