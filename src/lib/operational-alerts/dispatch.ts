import { EmailDispatchError } from "../email";
import type { sendEmail } from "../email";
import { canRunAlerts } from "./config";
import { renderOperationalMessage } from "./render";
import type { AlertConfig, AlertStore, DeliveryOutcome } from "./types";

type DispatchResult = "accepted" | "retry" | "review" | "skipped";
const SAFE_RETRY_MS = 82800000;

export async function dispatchAlert(id: string, deps: { store: AlertStore; config: AlertConfig; send: typeof sendEmail; now: () => number }): Promise<DispatchResult> {
  if (!canRunAlerts(deps.config)) return "skipped";
  const claim = await deps.store.claimDelivery(id).catch(() => null);
  if (!claim) return "retry";
  if (claim.kind === "skip") return claim.reason === "review" ? "review" : "skipped";
  const { token, delivery } = claim;
  const finish = async (outcome: DeliveryOutcome): Promise<DispatchResult> => {
    try { return await deps.store.finishDelivery(id, token, outcome) ? outcome.kind : "retry"; }
    catch { return "retry"; }
  };
  let prepared;
  // First dispatch is recorded inside prepare; this lower bound is conservative
  // if preparation takes time. Existing attempts use their persisted timestamp.
  const firstDispatchAtMs = delivery.firstDispatchAtMs ?? deps.now();
  try {
    const message = delivery.message ?? renderOperationalMessage(delivery, deps.config);
    prepared = await deps.store.prepareDelivery(id, token, message);
  } catch { return "retry"; }
  if (!prepared) return "skipped";
  // No await between these checks and transport: do not send from an expired
  // claim or after configuration has been disabled during preparation.
  if (!canRunAlerts(deps.config)) return "skipped";
  const time = deps.now();
  if (!delivery.lease || delivery.lease.expiresAtMs <= time) return "retry";
  if (time < firstDispatchAtMs || time - firstDispatchAtMs >= SAFE_RETRY_MS) {
    return finish({ kind: "review", code: "window_expired" });
  }
  let result;
  try { result = await deps.send(prepared.message, prepared.idempotencyKey); }
  catch (error) {
    if (error instanceof EmailDispatchError) {
      return finish({ kind: error.manualReview ? "review" : "retry", code: "receipt_unknown" });
    }
    return finish({ kind: "retry", code: "transport_failed" });
  }
  if (result.kind === "blocked") return finish({ kind: "retry", code: "configuration_missing" });
  if (typeof result.providerEmailId !== "string" || !result.providerEmailId.trim()) {
    return finish({ kind: "retry", code: "receipt_unknown" });
  }
  return finish({ kind: "accepted", providerEmailId: result.providerEmailId });
}
