import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 서비스 워커 전용 구독 갱신 통로.
 *
 * 페이지(React)는 Server Action(savePushSubscription)을 부르면 되지만,
 * 서비스 워커는 React 세계 밖에서 살아서 Server Action을 import할 수
 * 없다. 그래서 SW가 fetch로 두드릴 수 있는 평범한 REST 창구를 하나
 * 열어 둔다 — 브라우저가 구독을 갈아끼웠을 때(pushsubscriptionchange)
 * 새 주소를 여기로 보내온다.
 *
 * same-origin fetch에는 쿠키(세션)가 자동으로 실려 오므로,
 * Server Action과 같은 방식으로 본인 확인이 된다.
 */
export async function POST(request: Request) {
  let subscription: PushSubscriptionJSON;
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (
    !subscription?.endpoint ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // 로컬 모드·미로그인은 조용히 성공 처리 — SW가 재시도 폭풍을
  // 일으키지 않게 하고, 다음 앱 방문 때 자가 치유 저장에 맡긴다.
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: true, skipped: "not-configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, skipped: "no-session" });

  const { error } = await supabase.rpc("joop_01_push_save_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
    p_user_agent: request.headers.get("user-agent"),
  });
  if (error) {
    console.error("[push] SW 구독 갱신 저장 실패:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
