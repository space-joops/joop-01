-- ═══════════════════════════════════════════════════════════════
-- 줍스(JOOPS) 초기 스키마 — 프로필 · 펫 · 오프라인 로그 · 정산 함수
--
-- 명명 규칙: 모든 객체에 joop_01_ 접두사.
--   하나의 Supabase 프로젝트를 여러 실험이 공유하므로, 접두사로
--   네임스페이스를 나눠 기존 테이블과의 충돌을 피한다.
--
-- 설계 원칙 (기획서 개발 원칙 4·5번):
--   1. 시간 계산은 전부 DB 안에서 — 클라이언트 시계는 절대 믿지 않는다.
--      오프라인 보상은 joop_01_settle_offline()이 DB의 now() 기준으로 정산한다.
--   2. RLS로 "읽기는 본인 것만, 쓰기는 함수로만".
--      pets 테이블에는 update 권한이 아예 없다 — PostgREST로 직접
--      debris = 99999 같은 값을 쏘는 치트를 원천 차단하고,
--      모든 쓰기는 검증 로직이 들어 있는 RPC 두 개로만 이루어진다.
-- ═══════════════════════════════════════════════════════════════

-- ── 0. 멱등성 보장: 우리 것(joop_01_*)만 지우고 처음부터 다시 만든다 ──
-- 대시보드 SQL Editor에서 몇 번을 실행해도 항상 같은 최종 상태가 된다.
-- 접두사 밖의 객체(다른 실험의 테이블)는 절대 건드리지 않는다.
--
-- ⚠️ 주의: drop-후-재생성은 joop_01_* 테이블의 데이터를 비운다.
--   실제 유저 데이터가 생긴 뒤에는 이 방식을 버리고, 변경분만 담은
--   증분 마이그레이션(alter table …)을 새 파일로 추가해야 한다.
drop trigger  if exists joop_01_on_auth_user_created on auth.users;
drop function if exists public.joop_01_handle_new_user();
drop function if exists public.joop_01_settle_offline();
drop function if exists public.joop_01_sync_pet(numeric, numeric, numeric, numeric, int);
drop table    if exists public.joop_01_offline_logs cascade;
drop table    if exists public.joop_01_pets         cascade;
drop table    if exists public.joop_01_profiles     cascade;

-- ── 1. joop_01_profiles: auth.users 1:1 확장 (오퍼레이터 프로필) ──
-- auth.users는 Supabase가 관리하는 시스템 테이블이라 직접 컬럼을 못 늘린다.
-- 관례대로 public에 프로필 테이블을 만들어 게임용 정보를 담는다.
create table public.joop_01_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nickname      text not null default '오퍼레이터',
  last_login_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table public.joop_01_profiles is '오퍼레이터(유저) 프로필 — auth.users의 게임용 확장';

-- 회원가입(익명 포함) 순간 프로필 행을 자동 생성하는 트리거.
-- security definer: 트리거는 가입 트랜잭션 안에서 실행되므로
-- RLS를 우회해 insert할 권한이 필요하다.
create or replace function public.joop_01_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.joop_01_profiles (id) values (new.id);
  return new;
end;
$$;

create trigger joop_01_on_auth_user_created
  after insert on auth.users
  for each row execute function public.joop_01_handle_new_user();

-- ── 2. joop_01_pets: 위성 펫 본체 (기획서 3대 지표 + 진화 레벨) ──
create table public.joop_01_pets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  name            text not null default '줍이',
  level           int  not null default 1  check (level between 1 and 3),
  battery         numeric(6,2)  not null default 80 check (battery between 0 and 100),
  durability      numeric(6,2)  not null default 65 check (durability between 0 and 100),
  data_used       numeric(6,2)  not null default 40 check (data_used between 0 and 100),
  debris          numeric(12,2) not null default 0  check (debris >= 0),
  exp             int  not null default 0 check (exp >= 0),
  -- active(정상) / sulky(시무룩) / sleep(절전) / hibernate(동면) — 사망은 없다
  status          text not null default 'active'
                  check (status in ('active', 'sulky', 'sleep', 'hibernate')),
  -- 서버가 마지막으로 펫 상태를 확정한 시각 — 오프라인 정산의 기준점
  last_settled_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.joop_01_pets is '위성 펫 — 유저당 1마리, 3대 지표(battery/durability/data_used)와 진화 레벨';

