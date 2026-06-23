# DataPulse

แดชบอร์ดแบบ **instrument readout** ที่อ่านไฟล์ข้อมูลจากมิเตอร์/เซนเซอร์
(`.csv` / `.txt` / `.xlsx`) แล้วแปลงเป็นกราฟ trend, สรุป min/max/avg, ตั้งเกณฑ์เตือน
(threshold) และจำลอง what-if ได้ทันที — รองรับไฟล์หน้าตาไหนก็ได้ด้วยการ
auto-detect คอลัมน์

เฟสแรกทำงาน **ฝั่งเบราว์เซอร์ล้วน** (parse ไฟล์ในเครื่อง ไม่มี backend, ไม่อัปโหลด
ข้อมูลออกนอกเบราว์เซอร์ และไม่มีการใช้ localStorage/sessionStorage)

---

## วิธีรัน

ต้องมี **Node.js 18.18+** (แนะนำ 20+)

```bash
npm install
npm run dev
```

เปิด <http://localhost:3000>

- กดปุ่ม **“โหลดข้อมูลตัวอย่าง”** เพื่อดูแดชบอร์ดเต็มทันที (KPI + กราฟ + threshold +
  simulator) โดยไม่ต้องมีไฟล์จริง
- หรือ **ลาก-วาง** ไฟล์ `.csv` / `.txt` / `.xlsx` ของคุณเข้ามา

สั่ง build สำหรับ production:

```bash
npm run build
npm start
```

> **ฟอนต์:** โหลด IBM Plex Sans Thai + IBM Plex Mono ผ่าน `<link>` ของ Google Fonts
> ถ้าใช้งานออฟไลน์ แอปยังรันได้ปกติ (ใช้ฟอนต์ระบบแทน)

---

## ฟีเจอร์ (เฟส 1)

| ส่วน | รายละเอียด |
| --- | --- |
| **นำเข้าไฟล์** | ลาก-วาง/เลือกไฟล์ + ปุ่มข้อมูลตัวอย่าง · เดา delimiter (comma/tab/semicolon/pipe) · อ่าน header · แปลงตัวเลข (รองรับ `1,234.5`, `1.234,56`, `%`) |
| **ColumnMapper** | auto-detect คอลัมน์เวลา/ค่าตัวเลข · แก้การจับคู่และเลือกค่าที่จะพล็อตได้ |
| **KpiCards** | จำนวนแถว · ช่วงเวลา · min/max/avg ของแต่ละค่า (มี count-up) |
| **TrendChart** | กราฟเส้นหลายเส้น · ไฮไลต์จุดเกิน threshold เป็นสีแดง · downsample เมื่อเกิน ~1000 จุด · เส้น “วาดตัวเอง” ซ้าย→ขวาตอนข้อมูลเข้า |
| **ThresholdPanel** | ตั้ง min/max ต่อ series (มีปุ่ม “อัตโนมัติ” = avg ± 2σ) · นับจุดผิดปกติเรียลไทม์ · ตารางสรุป (เวลา/ค่า/series) |
| **SimulatorPanel** | slider scale ค่าต่อ series (×0.5–×1.5) · วาดเส้นจำลองซ้อนเส้นจริง · อัปเดตจำนวนจุดที่ยังเกินเกณฑ์ |
| **รีเซ็ต** | ปุ่ม “เริ่มใหม่/ล้างข้อมูล” กลับหน้าเริ่ม |

### ความทนทาน

- ไฟล์ว่าง/มีแถวขยะ/หัวตารางซ้ำ/คอลัมน์ว่าง → ไม่ทำให้แอปพัง และแสดง error ที่บอกวิธีแก้
- auto-detect เวลาไม่ได้ → fallback เป็นลำดับแถว (index)
- ค่าที่ไม่ใช่ตัวเลขในคอลัมน์ตัวเลข → ข้าม ไม่นับ ไม่พัง

---

## โครงสร้างโปรเจกต์

