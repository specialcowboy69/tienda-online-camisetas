export type SizeMeasurementCm = {
  size: string;
  length: number;
  width: number;
  sleeveLength?: number;
};

export type SizeGuide = {
  slug: string;
  productBase: string;
  source: string;
  unit: "cm";
  measurementNote: string;
  sourceImages: {
    cm: string;
    inches: string;
  };
  measurementsCm: SizeMeasurementCm[];
};

const sizeGuideSourceRoot = "docs/product-assets/size-guides";

export const sizeGuides = {
  "comfort-colors-1717-heavyweight-unisex": {
    slug: "comfort-colors-1717-heavyweight-unisex",
    productBase: "Comfort Colors 1717 heavyweight unisex garment-dyed T-shirt",
    source: "Printful size guide",
    unit: "cm",
    measurementNote: "Las medidas del producto pueden variar hasta 5 cm.",
    sourceImages: {
      cm: `${sizeGuideSourceRoot}/comfort-colors-1717-heavyweight-unisex-cm.png`,
      inches: `${sizeGuideSourceRoot}/comfort-colors-1717-heavyweight-unisex-inches.png`
    },
    measurementsCm: [
      { size: "S", length: 67.6, width: 46.4, sleeveLength: 41.3 },
      { size: "M", length: 71, width: 51.4, sleeveLength: 45 },
      { size: "L", length: 74.6, width: 56, sleeveLength: 48.3 },
      { size: "XL", length: 78, width: 61, sleeveLength: 52 },
      { size: "2XL", length: 80.3, width: 66, sleeveLength: 55.2 },
      { size: "3XL", length: 82.6, width: 70.5, sleeveLength: 59 },
      { size: "4XL", length: 85, width: 75.6, sleeveLength: 62.6 }
    ]
  },
  "bella-canvas-3413-triblend-unisex": {
    slug: "bella-canvas-3413-triblend-unisex",
    productBase: "Bella + Canvas 3413 triblend unisex T-shirt",
    source: "Printful size guide",
    unit: "cm",
    measurementNote: "Las medidas del producto pueden variar hasta 5 cm.",
    sourceImages: {
      cm: `${sizeGuideSourceRoot}/bella-canvas-3413-triblend-unisex-cm.png`,
      inches: `${sizeGuideSourceRoot}/bella-canvas-3413-triblend-unisex-inches.png`
    },
    measurementsCm: [
      { size: "XS", length: 68.6, width: 42 },
      { size: "S", length: 71, width: 45.7 },
      { size: "M", length: 73.7, width: 50.8 },
      { size: "L", length: 76.2, width: 56 },
      { size: "XL", length: 78.7, width: 61 },
      { size: "2XL", length: 81.3, width: 66 },
      { size: "3XL", length: 83.8, width: 71 },
      { size: "4XL", length: 86.4, width: 76.2 }
    ]
  },
  "bella-canvas-7502-womens-cropped-hoodie": {
    slug: "bella-canvas-7502-womens-cropped-hoodie",
    productBase: "Bella + Canvas 7502 women's cropped hoodie",
    source: "Printful size guide",
    unit: "cm",
    measurementNote: "Las medidas del producto pueden variar hasta 5 cm.",
    sourceImages: {
      cm: `${sizeGuideSourceRoot}/bella-canvas-7502-womens-cropped-hoodie-cm.png`,
      inches: `${sizeGuideSourceRoot}/bella-canvas-7502-womens-cropped-hoodie-inches.png`
    },
    measurementsCm: [
      { size: "S", length: 47.3, width: 56 },
      { size: "M", length: 49.2, width: 59.7 },
      { size: "L", length: 54.3, width: 64.8 },
      { size: "XL", length: 56.2, width: 70 },
      { size: "2XL", length: 58, width: 75 }
    ]
  },
  "bella-canvas-6882gd-womens-cropped-tee": {
    slug: "bella-canvas-6882gd-womens-cropped-tee",
    productBase: "Bella + Canvas 6882GD women's garment-dyed cropped tee",
    source: "Printful size guide",
    unit: "cm",
    measurementNote: "Las medidas del producto pueden variar hasta 5 cm.",
    sourceImages: {
      cm: `${sizeGuideSourceRoot}/bella-canvas-6882gd-womens-cropped-tee-cm.png`,
      inches: `${sizeGuideSourceRoot}/bella-canvas-6882gd-womens-cropped-tee-inches.png`
    },
    measurementsCm: [
      { size: "S", length: 44.5, width: 50.8 },
      { size: "M", length: 46.4, width: 56.2 },
      { size: "L", length: 50.2, width: 60 },
      { size: "XL", length: 54, width: 60 },
      { size: "2XL", length: 56.5, width: 70.2 }
    ]
  }
} satisfies Record<string, SizeGuide>;

export type SizeGuideSlug = keyof typeof sizeGuides;

export const productSizeGuideSlugsById: Record<string, SizeGuideSlug> = {
  "468682936": "comfort-colors-1717-heavyweight-unisex",
  "468513582": "comfort-colors-1717-heavyweight-unisex",
  "468520575": "bella-canvas-3413-triblend-unisex",
  "468471370": "bella-canvas-7502-womens-cropped-hoodie",
  "468502976": "bella-canvas-6882gd-womens-cropped-tee"
};

export function getSizeGuideForProduct(product: { id: string; name?: string }) {
  const slug = productSizeGuideSlugsById[product.id];
  return slug ? sizeGuides[slug] : undefined;
}
