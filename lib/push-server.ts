import webpush, { WebPushError } from "web-push";
import type { PushMessage } from "@/lib/push-messages";

/**
 * 웹 푸시 발송 코어 — 서버 전용 공용 모듈.
 *
 * "use server" 파일(app/actions/push.ts)은 async 함수만 export할 수
 * 있어서, Server Action과 크론 디스패처(/api/push/dispatch)가 함께
 * 쓸 발송 로직을 이 평범한 모듈로 분리했다. 파이썬으로 치면
 * 라우트 핸들러들이 공유하는 services 모듈을 빼내는 것과 같다.
 *
 * VAPID 비밀키를 다루므로 클라이언트 컴포넌트에서 import 금지.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:ops@joops.app";

/** 발송에 필요한 VAPID 키 쌍이 서버에 있는가 */
export function isVapidConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/** 발송 대상 — DB의 구독 행과 브라우저 구독 JSON 어느 쪽이든 이 모양으로 변환해 넘긴다 */
export interface WebPushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushSendResult {
  ok: boolean;
  /** 구독이 죽었다(410 Gone/404) — DB에서 지워야 한다는 신호 */
  gone?: boolean;
  error?: string;
}

/** 알림 한 통 발송. TTL: 기기 오프라인 시 푸시 서버가 보관할 시간(초) */
export async function sendWebPush(
  target: WebPushTarget,
  message: PushMessage,
  ttlSeconds = 60 * 60,
): Promise<WebPushSendResult> {
  if (!isVapidConfigured()) {
    return { ok: false, error: "VAPID 키 미설정" };
  }

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(message),
      { TTL: ttlSeconds },
    );
    return { ok: true };
  } catch (error) {
    // 410 Gone/404 = 푸시 서버가 "이 주소는 폐기됐다"고 알려준 것.
    // 재시도해도 소용없으니 구독을 정리하라는 신호로 바꿔 돌려준다.
    if (
      error instanceof WebPushError &&
      (error.statusCode === 404 || error.statusCode === 410)
    ) {
      return { ok: false, gone: true };
    }
    console.error("[push] 발송 실패:", error);
    return { ok: false, error: "발송 실패" };
  }
}
