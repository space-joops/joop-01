/**
 * 궤도 수학 (케플러 라이트) — 관제 모니터링 화면의 두뇌.
 *
 * 줍이의 궤도를 "원궤도 + 지구 자전 보정"으로 계산한다. 진짜 SGP4가 아니라
 * 케플러 제3법칙 수준의 근사지만, 지상 자취(사인 곡선)·기지국 패스·밤낮
 * 구분 같은 관제 화면의 재미는 전부 이 수준에서 나온다.
 *
 * 전부 순수 함수 — 시각(ms)을 넣으면 상태가 나온다. 고정 epoch 기준
 * 결정론이라 언제 접속해도 궤도가 이어져 보인다. 게임 보상과 무관한
 * 시각화 전용이므로 클라이언트 시계를 써도 안전하다(원칙 4는 보상 계산 대상).
 */

/** 지구 반경(km) */
export const EARTH_R = 6371;
/** 줍이 궤도 고도(km) — ISS와 같은 저궤도 */
export const ORBIT_ALT = 420;
/** 궤도 반경(km) */
export const ORBIT_A = EARTH_R + ORBIT_ALT;
/** 표준 중력 매개변수 μ (km³/s²) */
const MU = 398600.4418;
/** 궤도 경사각(도) — ISS와 같은 51.6° */
export const INCLINATION_DEG = 51.6;
/** 궤도 기준 시각 — 이 순간 줍이는 승교점(적도를 북쪽으로 지나는 점)에 있었다 */
const EPOCH_MS = Date.UTC(2026, 6, 1, 0, 0, 0);
/** epoch 시점 승교점 경도(도) — 한국 상공 근처에서 여정을 시작했다는 설정 */
const LON_AT_EPOCH = 127;
/** 항성일(초) — 지구가 별 기준으로 한 바퀴 도는 시간 */
const SIDEREAL_DAY_S = 86164;

/** 궤도 주기(초) — 케플러 제3법칙 T = 2π√(a³/μ) ≈ 92.8분 */
export const PERIOD_S = 2 * Math.PI * Math.sqrt(ORBIT_A ** 3 / MU);
/** 궤도 속도(km/s) — 원궤도 v = √(μ/a) ≈ 7.66 */
export const ORBIT_VEL = Math.sqrt(MU / ORBIT_A);

/** 기지국 — 클리어 스카이 관제소 (서울) */
export const GROUND_STATION = {
  name: "클리어 스카이 관제소",
  lat: 37.55,
  lon: 126.97,
};
/** 링크 성립 최소 앙각(도) */
export const MIN_LINK_ELEV = 10;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** 경도를 [-180, 180) 범위로 접는다 */
export const wrapLon = (lon: number) => {
  let x = ((lon + 180) % 360 + 360) % 360;
  return x - 180;
};

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** 시각 t(ms)의 줍이 직하점(nadir) 위경도 */
export function subpointAt(timeMs: number): GeoPoint {
  const t = (timeMs - EPOCH_MS) / 1000;
  const theta = ((t % PERIOD_S) / PERIOD_S) * 2 * Math.PI;
  const inc = INCLINATION_DEG * DEG;
  const lat = Math.asin(Math.sin(inc) * Math.sin(theta)) * RAD;
  // 관성계 경도 → 지구 자전만큼 서쪽으로 밀리며 자취가 사인 곡선이 된다
  const lonInertial = Math.atan2(
    Math.cos(inc) * Math.sin(theta),
    Math.cos(theta),
  ) * RAD;
  const earthSpin = (t / SIDEREAL_DAY_S) * 360;
  return { lat, lon: wrapLon(lonInertial + LON_AT_EPOCH - earthSpin) };
}

/** epoch 이후 몇 바퀴째인가 (REV 카운터) */
export function revAt(timeMs: number): number {
  return Math.floor((timeMs - EPOCH_MS) / 1000 / PERIOD_S);
}

/** 두 위경도 점 사이의 중심각(도) — 구면 코사인 법칙 */
export function angularDistance(a: GeoPoint, b: GeoPoint): number {
  const c =
    Math.sin(a.lat * DEG) * Math.sin(b.lat * DEG) +
    Math.cos(a.lat * DEG) *
      Math.cos(b.lat * DEG) *
      Math.cos((a.lon - b.lon) * DEG);
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD;
}

/** 태양 직하점 근사 — UTC 시각이 경도를, 날짜가 적위(계절)를 정한다 */
export function subsolarAt(timeMs: number): GeoPoint {
  const d = new Date(timeMs);
  const utcFrac =
    (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) /
    86400;
  const lon = wrapLon(180 - utcFrac * 360);
  const dayOfYear =
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(d.getUTCFullYear(), 0, 1)) /
      86400000 +
    1;
  const lat = 23.44 * Math.sin(((dayOfYear - 80) / 365) * 2 * Math.PI);
  return { lat, lon };
}

