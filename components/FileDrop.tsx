"use client";

import { useCallback, useRef, useState } from "react";

interface FileDropProps {
  onFile: (file: File) => void;
  /** id of the example dataset to load: "plant" | "air" | "power" */
  onSample: (id: string) => void;
  onReset: () => void;
  busy: boolean;
  hasData: boolean;
  fileName?: string;
}

const ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.xlsm,.dat,.log";

export default function FileDrop({
  onFile,
  onSample,
  onReset,
  busy,
  hasData,
  fileName,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      // allow re-selecting the same file
      e.target.value = "";
    },
    [onFile]
  );

  return (
    <div
      className={`dropzone${dragging ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์ข้อมูล"
      aria-busy={busy}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          pick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        onChange={handleChange}
        tabIndex={-1}
      />

      <div className="dropzone-icon" aria-hidden="true">
        {busy ? <span className="spinner" /> : <SignalGlyph />}
      </div>

      <div className="dropzone-text">
        {busy ? (
          <strong>กำลังอ่านไฟล์…</strong>
        ) : (
          <>
            <strong>ลากไฟล์มาวางที่นี่</strong>
            <span className="dropzone-sub">หรือกดเพื่อเลือกไฟล์ · CSV · TXT · XLSX</span>
          </>
        )}
      </div>

      <div className="dropzone-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => onSample("plant")}
          disabled={busy}
        >
          โหลดข้อมูลตัวอย่าง
        </button>
        {hasData && (
          <button type="button" className="btn btn-ghost" onClick={onReset} disabled={busy}>
            ล้างข้อมูล
          </button>
        )}
      </div>

      <div className="sample-row" onClick={(e) => e.stopPropagation()}>
        <span className="sample-hint">หรือลองชุดข้อมูลจริง:</span>
        <button
          type="button"
          className="chip"
          onClick={() => onSample("air")}
          disabled={busy}
        >
          คุณภาพอากาศ กทม.
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onSample("power")}
          disabled={busy}
        >
          มิเตอร์ไฟฟ้า
        </button>
      </div>

      {hasData && fileName && (
        <div className="dropzone-file" onClick={(e) => e.stopPropagation()}>
          <span className="dot-live" aria-hidden="true" />
          <span className="mono">{fileName}</span>
        </div>
      )}
    </div>
  );
}

function SignalGlyph() {
  return (
    <svg viewBox="0 0 48 32" width="48" height="32" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline
        points="2,24 8,24 12,10 18,28 24,6 30,22 36,16 42,16 46,16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
