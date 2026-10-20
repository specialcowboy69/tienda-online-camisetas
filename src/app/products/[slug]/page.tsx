import { JsonLd } from "@/components/json-ld";
import { breadcrumbJsonLd, productGroupJsonLd } from "@/lib/structured-data";
import { productMetadata } from "@/lib/seo";
import { filterPublicProducts, getPublicProductBySlug } from "@/lib/storefront-publication";
import type { Metadata } from "next";
import { AnalyticsPageRegistration } from "@/components/analytics-page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { ProductContext, ProductDetails, ProductFinalCallout } from "@/components/product-details";
import { ProductGallery } from "@/components/product-gallery";
import { ProductPurchasePanel } from "@/components/product-purchase-panel";
import { SiteHeader } from "@/components/site-header";
import { getAllowedShippingCountries, getDefaultShippingCountry } from "@/lib/env";
import { listCatalogProducts } from "@/lib/firestore";
import { getCatalogProductGallery } from "@/lib/product-gallery";
import { getProductSlug } from "@/lib/product-slugs";
import { productContentById } from "@/lib/product-content";
import { getActiveProductVariants, getProductPriceSummary } from "@/lib/product-view";
import { selectUrlVariant } from "@/lib/product-variant-url";
import { getSizeGuideForProduct } from "@/lib/size-guides";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ variant?: string | string[] }>;
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
  const product = await getPublicProductBySlug(slug);
  if (!product) notFound();
  return productMetadata(product);
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const product = await getPublicProductBySlug(slug);
  if (!product) notFound();

  const allProducts = await listCatalogProducts();
  const relatedProducts = filterPublicProducts(allProducts).filter((candidate) => candidate.id !== product.id).slice(0, 3);
  const content = productContentById[product.id];
  const gallery = getCatalogProductGallery(product);
  const sizeGuide = getSizeGuideForProduct(product);
  const price = getProductPriceSummary(product);
  const firstActiveVariant = getActiveProductVariants(product)[0];
  const selectedVariant = selectUrlVariant(product, (await searchParams)?.variant);
  const initialVariant = selectedVariant || firstActiveVariant;
  const selectedImage = selectedVariant?.image;
  let initialImageSrc: string | undefined;
  if (selectedImage) {
    try {
      const url = new URL(selectedImage);
      if (url.protocol === "http:" || url.protocol === "https:") initialImageSrc = selectedImage;
    } catch { /* A variant without a valid image still selects its price and options. */ }
  }
  const variantKey = `${product.id}:${selectedVariant?.syncVariantId ?? "default"}`;
  const priceLabel = initialVariant
    ? formatPrice(initialVariant.retailPrice, initialVariant.currency)
    : price
      ? `${price.isRange ? "From " : ""}${formatPrice(price.min, price.currency)}`
      : "Unavailable";
  const defaultCountry = getDefaultShippingCountry();
  const productGroup = productGroupJsonLd(product);

  return (
    <main className="ncc-page">
      <JsonLd data={breadcrumbJsonLd(product)} />
      {productGroup ? <JsonLd data={productGroup} /> : null}
      <AnalyticsPageRegistration path={`/products/${getProductSlug(product)}`} title="Product" />
      <SiteHeader />
      <nav className="ncc-breadcrumb" aria-label="Breadcrumb">
        <Link href="/products">Shop all</Link>
        <span>/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <section className="ncc-pdp-hero">
        <ProductGallery key={variantKey} images={gallery} productName={product.name} initialImageSrc={initialImageSrc} />
        <ProductPurchasePanel
          key={variantKey}
          product={product}
          initialVariantId={selectedVariant?.syncVariantId}
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
    </main>
  );
}
