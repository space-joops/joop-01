import { UI_SRC, type DebrisKind } from "@/components/action/sortie-assets";

/**
 * 출격 미니게임 튜닝 상수 — jd-03(STELLAPET)의 조종 미니게임 구조를 이식.
 *
 * 두 묶음으로 나눈 이유(jd-03의 설계를 그대로 계승):
 *   TUNE       — "조작감(손맛)". 게임이 손에 붙는 느낌을 만드는 값들.
 *                건드리면 게임의 성격이 변하므로 코드 리뷰를 거쳐 수정.
 *   DIFFICULTY — "난이도". 얼마나 어려운가만 조절하는 값들.
 *                밸런스 패치 때 이쪽만 만지면 조작감은 그대로 유지된다.
 *
 * 좌표 단위는 전부 실제 화면 px. jd-03은 240px 논리 해상도였지만
 * 우리는 벡터 SVG라 확대 개념이 없다 — jd-03 값에 ×1.6(≈390/240)을
 * 곱해 체감 속도를 맞춘 것이 아래 초기값이다.
 */

export const TUNE = {
  /** 조그셔틀: 스틱 최대 반경(px) — 엄지 하나가 편하게 움직이는 거리 */
  joyMax: 56,
  /** 데드존 — 이 안쪽 떨림은 무시 */
  joyDead: 6,
  /** 분사 단계 경계: <18px 1단, <36px 2단, 이상 3단 */
  levelAt: [18, 36],
  /** 단계별 추진 가속(px/s²) — 깊게 끌수록 세게, 대신 에너지도 세게 소모 */
  thrustAccel: [140, 340, 620],
  /** 우주 관성 — 속도가 서서히 잦아드는 감쇠 계수 */
  friction: 1.2,
  /** 한 번 움직이면 유지되는 최소 표류 속도 — 우주에선 완전히 멈추지 않는다 */
  minSpeed: 45,
  /** 벽 반동 계수 — 화면 밖으로 나가는 대신 튕겨 돌아온다 */
  bounce: 0.8,

  /** 획득 판정 여유(px) — 먹기는 보이는 것보다 후하게 */
  eatBonus: 8,
  /** 피격 판정은 펫 반지름을 이만큼 줄여서 — 맞기는 보이는 것보다 짜게 */
  hitShrink: 0.75,
  /** "꿀꺽" 빨려드는 연출 시간(초) */
  eatAnim: 0.16,
  /** 자석 끌어당김 속도(px/s) — 위험물은 안 끌려온다 */
  magnetPull: 90,
  /** 자석 기본 작동 반경(px, 펫 표면 기준) */
  magnetRange: 26,
  /** 피격 후 무적 시간(초) — 연속 피격의 억울함 방지 */
  invincible: 1.2,
  /** 무적 중 깜빡임 주파수(Hz) */
  blinkHz: 8,
  /** 피격 화면 흔들림 시간(초)·진폭(px) */
  shakeTime: 0.3,
  shakeAmp: 6,
  /** 시작 직후 위험물 미출현 유예(초) — 첫 인사부터 얻어맞지 않게 */
  grace: 2,
  /** dt 상한(초) — 백그라운드 복귀 시 순간이동(터널링) 방지 */
  maxDt: 0.05,
} as const;

export const DIFFICULTY = {
  /** 시작(최대) 추진 에너지 — 라운드 전용 게이지, 본체 배터리와 별개 */
  startEnergy: 100,
  /** 분사 1/2/3단 에너지 소모(/s) — 가속과의 트레이드오프가 핵심 재미 */
  thrustCosts: [2, 6, 14],
  /** 태양전지 파편 리필량 */
  cellRefill: 25,
  /** 고속 파편 피격 시 에너지 손실 */
  hazardDamage: 15,
  /** 스폰 간격 기준(초) — 리듬이 외워지지 않게 ±30% 지터 */
  spawnBase: 0.45,
  /** 에너지 0 이후 관성 표류 유예(초) — 이 안에 태양전지를 먹으면 재점화 */
  driftGrace: 4,
  /** 화면 위 동시 엔티티 상한 — 저사양 기기 보호 */
  maxEntities: 40,
} as const;

