import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PwaProvider from "@/components/pwa/pwa-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
 * 공유 카드(OG 스크랩)의 절대 URL 기준.
 * 페이스북·카카오톡·X의 크롤러는 상대 경로를 못 따라가므로, metadataBase가
 * 있어야 og:image 등이 완전한 주소로 렌더된다. 배포 환경에서는
 * NEXT_PUBLIC_SITE_URL(예: https://joops.vercel.app)을 설정할 것.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const TITLE = "줍스 (JOOPS) — 우주 쓰레기 청소 위성 펫";
const DESCRIPTION =
  "클리어 스카이의 오퍼레이터가 되어 인공위성 펫과 함께 우주 쓰레기를 청소하고 밤하늘의 별빛을 되찾으세요.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "줍스",
  alternates: { canonical: "/" },
  /*
   * 오픈 그래프 — 링크를 붙여넣는 순간 뜨는 미리보기 카드의 표준.
   * 페이스북·카카오톡·디스코드·슬랙이 전부 이 태그를 스크랩한다.
   */
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "줍스 (JOOPS)",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "줍스 — 인공위성 펫 줍이와 함께 우주 쓰레기를 청소하는 게임",
      },
    ],
  },
  /* X(트위터) 카드 — OG와 별도 네임스페이스라 같이 선언해 준다 */
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  /*
   * iOS 홈 화면 설치용 설정.
   * iOS는 매니페스트만으로 부족해서 전용 메타 태그가 따로 필요하다.
   * statusBarStyle "black-translucent": 상태바 영역까지 우주 배경이 차오른다.
   */
  appleWebApp: {
    capable: true,
    title: "줍스",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
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
        {/* PWA 배선반 — 서비스 워커 등록, 업데이트 토스트, 설치 넛지, 동적 파비콘 */}
        <PwaProvider />
      </body>
    </html>
  );
}
