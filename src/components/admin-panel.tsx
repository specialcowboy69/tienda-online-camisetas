"use client";

import { RefreshCcw, RotateCw, Webhook } from "lucide-react";
import { useState } from "react";
import type { PrintfulSubmissionEligibility } from "@/lib/checkout-validation";
import type { RefundSummary } from "@/lib/types";

type AdminOrder = {
  id: string;
  status: string;
  updatedAt: string;
  error?: { message?: string };
  checkoutValidationStatus?: "missing" | "valid" | "invalid";
  printfulSubmissionEligibility?: PrintfulSubmissionEligibility;
  emailReviewReason?: string;
  refundSummary?: RefundSummary;
  fulfillmentBlocked?: boolean;
  refundReviewReason?: string;
  emailJobs?: Array<{ id: string; kind: string; status: string; attempts: number; providerEmailId?: string; lastError?: string }>;
};

export function AdminPanel() {
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function callAdmin(path: string, init: RequestInit = {}, acceptEmailRetryResults = false) {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init.headers || {}),
          "x-admin-secret": secret
        }
      });
      const data = await response.json();
      if (!response.ok && !(acceptEmailRetryResults && response.status === 503 && Array.isArray(data.results))) {
        throw new Error(data.error || "Admin request failed.");
      }
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin request failed.");
      throw caught;
    } finally {
      setLoading(false);
    }
  }

  async function syncCatalog() {
    const data = await callAdmin("/api/catalog/sync", { method: "POST" });
    setMessage(`Catalog synced: ${data.products} products.`);
  }

  async function configureWebhook() {
    const data = await callAdmin("/api/admin/printful/webhook", { method: "POST" });
    setMessage(`Printful webhook configured: ${data.url}`);
  }

  async function loadReviewOrders() {
    const data = await callAdmin("/api/admin/orders");
    setOrders(data.orders || []);
    setMessage(`${data.orders?.length || 0} orders need review.`);
  }

  async function retryPrintful(orderId: string) {
    await callAdmin(`/api/admin/orders/${orderId}/retry-printful`, { method: "POST" });
    await loadReviewOrders();
  }

  async function revalidateCheckout(orderId: string) {
    await callAdmin(`/api/admin/orders/${orderId}/revalidate-checkout`, { method: "POST" });
    await loadReviewOrders();
  }

  async function retryEmails(orderId: string) {
    const data = await callAdmin(`/api/admin/orders/${orderId}/retry-email`, { method: "POST" }, true);
    const results = data.results as Array<{ jobId: string; result: string }>;
    try {
      await loadReviewOrders();
    } finally {
      setMessage(results.length ? `Email recovery: ${results.map(({ jobId, result }) => `${jobId}: ${result}`).join("; ")}.` : "No existing email jobs to retry.");
    }
  }

  return (
    <section className="panel">
      <h1>Admin</h1>
      <label>
        Admin secret
        <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} />
      </label>

      <div className="admin-actions">
        <button onClick={syncCatalog} disabled={!secret || loading}>
          <RefreshCcw size={18} /> Sync catalog
        </button>
        <button onClick={configureWebhook} disabled={!secret || loading}>
          <Webhook size={18} /> Configure Printful webhook
        </button>
        <button onClick={loadReviewOrders} disabled={!secret || loading}>
          <RotateCw size={18} /> Load review orders
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div role="region" aria-label="Review orders" tabIndex={0} style={{ maxWidth: "100%", overflowX: "auto" }}>
      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Payment validation</th>
            <th>Refunds</th>
            <th>Error</th>
            <th>Email recovery</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.status}</td>
              <td>{order.checkoutValidationStatus === "valid" ? "Valid paid checkout" : order.checkoutValidationStatus === "invalid" ? "Checkout proof no longer matches" : "No checkout proof"}</td>
              <td>
                {order.refundSummary ? <p>{order.refundSummary.status}: {order.refundSummary.refundedAmount} / {order.refundSummary.paidAmount} {order.refundSummary.currency} (minor units); {order.refundSummary.pendingCount} pending; {order.refundSummary.failedCount} failed; {order.refundSummary.canceledCount} canceled</p> : <p>Not reconciled</p>}
                {order.fulfillmentBlocked || order.refundSummary?.fulfillmentBlocked ? <p>Fulfillment blocked</p> : null}
                {order.refundReviewReason ? <p>{order.refundReviewReason}</p> : null}
              </td>
              <td>{order.error?.message || ""}</td>
              <td>
                {order.emailReviewReason ? <p>{order.emailReviewReason}</p> : null}
                {order.emailJobs?.map((job) => <p key={job.id}>{job.kind}: {job.status} ({job.attempts} attempts){job.providerEmailId ? ` — Provider accepted: ${job.providerEmailId}` : ""}{job.lastError ? ` — ${job.lastError}` : ""}</p>)}
                {order.emailJobs?.some((job) => ["pending", "processing", "blocked"].includes(job.status)) ? <button onClick={() => retryEmails(order.id)} disabled={loading}>Retry emails only</button> : null}
              </td>
              <td>
                <button onClick={() => retryPrintful(order.id)} disabled={loading || !order.printfulSubmissionEligibility?.allowed}>
                  Retry
                </button>
                {order.printfulSubmissionEligibility && !order.printfulSubmissionEligibility.allowed ? <p>{order.printfulSubmissionEligibility.message}</p> : null}
                <button onClick={() => revalidateCheckout(order.id)} disabled={loading}>Revalidate checkout</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
