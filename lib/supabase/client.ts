import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 *
 * @supabase/ssr의 createBrowserClient는 세션을 localStorage가 아니라
 * **쿠키**에 저장한다. 쿠키는 모든 요청에 자동으로 실려 가므로,
 * 브라우저에서 로그인하면 Server Action에서도 "지금 누가 로그인했는지"를
 * 알 수 있다 — 이게 클라이언트/서버가 세션을 공유하는 핵심 장치다.
 */
let browserClient: SupabaseClient | null = null;

/** 키가 없으면 null — 호출하는 쪽에서 로컬 모드로 폴백한다 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  // 모듈 스코프 싱글톤 — 어디서 몇 번을 불러도 연결은 하나
  browserClient ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  return browserClient;
}
