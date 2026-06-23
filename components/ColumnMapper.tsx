"use client";

import type { ColumnMapping } from "@/lib/types";

interface ColumnMapperProps {
  mapping: ColumnMapping;
  onChange: (next: ColumnMapping) => void;
}

/** Re-point the time axis to `name` (or null = row index), fixing up roles. */
function withTimeColumn(mapping: ColumnMapping, name: string | null): ColumnMapping {
  const columns = mapping.columns.map((c) => ({ ...c }));
  for (const c of columns) {
    if (c.role === "time") {
      // demote the previous time column back to value (if numeric) or ignore
      c.role = c.numericRatio >= 0.5 ? "value" : "ignore";
      if (c.role !== "value") c.selected = false;
    }
  }
  if (name) {
    const target = columns.find((c) => c.name === name);
    if (target) {
      target.role = "time";
      target.selected = false;
    }
  }
  return { timeColumn: name, columns };
}

/** Toggle whether a (non-time) column is plotted. */
function togglePlot(mapping: ColumnMapping, name: string): ColumnMapping {
  const columns = mapping.columns.map((c) => {
    if (c.name !== name || c.role === "time") return c;
    const selected = !c.selected;
    return { ...c, selected, role: selected ? "value" : "ignore" } as typeof c;
  });
  return { ...mapping, columns };
}

export default function ColumnMapper({ mapping, onChange }: ColumnMapperProps) {
  const { columns, timeColumn } = mapping;
  const selectedCount = columns.filter((c) => c.selected).length;

  return (
    <section className="panel" aria-labelledby="mapper-title">
      <header className="panel-head">
        <h2 id="mapper-title" className="panel-title">
          การจับคู่คอลัมน์
        </h2>
        <span className="panel-meta mono">{selectedCount} ค่าที่พล็อต</span>
      </header>

      <div className="field">
        <label className="field-label" htmlFor="time-col">
          คอลัมน์แกนเวลา
        </label>
        <select
          id="time-col"
          className="select"
          value={timeColumn ?? ""}
          onChange={(e) => onChange(withTimeColumn(mapping, e.target.value || null))}
        >
          <option value="">ลำดับแถว (index)</option>
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.dateRatio >= 0.3 ? "  ⏱" : ""}
            </option>
          ))}
        </select>
        {!timeColumn && (
          <p className="field-hint">ไม่พบคอลัมน์เวลา — ใช้ลำดับแถวเป็นแกน X</p>
        )}
      </div>

      <ul className="col-list" role="list">
        {columns.map((c) => {
          const isTime = c.role === "time";
          return (
            <li key={c.name} className={`col-row${isTime ? " is-time" : ""}`}>
              <label className="col-main">
                {!isTime && (
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={c.selected}
                    onChange={() => onChange(togglePlot(mapping, c.name))}
                    aria-label={`พล็อตคอลัมน์ ${c.name}`}
                  />
                )}
                {isTime && (
                  <span className="col-tag col-tag-time" aria-hidden="true">
                    เวลา
                  </span>
                )}
                <span className="col-name mono">{c.name}</span>
              </label>
              <span className="col-badges">
                <span
                  className={`badge${c.numericRatio >= 0.6 ? " badge-on" : ""}`}
                  title="สัดส่วนค่าที่เป็นตัวเลข"
                >
                  ตัวเลข {Math.round(c.numericRatio * 100)}%
                </span>
                {c.dateRatio >= 0.3 && (
                  <span className="badge badge-soft" title="สัดส่วนค่าที่เป็นวันเวลา">
                    วันเวลา {Math.round(c.dateRatio * 100)}%
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
