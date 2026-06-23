// Analysis layer for DataPulse.
//
// Responsibilities:
//  - inferMapping(): guess which column is time and which are numeric values
//  - analyze(): turn a RawDataset + mapping into chart-ready rows + stats
//  - suggestThreshold(): propose sensible min/max bounds for a series
//  - countAnomalies(): count & list points outside thresholds (with optional
//    what-if scaling)
//  - downsample(): thin the data for smooth rendering
//  - formatting helpers shared by the UI

import type {
  AnalysisModel,
  Anomaly,
  AnomalyReport,
  ChartRow,
  ColumnInfo,
  ColumnMapping,
  ColumnRole,
  RawDataset,
  Scales,
  SeriesStats,
  Threshold,
  Thresholds,
} from "./types";
import { toDate, toNumber } from "./parsers";

/** Soft, modern line colors that read well on a light surface. The first four
 *  (default selection) are well separated. Anomalies always render red. */
export const SERIES_COLORS = [
  "#6366f1", // indigo (primary)
  "#0fb9b1", // teal
  "#f59e0b", // amber
  "#a855f7", // violet
  "#3b82f6", // blue
  "#10b981", // green
  "#ec4899", // pink
  "#f97316", // orange
];

export const ANOMALY_COLOR = "#f43f5e";

export function colorForIndex(i: number): string {
  return SERIES_COLORS[i % SERIES_COLORS.length];
}

const TIME_NAME_RE =
  /(time|date|timestamp|datetime|epoch|^ts$|^dt$|วันที่|เวลา|วัน\s*เวลา)/i;

/** How many rows to sample when guessing column types (keeps inference fast). */
const SAMPLE_SIZE = 300;
/** Default number of value columns to plot on first load. */
const DEFAULT_SELECTED = 4;

/**
 * Guess the role of every column: one "time" column (or none) and the numeric
 * columns as "value". The result is fully user-editable in the UI.
 */
export function inferMapping(ds: RawDataset): ColumnMapping {
  const sample = ds.rows.slice(0, SAMPLE_SIZE);

  const columns: ColumnInfo[] = ds.columns.map((name) => {
    let nonEmpty = 0;
    let numeric = 0;
    let date = 0;
    for (const row of sample) {
      const v = row[name];
      if (v === null || v === undefined || String(v).trim() === "") continue;
      nonEmpty++;
      if (toNumber(v) !== null) numeric++;
      if (toDate(v) !== null) date++;
    }
    return {
      name,
      role: "ignore" as ColumnRole,
      numericRatio: nonEmpty ? numeric / nonEmpty : 0,
      dateRatio: nonEmpty ? date / nonEmpty : 0,
      selected: false,
    };
  });

  // Choose the best time column: a strong date ratio, or a date-ish name with
  // at least a weak date ratio. Name matches get a scoring bonus.
  let timeIdx = -1;
  let bestScore = 0;
  columns.forEach((c, i) => {
    const nameMatch = TIME_NAME_RE.test(c.name);
    const eligible = c.dateRatio >= 0.6 || (nameMatch && c.dateRatio >= 0.3);
    if (!eligible) return;
    const score = c.dateRatio + (nameMatch ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      timeIdx = i;
    }
  });

  const timeColumn = timeIdx >= 0 ? columns[timeIdx].name : null;
  if (timeIdx >= 0) columns[timeIdx].role = "time";

  // Value columns: numeric and not the chosen time column.
  let hasValue = false;
  columns.forEach((c, i) => {
    if (i === timeIdx) return;
    if (c.numericRatio >= 0.6) {
      c.role = "value";
      hasValue = true;
    }
  });

  // Fallback: if nothing looked numeric enough, accept the most-numeric columns.
  if (!hasValue) {
    columns
      .map((c, i) => ({ c, i }))
      .filter((x) => x.i !== timeIdx && x.c.numericRatio > 0)
      .sort((a, b) => b.c.numericRatio - a.c.numericRatio)
      .slice(0, DEFAULT_SELECTED)
      .forEach((x) => {
        x.c.role = "value";
      });
  }

  // Select the first few value columns for plotting by default.
  let selected = 0;
  for (const c of columns) {
    if (c.role === "value" && selected < DEFAULT_SELECTED) {
      c.selected = true;
      selected++;
    }
  }

  return { timeColumn, columns };
}

function computeStats(key: string, nums: number[]): SeriesStats {
  if (nums.length === 0) {
    return { key, count: 0, min: NaN, max: NaN, avg: NaN, std: NaN };
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
    sum += n;
  }
  const avg = sum / nums.length;
  let variance = 0;
  for (const n of nums) variance += (n - avg) * (n - avg);
  const std = Math.sqrt(variance / nums.length);
  return { key, count: nums.length, min, max, avg, std };
}

