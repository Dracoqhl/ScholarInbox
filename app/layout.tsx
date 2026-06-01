import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScholarInbox",
  description: "Self-hosted paper discovery and reading inbox"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
