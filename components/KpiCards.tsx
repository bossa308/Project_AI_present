"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisModel } from "@/lib/types";
import {
  colorForIndex,
  fmtNumber,
  formatDuration,
  formatTimeFull,
} from "@/lib/analyze";

interface KpiCardsProps {
  model: AnalysisModel;
  reducedMotion: boolean;
  /** changes whenever new data is loaded — retriggers the count-up */
  drawId: number;
}

/** Count up to `value` over ~700ms; instant when reduced motion is requested. */
function useCountUp(value: number, animate: boolean, drawId: number): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!animate || !Number.isFinite(value)) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const duration = 700;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // re-run when the value or the load id changes
  }, [value, animate, drawId]);

  useEffect(() => {
    fromRef.current = 0;
  }, [drawId]);

  return display;
}

function Stat({
  value,
  reducedMotion,
  drawId,
}: {
  value: number;
  reducedMotion: boolean;
  drawId: number;
}) {
  const shown = useCountUp(value, !reducedMotion, drawId);
  return <span className="readout mono">{fmtNumber(shown)}</span>;
}

export default function KpiCards({ model, reducedMotion, drawId }: KpiCardsProps) {
  const { rows, seriesKeys, stats, xType, timeStart, timeEnd } = model;

  return (
    <div className="kpi-grid">
      <div className="kpi-card kpi-summary">
        <span className="kpi-label">จำนวนแถว</span>
        <Stat value={rows.length} reducedMotion={reducedMotion} drawId={drawId} />
        <span className="kpi-unit">records</span>
      </div>

      <div className="kpi-card kpi-summary">
        <span className="kpi-label">ช่วงเวลา</span>
        {xType === "time" && timeStart !== null && timeEnd !== null ? (
          <>
            <span className="readout readout-sm mono">{formatDuration(timeStart, timeEnd)}</span>
            <span className="kpi-unit mono">
              {formatTimeFull(timeStart)} → {formatTimeFull(timeEnd)}
            </span>
          </>
        ) : (
          <>
            <span className="readout readout-sm mono">อิงลำดับแถว</span>
            <span className="kpi-unit">ไม่มีคอลัมน์เวลา</span>
          </>
        )}
      </div>

      {seriesKeys.map((k, i) => {
        const s = stats[k];
        const color = colorForIndex(i);
        return (
          <div className="kpi-card" key={k} style={{ ["--series" as string]: color }}>
            <span className="kpi-series-stripe" aria-hidden="true" />
            <span className="kpi-label" title={k}>
              {k}
            </span>
            {s && s.count > 0 ? (
              <>
                <span className="readout mono">{fmtNumber(s.avg)}</span>
                <span className="kpi-unit">avg · {s.count} จุด</span>
                <div className="kpi-minmax mono">
                  <span>
                    <i>min</i> {fmtNumber(s.min)}
                  </span>
                  <span>
                    <i>max</i> {fmtNumber(s.max)}
                  </span>
                </div>
              </>
            ) : (
              <span className="readout readout-sm mono">ไม่มีค่าตัวเลข</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
