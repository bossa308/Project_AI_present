// Synthetic sample dataset so the dashboard is fully usable without a real file.
//
// The data is generated with a seeded PRNG and a fixed start time so every
// "โหลดข้อมูลตัวอย่าง" produces the same readout (nice for demos/screenshots).
// It mimics a 2-day plant log sampled every 5 minutes, with a few deliberate
// excursions so thresholds, anomaly highlighting and the simulator all light up.

import type { CellValue, RawDataset } from "./types";

/** mulberry32 — tiny deterministic PRNG (returns 0..1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local "YYYY-MM-DD HH:mm:ss" timestamp — a very common meter export format. */
function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function getSampleDataset(): RawDataset {
  const rand = mulberry32(20260601);
  const columns = [
    "Timestamp",
    "Temperature_C",
    "Pressure_bar",
    "Flow_Lpm",
    "Vibration_mm_s",
  ];

  const rows: Record<string, CellValue>[] = [];
  const start = new Date(2026, 5, 1, 6, 0, 0); // 2026-06-01 06:00:00 (local)
  const stepMs = 5 * 60 * 1000; // 5 minutes
  const total = 576; // 2 days

  // pre-pick a few excursion indices so the demo always has visible anomalies
  const tempSpikes = new Set([88, 89, 90, 311, 312]);
  const flowDrops = new Set([150, 151, 152, 470]);
  const vibSpikes = new Set([60, 205, 206, 400, 401, 402]);

  for (let i = 0; i < total; i++) {
    const t = new Date(start.getTime() + i * stepMs);
    const hour = t.getHours() + t.getMinutes() / 60;
    const diurnal = Math.sin(((hour - 6) / 24) * Math.PI * 2); // -1..1 over a day

    // Temperature: ~62°C with a daily swing + noise, plus the odd spike.
    let temp = 62 + diurnal * 6 + (rand() - 0.5) * 2.5;
    if (tempSpikes.has(i)) temp += 28 + rand() * 6;

    // Pressure: tight around 4.2 bar.
    const pressure = 4.2 + diurnal * 0.15 + (rand() - 0.5) * 0.25;

    // Flow: ~120 L/min, with occasional sharp drops (valve events).
    let flow = 120 + diurnal * 8 + (rand() - 0.5) * 10;
    if (flowDrops.has(i)) flow = 38 + rand() * 12;

    // Vibration: low ~2.0 mm/s with intermittent bursts.
    let vib = 2.0 + Math.abs(diurnal) * 0.4 + (rand() - 0.5) * 0.6;
    if (vibSpikes.has(i)) vib += 4 + rand() * 2;

    rows.push({
      Timestamp: stamp(t),
      Temperature_C: temp.toFixed(2),
      Pressure_bar: pressure.toFixed(3),
      Flow_Lpm: flow.toFixed(1),
      // a couple of deliberately blank cells to prove robustness
      Vibration_mm_s: i === 10 || i === 11 ? "" : Math.max(0, vib).toFixed(2),
    });
  }

  return {
    fileName: "ตัวอย่าง — plant_log.csv",
    columns,
    rows,
    notes: ["ชุดข้อมูลตัวอย่าง: บันทึกโรงงานจำลอง 2 วัน (เก็บค่าทุก 5 นาที)"],
  };
}
