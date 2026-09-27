import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getPublicCatalog } from "@/lib/public-catalog";

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

  return (
    <main className="ncc-page">
      <SiteHeader />
      <section className="ncc-products-hero">
        <p className="ncc-microcopy">The First Drop</p>
        <h1>Graphic apparel for whatever that was.</h1>
        <p>Pet drama, coffee disasters, questionable choices and every other story that gets worse with context.</p>
      </section>
      {catalog.status === "unavailable" ? (
        <CatalogState kind="unavailable" />
      ) : catalog.products.length === 0 ? (
        <CatalogState kind="empty" />
      ) : (
        <section className="ncc-products-grid" aria-label="Products">
          {catalog.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      )}
    </main>
  );
}