/**
 * Build the chart model. Rows with an unparseable time (when a time column is
 * used) are skipped; non-numeric cells in a value column become null and are
 * simply not plotted — neither one is allowed to crash the app.
 */
export function analyze(ds: RawDataset, mapping: ColumnMapping): AnalysisModel {
  const seriesKeys = mapping.columns
    .filter((c) => c.role === "value" && c.selected)
    .map((c) => c.name);

  const timeColumn = mapping.timeColumn;
  const useTime = !!timeColumn;

  const rows: ChartRow[] = [];
  for (let i = 0; i < ds.rows.length; i++) {
    const row = ds.rows[i];

    let x: number;
    let xLabel: string;
    if (useTime) {
      const t = toDate(row[timeColumn as string]);
      if (t === null) continue; // drop rows we can't place on the time axis
      x = t;
      xLabel = formatTime(t);
    } else {
      x = i;
      xLabel = String(i + 1);
    }

    const values: Record<string, number | null> = {};
    for (const k of seriesKeys) values[k] = toNumber(row[k]);
    rows.push({ x, xLabel, values });
  }

  if (useTime) rows.sort((a, b) => a.x - b.x);

  const stats: Record<string, SeriesStats> = {};
  for (const k of seriesKeys) {
    const nums: number[] = [];
    for (const r of rows) {
      const v = r.values[k];
      if (v !== null) nums.push(v);
    }
    stats[k] = computeStats(k, nums);
  }

  return {
    xType: useTime ? "time" : "index",
    rows,
    seriesKeys,
    stats,
    timeStart: useTime && rows.length ? rows[0].x : null,
    timeEnd: useTime && rows.length ? rows[rows.length - 1].x : null,
  };
}

/** Suggest min/max bounds at roughly avg ± 2σ (rounded to a tidy precision). */
export function suggestThreshold(stats: SeriesStats | undefined): Threshold {
  if (!stats || stats.count === 0 || !Number.isFinite(stats.std)) {
    return { min: null, max: null };
  }
  const k = 2;
  return {
    min: roundNice(stats.avg - k * stats.std),
    max: roundNice(stats.avg + k * stats.std),
  };
}

/**
 * Count and list every point that falls outside its series threshold.
 * `scales` (optional) multiplies each series before comparison — that is what
 * powers the what-if simulator.
 */
export function countAnomalies(
  model: AnalysisModel,
  thresholds: Thresholds,
  scales?: Scales
): AnomalyReport {
  const perSeries: Record<string, number> = {};
  const anomalies: Anomaly[] = [];

  for (const k of model.seriesKeys) {
    perSeries[k] = 0;
    const th = thresholds[k];
    if (!th || (th.min === null && th.max === null)) continue;
    const scale = scales?.[k] ?? 1;

    for (const row of model.rows) {
      const raw = row.values[k];
      if (raw === null) continue;
      const v = raw * scale;
      if (th.min !== null && v < th.min) {
        perSeries[k]++;
        anomalies.push({ seriesKey: k, x: row.x, xLabel: row.xLabel, value: v, kind: "under", bound: th.min });
      } else if (th.max !== null && v > th.max) {
        perSeries[k]++;
        anomalies.push({ seriesKey: k, x: row.x, xLabel: row.xLabel, value: v, kind: "over", bound: th.max });
      }
    }
  }

  anomalies.sort((a, b) => a.x - b.x);
  const total = Object.values(perSeries).reduce((sum, n) => sum + n, 0);
  return { perSeries, total, rows: anomalies };
}

/** Uniformly thin rows down to ~maxPoints, always keeping the last sample. */
export function downsample(rows: ChartRow[], maxPoints = 1000): ChartRow[] {
  if (rows.length <= maxPoints) return rows;
  const stride = Math.ceil(rows.length / maxPoints);
  const out: ChartRow[] = [];
  for (let i = 0; i < rows.length; i += stride) out.push(rows[i]);
  const last = rows[rows.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Compact 24h label like "06/01 13:45" used on the axis and in tables. */
export function formatTime(t: number): string {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return String(t);
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

/** Fuller timestamp for the KPI time-range card. */
export function formatTimeFull(t: number): string {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return String(t);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

/** Human-readable duration between two epoch-ms values. */
export function formatDuration(start: number, end: number): string {
  const ms = Math.max(0, end - start);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) return remMin ? `${hours} ชม. ${remMin} นาที` : `${hours} ชม.`;
  const days = Math.floor(hours / 24);
  const remHr = hours % 24;
  return remHr ? `${days} วัน ${remHr} ชม.` : `${days} วัน`;
}

/** Format a measurement with magnitude-aware precision. */
export function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/** Round to a tidy precision based on magnitude (used for threshold suggestions). */
export function roundNice(n: number): number {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
