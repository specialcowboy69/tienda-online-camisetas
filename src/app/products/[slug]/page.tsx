import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { ProductDetails } from "@/components/product-details";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { SiteHeader } from "@/components/site-header";
import { env, getAllowedShippingCountries } from "@/lib/env";
import { getCatalogProduct, listCatalogProducts } from "@/lib/firestore";
import { getCatalogProductGallery } from "@/lib/product-gallery";
import { getProductIdBySlug, getProductSlug } from "@/lib/product-slugs";
import { productContentById } from "@/lib/product-content";
import { getSizeGuideForProduct } from "@/lib/size-guides";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const productId = getProductIdBySlug(slug);
  if (!productId) {
    return {};
  }

  const product = await getCatalogProduct(productId);
  if (!product) {
    return {};
  }

  return {
    title: `${product.name} | No Context Club`,
    description: productContentById[product.id]?.summary || "Funny graphic apparel from No Context Club."
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const productId = getProductIdBySlug(slug);
  if (!productId) {
    notFound();
  }

  const product = await getCatalogProduct(productId);
  if (!product || product.isIgnored) {
    notFound();
  }

  const allProducts = await listCatalogProducts();
  const relatedProducts = allProducts.filter((candidate) => candidate.id !== product.id).slice(0, 3);
  const content = productContentById[product.id];
  const gallery = getCatalogProductGallery(product);
  const sizeGuide = getSizeGuideForProduct(product);
  const defaultCountry = env.ALLOWED_SHIPPING_COUNTRIES.split(",")[0]?.trim().toUpperCase() || "US";

  return (
    <main className="ncc-page">
      <SiteHeader />
      <nav className="ncc-breadcrumb" aria-label="Breadcrumb">
        <Link href="/products">Shop all</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>

      <section className="ncc-pdp-hero">
        <ProductGallery images={gallery} productName={product.name} />
        <ProductPurchasePanel
          product={product}
          allowedCountries={getAllowedShippingCountries()}
          defaultCountry={defaultCountry}
          sizeGuide={sizeGuide}
        />
      </section>

      <ProductDetails content={content} />

      {relatedProducts.length ? (
        <section className="ncc-related" aria-label="Related products">
          <p className="ncc-microcopy">The First Drop</p>
          <h2>More things that make no sense</h2>
          <div className="ncc-products-grid ncc-products-grid--related">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
          <Link className="ncc-pill-link ncc-related__cta" href="/products">
            Shop all
          </Link>
        </section>
      ) : null}

      {!getProductSlug(product) ? <p className="notice">This product needs a public slug before launch.</p> : null}
    </main>
  );
}
