/**
 * 다면체(로우폴리) 지구 — 컷신의 시각적 정체성 담당.
 *
 * "완벽한 구체가 아닌 다면체 형태의 지구"(시나리오 문서)를
 * 삼각형 조각(facet)들로 표현한다. 조각 배치는 모듈 로드 시점에
 * 한 번만 계산되는 결정적(deterministic) 값이라 hydration도 안전하다.
 */

const CX = 200;
const CY = 208;
const R_OUTER = 190;
const R_INNER = 106;

/** 극좌표 → 직교좌표 (파이썬의 cmath.rect와 같은 역할) */
function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
}

/** 바다/육지/빙하 팔레트 — 인덱스 공식으로 섞어 대륙 느낌을 낸다 */
const FACET_COLORS = [
  "#1e40af", // 깊은 바다
  "#0e7490", // 얕은 바다
  "#2563eb", // 바다
  "#059669", // 육지(숲)
  "#1d4ed8", // 바다
  "#10b981", // 육지(초원)
  "#1e3a8a", // 심해
  "#0891b2", // 연안
];

/* 위쪽 반구(180°~360°)를 부채꼴로 쪼개 삼각형 팬을 만든다 */
const OUTER = Array.from({ length: 9 }, (_, k) => polar(R_OUTER, 180 + k * 22.5));
const INNER = Array.from({ length: 8 }, (_, k) =>
  polar(R_INNER, 180 + (k + 0.5) * 22.5),
);

const FACETS: { points: string; fill: string }[] = [];
for (let k = 0; k < 8; k++) {
  // 바깥 고리 삼각형 (지평선 쪽)
  FACETS.push({
    points: `${OUTER[k]} ${OUTER[k + 1]} ${INNER[k]}`,
    fill: FACET_COLORS[(k * 3 + 1) % 8],
  });
}
for (let k = 0; k < 7; k++) {
  // 고리 사이를 채우는 역방향 삼각형
  FACETS.push({
    points: `${INNER[k]} ${INNER[k + 1]} ${OUTER[k + 1]}`,
    fill: FACET_COLORS[(k * 5 + 4) % 8],
  });
  // 안쪽(정수리) 삼각형
  FACETS.push({
    points: `${INNER[k]} ${INNER[k + 1]} ${CX},${CY}`,
    fill: FACET_COLORS[(k * 7 + 2) % 8],
  });
}

export default function FacetedEarth({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 210" className={className} aria-hidden>
      {/* 대기권 미광 */}
      <path
        d="M6 208 A194 194 0 0 1 394 208"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="5"
        opacity="0.35"
      />
      {/* 밑바탕 반원 — 삼각형 틈이 비쳐도 구멍이 안 나게 */}
      <path d="M10 208 A190 190 0 0 1 390 208 Z" fill="#1e3a8a" />
      {FACETS.map((facet, i) => (
        <polygon
          key={i}
          points={facet.points}
          fill={facet.fill}
          stroke="#0b1c4d"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