```
datapulse/
├─ app/
│  ├─ layout.tsx        # root layout + ฟอนต์ + metadata
│  ├─ page.tsx          # orchestrator: state ทั้งหมด + ประกอบ component
│  └─ globals.css       # ธีม instrument readout (CSS ล้วน)
├─ components/
│  ├─ FileDrop.tsx      # ลาก-วาง / เลือกไฟล์ / ปุ่มตัวอย่าง
│  ├─ ColumnMapper.tsx  # เลือกคอลัมน์เวลา + ค่าที่จะพล็อต
│  ├─ KpiCards.tsx      # การ์ดสรุป KPI
│  ├─ TrendChart.tsx    # กราฟ Recharts + anomaly + เส้นจำลอง
│  ├─ ThresholdPanel.tsx# ตั้งเกณฑ์ + ตารางจุดผิดปกติ
│  └─ SimulatorPanel.tsx# what-if sliders
├─ lib/
│  ├─ types.ts          # โครงสร้างข้อมูลกลาง
│  ├─ parsers.ts        # parseFile + toNumber/toDate (CSV/TXT/XLSX)
│  ├─ analyze.ts        # inferMapping / analyze / threshold / anomaly / format
│  └─ sample.ts         # ชุดข้อมูลตัวอย่าง (seeded)
└─ README.md
```

### สถาปัตยกรรม (data pipeline)

```
File ──parseFile()──▶ RawDataset ──inferMapping()──▶ ColumnMapping
                                          │
                                          ▼
                               analyze() ──▶ AnalysisModel ──▶ UI
                                                   │
                                          countAnomalies() ──▶ AnomalyReport
```

ทุกคอมโพเนนต์เป็น **presentational** ล้วน — รับ props จาก `page.tsx` ซึ่งเก็บ state
ทั้งหมดด้วย React state (`useState`/`useMemo`) ไม่มี global store และไม่แตะ storage

---

## วิธีต่อยอด: เพิ่ม data source อื่น (เช่น Google Sheet)

ตัวแปลงไฟล์ทุกตัวรวมศูนย์ที่ `lib/parsers.ts` และทุกอย่างหลังจากนั้นทำงานบน
`RawDataset` (โครง `{ columns, rows, notes }`) เพียงอย่างเดียว — เพราะฉะนั้นการเพิ่ม
แหล่งข้อมูลใหม่ = แค่ทำให้มันคืน `RawDataset` ออกมา ส่วนที่เหลือ (mapping/analyze/
chart/threshold/simulator) ใช้ซ้ำได้ทันที

แนวทางเพิ่ม **Google Sheet**:

1. สร้าง “source adapter” ใหม่ เช่น `lib/sources/googleSheet.ts`:

   ```ts
   import type { RawDataset } from "@/lib/types";

   export async function loadGoogleSheet(sheetId: string): Promise<RawDataset> {
     // ดึงข้อมูล เช่นผ่าน gviz CSV endpoint หรือ Sheets API
     const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
     const res = await fetch(url);
     if (!res.ok) throw new Error("โหลด Google Sheet ไม่สำเร็จ");
     const csv = await res.text();
     // นำ csv ไปแปลงด้วย logic เดียวกับ parsers.ts (แยก parseDelimited ออกมา
     // เป็นฟังก์ชัน parseCsvText(text, fileName) เพื่อ reuse) แล้วคืน RawDataset
     // return parseCsvText(csv, `google-sheet:${sheetId}`);
   }
   ```

2. ใน UI เพิ่มทางเลือกแหล่งข้อมูล (เช่น แท็บ “ไฟล์ / Google Sheet / API”) แล้วเรียก
   adapter ที่เลือก จากนั้นส่งผลลัพธ์เข้า `loadDataset()` ตัวเดิมใน `page.tsx`

3. กรณีต้องมี backend (เช่น ซ่อน API key, polling แบบเรียลไทม์) ค่อยเพิ่ม route
   ใน `app/api/...` ที่คืน `RawDataset` — ฝั่ง client ไม่ต้องแก้

แหล่งข้อมูลอื่น (REST API, InfluxDB, MQTT bridge ฯลฯ) ใช้แพตเทิร์นเดียวกัน: เขียน
adapter ที่ map ออกมาเป็น `RawDataset` เท่านั้น

---

## เทคโนโลยี

- **Next.js 14** (App Router) + **TypeScript** + **React 18**
- **Recharts** — กราฟ
- **papaparse** — CSV/TXT (auto-detect delimiter)
- **SheetJS (xlsx)** — Excel
- CSS ล้วนใน `app/globals.css` (ไม่ใช้ Tailwind/UI library)
