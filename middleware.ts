import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

/**
 * 미들웨어 — 모든 페이지 요청보다 먼저 실행되는 문지기.
 *
 * 여기서 하는 일은 딱 하나: **만료된 세션 토큰의 자동 갱신**.
 * Supabase 세션 토큰(JWT)은 1시간이면 만료된다. 갱신은 쿠키를 다시
 * 써야 하는데, 서버 컴포넌트는 쿠키를 쓸 수 없으므로(읽기 전용)
 * 쿠키를 쓸 수 있는 유일한 길목인 미들웨어가 이 일을 맡는다.
 * 파이썬으로 치면 모든 라우트 앞에 걸린 WSGI 미들웨어다.
 */
export async function middleware(request: NextRequest) {
  // 키가 없으면(로컬 모드) 아무 일도 하지 않고 통과
  if (!isSupabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 갱신된 토큰을 ① 이번 요청에도 ② 브라우저 응답에도 심는다
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser()를 부르는 것만으로 만료 토큰이 있으면 자동 갱신된다
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // 정적 파일(빌드 산출물, 아이콘, 서비스 워커, 매니페스트)은 건너뛴다
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)",
  ],
};
