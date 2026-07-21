-- ═══════════════════════════════════════════════════════════════
-- 방치형 업그레이드 — inventory 테이블 · 구매 RPC · 정산 함수 v2
--
-- 파편의 소비처가 생긴다: 화물칸(cargo)·AI 코어(ai_core)·태양광(solar)
-- 3종 강화. 구매는 경제 행위이므로 비용 검증·차감이 전부 DB 안에서
-- 이루어진다 (클라이언트는 요청만). 증분 마이그레이션 — 기존 데이터 보존.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. joop_01_inventory: 범용 소지품 테이블 (개발 가이드 4테이블 완성) ──
-- 업그레이드 레벨은 item_key='upgrade_<종류>', qty=레벨로 저장한다.
-- 나중에 쓰레기 부품·특수 코어·데칼(스킨)도 같은 구조에 담는다.
create table if not exists public.joop_01_inventory (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_key   text not null,
  qty        int  not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, item_key)
);

comment on table public.joop_01_inventory is '소지품 — 업그레이드 레벨(upgrade_*), 향후 부품·데칼';

-- 권한: 읽기는 본인 것만, 쓰기는 RPC로만 (pets와 같은 이중 잠금)
revoke all on public.joop_01_inventory from anon, authenticated;
grant select on public.joop_01_inventory to authenticated;
alter table public.joop_01_inventory enable row level security;
drop policy if exists "본인 소지품 조회" on public.joop_01_inventory;
create policy "본인 소지품 조회" on public.joop_01_inventory
  for select using ((select auth.uid()) = user_id);

-- ── 2. joop_01_buy_upgrade(): 강화 구매 — 비용 검증·차감의 유일한 통로 ──
create or replace function public.joop_01_buy_upgrade(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 비용 곡선: Lv.0→1부터 (클라이언트 UPGRADE_COSTS와 맞출 것)
  costs constant int[] := array[50, 90, 160, 290, 520];
  max_level constant int := 5;

  v_uid   uuid := auth.uid();
  v_pet   public.joop_01_pets%rowtype;
  v_after public.joop_01_pets%rowtype;
  v_level int;
  v_cost  int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  if p_key not in ('cargo', 'ai_core', 'solar') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_key');
  end if;

  -- 펫 행 잠금 — 파편 잔액 검증과 차감 사이에 끼어들 수 없게
  select * into v_pet from public.joop_01_pets where user_id = v_uid for update;
  if not found then
    raise exception '펫이 없습니다';
  end if;

  select coalesce(qty, 0) into v_level
    from public.joop_01_inventory
    where user_id = v_uid and item_key = 'upgrade_' || p_key;
  v_level := coalesce(v_level, 0);

  if v_level >= max_level then
    return jsonb_build_object('ok', false, 'reason', 'max_level');
  end if;
  v_cost := costs[v_level + 1];
  if v_pet.debris < v_cost then
    return jsonb_build_object('ok', false, 'reason', 'not_enough', 'need', v_cost);
  end if;

  update public.joop_01_pets
    set debris = debris - v_cost, updated_at = now()
    where id = v_pet.id
    returning * into v_after;

  insert into public.joop_01_inventory (user_id, item_key, qty)
    values (v_uid, 'upgrade_' || p_key, v_level + 1)
    on conflict (user_id, item_key)
    do update set qty = excluded.qty, updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'key', p_key,
    'level', v_level + 1,
    'cost', v_cost,
    'pet', to_jsonb(v_after)
  );
end;
$$;

revoke all on function public.joop_01_buy_upgrade(text) from public, anon;
grant execute on function public.joop_01_buy_upgrade(text) to authenticated;

-- ── 3. 정산 함수 v2 — 업그레이드가 오프라인 수집에 반영된다 ──
-- 변경점: AI 코어 = 시간당 수집량 +20%/Lv, 화물칸 = 파편당 데이터 -20%/Lv
-- (compression: 1 / (1 + 0.25×Lv)). 나머지 로직은 v1과 동일.
create or replace function public.joop_01_settle_offline()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batt_drain_per_hour   constant numeric := 100.0 / 24;
  base_collect_per_hour constant numeric := 6;
  base_data_per_debris  constant numeric := 1;
  exp_per_debris        constant numeric := 1;
  full_data_eff         constant numeric := 0.5;
  sulky_after_hours     constant numeric := 12;
  hibernate_after_hours constant numeric := 72;
  graze_min_hours       constant numeric := 6;
  graze_chance          constant numeric := 0.35;
  min_settle_seconds    constant numeric := 60;

  v_uid   uuid := auth.uid();
  v_now   timestamptz := now();
  v_pet   public.joop_01_pets%rowtype;
  v_after public.joop_01_pets%rowtype;

  v_ai_lv    int := 0;
  v_cargo_lv int := 0;
  collect_per_hour numeric;
  data_per_debris  numeric;

  v_away_sec        numeric;
  v_away_hours      numeric;
  v_active_hours    numeric;
  v_sleep_hours     numeric;
  v_hours_till_full numeric;
  v_phase1          numeric;
  v_phase2          numeric;
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

  select * into v_pet from public.joop_01_pets where user_id = v_uid for update;
  if not found then
    raise exception '펫이 없습니다';
  end if;

  -- 업그레이드 레벨 읽기 (없으면 0)
  select
    coalesce(max(case when item_key = 'upgrade_ai_core' then qty end), 0),
    coalesce(max(case when item_key = 'upgrade_cargo'   then qty end), 0)
    into v_ai_lv, v_cargo_lv
    from public.joop_01_inventory
    where user_id = v_uid;

  collect_per_hour := base_collect_per_hour * (1 + 0.20 * v_ai_lv);
  data_per_debris  := base_data_per_debris / (1 + 0.25 * v_cargo_lv);

  v_away_sec := extract(epoch from (v_now - v_pet.last_settled_at));
  if v_away_sec < min_settle_seconds then
    return jsonb_build_object('settled', false, 'away_seconds', floor(v_away_sec));
  end if;
  v_away_hours := v_away_sec / 3600.0;

  v_active_hours := least(v_away_hours, v_pet.battery / batt_drain_per_hour);
  v_sleep_hours  := v_away_hours - v_active_hours;
  v_new_battery  := greatest(0, v_pet.battery - batt_drain_per_hour * v_away_hours);

  v_hours_till_full := greatest(0, (100 - v_pet.data_used) / (collect_per_hour * data_per_debris));
  v_phase1 := least(v_active_hours, v_hours_till_full);
  v_phase2 := v_active_hours - v_phase1;
  v_gained := collect_per_hour * (v_phase1 + v_phase2 * full_data_eff);
  v_exp_gain := floor(v_gained * exp_per_debris);
  v_new_data := least(100, v_pet.data_used + collect_per_hour * data_per_debris * v_phase1);

  if v_away_hours >= graze_min_hours and random() < graze_chance then
    v_dur_loss := round((2 + random() * 3)::numeric, 1);
  end if;
  v_new_durability := greatest(least(30, v_pet.durability), v_pet.durability - v_dur_loss);

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
