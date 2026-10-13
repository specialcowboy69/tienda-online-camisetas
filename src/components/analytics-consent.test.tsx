import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AnalyticsConsentProvider } from "./analytics-consent";
import { AnalyticsPageRegistration } from "./analytics-page";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
beforeAll(() => vi.stubGlobal("React", React));

describe("analytics server shell", () => {
  it.each([undefined, "false", "true"])("renders children and settings without Google or premature consent on SSR (%s)", (enabled) => {
    const html = renderToStaticMarkup(<AnalyticsConsentProvider enabled={enabled} measurementId="G-4JDZCBK8SY" deployment="production"><input defaultValue="keep my cart" /></AnalyticsConsentProvider>);
    expect(html).toContain("keep my cart");
    expect(html).toContain("Cookie settings");
    expect(html).not.toMatch(/<script|preconnect|googletagmanager|Accept analytics/);
  });
  it("allows page rendering without a provider and exposes no tracking markup", () => {
    expect(renderToStaticMarkup(<AnalyticsPageRegistration path="/" title="Home" />)).toBe("");
  });
});
