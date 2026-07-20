import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "줍스 (JOOPS) — 우주 쓰레기 청소 위성 펫",
  description:
    "클리어 스카이의 오퍼레이터가 되어 인공위성 펫과 함께 우주 쓰레기를 청소하고 밤하늘의 별빛을 되찾으세요.",
};

/*
 * 모바일 게임용 뷰포트 설정.
 * - userScalable: false → 더블탭/핀치 줌으로 게임 화면이 확대되는 사고 방지
 * - viewportFit: "cover" → 노치(카메라 홈)가 있는 폰에서도 화면을 꽉 채움
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#060714",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* 세로(Portrait) 전용 셸 — 데스크톱에서 열어도 폰 폭(max-w-md)으로 가운데 고정 */}
        <div className="mx-auto h-dvh max-w-md overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
