"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { AnalysisModel, AnomalyReport, Thresholds } from "@/lib/types";
import { fmtNumber, formatTimeFull, formatDuration } from "@/lib/analyze";
import { svgToPngDataUrl } from "@/lib/export";

interface CommissioningReportProps {
  model: AnalysisModel;
  report: AnomalyReport;
  thresholds: Thresholds;
  fileName?: string;
}

interface Meta {
  site: string;
  equipment: string;
  technician: string;
  jobNo: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function nowStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}`;
}

const MAX_REPORT_ANOMALIES = 60;

export default function CommissioningReport({
  model,
  report,
  thresholds,
  fileName,
}: CommissioningReportProps) {
  const { seriesKeys, stats, xType, timeStart, timeEnd } = model;
  const [meta, setMeta] = useState<Meta>({ site: "", equipment: "", technician: "", jobNo: "" });
  const [chartImg, setChartImg] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  async function makeReport() {
    let img: string | null = null;
    const svg = document.querySelector(".chart-wrap .recharts-surface");
    if (svg) {
      try {
        img = await svgToPngDataUrl(svg as unknown as SVGSVGElement, "#ffffff", 2);
      } catch {
        img = null;
      }
    }
    setChartImg(img);
    setGeneratedAt(nowStamp());
    setPrinting(true);
  }

  // once the report (incl. chart image) is in the DOM, open the print dialog
  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 80);
    return () => window.clearTimeout(id);
  }, [printing]);

  const set = (k: keyof Meta) => (e: ChangeEvent<HTMLInputElement>) =>
    setMeta((m) => ({ ...m, [k]: e.target.value }));

  return (
    <section className="panel report-bar" aria-labelledby="report-title">
      <header className="panel-head">
        <h2 id="report-title" className="panel-title">
          รายงานสรุป (PDF)
        </h2>
        <button type="button" className="btn btn-accent btn-mini" onClick={makeReport}>
          ออกรายงาน PDF
        </button>
      </header>

      <div className="report-fields">
        <label className="report-field">
          <span>ไซต์/สถานที่</span>
          <input className="input" value={meta.site} onChange={set("site")} placeholder="—" />
        </label>
        <label className="report-field">
          <span>อุปกรณ์</span>
          <input className="input" value={meta.equipment} onChange={set("equipment")} placeholder="—" />
        </label>
        <label className="report-field">
          <span>ผู้บันทึก</span>
          <input className="input" value={meta.technician} onChange={set("technician")} placeholder="—" />
        </label>
        <label className="report-field">
          <span>หมายเลขงาน</span>
          <input className="input" value={meta.jobNo} onChange={set("jobNo")} placeholder="—" />
        </label>
      </div>
      <p className="report-hint">
        กดปุ่มแล้วเลือก “บันทึกเป็น PDF” ในกล่องพิมพ์ — ได้รายงานสรุป (กราฟ + ค่าสถิติ + จุดที่หลุดเกณฑ์)
        · ประมวลผลในเบราว์เซอร์ ไม่มีการอัปโหลด
      </p>

      {/* ---- printable report (hidden on screen, shown only when printing) ---- */}
      <div className="print-report" aria-hidden="true">
        <div className="pr-head">
          <div>
            <div className="pr-title">
              Data<span style={{ color: "#4f46e5" }}>Pulse</span> — รายงานสรุปข้อมูล
            </div>
            <div className="pr-sub">Data summary report</div>
          </div>
          <div className="pr-stamp">{generatedAt}</div>
        </div>

        <table className="pr-meta">
          <tbody>
            <tr>
              <th>ไซต์/สถานที่</th>
              <td>{meta.site || "—"}</td>
              <th>อุปกรณ์</th>
              <td>{meta.equipment || "—"}</td>
            </tr>
            <tr>
              <th>ผู้บันทึก</th>
              <td>{meta.technician || "—"}</td>
              <th>หมายเลขงาน</th>
              <td>{meta.jobNo || "—"}</td>
            </tr>
            <tr>
              <th>ไฟล์ข้อมูล</th>
              <td colSpan={3}>{fileName || "—"}</td>
            </tr>
            <tr>
              <th>ช่วงข้อมูล</th>
              <td colSpan={3}>
                {xType === "time" && timeStart !== null && timeEnd !== null
                  ? `${formatTimeFull(timeStart)} → ${formatTimeFull(timeEnd)} (${formatDuration(
                      timeStart,
                      timeEnd
                    )}, ${model.rows.length.toLocaleString()} แถว)`
                  : `อิงลำดับแถว · ${model.rows.length.toLocaleString()} แถว`}
              </td>
            </tr>
          </tbody>
        </table>

        {chartImg && <img className="pr-chart" src={chartImg} alt="แนวโน้มตามเวลา" />}

        <table className="pr-table">
          <thead>
            <tr>
              <th>Series</th>
              <th className="num">min</th>
              <th className="num">max</th>
              <th className="num">avg</th>
              <th className="num">เกณฑ์ min</th>
              <th className="num">เกณฑ์ max</th>
              <th className="num">จุดเกิน</th>
            </tr>
          </thead>
          <tbody>
            {seriesKeys.map((k) => {
              const s = stats[k];
              const t = thresholds[k];
              const cnt = report.perSeries[k] ?? 0;
              return (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{s ? fmtNumber(s.min) : "—"}</td>
                  <td className="num">{s ? fmtNumber(s.max) : "—"}</td>
                  <td className="num">{s ? fmtNumber(s.avg) : "—"}</td>
                  <td className="num">{t?.min != null ? fmtNumber(t.min) : "—"}</td>
                  <td className="num">{t?.max != null ? fmtNumber(t.max) : "—"}</td>
                  <td className="num">{cnt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {report.rows.length > 0 && (
          <>
            <div className="pr-section">จุดที่หลุดเกณฑ์ ({report.total.toLocaleString()})</div>
            <table className="pr-table">
              <thead>
                <tr>
                  <th>เวลา / ลำดับ</th>
                  <th>Series</th>
                  <th className="num">ค่า</th>
                  <th className="num">เกณฑ์</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.slice(0, MAX_REPORT_ANOMALIES).map((a, i) => (
                  <tr key={`${a.seriesKey}-${a.x}-${i}`}>
                    <td>{a.xLabel}</td>
                    <td>{a.seriesKey}</td>
                    <td className="num">{fmtNumber(a.value)}</td>
                    <td className="num">
                      {a.kind === "over" ? "> " : "< "}
                      {fmtNumber(a.bound)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.rows.length > MAX_REPORT_ANOMALIES && (
              <div className="pr-note">
                แสดง {MAX_REPORT_ANOMALIES} จาก {report.rows.length.toLocaleString()} รายการ
              </div>
            )}
          </>
        )}

        <div className="pr-foot">
          สร้างโดย DataPulse · ประมวลผลในเบราว์เซอร์ ไม่มีการอัปโหลดข้อมูล · {generatedAt}
        </div>
      </div>
    </section>
  );
}
