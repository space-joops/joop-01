-- ═══════════════════════════════════════════════════════════════
-- 자동 알림 파이프라인의 DB 절반 — 후보 산정 · 중복 방지 · 구독 정리
--
-- 전체 그림:
--   pg_cron(15분) → pg_net → POST /api/push/dispatch (Next.js)
--     → joop_01_push_candidates()  : "지금 알림 받을 사람" 조회 (읽기 전용)
--     → web-push 발송 (Node)
--     → joop_01_push_mark_notified(): 성공 기록 (쿨다운 시작)
--     → joop_01_push_prune()        : 죽은 구독(410 Gone) 삭제
--
-- 핵심 아이디어 — 투영(projection) 계산:
-- 펫의 battery/data_used는 유저가 접속해 settle될 때만 갱신된다.
-- 크론이 도는 시점의 "진짜 현재 상태"는 저장값에서 경과 시간만큼
-- 미리 내다본 값이다: battery_now = battery - 소모율 × 경과시간.
-- 상태를 바꾸지 않고 읽기만 하므로 몇 번을 돌려도 안전하다(멱등).
-- ═══════════════════════════════════════════════════════════════

-- ── 0. 멱등성: 우리 것(joop_01_push_*)만 지우고 다시 만든다 ──────
-- notify_state는 "언제 마지막으로 알렸나"뿐이라 날아가도 최악의 경우
-- 알림이 한 번 더 갈 뿐 — 유저 데이터 손실이 아니다.
drop function if exists public.joop_01_push_candidates();
drop function if exists public.joop_01_push_mark_notified(uuid, text);
drop function if exists public.joop_01_push_prune(text);
drop table    if exists public.joop_01_push_notify_state cascade;

-- ── 1. 발송 기록 — (유저 × 알림 종류)별 마지막 발송 시각 ─────────
-- 이 한 줄이 "같은 알림 도배"를 막는 원본이다. 종류별 쿨다운이
-- 지나기 전에는 candidates가 같은 알림을 다시 뽑지 않는다.
create table public.joop_01_push_notify_state (
  user_id          uuid not null references auth.users (id) on delete cascade,
  notify_type      text not null
                   check (notify_type in ('batteryLow', 'dataFull', 'missYou')),
  last_notified_at timestamptz not null default now(),
  primary key (user_id, notify_type)
);

comment on table public.joop_01_push_notify_state is
  '자동 알림 발송 기록 — 종류별 쿨다운의 원본 (클라이언트 완전 비공개)';

-- 클라이언트에게 완전히 비공개: grant 없음 + RLS on(정책 없음).
-- 오직 아래 security definer 함수(=서버 크론 경로)만 읽고 쓴다.
revoke all on public.joop_01_push_notify_state from anon, authenticated;
alter table public.joop_01_push_notify_state enable row level security;

