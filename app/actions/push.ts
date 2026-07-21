"use server";

import { headers } from "next/headers";
import { PUSH_MESSAGES, type PushMessageKey } from "@/lib/push-messages";
import { isVapidConfigured, sendWebPush } from "@/lib/push-server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PushSubscriptionSyncResult } from "@/lib/supabase/push-types";

/**
 * 푸시 관련 Server Action 3종 — 테스트 발송 · 구독 저장 · 구독 삭제.
 *
 * "use server" 파일의 함수는 클라이언트에서 import해 부르면
 * 실제로는 서버에서 실행된다 — Flask 라우트 핸들러를 함수 호출처럼
 * 쓰는 느낌이다 (fetch/직렬화는 Next.js가 대신 처리).
 *
 * 발송 자체는 lib/push-server.ts의 공용 코어가 담당하고,
 * 자동 발송(펫 상태 기반)은 크론이 /api/push/dispatch를 부른다.
 * 여기는 "지금 이 유저의 요청"으로 일어나는 일들만 다룬다.
 */

export interface SendPushResult {
  ok: boolean;
  /** 실패 시 유저에게 보여줄 한국어 안내 */
  error?: string;
}

/** 클라이언트가 넘긴 구독 정보로 게임 알림 한 통을 보낸다 */
export async function sendPushToSelf(
  subscription: PushSubscriptionJSON,
  messageKey: PushMessageKey,
): Promise<SendPushResult> {
  if (!isVapidConfigured()) {
    return {
      ok: false,
      error:
        "서버에 VAPID 키가 없어요. `node scripts/generate-vapid-keys.mjs`로 키를 만들어 환경변수에 넣어주세요.",
    };
  }
  if (!subscription.endpoint || !subscription.keys) {
    return { ok: false, error: "구독 정보가 올바르지 않아요." };
  }

  const message = PUSH_MESSAGES[messageKey];
  if (!message) {
    return { ok: false, error: "알 수 없는 메시지 종류예요." };
  }

  const result = await sendWebPush(
    {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    message,
  );
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: result.gone
      ? "구독이 만료됐어요. 알림을 껐다가 다시 켜 주세요."
      : "발송에 실패했어요. 구독을 껐다 켠 뒤 다시 시도해 주세요.",
  };
}

/**
 * 구독을 DB(joop_01_push_subscriptions)에 저장한다.
 *
 * 브라우저의 구독 객체는 "이 기기로 푸시를 보낼 수 있는 주소+열쇠"다.
 * 이걸 서버가 보관해야, 유저가 앱을 꺼 둔 사이에도 크론이 펫 상태를
 * 보고 먼저 알림을 보낼 수 있다. 실제 upsert 로직은 DB의
 * security definer RPC가 담당한다 (검증·소유권 규칙이 거기 있다).
 */
export async function savePushSubscription(
  subscription: PushSubscriptionJSON,
): Promise<PushSubscriptionSyncResult> {
  if (
    !subscription.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return { ok: false, reason: "error" };
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "not-configured" }; // 로컬 모드

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-session" };

  // 어느 기기의 구독인지 디버깅하기 좋게 user-agent도 같이 기록
  const userAgent = (await headers()).get("user-agent");

  const { error } = await supabase.rpc("joop_01_push_save_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
    p_user_agent: userAgent,
  });
  if (error) {
    console.error("[push] 구독 저장 실패:", error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}

/** 구독 해지 시 DB에서도 해당 endpoint를 지운다 (본인 소유만 삭제됨) */
export async function removePushSubscription(
  endpoint: string,
): Promise<PushSubscriptionSyncResult> {
  if (!endpoint) return { ok: false, reason: "error" };

  const supabase = await getSupabaseServerClient();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { error } = await supabase.rpc("joop_01_push_remove_subscription", {
    p_endpoint: endpoint,
  });
  if (error) {
    console.error("[push] 구독 삭제 실패:", error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}
