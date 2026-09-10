import { describe, expect, it } from "vitest";
import { formatMeasurement, getSizeGuideColumns } from "./size-guide-display";
import { sizeGuides } from "./size-guides";

describe("size guide display", () => {
  it("formats centimeters as short metric values", () => {
    expect(formatMeasurement(67.6, "cm")).toBe("67.6 cm");
    expect(formatMeasurement(71, "cm")).toBe("71 cm");
  });

  it("formats inches to the nearest eighth for the US storefront", () => {
    expect(formatMeasurement(67.6, "in")).toBe('26 5/8"');
    expect(formatMeasurement(46.4, "in")).toBe('18 1/4"');
    expect(formatMeasurement(41.3, "in")).toBe('16 1/4"');
  });

  it("only includes sleeve length when the guide provides it", () => {
    expect(getSizeGuideColumns(sizeGuides["comfort-colors-1717-heavyweight-unisex"])).toEqual([
      "size",
      "length",
      "width",
      "sleeveLength"
    ]);
    expect(getSizeGuideColumns(sizeGuides["bella-canvas-3413-triblend-unisex"])).toEqual(["size", "length", "width"]);
  });
});
