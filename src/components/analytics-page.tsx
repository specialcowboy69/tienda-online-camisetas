"use client";

import { useLayoutEffect } from "react";
import { useAnalyticsPageRegistration } from "./analytics-consent";
import type { AnalyticsPage } from "@/lib/analytics-consent";

export function AnalyticsPageRegistration({ path, title }: AnalyticsPage) {
  const register = useAnalyticsPageRegistration();
  useLayoutEffect(() => register({ path, title }), [register, path, title]);
  return null;
}
