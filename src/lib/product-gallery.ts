import { CatalogProduct } from "./types";

export type ProductGalleryImage = {
  src: string;
  alt: string;
};

function addImage(images: string[], value?: string): void {
  const clean = value?.trim();
  if (clean && !images.includes(clean)) {
    images.push(clean);
  }
}

export function getCatalogProductGallery(product: CatalogProduct): ProductGalleryImage[] {
  const images: string[] = [];

  addImage(images, product.storefrontImage);
  for (const image of product.storefrontImages || []) {
    addImage(images, image);
  }
  for (const variant of product.variants) {
    if (!variant.isIgnored && variant.availabilityStatus !== "out_of_stock" && variant.availabilityStatus !== "discontinued") {
      addImage(images, variant.image);
    }
  }
  addImage(images, product.thumbnail);

  return images.map((src, index) => ({
    src,
    alt: `${product.name} product image ${index + 1}`
  }));
}
