import { productPolicies, ProductContent } from "@/lib/product-content";

export function ProductDetails({ content }: { content?: ProductContent }) {
  return (
    <section className="ncc-details" aria-label="Product details">
      {content ? (
        <article className="ncc-detail-card ncc-detail-card--story">
          <p className="ncc-microcopy">The useful context</p>
          <h2>{content.heading}</h2>
          <p>{content.summary}</p>
          <div className="ncc-fit-pills">
            {content.fitFeel.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </article>
      ) : null}

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
    </section>
  );
}
