import { NextRequest } from "next/server";
import { env } from "./env";

export function isAdminRequest(request: NextRequest): boolean {
  const headerToken = request.headers.get("x-admin-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = headerToken || bearer;

  if (!env.ADMIN_SECRET) {
    return false;
  }

  return token === env.ADMIN_SECRET;
}

export function isCronOrAdminRequest(request: NextRequest): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (env.CRON_SECRET && bearer === env.CRON_SECRET) {
    return true;
  }
  return isAdminRequest(request);
}
