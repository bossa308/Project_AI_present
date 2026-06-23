// File parsing for DataPulse.
//
// parseFile() dispatches on extension and always returns a uniform RawDataset
// (columns + string|null cells). Number/date interpretation is deliberately
// left to the analysis layer so the same logic applies to every source.
//
// This file is also the single home for the two "is this a number / a date?"
// helpers (toNumber / toDate) that the rest of the app relies on.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { CellValue, RawDataset } from "./types";

/** Thrown for problems we can explain to the user (empty file, bad sheet, …). */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Best-effort conversion of a raw cell to a finite number, else null.
 * Handles surrounding whitespace, thousands separators ("1,234.5"),
 * European decimals ("1,5" / "1.234,56") and a trailing "%".
 */
export function toNumber(value: CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return null;

  let s = String(value).trim();
  if (s === "") return null;

  // drop grouping spaces (regular, non-breaking, narrow no-break)
  s = s.replace(/[\s  ]/g, "");

  const isPercent = s.endsWith("%");
  if (isPercent) s = s.slice(0, -1);

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // whichever separator comes last is the decimal separator
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // 1.234,56 -> 1234.56
    } else {
      s = s.replace(/,/g, ""); // 1,234.56 -> 1234.56
    }
  } else if (hasComma) {
    // only a comma: thousands group (1,234) vs decimal comma (1,5)
    if (/^-?\d{1,3}(,\d{3})+$/.test(s)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-effort conversion of a raw cell to an epoch-ms timestamp, else null.
 * Plain numeric strings are intentionally NOT treated as dates so that a
 * column like "reading=123" is never mistaken for a timestamp.
 */
export function toDate(value: CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return null; // bare numbers are not dates
  if (typeof value === "boolean") return null;

  const s = String(value).trim();
  if (s === "") return null;

  // a pure number ("123", "12.5") is a measurement, not a date
  if (/^-?\d+(\.\d+)?$/.test(s)) return null;

  const direct = Date.parse(s);
  if (Number.isFinite(direct)) return direct;

  // fall back to D/M/Y or D-M-Y (with optional time tail)
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](.+))?$/);
  if (m) {
    const day = m[1];
    const month = m[2];
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const tail = m[4] ? `T${m[4]}` : "";
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}${tail}`;
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Make header names safe & unique (blanks become column_N, dupes get _2, _3…). */
function dedupeHeaders(headers: unknown[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, i) => {
    let name = (raw === null || raw === undefined ? "" : String(raw)).trim();
    if (name === "") name = `column_${i + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

function cellToString(raw: unknown): CellValue {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? raw.toISOString() : null;
  }
  const s = String(raw).trim();
  return s === "" ? null : s;
}

function buildRows(
  bodyRows: unknown[][],
  columns: string[]
): Record<string, CellValue>[] {
  return bodyRows.map((arr) => {
    const obj: Record<string, CellValue> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = cellToString(arr[i]);
    }
    return obj;
  });
}

/** Keep only rows that have at least one non-blank cell. */
function isMeaningfulRow(arr: unknown): arr is unknown[] {
  return (
    Array.isArray(arr) &&
    arr.some((c) => c !== null && c !== undefined && String(c).trim() !== "")
  );
}

async function parseDelimited(file: File): Promise<RawDataset> {
  const text = await file.text();
  if (!text.trim()) {
    throw new ParseError(
      "ไฟล์ว่างเปล่า — ตรวจสอบว่าไฟล์มีข้อมูลและบันทึกเป็นข้อความ (CSV/TXT)"
    );
  }

  // header:false + manual assembly lets us control ragged rows & dedupe headers.
  // delimiter is auto-detected by papaparse (comma / tab / semicolon / pipe).
  const result = Papa.parse<unknown[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const rows = (result.data as unknown[]).filter(isMeaningfulRow) as unknown[][];
  if (rows.length === 0) {
    throw new ParseError("ไม่พบข้อมูลในไฟล์ (มีแต่บรรทัดว่าง)");
  }
  if (rows.length === 1) {
    throw new ParseError(
      "พบเฉพาะบรรทัดหัวตาราง ไม่มีแถวข้อมูล — ตรวจสอบว่าไฟล์มีข้อมูลอย่างน้อย 1 แถว"
    );
  }

  const columns = dedupeHeaders(rows[0]);
  const dataRows = buildRows(rows.slice(1), columns);

  const notes: string[] = [];
  const delim = result.meta?.delimiter;
  if (delim) {
    const label =
      delim === "\t" ? "แท็บ (Tab)" : delim === ";" ? '";"' : delim === "|" ? '"|"' : `"${delim}"`;
    notes.push(`ตรวจพบตัวคั่นคอลัมน์: ${label}`);
  }
  if (result.errors && result.errors.length > 0) {
    notes.push(`ข้ามบางบรรทัดที่อ่านไม่ได้ ${result.errors.length} จุด`);
  }

  return { fileName: file.name, columns, rows: dataRows, notes };
}

async function parseExcel(file: File): Promise<RawDataset> {
  const buf = await file.arrayBuffer();
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  } catch (e) {
    throw new ParseError(
      "อ่านไฟล์ Excel ไม่สำเร็จ — ไฟล์อาจเสียหายหรือไม่ใช่ .xlsx ที่ถูกต้อง"
    );
  }

  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new ParseError("ไม่พบชีตข้อมูลในไฟล์ Excel");
  const sheet = wb.Sheets[sheetName];

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });

  const rows = aoa.filter(isMeaningfulRow) as unknown[][];
  if (rows.length === 0) {
    throw new ParseError(`ชีต "${sheetName}" ไม่มีข้อมูล`);
  }
  if (rows.length === 1) {
    throw new ParseError(
      `ชีต "${sheetName}" มีเฉพาะหัวตาราง ไม่มีแถวข้อมูล`
    );
  }

  const columns = dedupeHeaders(rows[0]);
  const dataRows = buildRows(rows.slice(1), columns);

  const notes: string[] = [`อ่านจากชีต "${sheetName}"`];
  if (wb.SheetNames.length > 1) {
    notes.push(`ไฟล์มี ${wb.SheetNames.length} ชีต — ใช้ชีตแรก`);
  }

  return { fileName: file.name, columns, rows: dataRows, notes };
}

/** Parse any supported file into a RawDataset, throwing ParseError on failure. */
export async function parseFile(file: File): Promise<RawDataset> {
  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1) : "";

  try {
    if (ext === "xlsx" || ext === "xls" || ext === "xlsm" || ext === "xlsb") {
      return await parseExcel(file);
    }
    // csv / txt / tsv / dat / log and anything unknown -> try delimited text
    return await parseDelimited(file);
  } catch (e) {
    if (e instanceof ParseError) throw e;
    const msg = e instanceof Error ? e.message : "unknown error";
    throw new ParseError(`แปลงไฟล์ไม่สำเร็จ: ${msg}`);
  }
}
