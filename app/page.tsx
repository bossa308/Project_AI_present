"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import FileDrop from "@/components/FileDrop";
import ColumnMapper from "@/components/ColumnMapper";
import KpiCards from "@/components/KpiCards";
import ThresholdPanel from "@/components/ThresholdPanel";
import SimulatorPanel from "@/components/SimulatorPanel";
import CommissioningReport from "@/components/CommissioningReport";

import { ParseError, parseFile } from "@/lib/parsers";
import {
  analyze,
  countAnomalies,
  inferMapping,
  suggestThreshold,
} from "@/lib/analyze";
import { getSampleDataset } from "@/lib/sample";
import type {
  ColumnMapping,
  RawDataset,
  Scales,
  Thresholds,
} from "@/lib/types";

// Recharts touches the DOM on mount — load the chart client-only to avoid SSR
// width/height warnings and keep the first paint instant.
const TrendChart = dynamic(() => import("@/components/TrendChart"), {
  ssr: false,
  loading: () => (
    <div className="chart-wrap chart-empty">
      <span className="spinner" />
    </div>
  ),
});

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

export default function Page() {
  const [dataset, setDataset] = useState<RawDataset | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds>({});
  const [scales, setScales] = useState<Scales>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawId, setDrawId] = useState(0);
  // anomaly the user clicked in the table → highlighted/scrolled-to on the chart
  const [focus, setFocus] = useState<{ x: number; key: string } | null>(null);

  const reducedMotion = useReducedMotion();

  const model = useMemo(
    () => (dataset && mapping ? analyze(dataset, mapping) : null),
    [dataset, mapping]
  );

  const baseReport = useMemo(
    () => (model ? countAnomalies(model, thresholds) : null),
    [model, thresholds]
  );
  const simReport = useMemo(
    () => (model ? countAnomalies(model, thresholds, scales) : null),
    [model, thresholds, scales]
  );

  /** Load a freshly-parsed dataset: infer mapping + seed thresholds/scales. */
  function loadDataset(ds: RawDataset) {
    const m = inferMapping(ds);
    const mdl = analyze(ds, m);
    const th: Thresholds = {};
    const sc: Scales = {};
    for (const k of mdl.seriesKeys) {
      th[k] = suggestThreshold(mdl.stats[k]);
      sc[k] = 1;
    }
    setDataset(ds);
    setMapping(m);
    setThresholds(th);
    setScales(sc);
    setError(null);
    setFocus(null);
    setDrawId((d) => d + 1);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const ds = await parseFile(file);
      loadDataset(ds);
    } catch (e) {
      setError(
        e instanceof ParseError
          ? e.message
          : "เกิดข้อผิดพลาดที่ไม่คาดคิดขณะอ่านไฟล์ — ลองไฟล์อื่นหรือบันทึกเป็น CSV"
      );
      setDataset(null);
      setMapping(null);
    } finally {
      setBusy(false);
    }
  }

  function handleSample() {
    setBusy(true);
    setError(null);
    try {
      loadDataset(getSampleDataset());
    } finally {
      setBusy(false);
    }
  }

  // Bundled real-world example CSVs (served from /public/examples). They flow
  // through the exact same parseFile pipeline as a user-dropped file.
  const EXAMPLE_FILES: Record<string, { file: string; name: string }> = {
    air: { file: "/examples/bangkok_air_quality.csv", name: "bangkok_air_quality.csv" },
    power: { file: "/examples/electricity_meter.csv", name: "electricity_meter.csv" },
  };

  function loadSample(id: string) {
    if (id === "plant") {
      handleSample();
      return;
    }
    const ex = EXAMPLE_FILES[id];
    if (!ex) return;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(ex.file);
        if (!res.ok) throw new ParseError("โหลดไฟล์ตัวอย่างไม่สำเร็จ — ลองรีเฟรชหน้า");
        const blob = await res.blob();
        const file = new File([blob], ex.name, { type: "text/csv" });
        const ds = await parseFile(file);
        loadDataset(ds);
      } catch (e) {
        setError(
          e instanceof ParseError ? e.message : "โหลดชุดข้อมูลตัวอย่างไม่สำเร็จ"
        );
      } finally {
        setBusy(false);
      }
    })();
  }

  /** Apply an edited column mapping, seeding defaults for any new series. */
  function applyMapping(next: ColumnMapping) {
    if (!dataset) return;
    const mdl = analyze(dataset, next);
    setThresholds((prev) => {
      const out = { ...prev };
      for (const k of mdl.seriesKeys) {
        if (!(k in out)) out[k] = suggestThreshold(mdl.stats[k]);
      }
      return out;
    });
    setScales((prev) => {
      const out = { ...prev };
      for (const k of mdl.seriesKeys) if (!(k in out)) out[k] = 1;
      return out;
    });
    setMapping(next);
  }

  function setThreshold(key: string, field: "min" | "max", value: number | null) {
    setThresholds((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { min: null, max: null }), [field]: value },
    }));
  }
  function autoThreshold(key: string) {
    if (!model) return;
    setThresholds((prev) => ({ ...prev, [key]: suggestThreshold(model.stats[key]) }));
  }
  function clearThreshold(key: string) {
    setThresholds((prev) => ({ ...prev, [key]: { min: null, max: null } }));
  }

  function setScale(key: string, value: number) {
    setScales((prev) => ({ ...prev, [key]: value }));
  }
  function resetScales() {
    if (!model) return;
    const out: Scales = {};
    for (const k of model.seriesKeys) out[k] = 1;
    setScales(out);
  }

  function reset() {
    setDataset(null);
    setMapping(null);
    setThresholds({});
    setScales({});
    setError(null);
    setBusy(false);
    setFocus(null);
  }

  const hasData = !!model && !!mapping;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <PulseGlyph />
          </span>
          <div className="brand-text">
            <h1 className="brand-name">
              Data<span className="brand-accent">Pulse</span>
            </h1>
            <p className="brand-tag">แดชบอร์ดอ่านค่ามิเตอร์ &amp; เซนเซอร์ · instrument readout</p>
          </div>
        </div>
        {hasData && (
          <button type="button" className="btn btn-ghost" onClick={reset}>
            เริ่มใหม่
          </button>
        )}
      </header>

      <main className="app-main">
        <FileDrop
          onFile={handleFile}
          onSample={loadSample}
          onReset={reset}
          busy={busy}
          hasData={hasData}
          fileName={dataset?.fileName}
        />

        {error && (
          <div className="banner banner-error" role="alert">
            <strong>อ่านไฟล์ไม่สำเร็จ</strong>
            <span>{error}</span>
          </div>
        )}

        {dataset && dataset.notes.length > 0 && (
          <div className="banner banner-info" role="status">
            {dataset.notes.map((n, i) => (
              <span key={i} className="note-chip">
                {n}
              </span>
            ))}
          </div>
        )}

        {model && mapping && baseReport && simReport ? (
          <>
            <KpiCards model={model} reducedMotion={reducedMotion} drawId={drawId} />

            <section className="board">
              <div className="board-main">
                <CommissioningReport
                  model={model}
                  report={baseReport}
                  thresholds={thresholds}
                  fileName={dataset?.fileName}
                />

                <section className="panel chart-panel" aria-labelledby="chart-title">
                  <header className="panel-head">
                    <h2 id="chart-title" className="panel-title">
                      แนวโน้มตามเวลา
                    </h2>
                    <span className="panel-meta mono">
                      {model.xType === "time" ? "แกน: เวลา" : "แกน: ลำดับแถว"}
                    </span>
                  </header>
                  <TrendChart
                    model={model}
                    thresholds={thresholds}
                    scales={scales}
                    drawId={drawId}
                    reducedMotion={reducedMotion}
                    focus={focus}
                  />
                </section>

                <ThresholdPanel
                  model={model}
                  thresholds={thresholds}
                  report={baseReport}
                  onSet={setThreshold}
                  onAuto={autoThreshold}
                  onClear={clearThreshold}
                  focus={focus}
                  onFocus={(x, key) => setFocus({ x, key })}
                />
              </div>

              <aside className="board-side">
                <ColumnMapper mapping={mapping} onChange={applyMapping} />
                <SimulatorPanel
                  model={model}
                  scales={scales}
                  baseReport={baseReport}
                  simReport={simReport}
                  onScale={setScale}
                  onResetScales={resetScales}
                />
              </aside>
            </section>
          </>
        ) : (
          !error && (
            <div className="empty-state">
              <p>
                ยังไม่มีข้อมูล — ลากไฟล์ <span className="mono">.csv / .txt / .xlsx</span> เข้ามา
                หรือกด <strong>โหลดข้อมูลตัวอย่าง</strong> เพื่อดูแดชบอร์ดทันที
              </p>
            </div>
          )
        )}
      </main>

      <footer className="app-footer">
        <span className="mono">DataPulse · client-side · ไม่มีการอัปโหลดข้อมูลออกนอกเบราว์เซอร์</span>
      </footer>
    </div>
  );
}

function PulseGlyph() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline
        points="2,16 9,16 12,8 16,24 20,12 23,16 30,16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
