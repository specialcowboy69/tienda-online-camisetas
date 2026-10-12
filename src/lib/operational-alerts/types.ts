import type { EmailJob, OrderStatus } from "../types";

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
