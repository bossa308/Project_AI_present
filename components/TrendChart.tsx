"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisModel, Scales, Thresholds } from "@/lib/types";
import {
  ANOMALY_COLOR,
  colorForIndex,
  downsample,
  fmtNumber,
  formatTime,
} from "@/lib/analyze";

interface TrendChartProps {
  model: AnalysisModel;
  thresholds: Thresholds;
  scales: Scales;
  drawId: number;
  reducedMotion: boolean;
}

/** Flattened row for Recharts: x + one field per series (base/sim/anomaly). */
type FlatRow = Record<string, number | null | string>;

function isBreach(
  v: number,
  th: { min: number | null; max: number | null } | undefined
): boolean {
  if (!th) return false;
  return (th.min !== null && v < th.min) || (th.max !== null && v > th.max);
}

export default function TrendChart({
  model,
  thresholds,
  scales,
  drawId,
  reducedMotion,
}: TrendChartProps) {
  const { seriesKeys, xType } = model;

  // Downsample for smooth rendering; anomaly *counts* elsewhere use full data.
  const visibleRows = useMemo(() => downsample(model.rows, 1000), [model.rows]);
  const downsampled = model.rows.length > visibleRows.length;

  // One flat data array drives the base + sim lines via string dataKeys.
  const chartData = useMemo<FlatRow[]>(() => {
    return visibleRows.map((r) => {
      const o: FlatRow = { x: r.x, xLabel: r.xLabel };
      for (const k of seriesKeys) {
        const v = r.values[k];
        o[k] = v;
        const scale = scales[k] ?? 1;
        o[`${k}__sim`] = v === null ? null : v * scale;
      }
      return o;
    });
  }, [visibleRows, seriesKeys, scales]);

  // Anomaly markers get their OWN compact data (only the breaching points) so
  // we don't emit a DOM node per non-anomalous sample. Lines use string
  // dataKeys, so the merged dataset stays harmless: these {x,y} rows simply
  // yield null for every line key and are skipped via connectNulls.
  const anomalyData = useMemo(() => {
    const out: Record<string, { x: number; y: number }[]> = {};
    for (const k of seriesKeys) {
      const th = thresholds[k];
      if (!th || (th.min === null && th.max === null)) continue;
      const pts: { x: number; y: number }[] = [];
      for (const r of visibleRows) {
        const v = r.values[k];
        if (v !== null && isBreach(v, th)) pts.push({ x: r.x, y: v });
      }
      if (pts.length) out[k] = pts;
    }
    return out;
  }, [visibleRows, seriesKeys, thresholds]);

  // Animate the "self-drawing" reveal only briefly after new data loads, so
  // dragging a slider (which changes chartData) doesn't re-animate the lines.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (reducedMotion) {
      setAnimate(false);
      return;
    }
    setAnimate(true);
    const id = window.setTimeout(() => setAnimate(false), 1600);
    return () => window.clearTimeout(id);
  }, [drawId, reducedMotion]);

  const simActive = seriesKeys.some((k) => (scales[k] ?? 1) !== 1);

  // Show a faint threshold band only when a single series is plotted (a shared
  // Y axis makes per-series bands meaningless once several overlap).
  const soloKey = seriesKeys.length === 1 ? seriesKeys[0] : null;
  const soloTh = soloKey ? thresholds[soloKey] : null;

  if (seriesKeys.length === 0) {
    return (
      <div className="chart-wrap chart-empty">
        <p>เลือกค่าที่จะพล็อตอย่างน้อย 1 ค่าจากแผง “การจับคู่คอลัมน์”</p>
      </div>
    );
  }

  const xTickFormatter = (x: number) =>
    xType === "time" ? formatTime(x) : String(Math.round(x) + 1);

  return (
    <div className="chart-wrap">
      {animate && <span className="chart-sweep" key={drawId} aria-hidden="true" />}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 16, bottom: 6, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale={xType === "time" ? "time" : "linear"}
            tickFormatter={xTickFormatter}
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            stroke="var(--grid-strong)"
            minTickGap={42}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            stroke="var(--grid-strong)"
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => fmtNumber(v)}
          />
          <Tooltip
            content={
              <ReadoutTooltip
                seriesKeys={seriesKeys}
                thresholds={thresholds}
                scales={scales}
                xType={xType}
              />
            }
            cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
            isAnimationActive={false}
          />

          {soloKey && soloTh && soloTh.min !== null && soloTh.max !== null && (
            <ReferenceArea
              y1={soloTh.min}
              y2={soloTh.max}
              fill="var(--accent)"
              fillOpacity={0.06}
              stroke="none"
            />
          )}
          {soloTh?.min != null && (
            <ReferenceLine y={soloTh.min} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {soloTh?.max != null && (
            <ReferenceLine y={soloTh.max} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
          )}

          {seriesKeys.map((k, i) => (
            <Line
              key={`base-${k}`}
              type="monotone"
              dataKey={k}
              name={k}
              stroke={colorForIndex(i)}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 3, fill: colorForIndex(i), stroke: "var(--bg)", strokeWidth: 1 }}
              connectNulls
              isAnimationActive={animate}
              animationDuration={1300}
              animationEasing="ease-out"
              animationBegin={i * 110}
            />
          ))}

          {simActive &&
            seriesKeys.map((k, i) => {
              if ((scales[k] ?? 1) === 1) return null;
              return (
                <Line
                  key={`sim-${k}`}
                  type="monotone"
                  dataKey={`${k}__sim`}
                  name={`${k} ×${(scales[k] ?? 1).toFixed(2)}`}
                  stroke={colorForIndex(i)}
                  strokeWidth={1.4}
                  strokeDasharray="5 4"
                  strokeOpacity={0.85}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}

          {seriesKeys.map((k) => {
            const pts = anomalyData[k];
            if (!pts) return null;
            return (
              <Scatter
                key={`anom-${k}`}
                data={pts}
                dataKey="y"
                isAnimationActive={false}
                shape={(props: any) => (
                  <circle
                    cx={props.cx}
                    cy={props.cy}
                    r={3.4}
                    fill={ANOMALY_COLOR}
                    stroke="var(--bg)"
                    strokeWidth={1}
                  />
                )}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="chart-legend">
        {seriesKeys.map((k, i) => (
          <span className="legend-item" key={k}>
            <span className="legend-swatch" style={{ background: colorForIndex(i) }} />
            <span className="mono">{k}</span>
            {(scales[k] ?? 1) !== 1 && (
              <span className="legend-sim mono">×{(scales[k] ?? 1).toFixed(2)}</span>
            )}
          </span>
        ))}
        <span className="legend-item legend-anom">
          <span className="legend-swatch" style={{ background: ANOMALY_COLOR }} />
          <span>เกินเกณฑ์</span>
        </span>
        {downsampled && (
          <span className="legend-note mono">
            แสดง {visibleRows.length.toLocaleString()} จาก {model.rows.length.toLocaleString()} จุด
          </span>
        )}
      </div>
    </div>
  );
}

function ReadoutTooltip({
  active,
  payload,
  seriesKeys,
  thresholds,
  scales,
  xType,
}: {
  active?: boolean;
  payload?: any[];
  seriesKeys: string[];
  thresholds: Thresholds;
  scales: Scales;
  xType: "time" | "index";
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as FlatRow | undefined;
  if (!row) return null;

  const x = Number(row.x);
  const label = xType === "time" ? formatTime(x) : `แถวที่ ${Math.round(x) + 1}`;

  return (
    <div className="tooltip">
      <div className="tooltip-head mono">{label}</div>
      <ul className="tooltip-list">
        {seriesKeys.map((k, i) => {
          const v = row[k];
          if (typeof v !== "number") return null;
          const th = thresholds[k];
          const breach = isBreach(v, th);
          const scale = scales[k] ?? 1;
          return (
            <li key={k} className={breach ? "is-breach" : ""}>
              <span className="tt-swatch" style={{ background: colorForIndex(i) }} />
              <span className="tt-name mono">{k}</span>
              <span className="tt-val mono">{fmtNumber(v)}</span>
              {scale !== 1 && <span className="tt-sim mono">→ {fmtNumber(v * scale)}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
