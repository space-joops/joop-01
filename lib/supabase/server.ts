import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

/**
 * 서버(Server Action · 서버 컴포넌트)용 Supabase 클라이언트.
 *
 * 브라우저 클라이언트와 달리 "요청마다" 새로 만든다 — 요청에 실려 온
 * 쿠키(= 그 유저의 세션)를 읽어야 하기 때문이다. 파이썬으로 치면
 * Flask에서 요청마다 request.cookies로 세션을 복원하는 것과 같다.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return null;

  // Next.js 15부터 cookies()는 비동기 — await가 필요하다
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트 렌더링 중에는 쿠키를 쓸 수 없다(읽기 전용).
          // 만료 토큰 갱신 같은 쿠키 쓰기는 middleware.ts가 담당한다.
        }
      },
    },
  });
}
