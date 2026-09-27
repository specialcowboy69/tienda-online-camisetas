"use client";

import { useState } from "react";
import { productPolicies, type ProductContent } from "@/lib/product-content";
import { getProductContextImage, type ProductGalleryImage } from "@/lib/product-gallery";
import type { SizeGuide } from "@/lib/size-guides";
import { SizeGuideModal, type SizeGuideTab } from "./size-guide-modal";

function getEditorialImage(images: ProductGalleryImage[], preferredIndex: number): ProductGalleryImage | undefined {
  return images[preferredIndex] || images[images.length - 1] || images[0];
}

type ProductDetailsProps = {
  content?: ProductContent;
  images?: ProductGalleryImage[];
  productName: string;
  sizeGuide?: SizeGuide;
};

export function ProductDetails({ content, images = [], productName, sizeGuide }: ProductDetailsProps) {
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [sizeGuideTab, setSizeGuideTab] = useState<SizeGuideTab>("measurements");
  const fitImage = getEditorialImage(images, 2);
  const situationImage = getEditorialImage(images, 1);
  const usefulImage = getEditorialImage(images, 0);
  const fitSentence = content?.fitFeel.map((item) => `${item}.`).join(" ");
  const supportSubject = encodeURIComponent(`Sizing help for ${productName}`);

  function openSizeGuide(tab: SizeGuideTab) {
    setSizeGuideTab(tab);
    setIsSizeGuideOpen(true);
  }

  return (
    <section className="ncc-details" aria-label="Product details">
      {content ? (
        <>
          <article className="ncc-editorial-panel ncc-editorial-panel--fit">
            {fitImage ? (
              <figure className="ncc-editorial-image ncc-editorial-image--fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fitImage.src} alt={fitImage.alt} />
              </figure>
            ) : null}

            <div className="ncc-editorial-copy">
              <div className="ncc-editorial-kicker">
                <p className="ncc-microcopy">No Context Club</p>
              </div>
              <h2>The fit</h2>
              <span className="ncc-fit-accent" aria-hidden="true" />
              {fitSentence ? <p className="ncc-fit-summary">{fitSentence}</p> : null}

              <div className="ncc-fit-group">
                <p className="ncc-fit-label">Fit & feel</p>
                <div className="ncc-fit-pills" aria-label="Fit and feel">
                  {content.fitFeel.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              {sizeGuide ? (
                <>
                  <button className="ncc-size-guide-cta" type="button" onClick={() => openSizeGuide("measurements")}>
                    <span>Size guide</span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <div className="ncc-fit-actions" aria-label="Sizing help">
                    <button className="ncc-fit-link" type="button" onClick={() => openSizeGuide("measure")}>
                      How to measure <span aria-hidden="true">→</span>
                    </button>
                    <a className="ncc-fit-link" href={`mailto:orders@funnyteesforall.com?subject=${supportSubject}`}>
                      Need help choosing? <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </article>

          <article className="ncc-editorial-panel ncc-editorial-panel--situation">
            <div className="ncc-situation-art">
              {situationImage ? (
                <figure className="ncc-situation-poster-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={situationImage.src} alt={situationImage.alt} />
                </figure>
              ) : null}
            </div>
            <div className="ncc-situation-copy">
              <div className="ncc-situation-kicker">
                <p className="ncc-microcopy">No Context Club</p>
                <span aria-hidden="true" />
              </div>
              <h2>The situation</h2>
              <span className="ncc-situation-accent" aria-hidden="true" />
              <p className="ncc-situation-lede">{content.situation.heading}</p>
              <p>{content.situation.body}</p>
              <p className="ncc-situation-tagline" aria-label="Design tags">
                {content.situation.tags.join(" + ")}
              </p>
            </div>
          </article>

        </>
      ) : null}

      <article className="ncc-useful-card">
        <div className="ncc-useful-copy">
          <div className="ncc-useful-kicker">
            <p className="ncc-microcopy">No Context Club</p>
            <span aria-hidden="true">*</span>
          </div>
          <h2>{content?.heading || "Details, no drama."}</h2>
          {content?.summary ? <p className="ncc-useful-dek">{content.summary}</p> : null}

          {content?.fitFeel.length ? (
            <div className="ncc-useful-fit">
              <p className="ncc-fit-label">Fit & feel</p>
              <div className="ncc-fit-pills ncc-fit-pills--useful" aria-label="Fit and feel">
                {content.fitFeel.map((item) => (
                  <span key={item}>
                    <span aria-hidden="true">✦</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ncc-useful-accordion-stack">
            {content ? (
              <details className="ncc-accordion ncc-accordion--specs" open>
                <summary>{content.specsTitle}</summary>
                <ul className="ncc-spec-list">
                  {content.specs.map((spec) => (
                    <li key={spec}>
                      <span className="ncc-spec-icon" aria-hidden="true" />
                      <span>{spec}</span>
                    </li>
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
          </div>
        </div>

        {usefulImage ? (
          <figure className="ncc-useful-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={usefulImage.src} alt={usefulImage.alt} />
          </figure>
        ) : null}
      </article>

      {sizeGuide ? (
        <SizeGuideModal
          guide={sizeGuide}
          initialTab={sizeGuideTab}
          isOpen={isSizeGuideOpen}
          onClose={() => setIsSizeGuideOpen(false)}
          productName={productName}
        />
      ) : null}
    </section>
  );
}

type ProductContextProps = {
  content?: ProductContent;
  images?: ProductGalleryImage[];
};

export function ProductContext({ content, images = [] }: ProductContextProps) {
  if (!content) {
    return null;
  }

  const contextImage = getProductContextImage(images);

  return (
    <section className="ncc-product-context" aria-label="Product context">
      <span className="ncc-product-context__mark" aria-hidden="true" />
      <div className="ncc-product-context__story">
        <div className="ncc-product-context__intro">
          <h2>The context, for once</h2>
          <p>No context for the joke. Full context for the tee.</p>
        </div>
        <div className="ncc-product-context__stage">
          <span className="ncc-product-context__dots" aria-hidden="true" />
          {contextImage ? (
            <figure className="ncc-product-context__image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={contextImage.src} alt={contextImage.alt} />
            </figure>
          ) : null}
        </div>
      </div>

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
      <div className="ncc-product-context__footer" aria-hidden="true">
        <span>Funny tees for a complex world.</span>
        <span>No Context Club</span>
      </div>
    </section>
  );
}

type ProductFinalCalloutProps = {
  content?: ProductContent;
  images?: ProductGalleryImage[];
  priceLabel: string;
  productName: string;
  sizeGuide?: SizeGuide;
};

function toDisplayCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function getGarmentLabel(content?: ProductContent) {
  const specsTitle = content?.specsTitle.toLowerCase() || "";
  const heading = content?.heading.toLowerCase() || "";

  if (specsTitle.includes("hoodie")) {
    return "Cropped Hoodie";
  }

  if (heading.includes("crop")) {
    return "Crop Top";
  }

  return "Graphic Tee";
}

function getFinalProductTitle(productName: string, content?: ProductContent) {
  const title = toDisplayCase(productName);
  const normalized = title.toLowerCase();

  if (normalized.includes("tee") || normalized.includes("hoodie") || normalized.includes("crop top")) {
    return title;
  }

  return `${title} ${getGarmentLabel(content)}`;
}

export function ProductFinalCallout({ content, images = [], priceLabel, productName, sizeGuide }: ProductFinalCalloutProps) {
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const finalImage = getEditorialImage(images, 0);
  const displayTitle = getFinalProductTitle(productName, content);

  return (
    <section className="ncc-final-cta" aria-label="Final purchase reminder">
      <span className="ncc-final-cta__mark ncc-final-cta__mark--top" aria-hidden="true" />
      <span className="ncc-final-cta__mark ncc-final-cta__mark--bottom" aria-hidden="true" />
      <div className="ncc-final-cta__paper">
        <h2>No further questions.</h2>
        <span className="ncc-final-cta__accent" aria-hidden="true" />
        <p>{displayTitle}</p>
        <strong>{priceLabel}</strong>
        <a className="ncc-final-cta__button" href="#product-purchase">
          Add to bag
        </a>
        {sizeGuide ? (
          <p className="ncc-final-cta__help">
            Need the details?{" "}
            <button type="button" onClick={() => setIsSizeGuideOpen(true)}>
              See size guide
            </button>
          </p>
        ) : null}
      </div>

      {finalImage ? (
        <figure className="ncc-final-cta__image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={finalImage.src} alt={finalImage.alt} />
        </figure>
      ) : null}

      {sizeGuide ? (
        <SizeGuideModal
          guide={sizeGuide}
          initialTab="measurements"
          isOpen={isSizeGuideOpen}
          onClose={() => setIsSizeGuideOpen(false)}
          productName={productName}
        />
      ) : null}
    </section>
  );
}
