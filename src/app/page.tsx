import { HomePageContent } from "@/components/home-page-content";
import { getPublicCatalog } from "@/lib/public-catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <HomePageContent catalog={await getPublicCatalog()} />;
}
