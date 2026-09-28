import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "阿柚自動影片備份 v1.0 · 控制中心",
  description:
    "Browser Extension + Windows Desktop App 影片備份系統控制中心：設定、下載佇列、下載紀錄與完整原始碼交付。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-[#0B0E13] text-white antialiased">{children}</body>
    </html>
  );
}