/**
 * 파편 종류별 스탯. 보상 티어(기획서의 파편 등급)를 SVG 8종에 배분:
 *   소형(chip·bolt·nut)         가치 1 · EXP 2  — 흔하고 가벼운 조각들
 *   중형(gear·antenna_piece)    가치 3 · EXP 5  — 가끔 나오는 알짜 부품
 *   대형(fuel_tank)             가치 8 · EXP 12 — 느리고 큼직한 대어
 *   태양전지(solar_fragment)    에너지 +25      — 표류 중이면 "재점화!"
 *   고속 파편(shard)            위험물 — 닿으면 에너지 -15 + 내구도 손상
 *
 * radius는 충돌 판정 반지름(px), img는 화면 표시 크기(px),
 * speed는 진입 속도 범위(px/s), weight는 스폰 가중치(shard는 구역이 결정).
 */
export interface KindStat {
  radius: number;
  img: number;
  speed: [number, number];
  debris: number;
  exp: number;
  weight: number;
}

export const KIND_STAT: Record<DebrisKind, KindStat> = {
  chip: { radius: 13, img: 34, speed: [72, 128], debris: 1, exp: 2, weight: 30 },
  bolt: { radius: 14, img: 38, speed: [64, 109], debris: 1, exp: 2, weight: 16 },
  nut: { radius: 14, img: 36, speed: [66, 112], debris: 1, exp: 2, weight: 14 },
  gear: { radius: 17, img: 46, speed: [56, 92], debris: 3, exp: 5, weight: 12 },
  antenna_piece: { radius: 17, img: 46, speed: [58, 96], debris: 3, exp: 5, weight: 8 },
  fuel_tank: { radius: 23, img: 60, speed: [48, 72], debris: 8, exp: 12, weight: 6 },
  solar_fragment: { radius: 16, img: 42, speed: [64, 96], debris: 0, exp: 0, weight: 12 },
  shard: { radius: 15, img: 40, speed: [104, 176], debris: 0, exp: 0, weight: 0 },
};

/**
 * 위험 수당제 — 출격 전 브리핑에서 고르는 작업 구역 3종 (기획서 V3).
 * 위험한 구역일수록 보상 배율이 크고, 고속 파편이 잦고 빠르다.
 * 원칙 9: 유저에겐 물리 용어(LEO 등) 대신 친숙한 이름만 보여준다.
 */
export interface RiskZone {
  id: "safe" | "standard" | "close";
  name: string;
  desc: string;
  /** 귀환 정산 시 파편·EXP에 곱하는 보상 배율 */
  mul: number;
  /** 고속 파편(shard) 스폰 가중치 */
  hazardWeight: number;
  /** 고속 파편 속도 배율 */
  hazardSpeedMul: number;
  badge: string;
}

export const RISK_ZONES: RiskZone[] = [
  {
    id: "safe",
    name: "안전 구역",
    desc: "한적한 항로 — 느긋하게 줍기 좋아요",
    mul: 1.0,
    hazardWeight: 12,
    hazardSpeedMul: 1.0,
    badge: UI_SRC.riskSafe,
  },
  {
    id: "standard",
    name: "표준 구역",
    desc: "적당히 붐비는 작업 구역",
    mul: 1.5,
    hazardWeight: 18,
    hazardSpeedMul: 1.15,
    badge: UI_SRC.riskStandard,
  },
  {
    id: "close",
    name: "밀집 구역",
    desc: "파편이 쏟아지는 위험 지대 — 수당 두 배!",
    mul: 2.0,
    hazardWeight: 28,
    hazardSpeedMul: 1.3,
    badge: UI_SRC.riskClose,
  },
];
