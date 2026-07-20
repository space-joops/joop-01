import { create } from "zustand";

/**
 * 펫(위성) 3대 상태 지표 스토어 — 게임의 두뇌.
 *
 * 파이썬으로 비유하면 "전역 싱글톤 dataclass + 메서드 묶음"이다.
 * 화면(컴포넌트)들은 이 스토어를 구독(subscribe)하고 있다가,
 * 값이 바뀌면 해당 값을 쓰는 컴포넌트만 다시 렌더링된다.
 */

/** 모든 게이지는 0~100 스케일 */
export const GAUGE_MAX = 100;

/** 내구도 하한선 — 기획서 원칙: 펫은 절대 파괴되지 않는다 (충돌 데미지가 생겨도 이 밑으론 안 내려감) */
export const DURABILITY_FLOOR = 30;

/** 데이터 용량이 꽉 찼을 때의 수집 효율 — 기획서: 50% 감소 */
export const FULL_DATA_EFFICIENCY = 0.5;

/** 값을 [min, max] 범위로 잘라내는 유틸 (파이썬의 max(min(v, hi), lo)) */
const clamp = (value: number, min = 0, max = GAUGE_MAX) =>
  Math.min(max, Math.max(min, value));

interface PetState {
  /** 배터리 (포만감) — 시간이 지나면 줄고, 0이 되면 절전 모드 (사망 없음) */
  battery: number;
  /** 내구도 (건강) — 파편 충돌로 감소 예정, 쓰다듬기로 회복 */
  durability: number;
  /** 데이터 사용량 (스트레스/배변) — 청소할수록 쌓이고, 꽉 차면 수집 효율 반감 */
  dataUsed: number;
  /** 수집한 파편 자원 — 효율 페널티 때문에 소수점 허용, 표시할 땐 내림 */
  debris: number;
  /** 경험치 — 진화(1~3단계) 시스템의 재료 */
  exp: number;

  /** [Tap] 파편 냠냠 — 자원 획득, 데이터가 쌓이고 배터리를 조금 쓴다 */
  eatDebris: () => void;
  /** [Drag] 쓰다듬기 — 내구도 수리 + 교감 */
  soothe: () => void;
  /** 기지국으로 데이터 전송 — 데이터 용량 비우기 */
  transmitData: () => void;
  /** 태양광 패널 충전 — 배터리 회복 (추후 스와이프 제스처로 발전 예정) */
  chargeSolar: () => void;
  /** 실시간 틱 — 궤도를 도는 동안 배터리가 자연 소모된다 */
  tickIdle: () => void;
}

export const usePetStore = create<PetState>((set) => ({
  // 첫 화면에서 게이지 변화를 바로 체험할 수 있도록 일부러 꽉 채우지 않은 초기값
  battery: 80,
  durability: 65,
  dataUsed: 40,
  debris: 0,
  exp: 0,

  eatDebris: () =>
    set((state) => {
      // 절전 모드(배터리 0)에서는 먹지 못한다 — 충전이 먼저!
      if (state.battery <= 0) return state;
      const efficiency =
        state.dataUsed >= GAUGE_MAX ? FULL_DATA_EFFICIENCY : 1;
      return {
        debris: state.debris + 1 * efficiency,
        dataUsed: clamp(state.dataUsed + 6),
        battery: clamp(state.battery - 2),
        exp: state.exp + 2,
      };
    }),

  soothe: () =>
    set((state) => ({
      durability: clamp(state.durability + 2),
      exp: state.exp + 1,
    })),

  transmitData: () => set({ dataUsed: 0 }),

  chargeSolar: () =>
    set((state) => ({ battery: clamp(state.battery + 18) })),

  tickIdle: () =>
    set((state) => ({ battery: clamp(state.battery - 1) })),
}));

/* ── 파생 상태 헬퍼 ──────────────────────────────
 * 저장하지 않고 그때그때 계산하는 값들.
 * "원본은 하나만 저장하고 나머지는 계산한다"가 상태 관리의 기본 원칙이다.
 */

/** 절전 모드 여부 — 배터리가 바닥나면 절전 (사망은 없다) */
export const isSleeping = (battery: number) => battery <= 0;

/** 데이터 용량 가득참 여부 — 수집 효율 반감 + 전송 유도 */
export const isDataFull = (dataUsed: number) => dataUsed >= GAUGE_MAX;
