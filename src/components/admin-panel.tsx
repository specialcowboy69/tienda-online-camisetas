"use client";

import { RefreshCcw, RotateCw, Webhook } from "lucide-react";
import { useState } from "react";

type AdminOrder = {
  id: string;
  status: string;
  updatedAt: string;
  error?: { message?: string };
};

export function AdminPanel() {
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function callAdmin(path: string, init: RequestInit = {}) {
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
      if (!response.ok) {
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

      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Error</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.status}</td>
              <td>{order.error?.message || ""}</td>
              <td>
                <button onClick={() => retryPrintful(order.id)} disabled={loading}>
                  Retry
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
