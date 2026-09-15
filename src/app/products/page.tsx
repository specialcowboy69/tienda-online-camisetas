import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { listCatalogProducts } from "@/lib/firestore";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await listCatalogProducts();

  return (
    <main className="ncc-page">
      <SiteHeader />
      <section className="ncc-products-hero">
        <p className="ncc-microcopy">The First Drop</p>
        <h1>Graphic apparel for whatever that was.</h1>
        <p>Pet drama, coffee disasters, questionable choices and every other story that gets worse with context.</p>
      </section>
      <section className="ncc-products-grid" aria-label="Products">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}
