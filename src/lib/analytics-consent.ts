import { productSlugEntries } from "./product-slugs";

export type AnalyticsChoice = "granted" | "denied";
export type AnalyticsConsent = { version: 1; choice: AnalyticsChoice; decidedAt: number };
export type AnalyticsPage = { path: string; title: "Home" | "Products" | "Product" };
export type AnalyticsConfig = { measurementId: string; origin: "https://www.funnyteesforall.com" };
export const CONSENT_STORAGE_KEY = "ncc.analytics-consent.v1";
export const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const ORIGIN = "https://www.funnyteesforall.com";
const pages = new Map<string, AnalyticsPage["title"]>([
  ["/", "Home"], ["/products", "Products"],
  ...productSlugEntries.map(({ slug }) => [`/products/${slug}`, "Product"] as const)
]);

export function createConsent(choice: AnalyticsChoice, now: number): AnalyticsConsent {
  return { version: 1, choice, decidedAt: now };
}

export function parseConsent(raw: string | null, now: number): AnalyticsConsent | null {
  try {
    const value = raw === null ? null : JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "choice,decidedAt,version") return null;
    if (value.version !== 1 || !["granted", "denied"].includes(value.choice)) return null;
    if (!Number.isFinite(now) || !Number.isFinite(value.decidedAt) || value.decidedAt < 0 || value.decidedAt > now || now - value.decidedAt >= CONSENT_TTL_MS) return null;
    return { version: 1, choice: value.choice, decidedAt: value.decidedAt };
  } catch {
    return null;
  }
}

export function readStoredConsent(storage: Pick<Storage, "getItem" | "removeItem">, now: number): AnalyticsConsent | null {
  const raw = storage.getItem(CONSENT_STORAGE_KEY);
  const value = parseConsent(raw, now);
  if (raw !== null && value === null) storage.removeItem(CONSENT_STORAGE_KEY);
  return value;
}

export function resolveAnalyticsConfig(input: { enabled?: string; measurementId?: string; deployment?: string; origin: string }): AnalyticsConfig | null {
  if (input.enabled !== "true" || input.deployment !== "production" || input.origin !== ORIGIN || !/^G-[A-Z0-9]+$/.test(input.measurementId ?? "")) return null;
  return { measurementId: input.measurementId!, origin: ORIGIN };
}

export function resolveAnalyticsPage(pathname: string, registered: AnalyticsPage | null): AnalyticsPage | null {
  if (!registered || registered.path !== pathname || pages.get(pathname) !== registered.title) return null;
  return { path: pathname, title: registered.title };
}

export function sanitizeAnalyticsReferrer(raw: string): string {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    if (url.origin !== ORIGIN) return url.origin;
    return pages.has(url.pathname) ? `${ORIGIN}${url.pathname}` : "";
  } catch {
    return "";
  }
}
