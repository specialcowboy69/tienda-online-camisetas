import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { ProductContext, ProductDetails, ProductFinalCallout } from "@/components/product-details";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { SiteHeader } from "@/components/site-header";
import { env, getAllowedShippingCountries } from "@/lib/env";
import { getCatalogProduct, listCatalogProducts } from "@/lib/firestore";
import { getCatalogProductGallery } from "@/lib/product-gallery";
import { getProductIdBySlug, getProductSlug } from "@/lib/product-slugs";
import { productContentById } from "@/lib/product-content";
import { getActiveProductVariants, getProductPriceSummary } from "@/lib/product-view";
import { getSizeGuideForProduct } from "@/lib/size-guides";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

function formatPrice(price?: string, currency?: string) {
  if (!price || !currency) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase()
    }).format(Number(price));
  } catch {
    return `${price} ${currency.toUpperCase()}`;
  }
}

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
  const price = getProductPriceSummary(product);
  const firstActiveVariant = getActiveProductVariants(product)[0];
  const priceLabel = firstActiveVariant
    ? formatPrice(firstActiveVariant.retailPrice, firstActiveVariant.currency)
    : price
      ? `${price.isRange ? "From " : ""}${formatPrice(price.min, price.currency)}`
      : "Unavailable";
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

      <ProductDetails content={content} images={gallery} productName={product.name} sizeGuide={sizeGuide} />

      {relatedProducts.length ? (
        <section className="ncc-related" aria-labelledby="related-products-title">
          <div className="ncc-related__frame">
            <span className="ncc-related__corner ncc-related__corner--top-left" aria-hidden="true" />
            <span className="ncc-related__corner ncc-related__corner--top-right" aria-hidden="true" />
            <span className="ncc-related__corner ncc-related__corner--bottom-left" aria-hidden="true" />
            <span className="ncc-related__corner ncc-related__corner--bottom-right" aria-hidden="true" />

            <div className="ncc-related__eyebrow">
              <p className="ncc-microcopy">The First Drop</p>
            </div>
            <h2 id="related-products-title">More things that make no sense</h2>
            <div className="ncc-products-grid ncc-products-grid--related">
              {relatedProducts.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} ctaLabel="View tee" showMeta={false} />
              ))}
            </div>
            <div className="ncc-related__footer">
              <Link className="ncc-pill-link ncc-related__cta" href="/products">
                Shop all
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <ProductContext content={content} images={gallery} />

      <ProductFinalCallout content={content} images={gallery} priceLabel={priceLabel} productName={product.name} sizeGuide={sizeGuide} />

      {!getProductSlug(product) ? <p className="notice">This product needs a public slug before launch.</p> : null}
    </main>
  );
}
