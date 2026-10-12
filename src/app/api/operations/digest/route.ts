import type { NextRequest } from "next/server";
import { isCronOrAdminRequest } from "@/lib/auth";
import { getDb } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email";
import { canRunAlerts, readAlertConfig } from "@/lib/operational-alerts/config";
import { createAlertStore } from "@/lib/operational-alerts/store";
import { runOperationalDigest } from "@/lib/operational-alerts/digest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest): Promise<Response> {
  if (!isCronOrAdminRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const config = readAlertConfig();
    if (!canRunAlerts(config)) return Response.json({ status: "disabled" });
    const db = getDb();
    const result = await runOperationalDigest({ db, store: createAlertStore(db, Date.now, config), config, send: sendEmail, now: Date.now });
    return Response.json(result);
  } catch { return Response.json({ status: "failed", code: "operational_digest_failed" }, { status: 503 }); }
}
