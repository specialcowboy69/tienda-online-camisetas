import { createHash } from "node:crypto";
import { configuredEmailSender, EmailDispatchError, renderOrderConfirmationEmail, renderShipmentEmail, sendEmail } from "./email";
import { claimEmailJob, finishEmailJob, listOrderEmailJobs, prepareEmailDispatch } from "./firestore";
import { ProcessingBusyError } from "./processing-errors";
import type { EmailJob, StoreOrder } from "./types";

export function buildEmailJob(order: StoreOrder, kind: EmailJob["kind"], identity = "confirmation"): EmailJob {
  const id = createHash("sha256").update(JSON.stringify([order.id, kind, identity])).digest("hex");
  const now = new Date().toISOString();
  return { id, orderId: order.id, kind, message: kind === "shipment" ? renderShipmentEmail(order) : renderOrderConfirmationEmail(order), idempotencyKey: `email-${id}`, status: "pending", attempts: 0, createdAt: now, updatedAt: now };
}

export type EmailJobResult = "accepted" | "retry" | "blocked" | "manual_review" | "busy";
export async function processEmailJob(jobId: string): Promise<EmailJobResult> {
  const claim = await claimEmailJob(jobId).catch(() => null);
  if (!claim) return "retry";
  if (claim.kind === "missing") return "manual_review";
  if (claim.kind !== "claimed") return claim.kind;
  const token = claim.lease.token; const job = claim.value;
  const finish = async (status: "pending" | "blocked" | "accepted" | "manual_review", details = {}): Promise<EmailJobResult> => {
    if (!await finishEmailJob(jobId, token, status, details)) return "retry";
    return status === "pending" ? "retry" : status;
  };
  try {
    if (job.firstDispatchAtMs !== undefined && (Date.now() - job.firstDispatchAtMs >= 82800000 || !job.message.from)) {
      return await finish("manual_review", { lastError: "Email acceptance is unknown beyond the safe retry window or frozen sender is missing." });
    }
    const sender = configuredEmailSender(job.message);
    if (!sender) return await finish("blocked", { lastError: "Email configuration is missing." });
    const prepared = await prepareEmailDispatch(jobId, token, sender);
    if (!prepared) return "retry";
    const result = await sendEmail(prepared.message, prepared.idempotencyKey);
    return result.kind === "accepted" ? await finish("accepted", { providerEmailId: result.providerEmailId }) : await finish("blocked", { lastError: "Email configuration is missing." });
  } catch (error) {
    // Never persist provider bodies, secrets, recipient data or arbitrary errors.
    const manual = error instanceof EmailDispatchError && error.manualReview;
    try { return await finish(manual ? "manual_review" : "pending", { lastError: manual ? "Email idempotency requires manual review." : "Email acceptance could not be recorded. Retry the original job." }); }
    catch { return "retry"; }
  }
}

export async function retryOrderEmails(orderId: string): Promise<Array<{ jobId: string; result: EmailJobResult }>> {
  const jobs = await listOrderEmailJobs(orderId);
  const results: Array<{ jobId: string; result: EmailJobResult }> = [];
  for (const job of jobs) results.push({ jobId: job.id, result: await processEmailJob(job.id) });
  return results;
}

export function requireEmailRecovery(results: Array<{ result: EmailJobResult }>): void {
  if (results.some(({ result }) => result === "retry" || result === "busy")) throw new ProcessingBusyError(1);
}
