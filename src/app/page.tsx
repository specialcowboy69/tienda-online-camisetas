import { pageMetadata } from "@/lib/seo";
import { HomePageContent } from "@/components/home-page-content";
import { AnalyticsPageRegistration } from "@/components/analytics-page";
import { getPublicCatalog } from "@/lib/public-catalog";

export const metadata = pageMetadata({"path": "/", "title": "Funny Graphic Tees & Apparel", "description": "Funny graphic tees, crop tops, and hoodies for pet drama, coffee disasters, and questionable decisions. Meet the first drop from No Context Club."});

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <><AnalyticsPageRegistration path="/" title="Home" /><HomePageContent catalog={await getPublicCatalog()} /></>;
}
