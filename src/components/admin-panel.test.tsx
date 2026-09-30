import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "./admin-panel";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  } };
});
type ElementProps = { children?: ReactNode; onClick?: () => Promise<void> };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function panel() { hooks.index = 0; return AdminPanel(); }

describe("AdminPanel email recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React); hooks.values = []; panel();
    hooks.values[0] = "synthetic-secret";
    hooks.values[1] = [{ id: "order1", status: "shipped", updatedAt: "today", emailJobs: [{ id: "job1", kind: "order_confirmation", status: "pending", attempts: 1 }, { id: "job2", kind: "shipment", status: "pending", attempts: 1 }] }];
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each([["valid", "Valid paid checkout"], ["invalid", "Checkout proof no longer matches"], ["missing", "No checkout proof"]])("shows %s payment validation independently from the refund hold and accepted email", (status, label) => {
    hooks.values[1] = [{ id: "order1", status: "shipped", updatedAt: "today", checkoutValidationStatus: status, fulfillmentBlocked: true, printfulSubmissionEligibility: { allowed: false, reason: "RefundReviewRequired", message: "Refund activity requires review" }, emailJobs: [{ id: "job1", kind: "order_confirmation", status: "accepted", attempts: 1, providerEmailId: "provider1" }] }];
    const html = renderToStaticMarkup(panel());
    expect(html).toContain(label); expect(html).toContain("Refund activity requires review"); expect(html).toContain("Fulfillment blocked"); expect(html).toContain("Provider accepted: provider1"); expect(html).toContain("shipped");
  });
  it("displays financial status separately from shipment and keeps the refund hold visible", () => {
    hooks.values[1] = [{ id: "order1", status: "shipped", updatedAt: "today", fulfillmentBlocked: true, refundReviewReason: "Manual review needed", refundSummary: { status: "partial", refundedAmount: 1100, paidAmount: 2200, currency: "eur", pendingCount: 1, failedCount: 2, canceledCount: 3 } }];
    const html = renderToStaticMarkup(panel());
    expect(html).toContain("shipped"); expect(html).toContain("partial"); expect(html).toContain("1100 / 2200 eur"); expect(html).toContain("Fulfillment blocked"); expect(html).toContain("Manual review needed"); expect(html).toContain("2 failed"); expect(html).toContain("3 canceled");
  });
  it("retains per-job outcomes and refreshes orders after a retryable partial result", async () => {
    const http = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ jobId: "job1", result: "accepted" }, { jobId: "job2", result: "retry" }] }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ orders: [{ id: "order1", status: "shipped", updatedAt: "today", emailJobs: [{ id: "job1", kind: "order_confirmation", status: "accepted", attempts: 2, providerEmailId: "provider1" }, { id: "job2", kind: "shipment", status: "pending", attempts: 2 }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", http);
    const retry = elements(panel()).find((element) => element.type === "button" && element.props.children === "Retry emails only")!;
    await expect(retry.props.onClick!()).resolves.toBeUndefined();
    expect(http.mock.calls.map(([url]) => url)).toEqual(["/api/admin/orders/order1/retry-email", "/api/admin/orders"]);
    const html = renderToStaticMarkup(panel());
    expect(html).toContain("job1: accepted"); expect(html).toContain("job2: retry"); expect(html).toContain("Provider accepted: provider1");
    expect(html).not.toContain("Admin request failed");
  });
});
