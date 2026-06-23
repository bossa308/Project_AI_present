"use client";

import type { AnalysisModel, AnomalyReport, Scales } from "@/lib/types";
import { colorForIndex } from "@/lib/analyze";

interface SimulatorPanelProps {
  model: AnalysisModel;
  scales: Scales;
  baseReport: AnomalyReport;
  simReport: AnomalyReport;
  onScale: (key: string, value: number) => void;
  onResetScales: () => void;
}

const MIN = 0.5;
const MAX = 1.5;
const STEP = 0.01;

export default function SimulatorPanel({
  model,
  scales,
  baseReport,
  simReport,
  onScale,
  onResetScales,
}: SimulatorPanelProps) {
  const { seriesKeys } = model;
  const anyScaled = seriesKeys.some((k) => (scales[k] ?? 1) !== 1);
  const delta = simReport.total - baseReport.total;

  return (
    <section className="panel" aria-labelledby="sim-title">
      <header className="panel-head">
        <h2 id="sim-title" className="panel-title">
          จำลอง What-if
        </h2>
        <button
          type="button"
          className="btn btn-mini btn-ghost"
          onClick={onResetScales}
          disabled={!anyScaled}
        >
          รีเซ็ตสเกล
        </button>
      </header>

      <div className="sim-summary">
        <div className="sim-stat">
          <span className="sim-stat-label">ผิดปกติ (จริง)</span>
          <span className="sim-stat-val mono">{baseReport.total}</span>
        </div>
        <span className="sim-arrow" aria-hidden="true">
          →
        </span>
        <div className="sim-stat">
          <span className="sim-stat-label">หลังจำลอง</span>
          <span className={`sim-stat-val mono${simReport.total > baseReport.total ? " is-alert" : " is-good"}`}>
            {simReport.total}
          </span>
        </div>
        <div className={`sim-delta mono${delta > 0 ? " is-alert" : delta < 0 ? " is-good" : ""}`}>
          {delta === 0 ? "±0" : delta > 0 ? `+${delta}` : `${delta}`}
        </div>
      </div>

      <div className="sim-list">
        {seriesKeys.map((k, i) => {
          const scale = scales[k] ?? 1;
          const color = colorForIndex(i);
          const simCount = simReport.perSeries[k] ?? 0;
          return (
            <div className="sim-row" key={k}>
              <div className="sim-row-head">
                <span className="legend-swatch" style={{ background: color }} />
                <span className="sim-name mono" title={k}>
                  {k}
                </span>
                <span className="sim-scale mono">×{scale.toFixed(2)}</span>
              </div>
              <input
                type="range"
                className="slider"
                min={MIN}
                max={MAX}
                step={STEP}
                value={scale}
                style={{ ["--series" as string]: color }}
                aria-label={`สเกลของ ${k}`}
                onChange={(e) => onScale(k, Number(e.target.value))}
              />
              <div className="sim-row-foot mono">
                <span>{simCount} จุดเกินเกณฑ์</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => onScale(k, 1)}
                  disabled={scale === 1}
                >
                  ×1.00
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
