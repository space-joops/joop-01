-- ═══════════════════════════════════════════════════════════════
-- 웹 푸시 구독 저장소 — joop_01_push_subscriptions + 저장/해지 RPC
--
-- 지금까지 푸시 구독은 브라우저(PushManager) 안에만 있었다. 그래서
-- "유저가 시트를 열고 버튼을 눌러야만" 발송할 수 있었다(데모 단계).
-- 구독을 DB에 보관하면 서버가 먼저 말을 걸 수 있게 된다 — 크론이
-- 펫 상태를 보고 알아서 알림을 쏘는 진짜 관제 회선의 첫 조각.
--
-- init(20260721000000)은 협업 규칙상 수정 금지이므로 새 파일로 추가한다.
-- ═══════════════════════════════════════════════════════════════

-- ── 0. 멱등성: 우리 것(joop_01_push_*)만 지우고 다시 만든다 ──────
-- 구독은 유저 데이터지만 '복구 가능한' 데이터다 — 다음 접속 때
-- 클라이언트가 알아서 다시 저장(자가 치유)하므로, pets와 달리
-- drop-재생성 방식을 써도 실플레이 손실이 없다.
drop function if exists public.joop_01_push_save_subscription(text, text, text, text);
drop function if exists public.joop_01_push_remove_subscription(text);
drop table    if exists public.joop_01_push_subscriptions cascade;

-- ── 1. joop_01_push_subscriptions: 기기·브라우저당 구독 1행 ──────
create table public.joop_01_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- 브라우저 벤더 푸시 서버가 발급한 주소 — 기기·브라우저의 신분증.
  -- 같은 유저가 폰/PC 여러 대에서 구독하면 행이 여러 개 생긴다.
  endpoint   text not null unique,
  p256dh     text not null, -- 페이로드 암호화용 공개키 (구독마다 다름)
  auth       text not null, -- 페이로드 인증 시크릿
  user_agent text,          -- 디버깅용 ("어느 기기의 구독이 죽었나" 추적)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.joop_01_push_subscriptions is
  '웹 푸시 구독 — 서버가 먼저 알림을 보내기 위한 기기별 주소록';

create index joop_01_push_subscriptions_user_idx
  on public.joop_01_push_subscriptions (user_id);

-- ── 2. 권한 — init과 같은 이중 잠금 (grant + RLS) ─────────────────
-- 클라우드는 default privileges로 새 테이블 권한을 자동 부여하므로
-- "전부 회수 → 최소한만 부여" 순서를 반드시 지킨다 (init 4절 참조).
revoke all on public.joop_01_push_subscriptions from anon, authenticated;
grant select on public.joop_01_push_subscriptions to authenticated;

alter table public.joop_01_push_subscriptions enable row level security;

create policy "본인 구독 조회" on public.joop_01_push_subscriptions
  for select using ((select auth.uid()) = user_id);
-- insert/update/delete 정책은 의도적으로 없음 — 쓰기는 아래 RPC로만.
-- (남의 endpoint를 멋대로 등록/삭제하는 장난을 원천 차단)

-- ── 3. 저장 RPC — 업서트(있으면 갱신, 없으면 생성) ────────────────
-- endpoint가 이미 다른 계정 소유로 저장돼 있으면 소유자를 갈아끼운다.
-- endpoint를 실제로 쥐고 있는 건 지금 이 브라우저이므로(익명 계정이
-- 바뀌는 경우 등) "브라우저가 곧 주인"이 맞는 규칙이다.
create or replace function public.joop_01_push_save_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  if p_endpoint is null or p_endpoint = ''
     or p_p256dh is null or p_auth is null then
    raise exception '구독 정보가 올바르지 않습니다';
  end if;

  insert into public.joop_01_push_subscriptions
    (user_id, endpoint, p256dh, auth, user_agent)
  values
    (v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

-- ── 4. 해지 RPC — 본인 소유 endpoint만 삭제 ──────────────────────
create or replace function public.joop_01_push_remove_subscription(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.joop_01_push_subscriptions
  where endpoint = p_endpoint
    and user_id = auth.uid();
end;
$$;

-- ── 5. 함수 권한 — 로그인한 유저만 호출 가능 ─────────────────────
revoke all on function public.joop_01_push_save_subscription(text, text, text, text)
  from public, anon;
revoke all on function public.joop_01_push_remove_subscription(text)
  from public, anon;
grant execute on function public.joop_01_push_save_subscription(text, text, text, text)
  to authenticated;
grant execute on function public.joop_01_push_remove_subscription(text)
  to authenticated;
