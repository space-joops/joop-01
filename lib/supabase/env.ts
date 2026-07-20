/**
 * Supabase 연동 설정 스위치.
 *
 * NEXT_PUBLIC_ 접두사가 붙은 환경변수는 빌드 시점에 코드에 새겨져
 * 브라우저에서도 읽을 수 있다 (anon key는 공개용이라 괜찮다 — 진짜
 * 보안은 DB의 RLS와 권한이 담당한다).
 *
 * 키가 없으면 게임은 '로컬 모드'로 동작한다:
 * 상태는 localStorage(zustand persist)로만 유지되고, 서버 정산은 꺼진다.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 두 키가 모두 있어야 관제 링크(서버 연동)가 켜진다 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
