import { pageMetadata } from "@/lib/seo";
import { filterPublicProducts } from "@/lib/storefront-publication";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getPublicCatalog } from "@/lib/public-catalog";

export const metadata = pageMetadata({"path": "/products", "title": "Shop Graphic Tees, Crop Tops & Hoodies", "description": "Explore the No Context Club drop: cat and dog graphic tees, a crop top, and a cropped hoodie. Find your design and check the fit, sizes, and details."});

export const dynamic = "force-dynamic";

function CatalogState({ kind }: { kind: "empty" | "unavailable" }) {
  return (
    <section className="ncc-catalog-state" aria-live="polite">
      <p>{kind === "empty"
        ? "Nothing here yet. Check back after the next questionable decision."
        : "The shop is temporarily unavailable. Please try again soon."}</p>
    </section>
  );
}

export default async function ProductsPage() {
  const catalog = await getPublicCatalog();
  const products = filterPublicProducts(catalog.products);

  return (
    <main className="ncc-page">
      <AnalyticsPageRegistration path="/products" title="Products" />
      <SiteHeader />
      <section className="ncc-products-hero">
        <p className="ncc-microcopy">The First Drop</p>
        <h1>Graphic apparel for whatever that was.</h1>
        <p>Pet drama, coffee disasters, questionable choices and every other story that gets worse with context.</p>
      </section>
      {catalog.status === "unavailable" ? (
        <CatalogState kind="unavailable" />
      ) : products.length === 0 ? (
        <CatalogState kind="empty" />
      ) : (
        <section className="ncc-products-grid" aria-label="Products">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      )}
    </main>
  );
}
import { AnalyticsPageRegistration } from "@/components/analytics-page";
