import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * service_role 키로 만드는 관리자 Supabase 클라이언트.
 *
 * ⚠️ 이 키는 RLS를 통째로 우회하는 만능 열쇠다 — 유저 세션이 아니라
 * "서버 자신"의 자격으로 DB에 접근한다. 파이썬으로 치면 웹 요청의
 * 세션과 무관하게 admin 계정으로 여는 DB 커넥션과 같다.
 *
 * 취급 규칙:
 *   1. 서버 전용 코드(크론 디스패처 등)에서만 import한다.
 *   2. 환경변수 이름에 NEXT_PUBLIC_을 절대 붙이지 않는다 —
 *      붙이는 순간 번들에 새겨져 브라우저에 공개된다.
 *   3. 필요한 최소 권한만 쓴다 — 우리는 grant를 service_role 전용
 *      RPC 3종에만 줬으므로, 이 클라이언트로도 그 이상은 못 한다.
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** 키가 없으면 null — 로컬 모드에선 자동 발송 기능이 조용히 꺼진다 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      // 유저 세션이 아니므로 세션 저장·자동 갱신이 전부 불필요하다
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
