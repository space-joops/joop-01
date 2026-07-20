/**
 * PWA 공용 상수/판별 유틸.
 *
 * process.env.NEXT_PUBLIC_* 값은 빌드 시점에 next.config.ts가 구워 넣은 상수다.
 * (실행 중에 환경변수를 읽는 게 아니라, 코드 문자열에 이미 값이 박혀 있다)
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
export const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_STAMP ?? "local";

/**
 * 서비스 워커 등록 URL.
 * 배포마다 ?v= 쿼리가 달라지므로 브라우저가 "새 파일이네?" 하고
 * 반드시 업데이트를 감지한다. 이것이 배포 반영의 핵심 장치.
 */
export const SW_URL = `/sw.js?v=${APP_VERSION}-${BUILD_STAMP}`;

/** 홈 화면 앱(standalone)으로 실행 중인지 — 브라우저 탭이 아니라 설치된 앱인지 */
export function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari는 비표준 navigator.standalone 을 쓴다
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone === true
  );
}

/** iOS(아이폰/아이패드) 여부 — beforeinstallprompt가 없어 설치 안내 방식이 다르다 */
export function detectIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // 최신 iPadOS는 자신을 Mac이라고 속이므로 터치 지점 수로 구분한다
  const iPadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || iPadOs;
}