-- ── 3. joop_01_offline_logs: 오프라인 정산 기록 (귀환 보고의 원본) ──
create table public.joop_01_offline_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  pet_id          uuid not null references public.joop_01_pets (id) on delete cascade,
  away_seconds    bigint not null,
  debris_gained   numeric(12,2) not null default 0,
  battery_drained numeric(6,2)  not null default 0,
  durability_lost numeric(6,2)  not null default 0,
  status_after    text not null,
  created_at      timestamptz not null default now()
);

comment on table public.joop_01_offline_logs is '오프라인 방치 정산 로그 — 파편 스침 등 부재 중 사건 기록';

create index joop_01_offline_logs_user_created_idx
  on public.joop_01_offline_logs (user_id, created_at desc);

-- ── 4. 권한 — 테이블 grant + RLS 이중 잠금 ──────────────────────
-- Postgres 권한은 2겹이다: ① 테이블 grant(뭘 할 수 있나) ② RLS(어느 행에서).
-- pets에 update/delete grant를 아예 주지 않으므로, RLS 정책 이전에
-- 권한 레벨에서 이미 직접 수정이 차단된다. 쓰기는 security definer
-- 함수(소유자 권한으로 실행)만 가능하다.
--
-- 주의: 클라우드 Supabase는 default privileges로 새 테이블의 모든 권한을
-- anon/authenticated에 자동 부여한다 (로컬 CLI는 안 그럼!).
-- 그래서 "전부 회수 → 최소한만 다시 부여" 순서로 명시해야
-- 로컬과 클라우드의 권한 상태가 같아진다.
revoke all on public.joop_01_pets         from anon, authenticated;
revoke all on public.joop_01_profiles     from anon, authenticated;
revoke all on public.joop_01_offline_logs from anon, authenticated;

grant select, insert         on public.joop_01_pets         to authenticated;
grant select, update         on public.joop_01_profiles     to authenticated;
grant select                 on public.joop_01_offline_logs to authenticated;

-- ── 5. RLS — 유저는 자신의 데이터만 본다 ─────────────────────────
alter table public.joop_01_profiles     enable row level security;
alter table public.joop_01_pets         enable row level security;
alter table public.joop_01_offline_logs enable row level security;

create policy "본인 프로필 조회" on public.joop_01_profiles
  for select using ((select auth.uid()) = id);
create policy "본인 프로필 수정" on public.joop_01_profiles
  for update using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "본인 펫 조회" on public.joop_01_pets
  for select using ((select auth.uid()) = user_id);
-- insert는 기본값 그대로의 새 펫만 만들 수 있으므로 허용해도 안전하다
create policy "본인 펫 생성" on public.joop_01_pets
  for insert with check ((select auth.uid()) = user_id);
-- update 정책은 의도적으로 없음! 쓰기는 아래 RPC 함수로만 가능하다.

create policy "본인 로그 조회" on public.joop_01_offline_logs
  for select using ((select auth.uid()) = user_id);
-- insert 정책 없음 — 로그는 joop_01_settle_offline()(definer)만 남긴다.

