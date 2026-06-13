import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "突然有点惦记你们",
  description: "面向家属与长辈的 AI 亲情回执 Agent Demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
