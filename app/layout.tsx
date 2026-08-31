import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "必办时间表",
  description: "企业微信提醒名单",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
