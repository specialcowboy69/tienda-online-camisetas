import type { AlertCategory, AlertConfig, AlertDelivery, EmailMessage } from "./types";

const descriptions: Record<AlertCategory, string> = {
  order_review: "El pedido requiere revision manual.",
  order_failed: "El procesamiento del pedido fallo; revisar su estado.",
  email_review: "El correo del pedido requiere revision manual.",
  refund_review: "El estado del reembolso requiere revision manual.",
  email_blocked: "El envio de correo esta bloqueado por configuracion.",
  email_manual_review: "El envio de correo requiere revision manual.",
  webhook_failed: "El procesamiento del webhook fallo.",
  catalog_failed: "La sincronizacion del catalogo fallo.",
  order_stale: "El pedido permanece pendiente mas de 15 minutos.",
  email_stale: "El correo permanece pendiente mas de 15 minutos.",
  webhook_stale: "El webhook permanece en procesamiento con su lease vencido.",
  catalog_stale: "No se ha confirmado una sincronizacion correcta en mas de 36 horas.",
  source_unreadable: "No se pudo verificar el estado de la referencia interna.",
  alert_delivery_review: "La aceptacion del aviso requiere revision manual."
};

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function panelUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") {
    throw new Error("Operational panel origin is invalid.");
  }
  // Always the normal panel: query tokens, fragments and action URLs never survive.
  return `${url.origin}/admin`;
}

export function renderOperationalMessage(delivery: AlertDelivery, config: AlertConfig): EmailMessage {
  const url = panelUrl(config.siteUrl);
  const incidents = delivery.snapshot.incidents.slice(0, 20);
  const title = delivery.kind === "digest" ? "Resumen operativo diario" : "Aviso operativo";
  const subject = delivery.kind === "digest" ? title : `${title}: ${incidents[0]?.category ?? "source_unreadable"}`;
  const scan = delivery.kind === "digest" ? delivery.snapshot.scan : undefined;
  const lines = scan ? scan.references.slice(0, 20).map(ref => `${ref.kind}: ${ref.id}`)
    : incidents.map(incident => `${incident.category} | ${incident.ref.kind}: ${incident.ref.id} | ${descriptions[incident.category]}`);
  const coverage = scan ? [
    scan.partial ? "Cobertura parcial. Los conteos son provisionales; quedan fuentes sin verificar." : "Cobertura completa del ciclo de inspeccion. Las lecturas ocurrieron en momentos distintos.",
    `Incidencias observadas: ${scan.pendingCount}. Documentos presupuestados/examinados en esta ronda: ${scan.examined}.`,
    ...Object.entries(scan.counts).map(([category, count]) => `${category}: ${count}`),
    ...(scan.unchecked.length ? [`Sin comprobar: ${scan.unchecked.join(", ")}.`] : [])
  ] : [];
  const intro = "Revisar las referencias en el panel administrativo. Este aviso no ejecuta acciones sobre pedidos.";
  return {
    from: config.sender, to: config.recipient ?? "", subject,
    text: [title, "", intro, "", ...coverage, "", ...lines.map(line => `- ${line}`), "", `Abrir el panel administrativo: ${url}`].join("\n"),
    html: `<!doctype html>
<html lang="es" dir="ltr">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#ffffff;color:#111827;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;">
<main lang="es" dir="ltr" style="max-width:640px;margin:0 auto;padding:24px;">
<h1 style="font-size:24px;">${escapeHtml(title)}</h1>
<p>${intro}</p>
${coverage.map(line => `<p>${escapeHtml(line)}</p>`).join("")}
<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
<p><a href="${escapeHtml(url)}" style="color:#0047ab;display:inline-block;padding:12px 0;">Abrir el panel administrativo</a></p>
</main>
</body>
</html>`,
    tags: [{ name: "email_type", value: delivery.kind === "digest" ? "operational_digest" : "operational_alert" }]
  };
}
