# DataPulse — project context

> ไฟล์นี้ให้ Claude Code อ่านอัตโนมัติเมื่อเปิดโปรเจกต์ เพื่อต่องานจากเครื่องอื่นได้ทันที
> (handoff note — ภาษาไทยปนอังกฤษตามสะดวก)

DataPulse = เว็บแอป dashboard ที่ลากไฟล์ข้อมูลมิเตอร์/เซนเซอร์ (`.csv` / `.txt` / `.xlsx`)
เข้ามาแล้วได้กราฟ trend, สรุป min/max/avg, ตั้ง threshold ไฮไลต์จุดผิดปกติ และจำลอง
what-if (scale ค่า) — auto-detect คอลัมน์เวลา/ตัวเลขเอง ทำงาน **ฝั่งเบราว์เซอร์ล้วน**

## สถานะปัจจุบัน (อัปเดต 2026-06-23)

- เฟส 1 **เสร็จและรันได้จริง** — verify ผ่านเบราว์เซอร์แล้วทุกฟีเจอร์ (import, auto-detect,
  KPI, chart + anomaly, threshold + ตาราง, simulator, reset, robustness)
- `npm run build` ผ่าน, `tsc --noEmit` ผ่าน
- **ดีไซน์: เปลี่ยนจากธีมมืด "instrument readout" → ธีม "โมเดิร์นนุ่ม โทนสว่าง"** ตาม feedback
  ของผู้ใช้ (ไม่ชอบธีมมืด/glow/พื้นกริด) ตอนนี้เป็นพื้นสว่าง การ์ดมุมโค้ง เงานุ่ม accent
  indigo `#6366f1` เอา texture พื้นหลังออกหมด
- อยู่บน GitHub แล้ว: https://github.com/bossa308/Project_AI_present (branch `main`)
  — แก้แล้ว `git add -A && git commit && git push` ได้เลย

## วิธีรัน

```bash
cd datapulse
npm install
npm run dev        # http://localhost:3000
```

กด "โหลดข้อมูลตัวอย่าง" เพื่อเห็น dashboard เต็มโดยไม่ต้องมีไฟล์จริง

## สถาปัตยกรรม

Pipeline: `File → parseFile() → RawDataset → inferMapping() → ColumnMapping → analyze()
→ AnalysisModel → UI`; anomaly = `countAnomalies(model, thresholds, scales?)`

- **State ทั้งหมดอยู่ใน [app/page.tsx](app/page.tsx)** (React `useState`/`useMemo` ล้วน)
  ทุก component เป็น presentational รับ props ลงไป
- lib แยกหน้าที่ชัด: `parsers.ts` (อ่านไฟล์ + `toNumber`/`toDate`), `analyze.ts`
  (infer/analyze/threshold/anomaly/format + ชุดสี), `sample.ts` (ข้อมูลตัวอย่าง seeded),
  `types.ts` (โครงข้อมูลกลาง)

```
datapulse/
  app/        layout.tsx · page.tsx (orchestrator) · globals.css (ธีมทั้งหมด, CSS ล้วน)
  components/ FileDrop · ColumnMapper · KpiCards · TrendChart · ThresholdPanel · SimulatorPanel
  lib/        types.ts · parsers.ts · analyze.ts · sample.ts
```

## ข้อตกลง/ข้อจำกัด (อย่าทำผิด)

- **ห้ามใช้ localStorage/sessionStorage** — เก็บ state ด้วย React เท่านั้น
- Client-side ล้วน ไม่มี backend (เฟส 1) — แต่จัดโครงให้เพิ่ม data source อื่นง่าย
  (เพิ่ม adapter ที่คืน `RawDataset` ดู README หัวข้อ Google Sheet)
- UI ภาษาไทย, ฟอนต์ IBM Plex Sans Thai + IBM Plex Mono (โหลดผ่าน `<link>` ใน layout)
- CSS ล้วนใน `app/globals.css` (ไม่มี Tailwind/UI lib) — ธีมอยู่ที่ `:root` ที่เดียว
- เคารพ `prefers-reduced-motion`

## ดีไซน์ — แก้สีที่ไหน

- โทเคนสี/เงา/รัศมีมุม ทั้งหมดอยู่ที่ `:root` ใน [app/globals.css](app/globals.css)
  (accent ปัจจุบัน `--accent: #6366f1`)
- **สีเส้นกราฟ + สีจุดผิดปกติ เป็นค่าคงที่ JS** ใน [lib/analyze.ts](lib/analyze.ts):
  `SERIES_COLORS[]` และ `ANOMALY_COLOR` (ต้องแก้ที่นี่ ไม่ใช่ CSS เพราะ Recharts รับเป็น prop)
- class ของ component ไม่ผูกกับสีตรงๆ ใช้ CSS var — เปลี่ยนธีมแก้ที่ globals.css พอ

## Gotchas ที่เจอมาแล้ว (กันพลาดซ้ำ)

1. **Recharts `ComposedChart` รวม dataset ของลูกทุกตัวเข้าด้วยกัน** — ห้ามใช้ *function*
   `dataKey` (เช่น `r => r.values[k]`) เพราะจะถูกเรียกด้วย data ของ Scatter ที่ไม่มี field
   นั้น → crash. ใช้ **string dataKey** (`dataKey={k}`) ทั้งหมด; Scatter จุดผิดปกติให้ data
   ของตัวเอง (เฉพาะจุดที่หลุดเกณฑ์) — **อย่า render โหนดต่อทุกจุด** (เคยทำ ~4600 `<g>` เลยหน่วง)
2. อนิเมชันกราฟ "วาดตัวเอง" คุมด้วย flag `animate` (จริงแค่ ~1.6s หลังโหลดข้อมูลใหม่)
   เพื่อไม่ให้ re-animate ตอนเลื่อน slider; ปิดเมื่อ reduced-motion
3. ข้อมูลตัวอย่างเป็น **seeded PRNG** (`lib/sample.ts`) — ผลเหมือนเดิมทุกครั้ง มี anomaly
   ฝังไว้ให้ demo threshold/simulator เห็นผล
4. Chart โหลดแบบ `dynamic(..., { ssr:false })` ใน page.tsx (Recharts แตะ DOM)
5. (เกร็ด tooling) เครื่องมือ preview screenshot เคยค้างกับ SVG กราฟใหญ่ — ตรวจความถูกต้อง
   ด้วยการอ่าน DOM/computed-style ผ่าน `preview_eval` แทนได้

## งานต่อที่เป็นไปได้ (ถ้าผู้ใช้ขอ)

- ปรับ accent/รายละเอียดธีมเพิ่ม (เคยคุยถึงเปลี่ยนสี accent, ความโค้งมุม, ฟอนต์ตัวเลข)
- เพิ่ม data source จริง (Google Sheet adapter) — แพตเทิร์นอยู่ใน README.md
- เฟส 2: backend / persistence / หลายไฟล์พร้อมกัน