-- ── 6. joop_01_settle_offline(): 오프라인 보상 정산 (게임의 심장) ──
--
-- 호출 시점: 유저가 접속했을 때 (Server Action → RPC)
-- 시간 기준: DB의 now() - pets.last_settled_at  ← 클라이언트 시계 개입 불가
--
-- 정산 모델 (구간을 나눠 계산하는 게 핵심):
--   · 배터리는 시간당 일정하게 소모된다 (만충 → 24시간 만에 방전).
--     따라서 "배터리가 버티는 시간"이 곧 오프라인 수집의 자연 상한 —
--     별도의 '최대 12시간 보상 캡' 같은 인위적 규칙이 필요 없다.
--   · 수집 효율은 데이터 용량이 가득 차는 순간 50%로 떨어지므로,
--     [가득 차기 전 구간]과 [가득 찬 후 구간]을 나눠 두 번 계산한다.
--   · 상태 전이: 12시간 이상 방치 → 시무룩, 방전 → 절전,
--     방전 상태로 72시간 경과 → 동면. (사망은 없다)
create or replace function public.joop_01_settle_offline()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ── 밸런스 상수: 이 숫자들만 바꾸면 게임의 호흡이 바뀐다 ──
  batt_drain_per_hour   constant numeric := 100.0 / 24; -- 만충 → 24시간 방전
  collect_per_hour      constant numeric := 6;          -- 시간당 파편 수집량 (효율 100%)
  data_per_debris       constant numeric := 1;          -- 파편 1개당 데이터 증가량
  exp_per_debris        constant numeric := 1;          -- 파편 1개당 경험치
  full_data_eff         constant numeric := 0.5;        -- 데이터 만땅 시 수집 효율
  sulky_after_hours     constant numeric := 12;         -- 시무룩 진입 방치 시간
  hibernate_after_hours constant numeric := 72;         -- 방전 후 동면 진입 시간
  graze_min_hours       constant numeric := 6;          -- 파편 스침 이벤트 최소 방치 시간
  graze_chance          constant numeric := 0.35;       -- 파편 스침 확률
  min_settle_seconds    constant numeric := 60;         -- 이보다 짧으면 정산 생략

  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_pet   public.joop_01_pets%rowtype;
  v_after public.joop_01_pets%rowtype;

  v_away_sec        numeric;
  v_away_hours      numeric;
  v_active_hours    numeric; -- 배터리가 살아 있던 시간
  v_sleep_hours     numeric; -- 방전 상태로 흘려보낸 시간
  v_hours_till_full numeric; -- 데이터가 가득 차기까지 걸리는 시간
  v_phase1          numeric; -- 효율 100% 구간
  v_phase2          numeric; -- 효율 50% 구간
  v_gained          numeric;
  v_exp_gain        int;
  v_new_battery     numeric;
  v_new_data        numeric;
  v_new_durability  numeric;
  v_dur_loss        numeric := 0;
  v_status          text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  -- for update: 같은 유저가 동시에 두 번 접속해도 이중 정산되지 않도록 행 잠금
  select * into v_pet from public.joop_01_pets where user_id = v_uid for update;
  if not found then
    raise exception '펫이 없습니다';
  end if;

  v_away_sec := extract(epoch from (v_now - v_pet.last_settled_at));
  if v_away_sec < min_settle_seconds then
    return jsonb_build_object('settled', false, 'away_seconds', floor(v_away_sec));
  end if;
  v_away_hours := v_away_sec / 3600.0;

  -- 1) 배터리가 버티는 시간 = 수집이 일어난 시간
  v_active_hours := least(v_away_hours, v_pet.battery / batt_drain_per_hour);
  v_sleep_hours  := v_away_hours - v_active_hours;
  v_new_battery  := greatest(0, v_pet.battery - batt_drain_per_hour * v_away_hours);

  -- 2) 수집량 — 데이터가 가득 차기 전(100%)과 후(50%)를 나눠 계산
  v_hours_till_full := greatest(0, (100 - v_pet.data_used) / (collect_per_hour * data_per_debris));
  v_phase1 := least(v_active_hours, v_hours_till_full);
  v_phase2 := v_active_hours - v_phase1;
  v_gained := collect_per_hour * (v_phase1 + v_phase2 * full_data_eff);
  v_exp_gain := floor(v_gained * exp_per_debris);
  v_new_data := least(100, v_pet.data_used + collect_per_hour * data_per_debris * v_phase1);

  -- 3) 파편 스침 이벤트 — 오래 자리를 비우면 가끔 잔파편에 긁힌다
  --    하한선: 충돌로는 30% 밑으로 내려가지 않는다 (이미 그보다 낮으면 현재값 유지)
  if v_away_hours >= graze_min_hours and random() < graze_chance then
    v_dur_loss := round((2 + random() * 3)::numeric, 1);
  end if;
  v_new_durability := greatest(least(30, v_pet.durability), v_pet.durability - v_dur_loss);

  -- 4) 상태 전이 — 시무룩 → 절전 → 동면 (사망 없음)
  if v_new_battery <= 0 and v_sleep_hours >= hibernate_after_hours then
    v_status := 'hibernate';
  elsif v_new_battery <= 0 then
    v_status := 'sleep';
  elsif v_away_hours >= sulky_after_hours then
    v_status := 'sulky';
  else
    v_status := 'active';
  end if;

  update public.joop_01_pets set
    battery         = v_new_battery,
    durability      = v_new_durability,
    data_used       = v_new_data,
    debris          = debris + v_gained,
    exp             = exp + v_exp_gain,
    status          = v_status,
    last_settled_at = v_now,
    updated_at      = v_now
  where id = v_pet.id
  returning * into v_after;

  insert into public.joop_01_offline_logs
    (user_id, pet_id, away_seconds, debris_gained, battery_drained, durability_lost, status_after)
  values
    (v_uid, v_pet.id, floor(v_away_sec), round(v_gained, 2),
     round(v_pet.battery - v_new_battery, 1), v_dur_loss, v_status);

  -- 접속 기록도 DB 시간으로 남긴다 (기획서 users.last_login_at)
  update public.joop_01_profiles set last_login_at = v_now where id = v_uid;

  return jsonb_build_object(
    'settled',         true,
    'away_seconds',    floor(v_away_sec),
    'debris_gained',   round(v_gained, 2),
    'battery_drained', round(v_pet.battery - v_new_battery, 1),
    'durability_lost', v_dur_loss,
    'status_after',    v_status,
    'pet',             to_jsonb(v_after)
  );
