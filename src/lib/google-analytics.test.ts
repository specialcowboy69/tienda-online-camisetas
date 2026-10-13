import { describe, expect, it, vi } from "vitest";
import { createGoogleAnalytics } from "./google-analytics";
import { createConsent, type AnalyticsPage } from "./analytics-consent";

const home: AnalyticsPage = { path: "/", title: "Home" };
const products: AnalyticsPage = { path: "/products", title: "Products" };
const origin = "https://www.funnyteesforall.com" as const;
const id = "G-4JDZCBK8SY";

function browser() {
  let time = 1791849600000;
  let cookies = "ncc_ga=one; ncc_ga_4JDZCBK8SY=two; cart=keep; _ga=other";
  const deletions: string[] = [];
  const scripts: HTMLScriptElement[] = [];
  const events = new Map<string, () => void>();
  const location = new URL(origin);
  const foreignLayer: unknown[] = [];
  const recorded: ArrayLike<unknown>[] = [];
  let ownLayer: ArrayLike<unknown>[] = [];
  const win = { location, dataLayer: foreignLayer, gtag: vi.fn(), history: {
    pushState: vi.fn(function (_state: unknown, _title: string, path?: string | URL | null) { if (path) location.href = new URL(path, location).href; return "unchanged"; }),
    replaceState: vi.fn(function (_state: unknown, _title: string, path?: string | URL | null) { if (path) location.href = new URL(path, location).href; })
  }, addEventListener: (event: string, handler: () => void) => events.set(event, handler) };
  Object.defineProperty(win, "nccAnalyticsLayer", { get: () => ownLayer, set: (layer: ArrayLike<unknown>[]) => {
    ownLayer = layer;
    layer.push = (...entries) => { recorded.push(...entries); return Array.prototype.push.apply(layer, entries); };
  } });
  const doc = {
    referrer: "https://example.com/private?email=secret#hash",
    get cookie() { return cookies; }, set cookie(value: string) { deletions.push(value); cookies = cookies.split("; ").filter(c => c.split("=")[0] !== value.split("=")[0]).join("; "); },
    createElement: () => ({ remove: vi.fn(), onload: null, onerror: null }),
    head: { appendChild: (script: HTMLScriptElement) => scripts.push(script) }
  };
  const options = { config: { measurementId: id, origin }, window: win as unknown as Window, document: doc as unknown as Document, now: () => time };
  const runtime = createGoogleAnalytics(options);
  const commands = () => recorded.map(c => Array.from(c));
  const views = () => commands().filter(c => c[0] === "event" && c[1] === "page_view");
  const load = (index = scripts.length - 1) => scripts[index].onload?.call(scripts[index], new Event("load"));
  return { win, doc, options, runtime, scripts, views, commands, load, deletions, events, setTime: (value: number) => { time = value; }, accept: () => createConsent("granted", time) };
}

