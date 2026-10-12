import type { Firestore } from "firebase-admin/firestore";
import type { sendEmail } from "../email";
import { canRunAlerts } from "./config";
import { dispatchAlert } from "./dispatch";
import { scanOperationalIncidents } from "./scan";
import type { AlertConfig, AlertStore } from "./types";

export async function runOperationalDigest(deps: { db: Firestore; store: AlertStore; config: AlertConfig; send: typeof sendEmail; now: () => number }): Promise<{
  status: "disabled" | "busy" | "complete" | "partial"; delivery: "accepted" | "retry" | "review" | "skipped";
}> {
  if (!canRunAlerts(deps.config)) return { status: "disabled", delivery: "skipped" };
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  const claim = await deps.store.claimDailyRun(day);
  if (!claim) return { status: "busy", delivery: "skipped" };
  const result = await scanOperationalIncidents({ ...deps, runToken: claim.token });
  const id = await deps.store.prepareDigest(day, claim.token, result);
  // The existing transport timeout has its own budget after the 30-second scan.
  const delivery = id ? await dispatchAlert(id, deps) : "skipped";
  const finished = await deps.store.finishDailyRun(day, claim.token, result);
  return { status: !finished || result.partial ? "partial" : "complete", delivery };
}
