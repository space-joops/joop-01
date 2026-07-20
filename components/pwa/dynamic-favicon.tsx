"use client";

import { useEffect } from "react";
import { usePetStore, isSleeping, isDataFull } from "@/stores/pet-store";

/**
 * 캐릭터 동기화 파비콘 + 앱 배지.
 *
 * "앱 아이콘이 펫 상태 따라 변하면 좋겠다"는 아이디어의 웹 기술 한계 내 구현:
 * - 홈 화면 앱 아이콘: OS가 설치 시점에 파일로 복사해 가므로 실시간 변경 불가 ❌
 * - 브라우저 탭 파비콘: <link rel="icon">을 캔버스 그림으로 갈아끼우면 실시간 변경 ⭕
 * - 앱 배지: 설치된 PWA 아이콘 위의 숫자 뱃지(카톡 빨간 점)는 Badging API로 변경 ⭕
 *
 * 그래서 탭에서는 줍이의 표정이 실시간으로 바뀌고,
 * 설치된 앱에서는 "돌봐줘야 할 일 개수"가 아이콘 뱃지로 표시된다.
 */

/** 상태등/표정만 다른 미니 줍이를 64×64 캔버스에 그린다 */
function drawFavicon(sleeping: boolean, dataFull: boolean): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 안테나 + 상태등 (정상: 초록 / 절전: 빨강 — 홈 화면 위성과 같은 규칙)
  ctx.strokeStyle = "#8b93bd";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(32, 11);
  ctx.lineTo(32, 20);
  ctx.stroke();
  ctx.fillStyle = sleeping ? "#f87171" : "#34d399";
  ctx.beginPath();
  ctx.arc(32, 8, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // 양쪽 태양광 패널
  ctx.fillStyle = "#3b4aa0";
  ctx.strokeStyle = "#5c6fd6";
  ctx.lineWidth = 1.5;
  for (const x of [2, 46]) {
    ctx.fillRect(x, 27, 16, 17);
    ctx.strokeRect(x, 27, 16, 17);
  }
  // 패널과 몸통을 잇는 팔
  ctx.fillStyle = "#8b93bd";
  ctx.fillRect(17, 32, 4, 7);
  ctx.fillRect(43, 32, 4, 7);

  // 몸통
  ctx.fillStyle = "#e8eaf6";
  ctx.strokeStyle = "#b9c0e4";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(20, 18, 24, 29, 7);
  ctx.fill();
  ctx.stroke();

  // 눈 — 절전 중엔 지그시 감은 눈
  ctx.fillStyle = "#1f2547";
  ctx.strokeStyle = "#1f2547";
  if (sleeping) {
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const x of [24, 34] as const) {
      ctx.beginPath();
      ctx.moveTo(x, 30);
      ctx.quadraticCurveTo(x + 3, 33, x + 6, 30);
      ctx.stroke();
    }
  } else {
    for (const x of [27, 37] as const) {
      ctx.beginPath();
      ctx.arc(x, 30, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 입
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(29, 38);
  ctx.quadraticCurveTo(32, 41, 35, 38);
  ctx.stroke();

  // 데이터 가득참 — 우상단 인디고 알림 점
  if (dataFull) {
    ctx.fillStyle = "#818cf8";
    ctx.beginPath();
    ctx.arc(53, 11, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 53, 12);
  }

  return canvas.toDataURL("image/png");
}

/** <link rel="icon">을 찾거나 만들어 데이터 URL로 교체 */
function applyFavicon(dataUrl: string) {
  let link = document.querySelector<HTMLLinkElement>("link#joops-live-icon");
  if (!link) {
    link = document.createElement("link");
    link.id = "joops-live-icon";
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  link.href = dataUrl;
}

/** 설치된 PWA의 아이콘 뱃지 — 돌봐줘야 할 일(절전/데이터 가득) 개수 */
function applyBadge(attentionCount: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  if (attentionCount > 0) {
    nav.setAppBadge(attentionCount).catch(() => undefined);
  } else {
    nav.clearAppBadge().catch(() => undefined);
  }
}

export default function DynamicFavicon() {
  const sleeping = usePetStore((state) => isSleeping(state.battery));
  const dataFull = usePetStore((state) => isDataFull(state.dataUsed));

  useEffect(() => {
    // roundRect가 없는 구형 브라우저에선 조용히 기본 파비콘 유지
    if (!("roundRect" in CanvasRenderingContext2D.prototype)) return;
    const dataUrl = drawFavicon(sleeping, dataFull);
    if (dataUrl) applyFavicon(dataUrl);
    applyBadge((sleeping ? 1 : 0) + (dataFull ? 1 : 0));
  }, [sleeping, dataFull]);

  return null;
}
