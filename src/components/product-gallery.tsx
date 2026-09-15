"use client";

import { useState } from "react";
import { ProductGalleryImage } from "@/lib/product-gallery";

export function ProductGallery({ images, productName }: { images: ProductGalleryImage[]; productName: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = images[selectedIndex] || images[0];

  return (
    <section className="ncc-gallery" aria-label={`${productName} gallery`}>
      <div className="ncc-gallery__main">
        {selectedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selectedImage.src} alt={selectedImage.alt} />
        ) : (
          <div className="ncc-gallery__empty">Product image coming soon.</div>
        )}
      </div>

      {images.length > 1 ? (
        <div className="ncc-gallery__thumbs" aria-label="Choose product image">
          {images.map((image, index) => (
            <button
              aria-label={`Show image ${index + 1}`}
              aria-pressed={selectedIndex === index}
              className="ncc-gallery__thumb"
              key={image.src}
              onClick={() => setSelectedIndex(index)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
