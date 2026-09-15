import { env } from "./env";
import { fromMinorUnits } from "./money";
import { StoreOrder } from "./types";

export async function sendOrderConfirmationEmail(order: StoreOrder): Promise<void> {
  const orderNumber = formatOrderNumber(order.id);
  await sendEmail({
    to: order.recipient.email,
    subject: `Order ${orderNumber} confirmed`,
    text: buildOrderConfirmationText(order),
    html: buildOrderConfirmationHtml(order),
    idempotencyKey: `order-confirmation-${order.id}`,
    tags: [{ name: "email_type", value: "order_confirmation" }]
  });
}

export async function sendShipmentEmail(order: StoreOrder): Promise<void> {
  const orderNumber = formatOrderNumber(order.id);
  await sendEmail({
    to: order.recipient.email,
    subject: `Your order ${orderNumber} is on the way`,
    text: buildShipmentText(order),
    html: buildShipmentHtml(order),
    idempotencyKey: `shipment-${order.id}-${order.tracking?.trackingNumber || "pending"}`,
    tags: [{ name: "email_type", value: "shipment" }]
  });
}

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  tags: Array<{ name: string; value: string }>;
};

async function sendEmail(input: EmailInput): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.info("Email skipped because RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.", input.subject);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      tags: input.tags
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}

function buildOrderConfirmationText(order: StoreOrder): string {
  const lines = [
    `Hi ${order.recipient.name},`,
    "",
    "We've received your payment and your order is now being prepared.",
    "",
    `Order: ${formatOrderNumber(order.id)}`,
    `Total: ${formatMoney(order.totals.total, order.totals.currency)}`,
    "",
    "Items:",
    ...order.items.map((item) => `- ${item.quantity} x ${item.productName} (${item.variantName})`),
    "",
    "We'll email you again when your order ships.",
    "",
    "Thanks for shopping with No Context Club."
  ];

  return lines.join("\n");
}

function buildShipmentText(order: StoreOrder): string {
  const tracking = order.tracking?.trackingUrl || order.tracking?.trackingNumber || "Tracking will be available soon.";
  return [
    `Hi ${order.recipient.name},`,
    "",
    `Your order ${formatOrderNumber(order.id)} is on the way.`,
    "",
    `Tracking: ${tracking}`,
    "",
    "Thanks for shopping with No Context Club."
  ].join("\n");
}

function buildOrderConfirmationHtml(order: StoreOrder): string {
  return renderEmailLayout({
    title: "Order confirmed",
    intro: `Hi ${escapeHtml(order.recipient.name)}, we've received your payment and your order is now being prepared.`,
    content: `
      <p><strong>Order:</strong> ${escapeHtml(formatOrderNumber(order.id))}</p>
      <p><strong>Total:</strong> ${escapeHtml(formatMoney(order.totals.total, order.totals.currency))}</p>
      <h2>Items</h2>
      <ul>
        ${order.items
          .map(
            (item) =>
              `<li>${item.quantity} x ${escapeHtml(item.productName)} <span>${escapeHtml(item.variantName)}</span></li>`
          )
          .join("")}
      </ul>
      <p>We'll email you again when your order ships.</p>
    `
  });
}

function buildShipmentHtml(order: StoreOrder): string {
  const trackingUrl = order.tracking?.trackingUrl;
  const trackingText = order.tracking?.trackingNumber || trackingUrl || "Tracking will be available soon.";

  return renderEmailLayout({
    title: "Your order is on the way",
    intro: `Hi ${escapeHtml(order.recipient.name)}, your order ${escapeHtml(formatOrderNumber(order.id))} is on the way.`,
    content: trackingUrl
      ? `<p><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px;padding:12px 16px;">View tracking</a></p>`
      : `<p><strong>Tracking:</strong> ${escapeHtml(trackingText)}</p>`
  });
}

function renderEmailLayout(input: { title: string; intro: string; content: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f3ed;color:#111827;font-family:Arial,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <main style="background:#ffffff;border:1px solid #ded7ca;border-radius:8px;padding:28px;">
        <p style="margin:0 0 16px;color:#0f766e;font-weight:700;">No Context Club</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 20px;line-height:1.6;">${input.intro}</p>
        <div style="line-height:1.6;">${input.content}</div>
        <p style="margin:24px 0 0;color:#4b5563;font-size:14px;">Thanks for shopping with No Context Club.</p>
      </main>
    </div>
  </body>
</html>`;
}

function formatOrderNumber(orderId: string): string {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(Number(fromMinorUnits(amount, currency)));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
