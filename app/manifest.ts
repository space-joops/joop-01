import type { MetadataRoute } from "next";

/*
 * 웹 앱 매니페스트 — "이 웹사이트는 설치 가능한 앱입니다"라는 신분증.
 * Next.js가 이 파일을 /manifest.webmanifest 로 서빙하고 <link> 태그도 자동으로 넣어준다.
 *
 * - display: "standalone" → 설치 후 주소창 없이 네이티브 앱처럼 실행
 * - orientation: "portrait" → 기획 원칙(세로 전용 UX)을 OS 레벨에서도 고정
 * - maskable 아이콘 → 안드로이드가 원형/스쿼클 등 기기별 모양으로 잘라 쓰는 아이콘.
 *   잘려도 안전하도록 여백을 넉넉히 둔 별도 이미지를 쓴다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "줍스 (JOOPS) — 우주 쓰레기 청소 위성 펫",
    short_name: "줍스",
    description:
      "클리어 스카이의 오퍼레이터가 되어 인공위성 펫과 함께 우주 쓰레기를 청소하고 밤하늘의 별빛을 되찾으세요.",
    id: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060714",
    theme_color: "#060714",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
