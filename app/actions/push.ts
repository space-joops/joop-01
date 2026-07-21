"use server";

import { headers } from "next/headers";
import webpush from "web-push";
import { PUSH_MESSAGES, type PushMessageKey } from "@/lib/push-messages";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PushSubscriptionSyncResult } from "@/lib/supabase/push-types";

/**
 * 푸시 발송 Server Action.
 *
 * "use server" 파일의 함수는 클라이언트에서 import해 부르면
 * 실제로는 서버에서 실행된다 — Flask 라우트 핸들러를 함수 호출처럼
 * 쓰는 느낌이다 (fetch/직렬화는 Next.js가 대신 처리).
 *
 * VAPID 비밀키는 서버에만 있으므로 발송은 반드시 여기서 한다.
 * 지금은 클라이언트가 자기 구독 정보를 직접 들고 와서 "나에게 보내줘"라고
 * 요청하는 데모 단계다. Supabase가 붙으면 구독 정보를 DB에 저장하고,
 * Edge Function + cron이 펫 상태를 보고 알아서 발송하게 된다.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:ops@joops.app";

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
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
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

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(message),
      // TTL: 푸시 서버가 기기 오프라인 시 이 시간(초)까지 보관 후 폐기
      { TTL: 60 * 60 },
    );
    return { ok: true };
  } catch (error) {
    console.error("[push] 발송 실패:", error);
    return {
      ok: false,
      error: "발송에 실패했어요. 구독을 껐다 켠 뒤 다시 시도해 주세요.",
    };
  }
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
