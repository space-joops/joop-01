"use client";

import { useEffect, useState } from "react";

/**
 * 소셜 공유 패널 — 관제 설정 시트의 "친구에게 알리기" 섹션.
 *
 * 웹 표준 우선 전략:
 * 1) Web Share API(navigator.share) — 모바일 OS 공유 시트가 카카오톡·
 *    인스타그램·메시지 등 설치된 모든 앱을 심리스하게 커버하는 표준.
 *    기능 감지 후 지원 기기에서만 대표 버튼으로 노출한다.
 * 2) 페이스북·X — 공식 공유 URL(intent)을 rel=noopener 팝업으로.
 * 3) 카카오톡 — JS 키가 있으면 카카오 SDK의 sendScrap(OG 스크랩 공유),
 *    없으면 링크 복사 + "붙여넣으면 미리보기가 떠요" 안내 폴백.
 *    (URL 미리보기 카드는 layout.tsx의 OG 태그가 만들어 준다)
 * 4) 인스타그램 — 웹 공유 URL이 존재하지 않는 플랫폼. 시스템 공유
 *    시트(가능 기기)나 링크 복사로 정직하게 안내한다.
 * 5) 링크 복사 — Clipboard API + 실패 안내.
 *
 * 브랜드 로고는 그리지 않고 텍스트 라벨만 쓴다(상표권 리스크 회피 —
 * 시장 분석 문서 권고).
 */

/** 공유 문구 — OG 카드와 톤을 맞춘 한 줄 */
const SHARE_TEXT =
  "인공위성 펫 '줍이'와 함께 우주 쓰레기를 줍고 밤하늘의 별빛을 되찾아요 🛰️✨";
const SHARE_TITLE = "줍스 (JOOPS) — 우주 쓰레기 청소 위성 펫";

/** 배포 URL — 환경변수 우선, 없으면 현재 origin (개발 환경) */
const shareUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";

/** 카카오 SDK 전역 타입 — 동적 로드라 최소한만 선언 */
interface KakaoSdk {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Share: { sendScrap: (opts: { requestUrl: string }) => void };
}

/** 카카오 SDK를 첫 사용 시점에만 로드한다 — 평소 페이지 성능에 영향 없음 */
async function loadKakao(): Promise<KakaoSdk | null> {
  if (!KAKAO_KEY) return null;
  const w = window as unknown as { Kakao?: KakaoSdk };
  if (!w.Kakao) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = KAKAO_SDK_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("카카오 SDK 로드 실패"));
      document.head.appendChild(script);
    });
  }
  if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init(KAKAO_KEY);
  return w.Kakao ?? null;
}

/** 소셜 공유 팝업 — noopener로 여는 것이 보안 표준 */
const openPopup = (url: string) =>
  window.open(url, "_blank", "noopener,noreferrer,width=600,height=640");

export default function SharePanel() {
  // Web Share API 지원 여부 — SSR에는 navigator가 없으니 마운트 후 감지
  const [canWebShare, setCanWebShare] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setCanWebShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  const copyLink = async (suffix?: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setNotice(`🔗 링크를 복사했어요!${suffix ? ` ${suffix}` : ""}`);
    } catch {
      setNotice(`주소를 직접 복사해 주세요: ${shareUrl()}`);
    }
  };

  const systemShare = async () => {
    try {
      await navigator.share({
        title: SHARE_TITLE,
        text: SHARE_TEXT,
        url: shareUrl(),
      });
    } catch {
      // 사용자가 공유 시트를 닫은 경우 — 아무것도 하지 않는 게 표준 관례
    }
  };

  const shareFacebook = () =>
    openPopup(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl())}`,
    );

  const shareX = () =>
    openPopup(
      `https://x.com/intent/post?url=${encodeURIComponent(shareUrl())}&text=${encodeURIComponent(SHARE_TEXT)}`,
    );

  const shareKakao = async () => {
    try {
      const kakao = await loadKakao();
      if (kakao) {
        // OG 태그를 그대로 스크랩해 카드로 보낸다 — 가장 심리스한 경로
        kakao.Share.sendScrap({ requestUrl: shareUrl() });
        return;
      }
    } catch {
      // SDK 로드 실패 → 복사 폴백으로
    }
    await copyLink("카카오톡에 붙여넣으면 미리보기가 자동으로 떠요.");
  };

  const shareInstagram = async () => {
    // 인스타그램은 웹 공유 URL이 없다 — 시스템 공유 시트 또는 복사 안내
    if (canWebShare) {
      await systemShare();
      return;
    }
    await copyLink("인스타그램 스토리·DM에 붙여넣어 주세요.");
  };

  const smallButton =
    "rounded-xl border border-panel-border bg-panel px-3 py-2.5 text-xs font-semibold transition active:scale-95";

  return (
    <div className="mt-3 rounded-2xl border border-panel-border bg-background/50 p-4">
      <p className="text-sm font-semibold">📣 친구에게 알리기</p>
      <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">
        링크를 받으면 줍이 카드가 미리보기로 함께 떠요.
      </p>

      {/* 대표: 시스템 공유 시트 (Web Share API — 지원 기기에서만) */}
      {canWebShare && (
        <button
          type="button"
          onClick={systemShare}
          className="mt-3 w-full rounded-xl bg-data/90 py-2.5 text-xs font-bold text-background transition active:scale-95"
        >
          📤 공유하기 (설치된 앱으로)
        </button>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={shareFacebook} className={smallButton}>
          페이스북
        </button>
        <button type="button" onClick={shareX} className={smallButton}>
          X (트위터)
        </button>
        <button type="button" onClick={shareKakao} className={smallButton}>
          카카오톡
        </button>
        <button type="button" onClick={shareInstagram} className={smallButton}>
          인스타그램
        </button>
      </div>

      <button
        type="button"
        onClick={() => copyLink()}
        className="mt-2 w-full rounded-xl border border-panel-border bg-panel py-2.5 text-xs font-semibold transition active:scale-95"
      >
        🔗 링크 복사
      </button>

      {notice && (
        <p className="mt-2 break-all text-center text-[11px] text-foreground/70">
          {notice}
        </p>
      )}
    </div>
  );
}
