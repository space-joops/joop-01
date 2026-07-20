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
3. 마이그레이션 적용 — 둘 중 하나:
   - 대시보드 SQL Editor에 `migrations/20260721000000_joops_init.sql` 붙여넣고 실행
   - 또는 CLI: `npx supabase login` 후 `npx supabase link --project-ref <ref>` → `npx supabase db push`
4. Vercel 환경변수에 프로젝트 URL과 키 등록 (`.env.example` 참조).
   키는 신형(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `sb_publishable_…`)과
   구형(`NEXT_PUBLIC_SUPABASE_ANON_KEY`, JWT) 어느 쪽이든 인식한다.

## 스키마 개요

모든 DB 객체는 `joop_01_` 접두사를 쓴다 — 하나의 Supabase 프로젝트를
여러 실험이 공유하므로, 접두사가 네임스페이스 역할을 해서 기존 테이블과
충돌하지 않는다.

- `joop_01_profiles` — auth.users 1:1 확장 (가입 트리거로 자동 생성)
- `joop_01_pets` — 유저당 1마리. **update grant 없음** — 쓰기는 RPC로만:
  - `joop_01_settle_offline()` — 오프라인 정산 (DB now() 기준, security definer)
  - `joop_01_sync_pet(...)` — 플레이 중 스냅샷 저장 (서버 측 클램프)
- `joop_01_offline_logs` — 정산 기록 (귀환 보고의 원본)
