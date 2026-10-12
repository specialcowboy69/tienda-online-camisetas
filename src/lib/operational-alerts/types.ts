import type { EmailJob, EmailMessage, OrderStatus, ProcessingLease } from "../types";
export type { EmailMessage } from "../types";

export type AlertConfig = {
  enabled: boolean;
  environment: string;
  recipient?: string;
  sender?: string;
  siteUrl: string;
};

export type SourceRef = { kind: "order" | "email" | "webhook" | "catalog"; id: string };
export type AlertCategory =
  | "order_review" | "order_failed" | "email_review" | "refund_review"
  | "email_blocked" | "email_manual_review" | "webhook_failed" | "catalog_failed"
  | "order_stale" | "email_stale" | "webhook_stale" | "catalog_stale"
  | "source_unreadable" | "alert_delivery_review";

export type SourceErrorCode = "none" | "busy" | "malformed_lease" | "processing_failed";
type ProjectionBase = {
  ref: SourceRef;
  readable: boolean;
  sourceVersionMs: number | null;
  errorCode: SourceErrorCode;
};

// Only allowlisted state, review flags, and normalized numeric instants survive.
export type SourceProjection = ProjectionBase & (
  | { kind: "order"; status: OrderStatus | "unknown"; emailReview: boolean; refundReview: boolean; fulfillmentBlocked: boolean; leaseExpiresAtMs: number | null }
  | { kind: "email"; status: EmailJob["status"] | "unknown"; leaseExpiresAtMs: number | null }
  | { kind: "webhook"; status: "processing" | "processed" | "failed" | "unknown"; leaseExpiresAtMs: number | null }
  | { kind: "catalog"; status: "success" | "failed" | "unknown"; lastSuccessAtMs: number | null }
);

export type Incident = {
  ref: SourceRef;
  category: AlertCategory;
  observedAtMs: number;
  sourceVersionMs: number | null;
  trigger: "immediate" | "daily";
};

export type Observation = {
  source: SourceProjection;
  // null proves creation; unknown does not prove a new transition.
  previous: SourceProjection | null | "unknown";
  mode: "event" | "daily";
  observedAtMs: number;
};

export type ScanResult = { pendingCount: number; counts: Partial<Record<AlertCategory, number>>; references: SourceRef[]; partial: boolean; unchecked: string[]; examined: number };
export type ScanPartition = "orders" | "emailJobs" | "webhookEvents" | "catalog" | "ledger" | "deliveries";
export type CatalogCursor = { id: string; seconds: number; nanoseconds: number };
export type ScanProgress = {
  phase: "sources" | "final" | "complete";
  next: number;
  cursors: Partial<Record<ScanPartition, string>>;
  covered: ScanPartition[];
  counts: ScanResult["counts"];
  references: SourceRef[];
  provisional: { counts: ScanResult["counts"]; references: SourceRef[] } | null;
  catalog: { cursor: CatalogCursor | null; lastSuccessAtMs: number | null; head: CatalogCursor | null;
    prefix: { cursor: CatalogCursor | null; until: CatalogCursor } | null; historyComplete: boolean; nextPrefix: boolean };
};
// Throws before the read if the shared inspection/deadline budget is exhausted.
export type InspectionBudget = { reserve: (documents: number) => void };
export type AlertSnapshot = { incidents: Incident[]; scan?: ScanResult };
export type DeliveryOutcome =
  | { kind: "accepted"; providerEmailId: string }
  | { kind: "retry" | "review"; code: "transport_failed" | "configuration_missing" | "window_expired" | "receipt_unknown" };
export type AlertDelivery = {
  environment?: string;
  // Document path; both incident and daily summary deliveries share one worker.
  id: string;
  kind: "incident" | "digest";
  generation: number;
  snapshot: AlertSnapshot;
  status: "pending" | "processing" | "accepted" | "review" | "digest_only";
  attempts: number;
  lease?: ProcessingLease;
  firstDispatchAtMs?: number;
  message?: EmailMessage;
  idempotencyKey?: string;
  providerEmailId?: string;
  outcomeCode?: Exclude<DeliveryOutcome, { kind: "accepted" }>["code"];
};
export type DeliveryClaim =
  | { kind: "claimed"; token: string; delivery: AlertDelivery }
  | { kind: "skip"; reason: "busy" | "accepted" | "review" | "missing" | "digest_only" };
export type PreparedDelivery = { message: EmailMessage; idempotencyKey: string };
export type AlertRecord = {
  logicalId: string;
  sourceKey: string;
  ref: SourceRef;
  category: AlertCategory;
  status: "active" | "resolved";
  generation: number;
  sourceVersionMs: number | null;
  observedAtMs: number;
  needsReconciliation: boolean;
};
export type AlertStore = {
  recordObservation(input: Observation, budget?: InspectionBudget): Promise<string[]>;
  claimDailyRun(dayUtc: string): Promise<{ token: string } | null>;
  readScanProgress(token: string, budget?: InspectionBudget): Promise<ScanProgress | null>;
  saveScanProgress(token: string, progress: ScanProgress, budget?: InspectionBudget): Promise<boolean>;
  prepareDigest(dayUtc: string, token: string, result: ScanResult): Promise<string | null>;
  finishDailyRun(dayUtc: string, token: string, result: ScanResult): Promise<boolean>;
  claimDelivery(id: string): Promise<DeliveryClaim>;
  prepareDelivery(id: string, token: string, message: EmailMessage): Promise<PreparedDelivery | null>;
  finishDelivery(id: string, token: string, outcome: DeliveryOutcome): Promise<boolean>;
};
