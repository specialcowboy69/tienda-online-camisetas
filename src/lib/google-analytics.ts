import { parseConsent, resolveAnalyticsDestination, resolveAnalyticsPage, sanitizeAnalyticsReferrer, type AnalyticsConfig, type AnalyticsConsent, type AnalyticsPage } from "./analytics-consent";

export type AnalyticsRuntime = {
  sync(input: { consent: AnalyticsConsent | null; page: AnalyticsPage | null }): void;
  stop(options: { clearCookies: boolean }): void;
  track(name: string, params: Record<string, unknown>): void;
};
type AnalyticsWindow = Window & { nccAnalyticsLayer?: IArguments[]; [key: `ga-disable-${string}`]: boolean };
const instances = new WeakMap<Document, Map<string, AnalyticsRuntime>>();
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
const ecommerceNames = new Set(["view_item", "add_to_cart", "begin_checkout", "add_shipping_info", "shipping_quote_success", "shipping_quote_failed", "checkout_redirect", "form_start", "form_submit"]);

function safeEventParams(name: string, params: Record<string, unknown>): Record<string, unknown> | null {
  if (!ecommerceNames.has(name)) return null;
  const safe: Record<string, unknown> = {};
  if (name === "form_start" || name === "form_submit") {
    if (params.form_id !== "shipping_quote") return null;
    safe.form_id = "shipping_quote";
  }
  if (typeof params.currency === "string" && /^[A-Z]{3}$/.test(params.currency)) safe.currency = params.currency;
  if (typeof params.value === "number" && Number.isFinite(params.value) && params.value >= 0) safe.value = params.value;
  if (typeof params.country_code === "string" && /^[A-Z]{2}$/.test(params.country_code)) safe.country_code = params.country_code;
  if (typeof params.reason === "string" && ["EU_CUSTOMS_RISK", "SHIPPING_CHECK_UNAVAILABLE", "SHIPPING_OPTIONS_CHANGED", "OTHER"].includes(params.reason)) safe.reason = params.reason;
  if (typeof params.shipping_tier === "string" && params.shipping_tier.length <= 50 && /^[\w -]+$/.test(params.shipping_tier)) safe.shipping_tier = params.shipping_tier;
  if (Array.isArray(params.items)) safe.items = params.items.slice(0, 100).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.item_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.item_id)) return [];
    const result: Record<string, unknown> = { item_id: item.item_id };
    if (typeof item.item_name === "string") result.item_name = item.item_name.slice(0, 100);
    if (typeof item.item_variant === "string") result.item_variant = item.item_variant.slice(0, 100);
    if (typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0) result.price = item.price;
    if (typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity > 0) result.quantity = item.quantity;
    return [result];
  });
  return safe;
}

