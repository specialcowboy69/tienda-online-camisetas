"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatMeasurement, getSizeGuideColumns, SizeGuideUnit } from "@/lib/size-guide-display";
import { SizeGuide } from "@/lib/size-guides";

type SizeGuideModalProps = {
  guide: SizeGuide;
  isOpen: boolean;
  onClose: () => void;
  productName: string;
};

export function SizeGuideModal({ guide, isOpen, onClose, productName }: SizeGuideModalProps) {
  const [unit, setUnit] = useState<SizeGuideUnit>("in");
  const [tab, setTab] = useState<"measurements" | "measure">("measurements");
  const columns = useMemo(() => getSizeGuideColumns(guide), [guide]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="ncc-modal" role="dialog" aria-modal="true" aria-labelledby="size-guide-title">
      <div className="ncc-modal__backdrop" onClick={onClose} />
      <div className="ncc-modal__panel">
        <button className="ncc-modal__close" type="button" onClick={onClose} aria-label="Close size guide">
          <X size={24} strokeWidth={2} />
        </button>
        <p className="ncc-microcopy">No Context Club</p>
        <p className="ncc-modal__product">{productName}</p>
        <h2 id="size-guide-title">Size guide</h2>

        <div className="ncc-tabs" role="tablist" aria-label="Size guide sections">
          <button type="button" role="tab" aria-selected={tab === "measurements"} onClick={() => setTab("measurements")}>
            Product measurements
          </button>
          <button type="button" role="tab" aria-selected={tab === "measure"} onClick={() => setTab("measure")}>
            How to measure
          </button>
        </div>

        {tab === "measurements" ? (
          <>
            <div className="ncc-unit-toggle" aria-label="Measurement unit">
              <button type="button" aria-pressed={unit === "in"} onClick={() => setUnit("in")}>
                IN
              </button>
              <button type="button" aria-pressed={unit === "cm"} onClick={() => setUnit("cm")}>
                CM
              </button>
            </div>

            <div className="ncc-size-table-wrap">
              <table className="ncc-size-table">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column}>{columnLabels[column]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.measurementsCm.map((measurement) => (
                    <tr key={measurement.size}>
                      <td>{measurement.size}</td>
                      <td>{formatMeasurement(measurement.length, unit)}</td>
                      <td>{formatMeasurement(measurement.width, unit)}</td>
                      {columns.includes("sleeveLength") ? (
                        <td>{measurement.sleeveLength ? formatMeasurement(measurement.sleeveLength, unit) : ""}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ncc-help-text">{guide.measurementNote}</p>
          </>
        ) : (
          <div className="ncc-measure">
            <div className="ncc-measure__shirt" aria-hidden="true">
              <span className="ncc-measure__line ncc-measure__line--length">A</span>
              <span className="ncc-measure__line ncc-measure__line--width">B</span>
              {columns.includes("sleeveLength") ? <span className="ncc-measure__line ncc-measure__line--sleeve">C</span> : null}
            </div>
            <div>
              <h3>Measure a garment laid flat.</h3>
              <p>A Length: top shoulder seam to bottom hem.</p>
              <p>B Width: chest width from side to side.</p>
              {columns.includes("sleeveLength") ? <p>C Sleeve: shoulder seam to sleeve opening.</p> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const columnLabels = {
  size: "Size",
  length: "A Length",
  width: "B Width",
  sleeveLength: "C Sleeve"
} as const;
