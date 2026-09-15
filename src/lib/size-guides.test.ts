import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSizeGuideForProduct, sizeGuides } from "./size-guides";

describe("size guides", () => {
  it("maps each active product to the matching Printful base garment guide", () => {
    expect(getSizeGuideForProduct({ id: "468682936", name: "Falling apart" })?.slug).toBe(
      "comfort-colors-1717-heavyweight-unisex"
    );
    expect(getSizeGuideForProduct({ id: "468513582", name: "Farming dog aura" })?.slug).toBe(
      "comfort-colors-1717-heavyweight-unisex"
    );
    expect(getSizeGuideForProduct({ id: "468520575", name: "Sorry i cant triblend" })?.slug).toBe(
      "bella-canvas-3413-triblend-unisex"
    );
    expect(getSizeGuideForProduct({ id: "468471370", name: "Momma sorry sweeter" })?.slug).toBe(
      "bella-canvas-7502-womens-cropped-hoodie"
    );
    expect(getSizeGuideForProduct({ id: "468502976", name: "Its a trap crop top" })?.slug).toBe(
      "bella-canvas-6882gd-womens-cropped-tee"
    );
  });

  it("keeps the official Printful centimeter measurements for each base garment", () => {
    expect(sizeGuides["comfort-colors-1717-heavyweight-unisex"].measurementsCm).toContainEqual({
      size: "S",
      length: 67.6,
      width: 46.4,
      sleeveLength: 41.3
    });
    expect(sizeGuides["bella-canvas-3413-triblend-unisex"].measurementsCm).toContainEqual({
      size: "XS",
      length: 68.6,
      width: 42
    });
    expect(sizeGuides["bella-canvas-7502-womens-cropped-hoodie"].measurementsCm).toContainEqual({
      size: "2XL",
      length: 58,
      width: 75
    });
    expect(sizeGuides["bella-canvas-6882gd-womens-cropped-tee"].measurementsCm).toContainEqual({
      size: "2XL",
      length: 56.5,
      width: 70.2
    });
  });

  it("references checked-in Printful source images for both supported units", () => {
    for (const guide of Object.values(sizeGuides)) {
      expect(fs.existsSync(path.join(process.cwd(), guide.sourceImages.cm))).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), guide.sourceImages.inches))).toBe(true);
    }
  });
});
