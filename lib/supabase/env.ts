/**
 * Supabase 연동 설정 스위치.
 *
 * NEXT_PUBLIC_ 접두사가 붙은 환경변수는 빌드 시점에 코드에 새겨져
 * 브라우저에서도 읽을 수 있다 (공개용 키라 괜찮다 — 진짜 보안은
 * DB의 RLS와 권한이 담당한다).
 *
 * 키 이름 두 가지를 모두 받는다:
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — 새 형식 (sb_publishable_…,
 *     현재 Supabase 대시보드가 안내하는 이름)
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY — 구 형식 (JWT, 로컬 CLI 출력)
 * supabase-js는 어느 쪽이든 그대로 받아들인다.
 *
 * 키가 없으면 게임은 '로컬 모드'로 동작한다:
 * 상태는 localStorage(zustand persist)로만 유지되고, 서버 정산은 꺼진다.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

/** URL과 키가 모두 있어야 관제 링크(서버 연동)가 켜진다 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
