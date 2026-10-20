import { expect, it } from "vitest";
import robots from "./robots";
it("allows crawling pages so noindex can be read, excludes APIs and advertises the canonical sitemap", () => {
  expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: "https://www.funnyteesforall.com/sitemap.xml" });
});