export function createGoogleAnalytics({ config, window: browser, document, now }: {
  config: AnalyticsConfig; window: Window; document: Document; now: () => number;
}): AnalyticsRuntime {
  const existing = instances.get(document)?.get(config.measurementId);
  if (existing) return existing;
  const win = browser as AnalyticsWindow;
  const disableKey = `ga-disable-${config.measurementId}` as const;
  // Dedicated queue: never claim a third-party gtag/dataLayer.
  const layer: IArguments[] = [];
  win.nccAnalyticsLayer = layer;
  const command: (...args: unknown[]) => void = function () {
    // gtag's public queue protocol uses Arguments objects, not DOM events.
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  let input: { consent: AnalyticsConsent | null; page: AnalyticsPage | null } = { consent: null, page: null };
  let script: HTMLScriptElement | null = null;
  let loaded = false;
  let configured = false;
  let generation = 0;
  let failedChoice: number | null = null;
  let enabled = false;
  const pendingEvents: Array<{ name: string; params: Record<string, unknown> }> = [];
  win[disableKey] = true;

  function allowedPage() {
    const consent = parseConsent(input.consent ? JSON.stringify(input.consent) : null, now());
    if (consent?.choice !== "granted" || browser.location.origin !== config.origin) return null;
    return resolveAnalyticsPage(browser.location.pathname, input.page);
  }

  function hasConsent() {
    return parseConsent(input.consent ? JSON.stringify(input.consent) : null, now())?.choice === "granted" && browser.location.origin === config.origin;
  }

  function clearOwnedCookies() {
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name === "ncc_ga" || /^ncc_ga_[A-Za-z0-9_]+$/.test(name)) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
      }
    }
  }

  function stop({ clearCookies }: { clearCookies: boolean }) {
    enabled = false;
    win[disableKey] = true;
    generation++;
    input = { consent: null, page: null };
    layer.length = 0;
    pendingEvents.length = 0;
    if (!loaded && script) {
      script.remove();
      script = null;
    }
    if (loaded) command("consent", "update", denied);
    if (clearCookies) clearOwnedCookies();
  }

  function emit() {
    const page = allowedPage();
    if (!page) { stop({ clearCookies: true }); return; }
    if (!loaded) return;
    const safe = { page_location: config.origin + page.path, page_title: page.title, page_referrer: sanitizeAnalyticsReferrer(document.referrer) };
    // Set safe global fields BEFORE enabling this property; automatic events must
    // not inherit arbitrary document titles, queries, or sensitive referrers.
    command("set", safe);
    win[disableKey] = false;
    const wasEnabled = enabled;
    if (!wasEnabled) command("consent", "update", { ...denied, analytics_storage: "granted" });
    enabled = true;
    if (!configured) {
      command("js", new Date(now()));
    }
    if (!configured || !wasEnabled) {
      command("config", config.measurementId, {
        ...safe, send_page_view: true, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_prefix: "ncc",
        cookie_expires: 15552000, cookie_update: false, cookie_domain: "none",
        cookie_path: "/", cookie_flags: "SameSite=Lax;Secure"
      });
      configured = true;
    }
    for (const event of pendingEvents.splice(0)) command("event", event.name, event.params);
  }

  function sync(next: typeof input) {
    input = next;
    if (!allowedPage()) {
      // During a public route transition, wait for its page registration without
      // interrupting GA4's own history-based page view.
      if (enabled && hasConsent() && resolveAnalyticsDestination(browser.location.pathname)) return;
      stop({ clearCookies: next.consent?.choice !== "granted" });
      return;
    }
    if (loaded) { emit(); return; }
    if (script || failedChoice === next.consent!.decidedAt) return;
    const attempt = ++generation;
    const choiceTime = next.consent!.decidedAt;
    layer.length = 0;
    command("consent", "default", denied);
    script = document.createElement("script");
    script.id = "ncc-ga4-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}&l=nccAnalyticsLayer`;
    script.onload = () => {
      if (attempt !== generation) return;
      loaded = true;
      emit();
    };
    script.onerror = () => {
      if (attempt !== generation) return;
      failedChoice = choiceTime;
      stop({ clearCookies: true });
    };
    document.head.appendChild(script);
  }

  function track(name: string, params: Record<string, unknown>) {
    const safe = safeEventParams(name, params);
    if (!safe) return;
    if (!allowedPage()) return;
    if (!enabled || !loaded) { pendingEvents.push({ name, params: safe }); return; }
    command("event", name, safe);
  }

  // Keep GA4 active on public history changes; block sensitive destinations
  // before its enhanced-measurement listener can observe the new URL.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = browser.history[method];
    browser.history[method] = function (...args: Parameters<History[typeof method]>) {
      const target = args[2];
      if (target != null) {
        try {
          const url = new URL(target, browser.location.href);
          const page = url.origin === config.origin ? resolveAnalyticsDestination(url.pathname) : null;
          if (!page) stop({ clearCookies: false });
          else if (enabled) command("set", { page_location: config.origin + page.path, page_title: page.title, page_referrer: sanitizeAnalyticsReferrer(browser.location.href) });
        } catch { stop({ clearCookies: false }); }
      }
      return original.apply(this, args);
    };
  }
  browser.addEventListener("popstate", () => {
    const page = resolveAnalyticsDestination(browser.location.pathname);
    if (!page) stop({ clearCookies: false });
    else if (enabled) command("set", { page_location: config.origin + page.path, page_title: page.title, page_referrer: sanitizeAnalyticsReferrer(document.referrer) });
  });
  const runtime = { sync, stop, track };
  const byId = instances.get(document) ?? new Map<string, AnalyticsRuntime>();
  byId.set(config.measurementId, runtime);
  instances.set(document, byId);
  return runtime;
}