describe("consent-gated analytics runtime", () => {
  it("makes no request without permission, and loads once with only denied defaults queued", () => {
    const b = browser();
    for (const consent of [null, createConsent("denied", 1791849600000)]) b.runtime.sync({ consent, page: home });
    expect(b.scripts).toHaveLength(0);
    b.runtime.sync({ consent: b.accept(), page: home });
    b.runtime.sync({ consent: b.accept(), page: home });
    expect(createGoogleAnalytics(b.options)).toBe(b.runtime);
    expect(b.scripts).toHaveLength(1);
    expect(b.scripts[0].src).toBe("https://www.googletagmanager.com/gtag/js?id=G-4JDZCBK8SY&l=nccAnalyticsLayer");
    expect(b.commands()).toEqual([["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]]);
    expect(b.views()).toHaveLength(0);
    b.load();
    expect(b.views()).toEqual([["event", "page_view", { send_to: id, page_location: origin + "/", page_title: "Home", page_referrer: "https://example.com" }]]);
    expect(b.commands().find(c => c[0] === "config")?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_prefix: "ncc", cookie_expires: 15552000, cookie_update: false, cookie_domain: "none", cookie_path: "/", cookie_flags: "SameSite=Lax;Secure" });
    expect(b.win.dataLayer).toEqual([]);
    expect(b.win.gtag).not.toHaveBeenCalled();
  });
  it("deduplicates renders and query changes but measures A/B/A", () => {
    const b = browser(); const consent = b.accept();
    b.runtime.sync({ consent, page: home }); b.load();
    b.win.history.pushState({}, "", "/?email=private#secret");
    b.runtime.sync({ consent, page: home });
    expect(b.views()).toHaveLength(1);
    b.win.history.pushState({}, "", "/products?email=private");
    b.runtime.sync({ consent, page: products });
    b.win.history.pushState({}, "", "/");
    b.runtime.sync({ consent, page: home });
    expect(b.views().map(c => (c[2] as { page_location: string }).page_location)).toEqual([origin + "/", origin + "/products", origin + "/"]);
    expect(b.commands().filter(c => c[0] === "config")).toHaveLength(1);
  });
  it("withdraws before load without letting an old callback configure or emit", () => {
    const b = browser(); b.runtime.sync({ consent: b.accept(), page: home });
    const late = b.scripts[0].onload!;
    b.runtime.stop({ clearCookies: true }); late.call(b.scripts[0], new Event("load"));
    expect(b.views()).toHaveLength(0);
    expect(b.commands().some(c => c[0] === "config")).toBe(false);
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(true);
    expect(b.deletions).toHaveLength(2);
    expect(b.doc.cookie).toBe("cart=keep; _ga=other");
  });
  it("reuses loaded script after withdrawal, with one new visit and no remount", () => {
    const b = browser(); b.runtime.sync({ consent: b.accept(), page: home }); b.load();
    b.runtime.stop({ clearCookies: true });
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(true);
    b.runtime.sync({ consent: b.accept(), page: home });
    expect(b.views()).toHaveLength(2);
    expect(b.scripts).toHaveLength(1);
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(false);
  });
  it("does not retry loader errors until a new explicit acceptance", () => {
    const b = browser(); const consent = b.accept();
    b.runtime.sync({ consent, page: home });
    b.scripts[0].onerror?.call(b.scripts[0], new Event("error"));
    b.runtime.sync({ consent, page: home });
    expect(b.scripts).toHaveLength(1);
    b.setTime(1791849601000); b.runtime.sync({ consent: b.accept(), page: home });
    expect(b.scripts).toHaveLength(2);
  });
  it("rechecks expiry and actual route when a script finishes", () => {
    const b = browser(); b.runtime.sync({ consent: b.accept(), page: home });
    b.setTime(1807401600000); b.load();
    expect(b.views()).toHaveLength(0);
  });
  it("pauses synchronously before sensitive history transitions and preserves return values", () => {
    const b = browser(); const consent = b.accept();
    b.runtime.sync({ consent, page: home }); b.load();
    expect(b.win.history.pushState({ x: 1 }, "", "/success?order_id=private")).toBe("unchanged");
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(true);
    b.runtime.sync({ consent, page: home });
    expect(b.views()).toHaveLength(1);
  });
  it("discards stale pages during loading and measures only the newly registered route", () => {
    const b = browser(); const consent = b.accept();
    b.runtime.sync({ consent, page: home }); const late = b.scripts[0].onload!;
    b.win.history.replaceState({}, "", "/products");
    b.runtime.sync({ consent, page: products });
    late.call(b.scripts[0], new Event("load")); b.load();
    expect(b.views().map(c => (c[2] as {page_title:string}).page_title)).toEqual(["Products"]);
  });
  it("pauses on browser history popstate", () => {
    const b = browser(); b.runtime.sync({ consent: b.accept(), page: home }); b.load();
    b.win.location.pathname = "/success";
    b.events.get("popstate")?.();
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(true);
  });
  it("does not pause or count query-only browser back navigation", () => {
    const b = browser(); b.runtime.sync({ consent: b.accept(), page: home }); b.load();
    b.win.location.search = "?email=private";
    b.events.get("popstate")?.();
    expect((b.win as unknown as Record<string, unknown>)[`ga-disable-${id}`]).toBe(false);
    expect(b.views()).toHaveLength(1);
  });
});
