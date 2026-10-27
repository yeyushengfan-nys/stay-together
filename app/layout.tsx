import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "住一起 · AI 酒店选择助手",
  description: "理解酒店评价截图，结合同行人的偏好，以可追溯的依据帮助选择酒店。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
