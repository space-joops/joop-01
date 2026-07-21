/**
 * DB 행(row) ↔ TypeScript 타입 대응.
 *
 * Supabase CLI로 타입을 자동 생성할 수도 있지만(supabase gen types),
 * 지금은 테이블이 작으니 손으로 써서 컬럼 하나하나를 눈에 익힌다.
 * 파이썬으로 치면 SQLAlchemy 모델 대신 TypedDict를 직접 쓰는 셈.
 */

/** 펫 상태 — 사망은 없다 (기획서 원칙) */
export type PetStatus = "active" | "sulky" | "sleep" | "hibernate";

/** 3단계 진화 장비 분기 — 한 번 고르면 바꿀 수 없다 */
export type PetVariant = "net" | "magnet" | "laser";

/** public.joop_01_pets 테이블 한 행 */
export interface PetRow {
  id: string;
  user_id: string;
  name: string;
  level: number;
  battery: number;
  durability: number;
  data_used: number;
  debris: number;
  exp: number;
  status: PetStatus;
  /** 3단계 장비 — 1~2단계는 null */
  variant: PetVariant | null;
  last_settled_at: string;
  created_at: string;
  updated_at: string;
}

/** 방치형 업그레이드 종류 — inventory에 upgrade_<key>로 저장된다 */
export type UpgradeKey = "cargo" | "ai_core" | "solar";

/** 업그레이드 현재 레벨 묶음 */
export type UpgradeLevels = Record<UpgradeKey, number>;

/** joop_01_buy_upgrade() RPC가 돌려주는 구매 결과 */
export interface BuyUpgradeResult {
  ok: boolean;
  reason?: "invalid_key" | "max_level" | "not_enough";
  /** not_enough일 때 필요한 파편 */
  need?: number;
  key?: UpgradeKey;
  level?: number;
  cost?: number;
  pet?: PetRow;
}

/** joop_01_evolve_pet() RPC가 돌려주는 승급 결과 */
export interface EvolveResult {
  ok: boolean;
  reason?: "exp_low" | "variant_required" | "max_level";
  /** exp_low일 때 필요한 경험치 */
  need?: number;
  pet?: PetRow;
}

/** joop_01_settle_offline() RPC가 돌려주는 정산 결과 */
export interface OfflineSettlement {
  settled: boolean;
  away_seconds: number;
  debris_gained?: number;
  battery_drained?: number;
  durability_lost?: number;
  status_after?: PetStatus;
  pet?: PetRow;
}