-- ── 2. 발송 후보 조회 (읽기 전용) ────────────────────────────────
create or replace function public.joop_01_push_candidates()
returns table (
  user_id     uuid,
  notify_type text,
  endpoint    text,
  p256dh      text,
  auth        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ⚠️⚠️ 상수 미러 경고 ⚠️⚠️
  -- 아래 4개는 joop_01_settle_offline()(20260721000000_joops_init.sql
  -- 164~169행)의 밸런스 상수 복제본이다. init 파일은 협업 규칙상
  -- 이 브랜치에서 수정 금지라 부득이 복제한다.
  -- 원본을 바꾸면 반드시 여기도 함께 바꿀 것!
  batt_drain_per_hour constant numeric := 100.0 / 24; -- 만충 → 24시간 방전
  collect_per_hour    constant numeric := 6;          -- 시간당 파편 수집량
  data_per_debris     constant numeric := 1;          -- 파편 1개당 데이터 증가
  sulky_after_hours   constant numeric := 12;         -- 시무룩 진입 = '보고싶어' 기준

  -- ── 알림 전용 기획값 (init에는 없는 새 상수) ──
  batt_low_threshold constant numeric  := 20;  -- 이 시점부터 절전까지 약 4.8시간
  batt_cooldown      constant interval := interval '20 hours'; -- 방전 주기당 1회꼴
  data_cooldown      constant interval := interval '24 hours';
  miss_cooldown      constant interval := interval '48 hours';
  miss_max_hours     constant numeric  := 168; -- 7일 넘게 방치면 그만 부른다(스팸 방지)
begin
  return query
  with projected as (
    -- 저장된 스냅샷 + 경과 시간 → "지금" 상태를 내다본다 (settle과 같은 모델)
    select p.user_id as uid,
           p.status  as pet_status,
           t1.away_h,
           greatest(0, p.battery - batt_drain_per_hour * t1.away_h) as battery_now,
           least(100, p.data_used
             + collect_per_hour * data_per_debris * t2.collect_h)   as data_now
    from public.joop_01_pets p
    cross join lateral (
      select extract(epoch from (now() - p.last_settled_at)) / 3600.0 as away_h
    ) t1
    cross join lateral (
      -- 수집은 배터리가 살아 있는 동안만 + 데이터가 가득 차기 전까지만
      select least(
        least(t1.away_h, p.battery / batt_drain_per_hour),
        greatest(0, (100 - p.data_used) / (collect_per_hour * data_per_debris))
      ) as collect_h
    ) t2
  ),
  triggered as (
    -- 알림 종류별 발동 조건 (동면 중엔 배터리·데이터 알림 무의미)
    select uid, 'batteryLow'::text as ntype, batt_cooldown as cool
      from projected
     where battery_now <= batt_low_threshold and pet_status <> 'hibernate'
    union all
    select uid, 'dataFull', data_cooldown
      from projected
     where data_now >= 100 and pet_status <> 'hibernate'
    union all
    select uid, 'missYou', miss_cooldown
      from projected
     where away_h >= sulky_after_hours and away_h <= miss_max_hours
  )
  select t.uid, t.ntype, s.endpoint, s.p256dh, s.auth
  from triggered t
  join public.joop_01_push_subscriptions s on s.user_id = t.uid
  left join public.joop_01_push_notify_state n
    on n.user_id = t.uid and n.notify_type = t.ntype
  where n.last_notified_at is null
     or n.last_notified_at < now() - t.cool
  limit 500; -- 폭주 안전장치 — 넘치면 다음 주기(15분 뒤)가 이어받는다
end;
$$;

-- ── 3. 발송 성공 기록 — 쿨다운 타이머 시작 ───────────────────────
-- 유저의 기기가 여러 대여도 (유저 × 종류) 단위로 한 번만 기록한다.
create or replace function public.joop_01_push_mark_notified(
  p_user_id uuid,
  p_type    text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.joop_01_push_notify_state (user_id, notify_type)
  values (p_user_id, p_type)
  on conflict (user_id, notify_type) do update
    set last_notified_at = now();
end;
$$;

-- ── 4. 죽은 구독 정리 — 푸시 서버가 410 Gone/404를 돌려준 주소 ────
create or replace function public.joop_01_push_prune(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.joop_01_push_subscriptions
  where endpoint = p_endpoint;
end;
$$;

-- ── 5. 함수 권한 — 오직 service_role(크론→디스패처 경로)만 ───────
-- 유저 세션(authenticated)이 남의 발송 기록을 만지거나 전체 후보를
-- 훑는 일은 있어선 안 된다. 그리고 신규 클라우드 프로젝트는 새 객체에
-- 자동 grant가 없으므로 service_role에도 "명시적으로" 부여해야 한다.
revoke all on function public.joop_01_push_candidates()
  from public, anon, authenticated;
revoke all on function public.joop_01_push_mark_notified(uuid, text)
  from public, anon, authenticated;
revoke all on function public.joop_01_push_prune(text)
  from public, anon, authenticated;

grant execute on function public.joop_01_push_candidates()          to service_role;
grant execute on function public.joop_01_push_mark_notified(uuid, text) to service_role;
grant execute on function public.joop_01_push_prune(text)           to service_role;
