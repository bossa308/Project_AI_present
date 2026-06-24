// Generates the bundled example datasets in public/examples/.
// Deterministic (seeded) so re-running produces identical files.
//   node scripts/generate-examples.mjs
//
// Both datasets embed clearly narratable "story" events for live demos — see
// EXAMPLES.md for the exact timestamps + what each one means.

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
const bump = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
const sig = (x) => 1 / (1 + Math.exp(-x));

function toCsv(columns, rows) {
  const head = columns.join(",");
  const body = rows.map((r) => columns.map((c) => r[c]).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

// --- Bangkok air quality: hourly, 7 days (Mon 2026-01-12 .. Sun 2026-01-18) ---
function bangkokAirQuality() {
  const rand = mulberry32(20260112);
  const columns = ["datetime", "PM2.5_ugm3", "PM10_ugm3", "O3_ppb", "NO2_ppb", "Temp_C", "Humidity_pct"];
  const rows = [];
  const start = new Date(2026, 0, 12, 0, 0, 0);

  for (let i = 0; i < 24 * 7; i++) {
    const t = new Date(start.getTime() + i * 3600 * 1000);
    const date = t.getDate();
    const h = t.getHours();
    const noise = (s) => (rand() - 0.5) * s;

    const morningRush = 18 * bump(h, 8, 1.4);
    const eveningRush = 48 * bump(h, 18.5, 1.7); // people leaving work -> traffic
    const inversion = h <= 5 ? 20 * (1 - h / 7) : 0; // pre-dawn trapped air
    const haze = date === 15 ? 58 : date === 16 ? 46 : date === 14 ? 18 : 0; // Thu–Fri episode

    let pm25 = 26 + inversion + morningRush + eveningRush + haze + noise(5);
    pm25 = Math.max(8, pm25);
    const pm10 = Math.max(pm25, pm25 * 1.6 + noise(8)); // computed from the *real* pm25

    const o3 = 10 + 42 * bump(h, 14, 3) + haze * 0.15 + noise(5);
    const no2 = 9 + morningRush * 0.7 + eveningRush * 0.45 + noise(4);
    const temp = 28 + 5 * Math.sin(((h - 9) / 24) * Math.PI * 2) + noise(1.2);
    const humidity = Math.min(99, Math.max(35, 92 - (temp - 23) * 3.4 + noise(6)));

    // --- story events (override pm2.5 only, so PM10 stays believable) ---
    if (date === 17 && h === 14) pm25 = 320; // SENSOR GLITCH: impossible spike
    if (date === 18 && h >= 3 && h <= 6) pm25 = 11.0; // STUCK SENSOR: flatlined

    rows.push({
      datetime: stamp(t),
      "PM2.5_ugm3": pm25.toFixed(1),
      PM10_ugm3: pm10.toFixed(1),
      O3_ppb: Math.max(2, o3).toFixed(1),
      NO2_ppb: Math.max(2, no2).toFixed(1),
      Temp_C: temp.toFixed(1),
      Humidity_pct: humidity.toFixed(0),
    });
  }
  return toCsv(columns, rows);
}

// --- Power meter: 15-min, 3 days (Mon 2026-03-02 .. Wed 2026-03-04) ---
function powerMeter() {
  const rand = mulberry32(2026030200);
  const columns = ["timestamp", "Voltage_V", "Current_A", "Power_kW", "PowerFactor", "Frequency_Hz", "Energy_kWh"];
  const rows = [];
  const start = new Date(2026, 2, 2, 0, 0, 0);
  let energy = 1250.0;

  for (let i = 0; i < 4 * 24 * 3; i++) {
    const t = new Date(start.getTime() + i * 15 * 60 * 1000);
    const date = t.getDate();
    const hh = t.getHours();
    const mm = t.getMinutes();
    const h = hh + mm / 60;
    const noise = (s) => (rand() - 0.5) * s;

    const business = 30 * (sig((h - 7.5) / 0.8) - sig((h - 17.5) / 0.8)); // 08:00–17:00 plateau
    const evening = 16 * bump(h, 19.5, 1.3); // people get home, AC/lights
    let currentA = 4 + business + evening + noise(1.6);

    let voltage = 231 - business * 0.13 + noise(2);
    let freq = 50 + noise(0.05);

    // --- story events ---
    if (date === 2 && hh === 8 && mm === 0) currentA += 45; // big machine inrush
    if (date === 2 && hh === 19 && mm === 0) voltage = 212; // voltage sag at peak
    if (date === 3 && hh === 10 && mm === 30) currentA = 210; // METER GLITCH
    const outage = date === 4 && hh === 2 && (mm === 0 || mm === 15);
    if (outage) {
      currentA = 0.15;
      voltage = 8;
      freq = 49.2;
    }

    const pf = Math.min(0.99, Math.max(0.8, 0.97 - business * 0.003 - rand() * 0.04));
    const powerKw = (voltage * Math.max(0, currentA) * pf) / 1000;
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
await writeFile(join(OUT_DIR, "bangkok-air-quality.csv"), bangkokAirQuality(), "utf8");
await writeFile(join(OUT_DIR, "power-meter.csv"), powerMeter(), "utf8");
console.log("wrote public/examples/bangkok-air-quality.csv + power-meter.csv");
