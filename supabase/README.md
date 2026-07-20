# Supabase 설정 가이드

게임 상태(펫·정산·로그)의 서버 저장소. 배경 설명과 설계 이유는
`docs/devlog/04-Supabase와-방치형-루프.md` 참조.

## 로컬 개발 (Docker 필요)

```bash
npx supabase start     # 로컬 Postgres + Auth + REST 기동
npx supabase db reset  # migrations/*.sql 순서대로 적용 (스키마 바꿀 때마다)
npx supabase stop      # 종료
```

`start` 출력의 `API_URL`/`ANON_KEY`를 `.env.local`에 넣는다
(`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
키가 없으면 게임은 localStorage만 쓰는 로컬 모드로 동작한다.

익명 로그인은 `config.toml`의 `enable_anonymous_sign_ins = true`로 이미 켜져 있다.

## 클라우드 전환 (배포 시)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (무료 티어 충분)
2. **Authentication → Sign In / Providers → Anonymous sign-ins 켜기** (잊기 쉬움!)
3. 프로젝트에 예전 실험용 테이블이 남아 있다면 먼저 정리 (반드시 내용 확인 후!):
   ```sql
   drop table if exists public.pets cascade;
   drop trigger if exists on_auth_user_created on auth.users;
   drop function if exists public.handle_new_user();
   ```
4. 마이그레이션 적용 — 둘 중 하나:
   - 대시보드 SQL Editor에 `migrations/20260721000000_joops_init.sql` 붙여넣고 실행
   - 또는 CLI: `npx supabase login` 후 `npx supabase link --project-ref <ref>` → `npx supabase db push`
5. Vercel 환경변수에 프로젝트 URL과 키 등록 (`.env.example` 참조).
   키는 신형(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `sb_publishable_…`)과
   구형(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, JWT) 어느 쪽이든 인식한다.

## 스키마 개요

- `profiles` — auth.users 1:1 확장 (가입 트리거로 자동 생성)
- `pets` — 유저당 1마리. **update grant 없음** — 쓰기는 RPC로만:
  - `settle_offline()` — 오프라인 정산 (DB now() 기준, security definer)
  - `sync_pet(...)` — 플레이 중 스냅샷 저장 (서버 측 클램프)
- `offline_logs` — 정산 기록 (귀환 보고의 원본)
