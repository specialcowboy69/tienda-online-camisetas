import Link from "next/link";
import { getCatalogProductImage } from "@/lib/catalog-images";
import { getProductSlug } from "@/lib/product-slugs";
import { getProductPriceSummary } from "@/lib/product-view";
import { CatalogProduct } from "@/lib/types";

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

type ProductCardProps = {
  product: CatalogProduct;
  ctaLabel?: string;
  showMeta?: boolean;
};

export function ProductCard({ product, ctaLabel = "View product", showMeta = true }: ProductCardProps) {
  const slug = getProductSlug(product);
  const image = getCatalogProductImage(product);
  const price = getProductPriceSummary(product);
  const priceLabel = price ? `${price.isRange ? "From " : ""}${formatPrice(price.min, price.currency)}` : "Unavailable";
  const href = slug ? `/products/${slug}` : `/products`;

  return (
    <article className="ncc-product-card">
      <Link href={href} className="ncc-product-card__image" aria-label={`View ${product.name}`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={product.name} />
        ) : (
          <span aria-hidden="true" />
        )}
      </Link>
      <div className="ncc-product-card__body">
        {showMeta ? (
          <>
            <h2>
              <Link href={href}>{product.name}</Link>
            </h2>
            <p>{priceLabel}</p>
          </>
        ) : null}
        <Link className="ncc-pill-link ncc-product-card__cta" href={href}>
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
