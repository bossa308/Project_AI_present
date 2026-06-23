// Core data model for DataPulse.
// The pipeline is: File -> RawDataset (parsers) -> ColumnMapping (inferMapping)
// -> AnalysisModel (analyze) -> AnomalyReport (countAnomalies).

/** A normalized cell value. Parsers keep everything as string|null; the
 *  analysis layer is responsible for turning strings into numbers/dates. */
export type CellValue = string | number | boolean | null;

/** A parsed file, normalized to a header + row objects keyed by column name. */
export interface RawDataset {
  fileName: string;
  columns: string[];
  rows: Record<string, CellValue>[];
  /** Non-fatal notes produced while parsing (delimiter used, rows skipped, …). */
  notes: string[];
}

export type ColumnRole = "time" | "value" | "ignore";

export interface ColumnInfo {
  name: string;
  role: ColumnRole;
  /** fraction of non-empty cells (in a sample) that parse as a finite number */
  numericRatio: number;
  /** fraction of non-empty cells (in a sample) that parse as a date */
  dateRatio: number;
  /** whether this value series is currently plotted on the chart */
  selected: boolean;
}

export interface ColumnMapping {
  /** name of the column used for the x-axis time; null => use row index */
  timeColumn: string | null;
  columns: ColumnInfo[];
}

export type XAxisType = "time" | "index";

/** One chart-ready row. `values` holds each plotted series keyed by column name. */
export interface ChartRow {
  /** numeric x: epoch ms when xType==='time', else the row index */
  x: number;
  /** display label for the x value (formatted time, or "1", "2", …) */
  xLabel: string;
  values: Record<string, number | null>;
}

export interface SeriesStats {
  key: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  /** population standard deviation — used to suggest thresholds */
  std: number;
}

export interface AnalysisModel {
  xType: XAxisType;
  /** full-resolution chart rows (downsampling happens at render time) */
  rows: ChartRow[];
  /** column names that are selected for plotting, in display order */
  seriesKeys: string[];
  /** stats for every selected series */
  stats: Record<string, SeriesStats>;
  /** epoch-ms bounds when xType==='time', else null */
  timeStart: number | null;
  timeEnd: number | null;
}

export interface Threshold {
  min: number | null;
  max: number | null;
}
export type Thresholds = Record<string, Threshold>;

/** per-series scale factor for what-if simulation (1 = unchanged) */
export type Scales = Record<string, number>;

export interface Anomaly {
  seriesKey: string;
  x: number;
  xLabel: string;
  /** the (possibly scaled) value that broke the threshold */
  value: number;
  kind: "over" | "under";
  bound: number;
}

export interface AnomalyReport {
  /** anomaly count per series key */
  perSeries: Record<string, number>;
  total: number;
  rows: Anomaly[];
}
