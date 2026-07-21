import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PUSH_MESSAGES } from "@/lib/push-messages";
import { sendWebPush } from "@/lib/push-server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PushCandidateRow } from "@/lib/supabase/push-types";

/**
 * 자동 알림 디스패처 — 크론만 두드리는 발송 창구.
 *
 * 호출 경로 둘 다 같은 시크릿(Bearer CRON_SECRET)으로 인증한다:
 *   1. Supabase pg_cron + pg_net (15분 주기, 주력) → POST
 *   2. Vercel Cron (하루 1회, 폴백 안전망) → GET
 *      (env 이름이 CRON_SECRET이면 Vercel이 자동으로 같은 헤더를 붙인다)
 *
 * 멱등성: 후보 산정이 쿨다운 기반(read-only)이라 몇 번을 불러도
 * 안전하다. 발송에 실패한 건 mark하지 않으므로 다음 주기가 자동으로
 * 재시도하고, 성공한 건 쿨다운에 걸려 다시 뽑히지 않는다.
 */

// web-push는 Node 전용(암호화에 node:crypto 사용) — Edge 런타임 금지
export const runtime = "nodejs";
// 크론 호출은 항상 실시간 실행 — 라우트 캐싱 대상이 아니다
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bearer 시크릿 비교 — 문자열 ===는 앞글자에서 끊겨 시간차가 새므로 상수 시간 비교 */
function isAuthorized(request: Request, secret: string): boolean {
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

async function dispatch(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    // 시크릿 없이 열려 있는 창구는 존재하면 안 된다 — 기능 자체를 잠근다
    return NextResponse.json(
      { error: "CRON_SECRET이 설정되지 않았어요" },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    // 로컬 모드(서비스 키 없음) — 크론이 에러 알람을 만들지 않게 200
    return NextResponse.json({ skipped: "not-configured" });
  }

  const { data, error } = await supabase.rpc("joop_01_push_candidates");
  if (error) {
    console.error("[push] 후보 조회 실패:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as PushCandidateRow[];
  let sent = 0;
  let pruned = 0;
  let failed = 0;
  // 한 유저의 기기가 여러 대면 후보 행도 여러 개 — 쿨다운 기록은
  // (유저 × 종류)당 한 번만 남기면 된다
  const marked = new Set<string>();

  for (const candidate of candidates) {
    const result = await sendWebPush(
      {
        endpoint: candidate.endpoint,
        p256dh: candidate.p256dh,
        auth: candidate.auth,
      },
      PUSH_MESSAGES[candidate.notify_type],
    );

    if (result.ok) {
      sent += 1;
      const key = `${candidate.user_id}:${candidate.notify_type}`;
      if (!marked.has(key)) {
        marked.add(key);
        await supabase.rpc("joop_01_push_mark_notified", {
          p_user_id: candidate.user_id,
          p_type: candidate.notify_type,
        });
      }
    } else if (result.gone) {
      // 푸시 서버가 폐기한 주소 — 주소록에서 삭제
      pruned += 1;
      await supabase.rpc("joop_01_push_prune", {
        p_endpoint: candidate.endpoint,
      });
    } else {
      // 일시 오류 — mark하지 않았으니 다음 주기가 알아서 재시도
      failed += 1;
    }
  }

  // 이 응답은 pg_net이 net._http_response 테이블에 남긴다 — 크론이
  // 잘 돌았는지 DB에서 바로 확인할 수 있는 디버깅 창구가 된다
  return NextResponse.json({ candidates: candidates.length, sent, pruned, failed });
}

export async function POST(request: Request) {
  return dispatch(request);
}

export async function GET(request: Request) {
  return dispatch(request);
}