end;
$$;

-- ── 7. joop_01_sync_pet(): 온라인 플레이 스냅샷 저장 ─────────────
-- 클라이언트(Zustand)에서 일어난 탭/쓰다듬기 결과를 주기적으로 반영한다.
-- 값은 서버에서 한 번 더 클램프 — "클라이언트 입력은 항상 오염됐다고 가정".
-- last_settled_at을 now()로 당겨서, 방금 반영한 온라인 플레이 시간이
-- 다음 오프라인 정산에서 이중으로 계산되지 않게 한다.
create or replace function public.joop_01_sync_pet(
  p_battery    numeric,
  p_durability numeric,
  p_data_used  numeric,
  p_debris     numeric,
  p_exp        int
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

  update public.joop_01_pets set
    battery         = least(100, greatest(0, p_battery)),
    durability      = least(100, greatest(0, p_durability)),
    data_used       = least(100, greatest(0, p_data_used)),
    debris          = greatest(0, p_debris),
    exp             = greatest(exp, p_exp), -- 경험치는 줄어들 수 없다
    status          = case when p_battery <= 0 then 'sleep' else 'active' end,
    last_settled_at = now(),
    updated_at      = now()
  where user_id = v_uid;
end;
$$;

-- RPC는 로그인한 유저만 부를 수 있다 (anon 키만으로는 불가)
revoke all on function public.joop_01_settle_offline() from public, anon;
revoke all on function public.joop_01_sync_pet(numeric, numeric, numeric, numeric, int) from public, anon;
grant execute on function public.joop_01_settle_offline() to authenticated;
grant execute on function public.joop_01_sync_pet(numeric, numeric, numeric, numeric, int) to authenticated;
