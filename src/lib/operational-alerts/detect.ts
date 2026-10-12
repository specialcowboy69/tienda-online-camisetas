import type { AlertCategory, Incident, SourceErrorCode, SourceProjection, SourceRef } from "./types";

const orderStatuses = ["draft", "checkout_created", "paid", "printful_pending", "printful_confirmed", "shipped", "returned", "failed", "refunded", "manual_review", "expired", "canceled"] as const;
const emailStatuses = ["pending", "processing", "blocked", "accepted", "manual_review"] as const;
const webhookStatuses = ["processing", "processed", "failed"] as const;
const catalogStatuses = ["success", "failed"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function instant(value: unknown): number | null {
  try {
    let millis: unknown = value;
    if (value instanceof Date) millis = value.getTime();
    else if (typeof value === "string") {
      const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
      if (!parts) return null;
      const month = Number(parts[2]); const day = Number(parts[3]);
      if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(Number(parts[1]), month, 0)).getUTCDate()) return null;
      if (Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return null;
      millis = Date.parse(value);
    } else {
      const data = record(value);
      if (typeof data?.toMillis === "function") millis = data.toMillis();
    }
    return typeof millis === "number" && Number.isSafeInteger(millis) && millis >= 0 && millis <= 8640000000000000 ? millis : null;
  } catch { return null; }
}

function statusOf<T extends string>(value: unknown, allowed: readonly T[]): T | "unknown" {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : "unknown";
}

function errorCode(value: unknown): SourceErrorCode {
  if (value === undefined || value === null) return "none";
  const error = record(value);
  const name = error?.type ?? error?.name;
  if (name === "ProcessingBusyError" || name === "ProcessingOwnershipLostError") return "busy";
  if (name === "MalformedProcessingLease") return "malformed_lease";
  return "processing_failed";
}

function reviewFlag(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function lease(value: unknown): { expiresAtMs: number | null; valid: boolean } {
  if (value === undefined) return { expiresAtMs: null, valid: true };
  const data = record(value);
  const expiresAtMs = typeof data?.expiresAtMs === "number" ? instant(data.expiresAtMs) : null;
  const valid = typeof data?.token === "string" && data.token.length > 0 && expiresAtMs !== null && expiresAtMs > 0;
  return { expiresAtMs: valid ? expiresAtMs : null, valid };
}

/** Catalog daily scans supply the latest run plus the separately established lastSuccessAt. */
export function projectSource(ref: SourceRef, raw: unknown): SourceProjection {
  const data = record(raw);
  const code = errorCode(data?.error);
  const sourceVersionMs = ref.kind === "catalog" ? instant(data?.createdAt)
    : ref.kind === "webhook" && data?.status === undefined ? instant(data?.processedAt)
      : instant(data?.updatedAt);
  const base = { ref: { kind: ref.kind, id: ref.id }, sourceVersionMs, errorCode: code };
  const validBase = data !== null && sourceVersionMs !== null;
  switch (ref.kind) {
    case "order": {
      const status = statusOf(data?.status, orderStatuses); const ownership = lease(data?.orderProcessingLease);
      const flagsValid = [data?.emailReviewReason, data?.refundReviewReason].every(value => value === undefined || typeof value === "string")
        && (data?.fulfillmentBlocked === undefined || typeof data.fulfillmentBlocked === "boolean");
      return { ...base, kind: "order", status, readable: validBase && flagsValid && status !== "unknown" && ownership.valid,
        emailReview: reviewFlag(data?.emailReviewReason), refundReview: reviewFlag(data?.refundReviewReason),
        fulfillmentBlocked: data?.fulfillmentBlocked === true || record(data?.refundSummary)?.fulfillmentBlocked === true,
        leaseExpiresAtMs: ownership.expiresAtMs };
    }
    case "email": {
      const status = statusOf(data?.status, emailStatuses); const ownership = lease(data?.lease);
      return { ...base, kind: "email", status, readable: validBase && status !== "unknown" && ownership.valid, leaseExpiresAtMs: ownership.expiresAtMs };
    }
    case "webhook": {
      const status = data?.status === undefined && sourceVersionMs !== null ? "processed" : statusOf(data?.status, webhookStatuses);
      const ownership = lease(data?.lease);
      // Match the supported legacy processing record's two-minute ownership window.
      const leaseExpiresAtMs = status === "processing" && data?.lease === undefined && sourceVersionMs !== null
        ? sourceVersionMs + 120000 : ownership.expiresAtMs;
      return { ...base, kind: "webhook", status, readable: validBase && status !== "unknown" && ownership.valid, leaseExpiresAtMs };
    }
    case "catalog": {
      const status = statusOf(data?.status, catalogStatuses);
      const lastSuccessAtMs = data?.lastSuccessAt === undefined && status === "success" ? sourceVersionMs : instant(data?.lastSuccessAt);
      return { ...base, kind: "catalog", status, readable: validBase && status !== "unknown" && lastSuccessAtMs !== null, lastSuccessAtMs };
    }
  }
}

export function detectIncidents(source: SourceProjection, nowMs: number): Incident[] {
  const result: Incident[] = [];
  const add = (category: AlertCategory, trigger: Incident["trigger"] = "immediate") => {
    result.push({ ref: source.ref, category, observedAtMs: nowMs, sourceVersionMs: source.sourceVersionMs, trigger });
  };
  const validTime = source.sourceVersionMs !== null && source.sourceVersionMs <= nowMs;
  const readable = source.readable && validTime && Number.isFinite(nowMs)
    && (source.kind !== "catalog" || (source.lastSuccessAtMs !== null && source.lastSuccessAtMs <= nowMs && source.lastSuccessAtMs <= source.sourceVersionMs!));
  if (!readable) add("source_unreadable", "daily");
  const age = validTime ? nowMs - source.sourceVersionMs! : 0;
  switch (source.kind) {
    case "order":
      if (source.status === "manual_review") add("order_review");
      if (source.status === "failed") add("order_failed");
      if (source.emailReview) add("email_review");
      if (source.refundReview) add("refund_review");
      if (readable && source.status === "printful_pending" && !source.fulfillmentBlocked && age > 900000
        && (source.leaseExpiresAtMs === null || source.leaseExpiresAtMs <= nowMs)) add("order_stale", "daily");
      break;
    case "email":
      if (source.status === "blocked") add("email_blocked");
      if (source.status === "manual_review") add("email_manual_review");
      if (readable && ["pending", "processing"].includes(source.status) && age > 900000
        && (source.leaseExpiresAtMs === null || source.leaseExpiresAtMs <= nowMs)) add("email_stale", "daily");
      break;
    case "webhook":
      if (source.status === "failed" && source.errorCode !== "busy") add("webhook_failed");
      if (readable && source.status === "processing" && age > 300000
        && source.leaseExpiresAtMs !== null && source.leaseExpiresAtMs <= nowMs) add("webhook_stale", "daily");
      break;
    case "catalog":
      if (source.status === "failed") add("catalog_failed");
      if (readable && source.lastSuccessAtMs !== null && nowMs - source.lastSuccessAtMs > 129600000) add("catalog_stale", "daily");
      break;
  }
  return result;
}
