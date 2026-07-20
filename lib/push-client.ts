/**
 * 브라우저 쪽 푸시 구독 유틸.
 *
 * 웹 푸시의 등장인물 3명:
 * 1. 브라우저 벤더의 푸시 서버 (구글/애플/모질라가 운영 — 우리가 만들 필요 없음)
 * 2. 우리 서버 (Server Action + web-push 라이브러리)
 * 3. 서비스 워커 (푸시를 받아 알림으로 표시)
 *
 * VAPID 공개키로 구독하면 브라우저가 "이 키의 주인만 나에게 푸시를 보낼 수 있다"는
 * 엔드포인트(주소 + 암호화 키)를 발급해 준다. 이 구독 정보를 서버에 넘기면
 * 서버가 언제든(앱이 꺼져 있어도) 알림을 보낼 수 있다.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** 이 브라우저 환경에서 푸시가 가능한가 (iOS는 홈 화면 설치 후에만 가능) */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** 서버에 VAPID 공개키가 설정되어 있는가 */
export function hasVapidKey(): boolean {
  return VAPID_PUBLIC_KEY.length > 0;
}

/**
 * base64url 문자열 → Uint8Array.
 * PushManager.subscribe가 키를 바이트 배열로 요구해서 필요한 변환.
 * (파이썬의 base64.urlsafe_b64decode와 같은 일)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);
  // subscribe()가 요구하는 BufferSource 타입에 맞도록 ArrayBuffer 기반으로 생성
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 현재 구독 상태 조회 (구독 안 했으면 null) */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * 알림 권한 요청 → 푸시 구독까지 한 번에.
 * 성공하면 구독 객체, 유저가 거부하면 null을 돌려준다.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported() || !hasVapidKey()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    // 모든 푸시는 반드시 유저에게 보이는 알림이어야 한다는 약속 (필수 옵션)
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

/** 구독 해지 */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getPushSubscription();
  await subscription?.unsubscribe();
}
