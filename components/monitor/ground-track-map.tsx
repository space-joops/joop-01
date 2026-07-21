"use client";

import { useMemo } from "react";
import {
  GROUND_STATION,
  PERIOD_S,
  coverageRadiusDeg,
  sphericalCircle,
  subpointAt,
  subsolarAt,
  terminatorLat,
  type GeoPoint,
} from "@/components/monitor/orbit-math";
import { CONTINENTS } from "@/components/monitor/world-map-data";

/**
 * GROUND TRACK — 평면(등장방형) 세계지도 위의 궤도 자취.
 *
 * 등장방형 투영은 사실 투영이랄 것도 없다: x = 경도, y = 위도 그대로.
 * viewBox를 360×180으로 잡으면 위경도가 곧 SVG 좌표가 된다.
 * 지난 반 바퀴는 실선, 다음 한 바퀴는 점선 — "어디서 와서 어디로 가는지".
 */

const W = 360;
const H = 180;

/** 위경도 → SVG 좌표 */
const toXY = (p: GeoPoint) => ({ x: p.lon + 180, y: 90 - p.lat });

/**
 * 위경도 점열 → 폴리라인 path 문자열 목록.
 * 날짜변경선(±180°)을 넘는 순간 x가 340쯤 점프하므로 그 지점에서 선을 끊는다.
 */
function toPaths(points: GeoPoint[]): string[] {
  const paths: string[] = [];
  let d = "";
  let prevX: number | null = null;
  for (const p of points) {
    const { x, y } = toXY(p);
    if (prevX !== null && Math.abs(x - prevX) > 180) d = flush(d, paths);
    d += d === "" ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    prevX = x;
  }
  flush(d, paths);
  return paths;
}
const flush = (d: string, out: string[]) => {
  if (d.includes("L")) out.push(d);
  return "";
};

/** 대륙 폴리곤 → 닫힌 path (지도 데이터는 날짜변경선을 걸치지 않게 만들어져 있다) */
const continentPaths = CONTINENTS.map(({ points }) =>
  points
    .map(([lon, lat], i) => {
      const { x, y } = toXY({ lon, lat });
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ") + " Z",
);

export default function GroundTrackMap({ now }: { now: number }) {
  const sub = subpointAt(now);
  const subXY = toXY(sub);

  // 자취: 지난 반 바퀴(실선) + 다음 한 바퀴(점선). 20초 스텝이면 충분히 매끈하다.
  const { pastPaths, futurePaths } = useMemo(() => {
    const step = 20_000;
    const past: GeoPoint[] = [];
    for (let t = now - (PERIOD_S / 2) * 1000; t <= now; t += step)
      past.push(subpointAt(t));
    const future: GeoPoint[] = [];
    for (let t = now; t <= now + PERIOD_S * 1000; t += step)
      future.push(subpointAt(t));
    return { pastPaths: toPaths(past), futurePaths: toPaths(future) };
    // 500ms마다 다시 그릴 필요는 없다 — 10초 단위로만 갱신
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 10_000)]);

  // 밤 반구 음영: 경계 위도 곡선 + (태양이 북반구면) 남극 쪽으로 닫는다
  const nightPath = useMemo(() => {
    const sun = subsolarAt(now);
    let d = "";
    for (let lon = -180; lon <= 180; lon += 5) {
      const y = 90 - terminatorLat(lon, sun);
      d += `${d === "" ? "M" : "L"}${lon + 180} ${y.toFixed(1)} `;
    }
    const poleY = sun.lat > 0 ? H : 0; // 밤은 태양 반대쪽 극을 포함한다
    return `${d}L${W} ${poleY} L0 ${poleY} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 60_000)]);

  // 기지국 커버리지 (앙각 10° 원)
  const coveragePaths = useMemo(
    () => toPaths(sphericalCircle(GROUND_STATION, coverageRadiusDeg())),
    [],
  );
  const gsXY = toXY(GROUND_STATION);

  const utc = new Date(now).toISOString().slice(11, 19);

  return (
    <section className="rounded-3xl border border-panel-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em]">
        <span className="text-foreground/60">GROUND TRACK</span>
        <span className="font-mono text-foreground/40">UTC {utc}</span>
      </header>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl"
        role="img"
        aria-label="줍이의 지상 자취 세계지도"
      >
        {/* 바다 */}
        <rect width={W} height={H} fill="#0C1430" />
        {/* 위경도 격자 (30°) */}
        <g stroke="#1B2A50" strokeWidth="0.4">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 30} y1={0} x2={(i + 1) * 30} y2={H} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={(i + 1) * 30} x2={W} y2={(i + 1) * 30} />
          ))}
        </g>
        {/* 대륙 실루엣 */}
        <g fill="#1D2E56" stroke="#2C4270" strokeWidth="0.5" strokeLinejoin="round">
          {continentPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* 밤 반구 */}
        <path d={nightPath} fill="#020510" opacity="0.45" />
        {/* 기지국 커버리지 + 마커 */}
        <g stroke="#5EC8E8" fill="none" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.8">
          {coveragePaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g>
          <path
            d={`M${gsXY.x} ${gsXY.y - 3} L${gsXY.x - 2.6} ${gsXY.y + 2} L${gsXY.x + 2.6} ${gsXY.y + 2} Z`}
            fill="#5EC8E8"
          />
          <text x={gsXY.x + 4} y={gsXY.y + 2} fontSize="6" fill="#5EC8E8">
            관제소
          </text>
        </g>
        {/* 자취: 다음 한 바퀴(점선) → 지난 반 바퀴(실선) 순서로 겹침 */}
        <g stroke="#4CAE78" fill="none" strokeWidth="1" strokeDasharray="2.5 2.5" opacity="0.65">
          {futurePaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke="#7EE8A2" fill="none" strokeWidth="1.3">
          {pastPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* 줍이 마커 — 동심원 + 라벨 */}
        <g>
          <circle cx={subXY.x} cy={subXY.y} r="7" fill="none" stroke="#7EE8A2" strokeWidth="0.7" opacity="0.5">
            <animate attributeName="r" values="5;9;5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={subXY.x} cy={subXY.y} r="4.2" fill="none" stroke="#7EE8A2" strokeWidth="0.8" opacity="0.8" />
          <circle cx={subXY.x} cy={subXY.y} r="2" fill="#7EE8A2" />
          <text
            x={subXY.x}
            y={subXY.y - 9}
            fontSize="7"
            fontWeight="bold"
            fill="#7EE8A2"
            textAnchor="middle"
          >
            줍이
          </text>
        </g>
      </svg>
    </section>
  );
}
