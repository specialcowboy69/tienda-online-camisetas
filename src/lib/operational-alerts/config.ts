import { z } from "zod";
import { env } from "../env";
import type { AlertConfig } from "./types";

function singleMailbox(value: string | undefined): boolean {
  return typeof value === "string" && !/[\s,;<>]/.test(value) && z.string().email().safeParse(value).success;
}

function validSender(value: string | undefined): boolean {
  if (!value || /[\x00-\x1f\x7f,;]/.test(value)) return false;
  if (singleMailbox(value)) return true;
  const named = /^([^<>]+) <([^<>]+)>$/.exec(value);
  return !!named && named[1].trim().length > 0 && singleMailbox(named[2]);
}

function productionOrigin(value: string): boolean {
  if (value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password
      && !url.search && !url.hash && url.pathname === "/" && !url.port
      && hostname.includes(".") && !/^[\d.]+$/.test(hostname)
      && !hostname.includes(":") && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(hostname);
  } catch { return false; }
}

export function canRunAlerts(config: AlertConfig): boolean {
  return config.enabled === true && config.environment === "production"
    && singleMailbox(config.recipient) && validSender(config.sender) && productionOrigin(config.siteUrl);
}

export function readAlertConfig(): AlertConfig {
  const config: AlertConfig = {
    enabled: env.OPERATIONAL_ALERTS_ENABLED === "true",
    environment: env.VERCEL_ENV || "",
    recipient: env.OPERATIONAL_ALERTS_TO,
    sender: env.RESEND_FROM_EMAIL,
    siteUrl: env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")
  };
  return { ...config, enabled: canRunAlerts(config) };
}
