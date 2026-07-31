import { env } from "./env";
import { StoreOrder } from "./types";

export async function sendOrderConfirmationEmail(order: StoreOrder): Promise<void> {
  await sendEmail({
    to: order.recipient.email,
    subject: `Order ${order.id} confirmed`,
    text: `Thanks for your order. We have received your payment and your order is being prepared. Order ID: ${order.id}`
  });
}

export async function sendShipmentEmail(order: StoreOrder): Promise<void> {
  const tracking = order.tracking?.trackingUrl || order.tracking?.trackingNumber || "Tracking will be available soon.";
  await sendEmail({
    to: order.recipient.email,
    subject: `Order ${order.id} shipped`,
    text: `Your order has shipped. Tracking: ${tracking}`
  });
}

async function sendEmail(input: { to: string; subject: string; text: string }): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.info("Email skipped because RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.", input.subject);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      text: input.text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}
