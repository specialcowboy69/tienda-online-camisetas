import { SITE_ORIGIN } from "@/lib/seo";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AnalyticsConsentProvider } from "@/components/analytics-consent";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "No Context Club",
  description: "Funny graphic tees for whatever that was."
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><AnalyticsConsentProvider enabled={process.env.NEXT_PUBLIC_ANALYTICS_ENABLED} measurementId={process.env.NEXT_PUBLIC_GA4_ID} deployment={process.env.VERCEL_ENV}>{children}</AnalyticsConsentProvider></body>
    </html>
  );
}
