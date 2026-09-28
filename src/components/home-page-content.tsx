import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { SiteHeader } from "@/components/site-header";
import { getCatalogProductGallery } from "@/lib/product-gallery";
import { getProductSlug } from "@/lib/product-slugs";
import type { CatalogProduct } from "@/lib/types";
import type { PublicCatalogResult } from "@/lib/public-catalog";

const HOME_HERO_IMAGE = "https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/Imagenes%20web%20camisetas/home/no-context-club-home-hero.webp";
const HOME_FINAL_CTA_IMAGE = "https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/Imagenes%20web%20camisetas/home/no-context-club-home-final-cta.webp";

function selectGalleryImage(product: CatalogProduct | undefined, preferredIndexes: number[], excludedSources: Set<string> = new Set()) {
  if (!product) return undefined;

  const gallery = getCatalogProductGallery(product);
  return preferredIndexes.map((index) => gallery[index]).find((image) => image && !excludedSources.has(image.src));
}

export function HomePageContent({ catalog }: { catalog: PublicCatalogResult }) {
  const publicProducts = catalog.products.filter((product) => Boolean(getProductSlug(product)));
  const featuredProducts = publicProducts.slice(0, 3);
  const selectProduct = (slug: string, fallbackIndex: number) => (
    publicProducts.find((product) => getProductSlug(product) === slug)
    || (publicProducts.length > 0 ? publicProducts[fallbackIndex % publicProducts.length] : undefined)
  );

  const aboutProduct = selectProduct("farming-dog-aura-graphic-tee", 1);
  const aboutLifestyleImage = selectGalleryImage(aboutProduct, [3, 1, 2, 0]);
  const aboutDetailImage = selectGalleryImage(aboutProduct, [2, 1, 0], new Set(aboutLifestyleImage ? [aboutLifestyleImage.src] : []));
  const aboutSlug = aboutProduct ? getProductSlug(aboutProduct) : undefined;
  const aboutHref = aboutSlug ? `/products/${aboutSlug}` : "/products";

  const usedProofSources = new Set<string>();
  const proofItems = [
    { product: selectProduct("sorry-i-cant-cat-graphic-tee", 4), preferredIndexes: [1, 3, 2, 0], caption: "The fit", altSuffix: "fit view" },
    { product: selectProduct("momma-sorry-cat-cropped-hoodie", 3), preferredIndexes: [2, 1, 3, 0], caption: "The detail", altSuffix: "print detail" },
    { product: selectProduct("its-a-trap-cat-crop-top", 2), preferredIndexes: [3, 1, 2, 0], caption: "In the wild", altSuffix: "lifestyle view" }
  ].flatMap((item) => {
    const product = item.product;
    const image = selectGalleryImage(product, item.preferredIndexes, usedProofSources);
    if (!product || !image) return [];
    usedProofSources.add(image.src);
    return [{ product, image, caption: item.caption, altSuffix: item.altSuffix }];
  });

  const contextProduct = selectProduct("falling-apart-cat-graphic-tee", 0);
  const contextImage = selectGalleryImage(contextProduct, [1, 2, 3, 0]);
  const dropDescription = catalog.status === "available" && catalog.products.length > 0
    ? catalog.products.length === 1
      ? "One design. Zero need to explain it."
      : `${catalog.products.length === 5 ? "Five" : catalog.products.length} designs. Zero need to explain them.`
    : undefined;

  return (
    <main className="ncc-page ncc-home">
      <SiteHeader />

      <section className="ncc-home-hero" aria-labelledby="ncc-home-title">
        <div className="ncc-home-hero__copy">
          <p className="ncc-microcopy">No Context Club</p>
          <h1 id="ncc-home-title">Funny graphic tees for whatever that was.</h1>
          <span className="ncc-home-hero__stroke" aria-hidden="true" />
          <p className="ncc-home-lede">Graphic apparel for pet drama, coffee disasters, questionable choices, and every other story that gets worse with context.</p>
          <Link className="ncc-home-button ncc-home-button--blue" href="/products">Shop the first drop <span aria-hidden="true">↗</span></Link>
          {catalog.status === "unavailable" ? (
            <p className="ncc-home-status" role="status">The shop is temporarily unavailable. Please try again soon.</p>
          ) : null}
          <p className="ncc-home-hero__footnote">No context for the joke. Full context for the tee.</p>
        </div>
        <div className="ncc-home-hero__visual">
          <span className="ncc-home-open-frame" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HOME_HERO_IMAGE} alt="Woman wearing a No Context Club graphic tee at home with her cat" />
        </div>
      </section>

      <section className="ncc-home-drop" aria-labelledby="ncc-home-drop-title">
        <div className="ncc-home-section-head">
          <p className="ncc-microcopy">The First Drop</p>
          <h2 id="ncc-home-drop-title">Small drop. Big energy.</h2>
          {dropDescription ? <p>{dropDescription}</p> : null}
        </div>
        {featuredProducts.length > 0 ? (
          <div className="ncc-home-drop__grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} ctaLabel="View product" />
            ))}
          </div>
        ) : null}
        <div className="ncc-home-drop__footer"><span aria-hidden="true">✳</span><Link className="ncc-home-text-link ncc-home-drop__link" href="/products">Shop all <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section id="about" className="ncc-home-about" aria-labelledby="ncc-home-about-title">
        <p className="ncc-home-about__rail" aria-hidden="true">About No Context Club</p>
        <div className="ncc-home-about__copy">
          <p className="ncc-microcopy">The Situation</p>
          <h2 id="ncc-home-about-title">No context. Better stories.</h2>
          <p>For people who somehow became the main character in a group chat about a cat, a coffee, or both.</p>
          <p className="ncc-home-about__closer">Wear the part you can explain. Or don&apos;t.</p>
          <Link className="ncc-home-text-link" href={aboutHref}>Meet the tee <span aria-hidden="true">↗</span></Link>
        </div>
        {aboutLifestyleImage && aboutProduct ? (
          <div className="ncc-home-about__visual">
            <span className="ncc-home-open-frame" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aboutLifestyleImage.src} alt={`${aboutProduct.name} lifestyle view`} />
            {aboutDetailImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ncc-home-about__detail" src={aboutDetailImage.src} alt={`${aboutProduct.name} print detail`} />
            ) : null}
          </div>
        ) : (
          <span className="ncc-home-about__graphic" aria-hidden="true">?</span>
        )}
      </section>

      <section className="ncc-home-proof" aria-labelledby="ncc-home-proof-title">
        <div className="ncc-home-proof__copy">
          <p className="ncc-microcopy">The Tee, Not the Drama</p>
          <h2 id="ncc-home-proof-title">The art gets the attention. The tee has to earn the repeat wear.</h2>
        </div>
        {proofItems.length > 0 ? (
          <div className="ncc-home-proof__gallery">
            {proofItems.map(({ product, image, caption, altSuffix }) => (
              <figure className="ncc-home-proof__frame" key={`${product.id}-${caption}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.src} alt={`${product.name} ${altSuffix}`} />
                <figcaption>{caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <span className="ncc-home-proof__graphic" aria-hidden="true">NCC</span>
        )}
        <div className="ncc-home-proof__footer"><p>No context for the joke. Full context for the tee.</p><Link className="ncc-home-button ncc-home-button--ink" href="/products">Shop the drop <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="ncc-home-context" aria-labelledby="ncc-home-context-title">
        <div className="ncc-home-context__copy">
          <p className="ncc-microcopy">The Context, For Once</p>
          <h2 id="ncc-home-context-title">No context for the joke. Full context for the tee.</h2>
          <p>The details behind every garment belong with the product, not in fine print.</p>
          <Link className="ncc-home-button ncc-home-button--outline" href="/products">See product details <span aria-hidden="true">↗</span></Link>
        </div>
        {contextImage && contextProduct ? (
          <div className="ncc-home-context__visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contextImage.src} alt={`${contextProduct.name} close-up`} />
            <p>Real product photos. Details on every product page.</p>
          </div>
        ) : (
          <div className="ncc-home-context__graphic" aria-hidden="true"><span>[</span><span>]</span></div>
        )}
      </section>

      <section className="ncc-home-final" aria-labelledby="ncc-home-final-title">
        <div className="ncc-home-final__visual">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HOME_FINAL_CTA_IMAGE} alt="Two friends wearing No Context Club graphic tees" />
        </div>
        <div className="ncc-home-final__copy">
          <p className="ncc-microcopy">No Context Club</p>
          <h2 id="ncc-home-final-title">No context? Perfect.</h2>
          <p>The drop is waiting. The explanation isn&apos;t.</p>
          <Link className="ncc-home-button ncc-home-button--blue" href="/products">Shop the first drop <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
