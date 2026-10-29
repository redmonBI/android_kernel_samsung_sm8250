import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "필라멘트코리아", template: "%s · 필라멘트코리아" },
  description: "상업조명 제품 소개와 사내 장기재고·제안 운영",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