/** 줍이가 햇빛을 받고 있나 — 지구 그림자 원뿔 근사 */
export function isSunlit(timeMs: number): boolean {
  const horizon = Math.acos(EARTH_R / ORBIT_A) * RAD; // 궤도에서 보는 지평 여유각 ≈ 20°
  return angularDistance(subpointAt(timeMs), subsolarAt(timeMs)) < 90 + horizon;
}

export interface StationView {
  /** 기지국에서 본 앙각(도) — 음수면 지평선 아래 */
  elev: number;
  /** 슬랜트 거리(km) */
  range: number;
  /** 링크 성립 여부 (앙각 ≥ 10°) */
  linked: boolean;
}

/** 기지국에서 본 줍이 — 앙각·거리·링크 */
export function stationViewAt(timeMs: number): StationView {
  const psi = angularDistance(subpointAt(timeMs), GROUND_STATION) * DEG;
  const elev =
    Math.atan2(Math.cos(psi) - EARTH_R / ORBIT_A, Math.sin(psi)) * RAD;
  const range = Math.sqrt(
    EARTH_R ** 2 + ORBIT_A ** 2 - 2 * EARTH_R * ORBIT_A * Math.cos(psi),
  );
  return { elev, range, linked: elev >= MIN_LINK_ELEV };
}

/** 기지국 커버리지(앙각 10° 기준)의 지상 반경 중심각(도): ψ = acos(R/a·cosε) − ε */
export const coverageRadiusDeg = () => {
  const eps = MIN_LINK_ELEV * DEG;
  return (Math.acos((EARTH_R / ORBIT_A) * Math.cos(eps)) - eps) * RAD;
};

/** 어떤 점 중심의 구면 원(각반경 ψ°)을 위경도 폴리라인으로 — 커버리지 표시용 */
export function sphericalCircle(
  center: GeoPoint,
  radiusDeg: number,
  steps = 72,
): GeoPoint[] {
  const points: GeoPoint[] = [];
  const phi = center.lat * DEG;
  const psi = radiusDeg * DEG;
  for (let k = 0; k <= steps; k++) {
    const bearing = (k / steps) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(phi) * Math.cos(psi) +
        Math.cos(phi) * Math.sin(psi) * Math.cos(bearing),
    );
    const lon =
      center.lon * DEG +
      Math.atan2(
        Math.sin(bearing) * Math.sin(psi) * Math.cos(phi),
        Math.cos(psi) - Math.sin(phi) * Math.sin(lat),
      );
    points.push({ lat: lat * RAD, lon: wrapLon(lon * RAD) });
  }
  return points;
}

export interface Pass {
  /** 패스 시작(ms) */
  startMs: number;
  /** 지속(초) */
  durationS: number;
  /** 최대 앙각(도) */
  maxElev: number;
}

/**
 * 24시간 패스 예측 — 30초 스텝 스캔(2,880회, 마운트 시 1회면 충분).
 * 앙각이 MIN_LINK_ELEV를 넘는 구간의 시작·지속·최대앙각을 뽑는다.
 */
export function predictPasses(
  fromMs: number,
  hours = 24,
  stepS = 30,
  maxCount = 4,
): Pass[] {
  const passes: Pass[] = [];
  let current: { start: number; maxElev: number } | null = null;
  const end = fromMs + hours * 3600 * 1000;
  for (let t = fromMs; t <= end; t += stepS * 1000) {
    const { elev } = stationViewAt(t);
    if (elev >= MIN_LINK_ELEV) {
      if (!current) current = { start: t, maxElev: elev };
      else current.maxElev = Math.max(current.maxElev, elev);
    } else if (current) {
      passes.push({
        startMs: current.start,
        durationS: (t - current.start) / 1000,
        maxElev: current.maxElev,
      });
      current = null;
      if (passes.length >= maxCount) break;
    }
  }
  return passes;
}

/**
 * 밤낮 경계선(terminator) — 경도별 경계 위도.
 * 태양 직하점과 90° 떨어진 대원: tanφ = −cos(λ−λs)/tanφs
 */
export function terminatorLat(lon: number, subsolar: GeoPoint): number {
  // 적위가 0에 가까우면 경계가 자오선이 된다 — 발산 방지 클램프
  const phiS = Math.max(0.5, Math.abs(subsolar.lat)) * Math.sign(subsolar.lat || 1) * DEG;
  return Math.atan(-Math.cos((lon - subsolar.lon) * DEG) / Math.tan(phiS)) * RAD;
}
