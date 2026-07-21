-- ═══════════════════════════════════════════════════════════════
-- 진화 시스템 — 첫 번째 "증분" 마이그레이션
--
-- 초기 마이그레이션(20260721000000)은 drop-recreate 방식이지만,
-- 클라우드에 실제 플레이 데이터가 생긴 지금부터는 예고했던 대로
-- 변경분만 담는 증분 방식으로 전환한다. 이 파일은 기존 데이터를
-- 건드리지 않고 컬럼과 함수만 추가한다. (여러 번 실행해도 안전)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. 3단계 진화 분기 저장 컬럼 ────────────────────────────────
-- level 3에서 선택하는 장비: net(그물망)/magnet(자석)/laser(레이저).
-- level 1~2 동안은 null.
alter table public.joop_01_pets
  add column if not exists variant text
  check (variant is null or variant in ('net', 'magnet', 'laser'));

comment on column public.joop_01_pets.variant is '3단계 진화 장비 분기 — net/magnet/laser (1~2단계는 null)';

-- ── 2. joop_01_evolve_pet(): 서버 검증 승급 ─────────────────────
-- 진화의 유일한 통로. 임계값 검증이 서버(DB)에 있으므로 클라이언트가
-- "나 레벨 3이야"라고 우겨도 통하지 않는다 — sync_pet은 level을
-- 건드리지 않고, pets 테이블에는 update 권한 자체가 없다.
create or replace function public.joop_01_evolve_pet(p_variant text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- ── 승급 임계값: 클라이언트 표시용 상수(stores/pet-store.ts)와 맞출 것 ──
  lv2_exp constant int := 300;   -- 1 → 2단계 (주니어)
  lv3_exp constant int := 1200;  -- 2 → 3단계 (장비 선택)

  v_uid   uuid := auth.uid();
  v_pet   public.joop_01_pets%rowtype;
  v_after public.joop_01_pets%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  -- 행 잠금: 더블 탭으로 두 번 진화되는 사고 방지
  select * into v_pet from public.joop_01_pets where user_id = v_uid for update;
  if not found then
    raise exception '펫이 없습니다';
  end if;

  if v_pet.level = 1 then
    if v_pet.exp < lv2_exp then
      return jsonb_build_object('ok', false, 'reason', 'exp_low', 'need', lv2_exp);
    end if;
    update public.joop_01_pets
      set level = 2, updated_at = now()
      where id = v_pet.id
      returning * into v_after;

  elsif v_pet.level = 2 then
    if v_pet.exp < lv3_exp then
      return jsonb_build_object('ok', false, 'reason', 'exp_low', 'need', lv3_exp);
    end if;
    -- 3단계는 장비 선택이 필수 — 한 번 고르면 바꿀 수 없다 (신중히!)
    if p_variant is null or p_variant not in ('net', 'magnet', 'laser') then
      return jsonb_build_object('ok', false, 'reason', 'variant_required');
    end if;
    update public.joop_01_pets
      set level = 3, variant = p_variant, updated_at = now()
      where id = v_pet.id
      returning * into v_after;

  else
    return jsonb_build_object('ok', false, 'reason', 'max_level');
  end if;

  return jsonb_build_object('ok', true, 'pet', to_jsonb(v_after));
end;
$$;

revoke all on function public.joop_01_evolve_pet(text) from public, anon;
grant execute on function public.joop_01_evolve_pet(text) to authenticated;
