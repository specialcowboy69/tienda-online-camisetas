// Synthetic source fixtures. Import only from tests, never from production.
export const T0 = Date.parse("2026-10-12T08:00:00.000Z");

export function sourceAt(status: string, extras: Record<string, unknown> = {}) {
  return {
    status,
    createdAt: new Date(T0 - 60000).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...extras
  };
}

export function preventiveRefund() {
  return sourceAt("refunded", {
    fulfillmentBlocked: true,
    refundSummary: { status: "full", fulfillmentBlocked: true, pendingCount: 0, failedCount: 0, refundCount: 1 }
  });
}
