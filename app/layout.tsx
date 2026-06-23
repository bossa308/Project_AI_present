import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataPulse — instrument readout dashboard",
  description:
    "ลากไฟล์ข้อมูลมิเตอร์/เซนเซอร์ (.csv/.txt/.xlsx) แล้วได้แดชบอร์ด trend, สรุปค่า, เกณฑ์เตือน และจำลอง what-if อัตโนมัติ",
};

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        {/* IBM Plex Sans Thai (UI/Thai) + IBM Plex Mono (instrument readouts).
            Loaded via <link> so the app still runs offline (falls back to
            system fonts) instead of failing a build-time font fetch. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
