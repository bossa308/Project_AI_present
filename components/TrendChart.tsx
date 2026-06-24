"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
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
  /** anomaly clicked in the table → highlight it here + scroll into view + zoom */
  focus: { x: number; key: string } | null;
}

type FlatRow = Record<string, number | null | string>;
type Range = [number, number];

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

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    seriesKeys.forEach((k, i) => (m[k] = colorForIndex(i)));
    return m;
  }, [seriesKeys]);

  const [normalized, setNormalized] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // zoom: zoomX = visible time window (data is sliced to it, so Y auto-fits);
  // zoomY = explicit value window (for shift+scroll value-only zoom).
  const [zoomX, setZoomX] = useState<Range | null>(null);
  const [zoomY, setZoomY] = useState<Range | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const lastXRef = useRef<number | null>(null);

  useEffect(() => {
    setHidden(new Set());
    setZoomX(null);
    setZoomY(null);
    setDrag(null);
  }, [drawId]);

  const visibleKeys = seriesKeys.filter((k) => !hidden.has(k));
  const visibleRows = useMemo(() => downsample(model.rows, 1000), [model.rows]);
  const downsampled = model.rows.length > visibleRows.length;

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
        o[`${k}__anom`] = raw !== null && isBreach(raw, thresholds[k]) ? plot : null;
      }
      return o;
    });
  }, [visibleRows, seriesKeys, scales, thresholds, normalized, stats]);

  const xExtent = useMemo<Range | null>(() => {
    if (chartData.length === 0) return null;
    return [Number(chartData[0].x), Number(chartData[chartData.length - 1].x)];
  }, [chartData]);

  // Slice to the zoom window — the axes (and Y auto-domain) then fit the window,
  // which is what makes "zoom time" also magnify the values.
  const displayData = useMemo<FlatRow[]>(() => {
    if (!zoomX) return chartData;
    return chartData.filter((r) => {
      const x = Number(r.x);
      return x >= zoomX[0] && x <= zoomX[1];
    });
  }, [chartData, zoomX]);

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

  /** [min,max] of plotted (and sim) values across the given rows — for Y zoom base. */
  function valueRange(rows: FlatRow[]): Range | null {
    let mn = Infinity;
    let mx = -Infinity;
    for (const r of rows) {
      for (const k of visibleKeys) {
        const v = r[k];
        if (typeof v === "number") {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        if (simActive) {
          const s = r[`${k}__sim`];
          if (typeof s === "number") {
            if (s < mn) mn = s;
            if (s > mx) mx = s;
          }
        }
      }
    }
    if (mn === Infinity) return null;
    const pad = (mx - mn) * 0.08 || Math.abs(mx) * 0.05 || 1;
    return [mn - pad, mx + pad];
  }

  function zoomToX(x0: number, x1: number) {
    if (!xExtent) return;
    const a = Math.max(xExtent[0], Math.min(x0, x1));
    const b = Math.min(xExtent[1], Math.max(x0, x1));
    if (b - a < (xExtent[1] - xExtent[0]) * 0.004) return; // ignore clicks/tiny drags
    setZoomX([a, b]);
    setZoomY(null); // X zoom → let Y auto-fit the window
  }
  function resetZoom() {
    setZoomX(null);
    setZoomY(null);
    setDrag(null);
  }

  const onChartDown = (e: any) => {
    if (e && e.activeLabel != null) setDrag({ a: Number(e.activeLabel), b: Number(e.activeLabel) });
  };
  const onChartMove = (e: any) => {
    if (e && e.activeLabel != null) {
      lastXRef.current = Number(e.activeLabel);
      setDrag((d) => (d ? { ...d, b: Number(e.activeLabel) } : d));
    }
  };
  const onChartUp = () => {
    if (drag) {
      zoomToX(drag.a, drag.b);
      setDrag(null);
    }
  };

  // wheel: scroll = time(X) zoom around cursor; shift+scroll = value(Y) zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !xExtent) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 0.82 : 1.22;
      if (ev.shiftKey) {
        const base = zoomY ?? (normalized ? ([0, 100] as Range) : valueRange(displayData));
        if (!base) return;
        const c = (base[0] + base[1]) / 2;
        const half = ((base[1] - base[0]) / 2) * factor;
        setZoomY([c - half, c + half]);
      } else {
        const base = zoomX ?? xExtent;
        const lx = lastXRef.current;
        const center = lx != null && lx >= base[0] && lx <= base[1] ? lx : (base[0] + base[1]) / 2;
        let nx0 = center - (center - base[0]) * factor;
        let nx1 = center + (base[1] - center) * factor;
        nx0 = Math.max(xExtent[0], nx0);
        nx1 = Math.min(xExtent[1], nx1);
        if (nx1 - nx0 >= xExtent[1] - xExtent[0]) {
          setZoomX(null);
          setZoomY(null);
          return;
        }
        setZoomX([nx0, nx1]);
        setZoomY(null);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomX, zoomY, normalized, xExtent, displayData, simActive, hidden]);

  const focusPoint = useMemo(() => {
    if (!focus) return null;
    const row = model.rows.find((r) => r.x === focus.x);
    const raw = row ? row.values[focus.key] : null;
    const y = normalized ? norm(raw, stats[focus.key]) : raw;
    return { x: focus.x, y };
  }, [focus, model.rows, normalized, stats]);

  useEffect(() => {
    if (!focus) return;
    setHidden((prev) => {
      if (!prev.has(focus.key)) return prev;
      const next = new Set(prev);
      next.delete(focus.key);
      return next;
    });
    const el = wrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight;
      if (!fullyVisible) {
        el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
      }
    }
    if (xExtent) {
      const w = (xExtent[1] - xExtent[0]) * 0.06;
      zoomToX(focus.x - w, focus.x + w);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const rows = model.rows.map((r) => [r.xLabel, ...seriesKeys.map((k) => r.values[k])]);
    downloadText("datapulse-data.csv", toCsv(headers, rows));
  }
  async function exportPng() {
    const svg = wrapRef.current?.querySelector(".recharts-surface");
    if (svg) await exportSvgToPng(svg as unknown as SVGSVGElement, "datapulse-chart.png");
  }

  const xTickFormatter = (x: number) =>
    xType === "time" ? formatTime(x) : String(Math.round(x) + 1);
  const yTickFormatter = (v: number) => (normalized ? String(Math.round(v)) : fmtNumber(v));

  if (seriesKeys.length === 0) {
    return (
      <div className="chart-wrap chart-empty">
        <p>เลือกค่าที่จะพล็อตอย่างน้อย 1 ค่าจากแผง “การจับคู่คอลัมน์”</p>
      </div>
    );
  }

  const zoomed = zoomX !== null || zoomY !== null;
  const yDomain: [any, any] = zoomY ?? (normalized ? [0, 100] : ["auto", "auto"]);

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
        {zoomed && (
          <button type="button" className="btn btn-mini btn-ghost" onClick={resetZoom}>
            รีเซ็ตซูม
          </button>
        )}
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
          <LineChart
            data={displayData}
            margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
            onMouseDown={onChartDown}
            onMouseMove={onChartMove}
            onMouseUp={onChartUp}
            onMouseLeave={() => setDrag(null)}
          >
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
              domain={yDomain}
              allowDataOverflow={zoomY !== null}
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

            {!normalized && soloKey && soloTh && soloTh.min !== null && soloTh.max !== null && (
              <ReferenceArea y1={soloTh.min} y2={soloTh.max} fill="var(--accent)" fillOpacity={0.06} stroke="none" />
            )}
            {!normalized && soloTh?.min != null && (
              <ReferenceLine y={soloTh.min} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
            )}
            {!normalized && soloTh?.max != null && (
              <ReferenceLine y={soloTh.max} stroke={ANOMALY_COLOR} strokeDasharray="4 4" strokeOpacity={0.5} />
            )}

            {normalized &&
              visibleKeys.map((k) => {
                const th = thresholds[k];
                if (!th) return null;
                const c = colorMap[k];
                const out = [] as JSX.Element[];
                const nMax = norm(th.max, stats[k]);
                const nMin = norm(th.min, stats[k]);
                if (th.max !== null && nMax !== null)
                  out.push(<ReferenceLine key={`${k}-max`} y={nMax} stroke={c} strokeDasharray="2 4" strokeOpacity={0.4} />);
                if (th.min !== null && nMin !== null)
                  out.push(<ReferenceLine key={`${k}-min`} y={nMin} stroke={c} strokeDasharray="2 4" strokeOpacity={0.4} />);
                return out;
              })}

            {simActive &&
              visibleKeys.map((k) => {
                if ((scales[k] ?? 1) === 1) return null;
                return (
                  <Line
                    key={`sim-${k}`}
                    type="monotone"
                    dataKey={`${k}__sim`}
                    name={`${k} ×${(scales[k] ?? 1).toFixed(2)}`}
                    stroke={colorMap[k]}
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
              const color = colorMap[k];
              const i = seriesKeys.indexOf(k);
              const anomalyDot = (props: any) => {
                const { cx, cy, payload, index } = props;
                if (cx == null || cy == null || !payload || payload[`${k}__anom`] == null) return null;
                return (
                  <circle key={`anom-${k}-${index}`} cx={cx} cy={cy} r={3.4} fill={ANOMALY_COLOR} stroke="var(--bg)" strokeWidth={1} />
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
              <ReferenceLine x={focus.x} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" ifOverflow="hidden" />
            )}
            {focusPoint && focusPoint.y !== null && (
              <ReferenceDot x={focusPoint.x} y={focusPoint.y} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} ifOverflow="hidden" isFront />
            )}

            {drag && drag.a !== drag.b && (
              <ReferenceArea
                x1={Math.min(drag.a, drag.b)}
                x2={Math.max(drag.a, drag.b)}
                fill="var(--accent)"
                fillOpacity={0.12}
                stroke="var(--accent)"
                strokeOpacity={0.4}
              />
            )}
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
              {(scales[k] ?? 1) !== 1 && <span className="legend-sim mono">×{(scales[k] ?? 1).toFixed(2)}</span>}
            </button>
          );
        })}
        <span className="legend-item legend-anom">
          <span className="legend-swatch" style={{ background: ANOMALY_COLOR }} />
          <span>เกินเกณฑ์</span>
        </span>
        <span className="legend-note mono">ลากเลือกช่วง = ซูม · scroll = ซูมเวลา · shift+scroll = ซูมค่า</span>
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
