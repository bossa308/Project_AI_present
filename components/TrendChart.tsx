"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisModel, Scales, SeriesStats, Thresholds } from "@/lib/types";
import {
  ANOMALY_COLOR,
  colorForIndex,
  downsample,
  fmtNumber,
  formatTime,
} from "@/lib/analyze";
import { downloadText, exportSvgToPng, toCsv } from "@/lib/export";

interface TrendChartProps {
  model: AnalysisModel;
  thresholds: Thresholds;
  scales: Scales;
  drawId: number;
  reducedMotion: boolean;
  /** anomaly clicked in the table → highlight it here + scroll into view */
  focus: { x: number; key: string } | null;
}

type FlatRow = Record<string, number | null | string>;

function isBreach(
  v: number,
  th: { min: number | null; max: number | null } | undefined
): boolean {
  if (!th) return false;
  return (th.min !== null && v < th.min) || (th.max !== null && v > th.max);
}

/** Min-max scale a value to 0..100 using a series' observed range. */
function norm(v: number | null, s: SeriesStats | undefined): number | null {
  if (v === null) return null;
  if (!s || !Number.isFinite(s.min) || s.max === s.min) return 50;
  return ((v - s.min) / (s.max - s.min)) * 100;
}

export default function TrendChart({
  model,
  thresholds,
  scales,
  drawId,
  reducedMotion,
  focus,
}: TrendChartProps) {
  const { seriesKeys, xType, stats } = model;
  const wrapRef = useRef<HTMLDivElement>(null);

  // stable color per series, keyed by the original order (survives hiding)
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    seriesKeys.forEach((k, i) => (m[k] = colorForIndex(i)));
    return m;
  }, [seriesKeys]);

  const [normalized, setNormalized] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // new dataset -> show every series again
  useEffect(() => setHidden(new Set()), [drawId]);

  const visibleKeys = seriesKeys.filter((k) => !hidden.has(k));

  const visibleRows = useMemo(() => downsample(model.rows, 1000), [model.rows]);
  const downsampled = model.rows.length > visibleRows.length;

  // ONE shared dataset. `${k}` is the *plotted* value (raw or normalized);
  // `${k}__raw` keeps the true value for the tooltip; `${k}__anom` marks breaches
  // at the plotted position; `${k}__sim` is the what-if line (plotted-space).
  const chartData = useMemo<FlatRow[]>(() => {
    return visibleRows.map((r) => {
      const o: FlatRow = { x: r.x, xLabel: r.xLabel };
      for (const k of seriesKeys) {
        const raw = r.values[k];
        const scale = scales[k] ?? 1;
        const simRaw = raw === null ? null : raw * scale;
        const plot = normalized ? norm(raw, stats[k]) : raw;
        o[k] = plot;
        o[`${k}__raw`] = raw;
        o[`${k}__simRaw`] = simRaw;
        o[`${k}__sim`] = normalized ? norm(simRaw, stats[k]) : simRaw;
        o[`${k}__anom`] =
          raw !== null && isBreach(raw, thresholds[k]) ? plot : null;
      }
      return o;
    });
  }, [visibleRows, seriesKeys, scales, thresholds, normalized, stats]);

  // Self-draw reveal only briefly after a new dataset loads.
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

  const simActive = visibleKeys.some((k) => (scales[k] ?? 1) !== 1);
  const soloKey = visibleKeys.length === 1 ? visibleKeys[0] : null;
  const soloTh = soloKey ? thresholds[soloKey] : null;

  // Plotted position of the clicked anomaly (raw or normalized to match the axis).
  const focusPoint = useMemo(() => {
    if (!focus) return null;
    const row = model.rows.find((r) => r.x === focus.x);
    const raw = row ? row.values[focus.key] : null;
    const y = normalized ? norm(raw, stats[focus.key]) : raw;
    return { x: focus.x, y };
  }, [focus, model.rows, normalized, stats]);

  // When an anomaly is clicked: reveal its series if hidden, and bring the chart
  // into view only if it isn't already (so a sticky/visible chart doesn't jump).
  useEffect(() => {
    if (!focus) return;
    setHidden((prev) => {
      if (!prev.has(focus.key)) return prev;
      const next = new Set(prev);
      next.delete(focus.key);
      return next;
    });
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
    if (!fullyVisible) {
      el.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }
  }, [focus, reducedMotion]);

  function toggleSeries(k: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function exportData() {
    const headers = [xType === "time" ? "time" : "index", ...seriesKeys];
    const rows = model.rows.map((r) => [
      r.xLabel,
      ...seriesKeys.map((k) => r.values[k]),
    ]);
    downloadText("datapulse-data.csv", toCsv(headers, rows));
  }

  async function exportPng() {
    const svg = wrapRef.current?.querySelector(".recharts-surface");
    if (svg) await exportSvgToPng(svg as unknown as SVGSVGElement, "datapulse-chart.png");
  }

  const xTickFormatter = (x: number) =>
    xType === "time" ? formatTime(x) : String(Math.round(x) + 1);
  const yTickFormatter = (v: number) =>
    normalized ? String(Math.round(v)) : fmtNumber(v);

  if (seriesKeys.length === 0) {
    return (
      <div className="chart-wrap chart-empty">
        <p>เลือกค่าที่จะพล็อตอย่างน้อย 1 ค่าจากแผง “การจับคู่คอลัมน์”</p>
      </div>
    );
  }

  return (
    <div className="chart-block">
      <div className="chart-toolbar">
        <div className="seg" role="group" aria-label="โหมดแกน Y">
          <button
            type="button"
            className={`seg-btn${!normalized ? " is-on" : ""}`}
            onClick={() => setNormalized(false)}
            aria-pressed={!normalized}
          >
            ค่าจริง
          </button>
          <button
            type="button"
            className={`seg-btn${normalized ? " is-on" : ""}`}
            onClick={() => setNormalized(true)}
            aria-pressed={normalized}
            title="ปรับทุกเส้นให้สเกล 0–100 เพื่อเทียบรูปทรงกัน"
          >
            ปรับสเกล
          </button>
        </div>
        <div className="toolbar-spacer" />
        <button type="button" className="btn btn-mini btn-ghost" onClick={exportData}>
          ข้อมูล CSV
        </button>
        <button type="button" className="btn btn-mini btn-ghost" onClick={exportPng}>
          เซฟ PNG
        </button>
      </div>

      <div className="chart-wrap" ref={wrapRef}>
        {animate && <span className="chart-sweep" key={drawId} aria-hidden="true" />}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
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
              width={normalized ? 38 : 52}
              domain={normalized ? [0, 100] : ["auto", "auto"]}
              tickFormatter={yTickFormatter}
            />
            <Tooltip
              content={
                <ReadoutTooltip
                  seriesKeys={visibleKeys}
                  colorMap={colorMap}
                  thresholds={thresholds}
                  scales={scales}
                  xType={xType}
                />
              }
              cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />

            {/* raw mode + single series: shaded threshold band */}
            {!normalized && soloKey && soloTh && soloTh.min !== null && soloTh.max !== null && (
              <ReferenceArea
                y1={soloTh.min}
                y2={soloTh.max}
                fill="var(--accent)"
                fillOpacity={0.06}
                stroke="none"
              />
            )}
            {!normalized && soloTh?.min != null && (
              <ReferenceLine y={soloTh.min} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
            )}
            {!normalized && soloTh?.max != null && (
              <ReferenceLine y={soloTh.max} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
            )}

            {/* normalized mode: each series' limits as thin colored lines (multi band) */}
            {normalized &&
              visibleKeys.map((k) => {
                const th = thresholds[k];
                if (!th) return null;
                const i = seriesKeys.indexOf(k);
                const c = colorForIndex(i);
                const lines = [] as JSX.Element[];
                const nMax = norm(th.max, stats[k]);
                const nMin = norm(th.min, stats[k]);
                if (th.max !== null && nMax !== null)
                  lines.push(
                    <ReferenceLine key={`${k}-max`} y={nMax} stroke={c} strokeDasharray="2 4" strokeOpacity={0.4} />
                  );
                if (th.min !== null && nMin !== null)
                  lines.push(
                    <ReferenceLine key={`${k}-min`} y={nMin} stroke={c} strokeDasharray="2 4" strokeOpacity={0.4} />
                  );
                return lines;
              })}

            {simActive &&
              visibleKeys.map((k) => {
                if ((scales[k] ?? 1) === 1) return null;
                const i = seriesKeys.indexOf(k);
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
                    activeDot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}

            {visibleKeys.map((k) => {
              const i = seriesKeys.indexOf(k);
              const color = colorForIndex(i);
              const anomalyDot = (props: any) => {
                const { cx, cy, payload, index } = props;
                if (cx == null || cy == null || !payload || payload[`${k}__anom`] == null) {
                  return null;
                }
                return (
                  <circle
                    key={`anom-${k}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={3.4}
                    fill={ANOMALY_COLOR}
                    stroke="var(--bg)"
                    strokeWidth={1}
                  />
                );
              };
              return (
                <Line
                  key={`base-${k}`}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={color}
                  strokeWidth={1.8}
                  dot={anomalyDot as any}
                  activeDot={{ r: 3, fill: color, stroke: "var(--bg)", strokeWidth: 1 }}
                  connectNulls
                  isAnimationActive={animate}
                  animationDuration={1300}
                  animationEasing="ease-out"
                  animationBegin={i * 110}
                />
              );
            })}

            {focus && (
              <ReferenceLine
                x={focus.x}
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                ifOverflow="extendDomain"
              />
            )}
            {focusPoint && focusPoint.y !== null && (
              <ReferenceDot
                x={focusPoint.x}
                y={focusPoint.y}
                r={7}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                ifOverflow="extendDomain"
                isFront
              />
            )}

            <Brush
              key={drawId}
              dataKey="x"
              height={20}
              travellerWidth={8}
              stroke="var(--accent)"
              fill="var(--surface-2)"
              tickFormatter={xTickFormatter}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-legend">
        {seriesKeys.map((k, i) => {
          const off = hidden.has(k);
          return (
            <button
              type="button"
              className={`legend-item legend-toggle${off ? " is-hidden" : ""}`}
              key={k}
              onClick={() => toggleSeries(k)}
              aria-pressed={!off}
              title={off ? "คลิกเพื่อแสดง" : "คลิกเพื่อซ่อน"}
            >
              <span className="legend-swatch" style={{ background: colorForIndex(i) }} />
              <span className="mono">{k}</span>
              {(scales[k] ?? 1) !== 1 && (
                <span className="legend-sim mono">×{(scales[k] ?? 1).toFixed(2)}</span>
              )}
            </button>
          );
        })}
        <span className="legend-item legend-anom">
          <span className="legend-swatch" style={{ background: ANOMALY_COLOR }} />
          <span>เกินเกณฑ์</span>
        </span>
        {normalized && <span className="legend-note mono">สเกล 0–100 (tooltip = ค่าจริง)</span>}
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
  colorMap,
  thresholds,
  scales,
  xType,
}: {
  active?: boolean;
  payload?: any[];
  seriesKeys: string[];
  colorMap: Record<string, string>;
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
        {seriesKeys.map((k) => {
          const v = row[`${k}__raw`];
          if (typeof v !== "number") return null;
          const th = thresholds[k];
          const breach = isBreach(v, th);
          const scale = scales[k] ?? 1;
          return (
            <li key={k} className={breach ? "is-breach" : ""}>
              <span className="tt-swatch" style={{ background: colorMap[k] }} />
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
