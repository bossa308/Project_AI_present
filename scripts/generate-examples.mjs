// Generates the bundled example datasets in public/examples/.
// Deterministic (seeded) so re-running produces identical files.
//   node scripts/generate-examples.mjs
//
// The events below are tuned to match the demo narration exactly:
//   - PM2.5 spikes to 168 on the afternoon of June 2 (real haze episode)
//   - Temperature shows a single-point glitch to 46 C (sensor error)
//   - Current jumps 13 -> 56 A once (motor start / large load)
//   - Voltage sags 230 -> 196 V continuously for 1 hour (brownout)
// See EXAMPLES.md for the presenter guide.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "examples");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));

function toCsv(columns, rows) {
  const head = columns.join(",");
  const body = rows.map((r) => columns.map((c) => r[c]).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

// --- Bangkok air quality: hourly, 7 days (2026-06-01 .. 2026-06-07) ---------
function bangkokAirQuality() {
  const rand = mulberry32(20260601);
  const columns = ["datetime", "PM2.5_ugm3", "PM10_ugm3", "Temp_C", "Humidity_pct"];
  const rows = [];
  const start = new Date(2026, 5, 1, 0, 0, 0); // June 1
  // afternoon haze episode on June 2: PM2.5 by hour
  const jun2pm25 = { 11: 70, 12: 96, 13: 132, 14: 168, 15: 124, 16: 84 };

  for (let i = 0; i < 24 * 7; i++) {
    const t = new Date(start.getTime() + i * 3600 * 1000);
    const date = t.getDate();
    const h = t.getHours();
    const noise = (s) => (rand() - 0.5) * s;

    // PM2.5: normal ~40, mild evening lift
    let pm25 = 40 + 6 * bump(h, 19, 4) + 4 * Math.sin(((h - 6) / 24) * Math.PI * 2) + noise(6);
    if (date === 2 && jun2pm25[h] !== undefined) pm25 = jun2pm25[h]; // real haze peak
    pm25 = Math.max(10, pm25);
    let pm10 = Math.max(pm25, pm25 * (1.45 + rand() * 0.2) + noise(6)); // PM10 tracks PM2.5

    // Temperature: tight ~26–34 so the 46 C glitch stands out clearly.
    let temp = 30 + 3 * Math.sin(((h - 9) / 24) * Math.PI * 2) + noise(1.0);
    let humidity = Math.min(99, Math.max(35, 90 - (temp - 24) * 3.2 + noise(5)));

    if (date === 4 && h === 15) temp = 46.0; // SENSOR GLITCH (single point)

    // RAIN washout (June 5, 13:00–16:00): PM drops sharply while humidity jumps
    // and temperature falls — the correlated channels confirm real rain, not a fault.
    if (date === 5 && h >= 13 && h <= 16) {
      pm25 = 12 + noise(2);
      pm10 = 18 + noise(3);
      humidity = Math.min(99, 97 + noise(2));
      temp = 25 + noise(1);
    }

    rows.push({
      datetime: stamp(t),
      "PM2.5_ugm3": pm25.toFixed(1),
      PM10_ugm3: pm10.toFixed(1),
      Temp_C: temp.toFixed(1),
      Humidity_pct: humidity.toFixed(0),
    });
  }
  return toCsv(columns, rows);
}

// --- Electricity meter: 15-min, 2 days (2026-06-02 .. 2026-06-03) -----------
function electricityMeter() {
  const rand = mulberry32(20260602);
  const columns = ["timestamp", "Voltage_V", "Current_A", "Power_kW", "PowerFactor", "Frequency_Hz", "Energy_kWh"];
  const rows = [];
  const start = new Date(2026, 5, 2, 0, 0, 0); // June 2
  let energy = 4820.0;

  for (let i = 0; i < 4 * 24 * 2; i++) {
    const t = new Date(start.getTime() + i * 15 * 60 * 1000);
    const date = t.getDate();
    const hh = t.getHours();
    const mm = t.getMinutes();
    const noise = (s) => (rand() - 0.5) * s;

    let currentA = 13 + 1.5 * Math.sin(((hh - 6) / 24) * Math.PI * 2) + noise(1.6);
    let voltage = 230 + noise(2);
    let freq = 50 + noise(0.05);
    let pf = Math.min(0.99, Math.max(0.85, 0.96 - rand() * 0.04));

    // --- story events ---
    if (date === 2 && hh === 9 && mm === 0) currentA = 56; // motor start (instant inrush)
    // brownout: ~196 V continuous for one hour (June 2, 19:00–19:45)
    if (date === 2 && hh === 19 && mm < 60) voltage = 196 + noise(1.2);
    // big load runs (June 3, 13:00–13:45): correlated change — current up, voltage
    // sags under load, power factor drops (inductive). All channels move together.
    if (date === 3 && hh === 13 && mm < 60) {
      currentA = 38 + noise(2);
      voltage = 224 + noise(1.5);
      pf = 0.84 + noise(0.02);
    }

    currentA = Math.max(1, currentA);
    const powerKw = (voltage * currentA * pf) / 1000;
    energy += powerKw * 0.25;

    rows.push({
      timestamp: stamp(t),
      Voltage_V: voltage.toFixed(1),
      Current_A: currentA.toFixed(2),
      Power_kW: powerKw.toFixed(3),
      PowerFactor: pf.toFixed(3),
      Frequency_Hz: freq.toFixed(3),
      Energy_kWh: energy.toFixed(2),
    });
  }
  return toCsv(columns, rows);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, "bangkok_air_quality.csv"), bangkokAirQuality(), "utf8");
await writeFile(join(OUT_DIR, "electricity_meter.csv"), electricityMeter(), "utf8");
console.log("wrote public/examples/bangkok_air_quality.csv + electricity_meter.csv");
