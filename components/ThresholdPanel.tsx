"use client";

import { useMemo } from "react";
import type { AnalysisModel, AnomalyReport, Thresholds } from "@/lib/types";
import { colorForIndex, fmtNumber } from "@/lib/analyze";
import { downloadText, toCsv } from "@/lib/export";

interface ThresholdPanelProps {
  model: AnalysisModel;
  thresholds: Thresholds;
  report: AnomalyReport;
  onSet: (key: string, field: "min" | "max", value: number | null) => void;
  onAuto: (key: string) => void;
  onClear: (key: string) => void;
  /** anomaly currently highlighted on the chart */
  focus: { x: number; key: string } | null;
  /** click a row to highlight + scroll the chart to that point */
  onFocus: (x: number, key: string) => void;
}

const MAX_TABLE_ROWS = 100;

export default function ThresholdPanel({
  model,
  thresholds,
  report,
  onSet,
  onAuto,
  onClear,
  focus,
  onFocus,
}: ThresholdPanelProps) {
  const { seriesKeys } = model;
  const colorOf = useMemo(() => {
    const map: Record<string, string> = {};
    seriesKeys.forEach((k, i) => (map[k] = colorForIndex(i)));
    return map;
  }, [seriesKeys]);

  const visibleRows = report.rows.slice(0, MAX_TABLE_ROWS);

  function downloadAnomalies() {
    const headers = ["time_index", "series", "value", "bound", "type"];
    const rows = report.rows.map((a) => [
      a.xLabel,
      a.seriesKey,
      a.value,
      a.bound,
      a.kind === "over" ? "> max" : "< min",
    ]);
    downloadText("datapulse-anomalies.csv", toCsv(headers, rows));
  }

  return (
    <section className="panel" aria-labelledby="th-title">
      <header className="panel-head">
        <h2 id="th-title" className="panel-title">
          เกณฑ์เตือน (Threshold)
        </h2>
        <div className="panel-head-right">
          <span className={`panel-meta mono${report.total > 0 ? " is-alert" : ""}`}>
            {report.total} จุดผิดปกติ
          </span>
          <button
            type="button"
            className="btn btn-mini btn-ghost"
            onClick={downloadAnomalies}
            disabled={report.total === 0}
          >
            CSV
          </button>
        </div>
      </header>

      <div className="th-list">
        {seriesKeys.map((k) => {
          const th = thresholds[k] ?? { min: null, max: null };
          const count = report.perSeries[k] ?? 0;
          return (
            <div className="th-row" key={k} style={{ ["--series" as string]: colorOf[k] }}>
              <div className="th-row-head">
                <span className="th-dot" aria-hidden="true" />
                <span className="th-name mono" title={k}>
                  {k}
                </span>
                <span className={`th-count mono${count > 0 ? " is-alert" : ""}`}>{count}</span>
              </div>
              <div className="th-inputs">
                <label className="th-input">
                  <span>min</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input mono"
                    value={th.min ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onSet(k, "min", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </label>
                <label className="th-input">
                  <span>max</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input mono"
                    value={th.max ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onSet(k, "max", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </label>
                <div className="th-btns">
                  <button type="button" className="btn btn-mini" onClick={() => onAuto(k)}>
                    อัตโนมัติ
                  </button>
                  <button type="button" className="btn btn-mini btn-ghost" onClick={() => onClear(k)}>
                    ล้าง
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="th-table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">รายการจุดที่หลุดเกณฑ์</caption>
          <thead>
            <tr>
              <th scope="col">เวลา / ลำดับ</th>
              <th scope="col">Series</th>
              <th scope="col" className="num">
                ค่า
              </th>
              <th scope="col" className="num">
                เกณฑ์
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="table-empty">
                  ไม่มีจุดที่หลุดเกณฑ์ 🎉
                </td>
              </tr>
            ) : (
              visibleRows.map((a, idx) => {
                const isSel = focus?.x === a.x && focus?.key === a.seriesKey;
                return (
                  <tr
                    key={`${a.seriesKey}-${a.x}-${idx}`}
                    className={`row-click${isSel ? " is-selected" : ""}`}
                    onClick={() => onFocus(a.x, a.seriesKey)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onFocus(a.x, a.seriesKey);
                      }
                    }}
                    title="คลิกเพื่อดูตำแหน่งบนกราฟ"
                  >
                    <td className="mono">{a.xLabel}</td>
                    <td>
                      <span className="tt-swatch" style={{ background: colorOf[a.seriesKey] }} />
                      <span className="mono">{a.seriesKey}</span>
                    </td>
                    <td className="num mono is-alert">{fmtNumber(a.value)}</td>
                    <td className="num mono">
                      {a.kind === "over" ? "> " : "< "}
                      {fmtNumber(a.bound)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {report.rows.length > MAX_TABLE_ROWS && (
          <p className="table-note mono">
            แสดง {MAX_TABLE_ROWS} จาก {report.rows.length.toLocaleString()} รายการ
          </p>
        )}
      </div>
    </section>
  );
}
