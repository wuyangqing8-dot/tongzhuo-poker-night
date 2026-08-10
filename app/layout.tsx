import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "同桌 Poker Night｜和同学来一局",
  description: "一个为朋友小聚设计的轻松德州扑克房间。创建私密牌桌，分享房间码，随时开局。",
  openGraph: {
    title: "同桌 Poker Night",
    description: "好牌，好朋友，好好玩一晚。",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
