import { HomePageContent } from "@/components/home-page-content";
import { AnalyticsPageRegistration } from "@/components/analytics-page";
import { getPublicCatalog } from "@/lib/public-catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <><AnalyticsPageRegistration path="/" title="Home" /><HomePageContent catalog={await getPublicCatalog()} /></>;
}
