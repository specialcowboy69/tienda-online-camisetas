import { after } from "next/server";
import { getDb } from "../firebase-admin";
import { sendEmail } from "../email";
import { canRunAlerts, readAlertConfig } from "./config";
import { dispatchAlert } from "./dispatch";
import { createAlertStore } from "./store";
import type { Observation } from "./types";

function reportFailure(code: "operational_observation_failed" | "operational_delivery_failed"): void {
  try { console.warn(code); } catch { /* Diagnostics must not affect business processing either. */ }
}

/** Called only after the business write commits. Transport belongs to after(). */
export async function observeCommittedChange(observation: Observation): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  try {
    const config = readAlertConfig();
    if (!canRunAlerts(config)) return;
    const store = createAlertStore(getDb(), Date.now, config);
    const deadline = Date.now() + 1000;
    let inspected = 0;
    const ids = await Promise.race([
      store.recordObservation(observation, { reserve: count => {
        inspected += count;
        if (!active || Date.now() >= deadline || inspected > 100) throw new Error("observation_budget");
      } }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("observation_timeout")), 1000); })
    ]);
    active = false;
    if (ids.length) after(async () => {
      try {
        for (const id of ids) await dispatchAlert(id, { store, config, send: sendEmail, now: Date.now });
      } catch { reportFailure("operational_delivery_failed"); }
    });
  } catch { reportFailure("operational_observation_failed"); }
  finally { active = false; if (timer) clearTimeout(timer); }
}
