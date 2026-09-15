import { productPolicies, type ProductContent } from "@/lib/product-content";
import type { ProductGalleryImage } from "@/lib/product-gallery";

function getEditorialImage(images: ProductGalleryImage[], preferredIndex: number): ProductGalleryImage | undefined {
  return images[preferredIndex] || images[images.length - 1] || images[0];
}

export function ProductDetails({ content, images = [] }: { content?: ProductContent; images?: ProductGalleryImage[] }) {
  const fitImage = getEditorialImage(images, 2);
  const situationImage = getEditorialImage(images, 3);

  return (
    <section className="ncc-details" aria-label="Product details">
      {content ? (
        <>
          <article className="ncc-editorial-panel ncc-editorial-panel--fit">
            <div className="ncc-editorial-copy">
              <p className="ncc-microcopy">No Context Club</p>
              <h2>{content.heading}</h2>
              <p>{content.summary}</p>
              <div className="ncc-fit-pills" aria-label="Fit and feel">
                {content.fitFeel.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            {fitImage ? (
              <figure className="ncc-editorial-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fitImage.src} alt={fitImage.alt} />
              </figure>
            ) : null}
          </article>

          <article className="ncc-editorial-panel ncc-editorial-panel--situation">
            <div className="ncc-situation-art">
              {situationImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={situationImage.src} alt={situationImage.alt} />
                </>
              ) : null}
            </div>
            <div className="ncc-situation-copy">
              <p className="ncc-microcopy">The situation</p>
              <h2>{content.situation.heading}</h2>
              <p>{content.situation.body}</p>
              <div className="ncc-situation-tags" aria-label="Design tags">
                {content.situation.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
          </article>

          <article className="ncc-supplier-card">
            <div>
              <p className="ncc-microcopy">Supplier</p>
              <h2>{content.supplierContext.supplier}</h2>
            </div>
            <div className="ncc-supplier-card__body">
              <p className="ncc-microcopy">What applies</p>
              <p>{content.supplierContext.whatApplies}</p>
              <a href={content.supplierContext.sourceUrl} target="_blank" rel="noreferrer">
                {content.supplierContext.sourceLabel} ↗
              </a>
              <p className="ncc-supplier-note">{content.supplierContext.note}</p>
            </div>
          </article>
        </>
      ) : null}

      <article className="ncc-useful-card">
        <p className="ncc-microcopy">The useful part</p>
        <h2>Details, no drama.</h2>

        {content ? (
          <details className="ncc-accordion" open>
            <summary>{content.specsTitle}</summary>
            <ul>
              {content.specs.map((spec) => (
                <li key={spec}>{spec}</li>
              ))}
            </ul>
            {content.customerNote ? <p className="ncc-help-text">{content.customerNote}</p> : null}
          </details>
        ) : null}

        <details className="ncc-accordion">
          <summary>Fit and size</summary>
          <p>Use the size guide in the purchase box before choosing. Product measurements vary by garment type.</p>
        </details>

        <details className="ncc-accordion">
          <summary>Shipping</summary>
          <p>{productPolicies.shipping.summary}</p>
          <ul>
            {productPolicies.shipping.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>

        <details className="ncc-accordion">
          <summary>Returns and product issues</summary>
          <p>{productPolicies.returns.summary}</p>
          <ul>
            {productPolicies.returns.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      </article>
    </section>
  );
}
