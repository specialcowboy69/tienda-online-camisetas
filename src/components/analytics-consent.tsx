"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_STORAGE_KEY, CONSENT_TTL_MS, createConsent, parseConsent, readStoredConsent, resolveAnalyticsConfig, resolveAnalyticsPage, type AnalyticsChoice, type AnalyticsConfig, type AnalyticsConsent, type AnalyticsPage } from "@/lib/analytics-consent";
import { createGoogleAnalytics, type AnalyticsRuntime } from "@/lib/google-analytics";

type Register = (page: AnalyticsPage) => () => void;
const RegistrationContext = createContext<Register>(() => () => {});
export function useAnalyticsPageRegistration() { return useContext(RegistrationContext); }

export function AnalyticsConsentProvider({ enabled, measurementId, deployment, children }: {
  enabled?: string; measurementId?: string; deployment?: string; children: ReactNode;
}) {
  const pathname = usePathname();
  const runtime = useRef<AnalyticsRuntime | null>(null);
  const page = useRef<{ token: symbol; descriptor: AnalyticsPage } | null>(null);
  const choice = useRef<AnalyticsConsent | null>(null);
  const memoryOnly = useRef(false);
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [config, setConfig] = useState<AnalyticsConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [settings, setSettings] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const banner = useRef<HTMLElement | null>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  const showBanner = ready && !!config && !consent;

  useEffect(() => {
    if (!showBanner || !banner.current) { setBannerHeight(0); return; }
    const element = banner.current;
    const observer = new ResizeObserver(() => setBannerHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [showBanner]);

  const sync = useCallback(() => {
    runtime.current?.sync({ consent: choice.current, page: resolveAnalyticsPage(window.location.pathname, page.current?.descriptor ?? null) });
  }, []);
  const register = useCallback<Register>((descriptor) => {
    const token = Symbol("analytics page");
    page.current = { token, descriptor };
    sync();
    return () => {
      if (page.current?.token === token) { page.current = null; sync(); }
    };
  }, [sync]);
  const apply = useCallback((value: AnalyticsConsent | null) => {
    choice.current = value;
    if (value?.choice !== "granted") runtime.current?.stop({ clearCookies: true });
    setConsent(value);
    sync();
  }, [sync]);

  useLayoutEffect(() => {
    const nextConfig = resolveAnalyticsConfig({ enabled, measurementId, deployment, origin: window.location.origin });
    setConfig(nextConfig);
    runtime.current = nextConfig ? createGoogleAnalytics({ config: nextConfig, window, document, now: Date.now }) : null;
    try { apply(readStoredConsent(window.localStorage, Date.now())); }
    catch { setStorageWarning(true); apply(null); }
    setReady(true);
    return () => { runtime.current?.stop({ clearCookies: false }); };
  }, [enabled, measurementId, deployment, apply]);

  useLayoutEffect(() => { sync(); }, [pathname, sync]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      let value: AnalyticsConsent | null = null;
      try { value = memoryOnly.current ? parseConsent(JSON.stringify(choice.current), Date.now()) : readStoredConsent(window.localStorage, Date.now()); }
      catch { setStorageWarning(true); }
      apply(value);
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      const remaining = choice.current ? choice.current.decidedAt + CONSENT_TTL_MS - Date.now() : 86400000;
      timer = setTimeout(refresh, Math.max(1, Math.min(86400000, remaining)));
    }
    function external(event: StorageEvent) {
      if (event.key !== CONSENT_STORAGE_KEY && event.key !== null) return;
      memoryOnly.current = false;
      // Queued events may contain an older grant than the current stored rejection.
      refresh();
    }
    schedule();
    window.addEventListener("storage", external);
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("storage", external); window.removeEventListener("focus", refresh); };
  }, [apply, consent]);

  function decide(value: AnalyticsChoice) {
    const record = createConsent(value, Date.now());
    // Revoke before storage/UI work; no navigation or child remount involved.
    if (value === "denied") runtime.current?.stop({ clearCookies: true });
    try { window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record)); memoryOnly.current = false; setStorageWarning(false); }
    catch { memoryOnly.current = true; setStorageWarning(true); }
    apply(record);
  }
  function openSettings(event: React.MouseEvent<HTMLButtonElement>) {
    trigger.current = event.currentTarget;
    setSettings(true);
  }
  function closeSettings() {
    setSettings(false);
    trigger.current?.focus();
  }

  return <RegistrationContext.Provider value={register}>
    {children}
    <footer className="ncc-consent-footer" aria-label="Legal information">
      <a href="/privacy">Privacy policy</a>
      <a href="/cookies">Cookie policy</a>
      <button type="button" onClick={openSettings}>Cookie settings</button>
    </footer>
    {showBanner && <div aria-hidden="true" style={{ height: bannerHeight }} />}
    {showBanner && <section ref={banner} className="ncc-consent-banner" aria-label="Analytics preferences">
      <p>We use optional Google Analytics cookies to understand visits to our store. Analytics stays off unless you accept. You can change your choice at any time using Cookie settings. Advertising tracking is off.</p>
      <div className="ncc-consent-actions">
        <button type="button" onClick={() => decide("granted")}>Accept analytics</button>
        <button type="button" onClick={() => decide("denied")}>Reject analytics</button>
        <button type="button" onClick={openSettings}>Settings</button>
      </div>
    </section>}
    {settings && <ConsentDialog available={!!config} granted={consent?.choice === "granted"} warning={storageWarning} onClose={closeSettings} onSave={(granted) => { decide(granted ? "granted" : "denied"); closeSettings(); }} />}
  </RegistrationContext.Provider>;
}

function ConsentDialog({ available, granted, warning, onClose, onSave }: {
  available: boolean; granted: boolean; warning: boolean; onClose: () => void; onSave: (granted: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState(granted);
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  function close() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className="ncc-consent-dialog" aria-labelledby="ncc-consent-title" onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href]") ?? []);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="ncc-consent-heading"><h2 id="ncc-consent-title">Cookie settings</h2><button type="button" onClick={close} aria-label="Close cookie settings">Close</button></div>
    <p>Your choice remains valid for 180 days. An expired browser record is removed while this site is open or when you next visit. Necessary store features work whether you accept or reject analytics.</p>
    {available ? <label className="ncc-consent-toggle"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Allow Google Analytics</label> : <p>Analytics is currently off on this site.</p>}
    <p>Advertising tracking is off. We do not enable Google Ads tracking through these settings.</p>
    <p>Read our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy policy (opens in a new tab)</a> and <a href="/cookies" target="_blank" rel="noopener noreferrer">Cookie policy (opens in a new tab)</a>.</p>
    {warning && <p role="status">Your choice could not be saved. It will apply until you leave this page.</p>}
    <div className="ncc-consent-actions">
      {available && <button type="button" onClick={() => { dialog.current?.close(); onSave(checked); }}>Save preferences</button>}
      <button type="button" onClick={close}>Cancel</button>
    </div>
  </dialog>;
}
