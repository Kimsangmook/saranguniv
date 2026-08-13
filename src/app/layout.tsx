import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "찬양팀 지각비 관리",
  description: "찬양팀 출결과 지각비를 관리합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
