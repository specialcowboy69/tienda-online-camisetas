import { SizeGuide } from "./size-guides";

export type SizeGuideUnit = "in" | "cm";
export type SizeGuideColumn = "size" | "length" | "width" | "sleeveLength";

const fractionLabels: Record<number, string> = {
  1: "1/8",
  2: "1/4",
  3: "3/8",
  4: "1/2",
  5: "5/8",
  6: "3/4",
  7: "7/8"
};

export function formatMeasurement(valueCm: number, unit: SizeGuideUnit): string {
  if (unit === "cm") {
    return `${Number.isInteger(valueCm) ? valueCm.toFixed(0) : valueCm.toFixed(1)} cm`;
  }

  const totalEighths = Math.round((valueCm / 2.54) * 8);
  const whole = Math.floor(totalEighths / 8);
  const fraction = totalEighths % 8;

  return fraction === 0 ? `${whole}"` : `${whole} ${fractionLabels[fraction]}"`;
}

export function getSizeGuideColumns(guide: SizeGuide): SizeGuideColumn[] {
  const columns: SizeGuideColumn[] = ["size", "length", "width"];
  if (guide.measurementsCm.some((measurement) => typeof measurement.sleeveLength === "number")) {
    columns.push("sleeveLength");
  }
  return columns;
}
