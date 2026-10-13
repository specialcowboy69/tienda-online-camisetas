import { parseConsent, resolveAnalyticsPage, sanitizeAnalyticsReferrer, type AnalyticsConfig, type AnalyticsConsent, type AnalyticsPage } from "./analytics-consent";

export type AnalyticsRuntime = {
  sync(input: { consent: AnalyticsConsent | null; page: AnalyticsPage | null }): void;
  stop(options: { clearCookies: boolean }): void;
};
type AnalyticsWindow = Window & { nccAnalyticsLayer?: IArguments[]; [key: `ga-disable-${string}`]: boolean };
const instances = new WeakMap<Document, Map<string, AnalyticsRuntime>>();
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };

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
  let lastPath: string | null = null;
  let enabled = false;
  win[disableKey] = true;

  function allowedPage() {
    const consent = parseConsent(input.consent ? JSON.stringify(input.consent) : null, now());
    if (consent?.choice !== "granted" || browser.location.origin !== config.origin) return null;
    return resolveAnalyticsPage(browser.location.pathname, input.page);
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
    lastPath = null;
    layer.length = 0;
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
    if (!enabled) command("consent", "update", { ...denied, analytics_storage: "granted" });
    enabled = true;
    if (!configured) {
      command("js", new Date(now()));
      command("config", config.measurementId, {
        ...safe, send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_prefix: "ncc",
        cookie_expires: 15552000, cookie_update: false, cookie_domain: "none",
        cookie_path: "/", cookie_flags: "SameSite=Lax;Secure"
      });
      configured = true;
    }
    if (lastPath !== page.path) {
      command("event", "page_view", { send_to: config.measurementId, ...safe });
      lastPath = page.path;
    }
  }

  function sync(next: typeof input) {
    input = next;
    if (!allowedPage()) { stop({ clearCookies: next.consent?.choice !== "granted" }); return; }
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

  // Block before the URL changes. Resume only from a freshly registered page.
  for (const method of ["pushState", "replaceState"] as const) {
    const original = browser.history[method];
    browser.history[method] = function (...args: Parameters<History[typeof method]>) {
      const target = args[2];
      if (target != null) {
        try {
          if (new URL(target, browser.location.href).pathname !== browser.location.pathname) stop({ clearCookies: false });
        } catch { stop({ clearCookies: false }); }
      }
      return original.apply(this, args);
    };
  }
  browser.addEventListener("popstate", () => {
    if (!allowedPage()) stop({ clearCookies: false });
  });
  const runtime = { sync, stop };
  const byId = instances.get(document) ?? new Map<string, AnalyticsRuntime>();
  byId.set(config.measurementId, runtime);
  instances.set(document, byId);
  return runtime;
}
