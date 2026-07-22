import type { PetVariant } from "@/lib/supabase/types";

/**
 * 출격(액션 모드) SVG 에셋 경로 모음.
 *
 * 원본은 `plan/img/satellite pet svg pack.zip` — 그중 게임에 필요한 파일만
 * `public/game/` 아래에 배치했다 (에셋 팩 README에 규격·팔레트 문서화됨).
 * 규격: 캐릭터 256×256(중심 128,130), 파편·이펙트·UI 96×96(중심 48,48),
 * 배경 1080×1920 세로. 전부 벡터라 어떤 배율로 띄워도 선명하다.
 */

/** 파편(수집물·위험물·태양전지) 스프라이트 — 96×96 */
export const DEBRIS_SRC = {
  chip: "/game/debris/chip.svg",
  bolt: "/game/debris/bolt.svg",
  nut: "/game/debris/nut.svg",
  gear: "/game/debris/gear.svg",
  antenna_piece: "/game/debris/antenna_piece.svg",
  fuel_tank: "/game/debris/fuel_tank.svg",
  solar_fragment: "/game/debris/solar_fragment.svg",
  shard: "/game/debris/shard.svg",
} as const;

export type DebrisKind = keyof typeof DEBRIS_SRC;

/** 이펙트 — 96×96 */
export const FX_SRC = {
  collectRing: "/game/fx/fx_collect_ring.svg",
  alert: "/game/fx/fx_alert.svg",
  sparkle: "/game/fx/fx_sparkle.svg",
  magnetField: "/game/fx/fx_magnet_field.svg",
  netThrow: "/game/fx/fx_net_throw.svg",
  laserBeam: "/game/fx/fx_laser_beam.svg",
  zzz: "/game/fx/fx_zzz.svg",
} as const;

/** HUD·브리핑 UI 아이콘 — 96×96 */
export const UI_SRC = {
  statBattery: "/game/ui/stat_battery.svg",
  coinScrap: "/game/ui/coin_scrap.svg",
  riskSafe: "/game/ui/risk_safe.svg",
  riskStandard: "/game/ui/risk_standard.svg",
  riskClose: "/game/ui/risk_close.svg",
  gestureDrag: "/game/ui/gesture_drag.svg",
} as const;

/** 세로(9:16) 우주 배경 */
export const BG_SPACE_SRC = "/game/bg/bg_space_portrait.svg";

/** 배경 궤도 연출(플라이바이) 기체 하나의 사양 */
export interface AmbientCraft {
  src: string;
  /** 표시 기준 크기(px) — 에셋 종횡비에 맞춘 값 */
  w: number;
  h: number;
  /** 최대 접근 배율 — 기체의 실제 덩치感을 여기서 낸다 (ISS가 가장 크다) */
  scaleTo: number;
  /** 등장 가중치 */
  weight: number;
}

/**
 * 플라이바이 함대 — 우주 덕후 팬서비스: 실존 우주선들이 궤도를 지나간다.
 * 전부 게임플레이와 무관한 장식. 가중치 뽑기로 한 기씩 등장한다.
 */
export const AMBIENT_FLEET: AmbientCraft[] = [
  // 이름 없는 통신위성 — 궤도의 흔한 이웃
  { src: "/game/bg/flyby_satellite.svg", w: 144, h: 72, scaleTo: 2.2, weight: 3 },
  // 스타링크형 플랫 패널 위성 — 요즘 궤도에서 가장 자주 마주치는 얼굴
  { src: "/game/bg/flyby_starlink.svg", w: 150, h: 105, scaleTo: 2.0, weight: 3 },
  // 국제우주정거장 — 가장 크고 장엄한 플라이바이
  { src: "/game/bg/flyby_iss.svg", w: 208, h: 104, scaleTo: 2.7, weight: 2 },
  // 허블 우주망원경 — 은박 경통과 열린 조리개 도어
  { src: "/game/bg/flyby_hubble.svg", w: 176, h: 66, scaleTo: 2.3, weight: 2 },
  // 스푸트니크 1호 — 최초의 인공위성, 작지만 반짝인다
  { src: "/game/bg/flyby_sputnik.svg", w: 96, h: 96, scaleTo: 1.7, weight: 2 },
  // 제임스 웹 우주망원경 — 금빛 육각 거울의 주인공
  { src: "/game/bg/flyby_jwst.svg", w: 150, h: 100, scaleTo: 2.4, weight: 2 },
];

/**
 * 에셋 팩의 감정 프리베이크 6종 — 파일명 접미사(`이름__감정.svg`)와 일치.
 * 생략(undefined)이면 평상(normal) 포즈.
 */
export type PetEmotion =
  | "happy"
  | "low_battery"
  | "data_full"
  | "sulky"
  | "powersave"
  | "hibernate";

/**
 * 진화 단계·장비 분기·감정에 맞는 펫 스티커 경로.
 * 감정별 포즈(안테나 처짐·날개 접힘·눈빛)는 팩에 미리 구워져 있어
 * 파일 스왑만으로 기분 연출이 된다.
 */
export function petSprite(
  level: number,
  variant: PetVariant | null,
  emotion?: PetEmotion,
): string {
  const name =
    level >= 3
      ? `pet_stage3_${variant ?? "net"}`
      : level === 2
        ? "pet_stage2_junior"
        : "pet_stage1_baby";
  return `/game/pet/${name}${emotion ? `__${emotion}` : ""}.svg`;
}

/**
 * 출격 전에 브라우저 캐시에 실어 둘 파일 목록.
 * 브리핑 화면에서 `new Image()`로 워밍하면 플레이 첫 프레임에
 * 스프라이트가 늦게 뜨는 깜빡임이 없다.
 */
export function preloadList(level: number, variant: PetVariant | null): string[] {
  return [
    petSprite(level, variant),
    petSprite(level, variant, "happy"),
    ...Object.values(DEBRIS_SRC),
    ...Object.values(FX_SRC),
    ...Object.values(UI_SRC),
    BG_SPACE_SRC,
    ...AMBIENT_FLEET.map((craft) => craft.src),
  ];
}
