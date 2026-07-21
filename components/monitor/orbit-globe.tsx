"use client";

import { useMemo } from "react";
import {
  GROUND_STATION,
  coverageRadiusDeg,
  sphericalCircle,
  subpointAt,
  type GeoPoint,
} from "@/components/monitor/orbit-math";
import { CONTINENTS } from "@/components/monitor/world-map-data";

/**
 * ORBIT VIEW — 줍이 직하점을 정면에 둔 정사영(orthographic) 지구본.
 *
 * 정사영은 "아주 멀리서 지구를 바라본 모습"이다. 직하점(위도 φ₀, 경도 λ₀)을
 * 화면 중앙에 두면:
 *   x = cosφ·sin(λ−λ₀)
 *   y = cosφ₀·sinφ − sinφ₀·cosφ·cos(λ−λ₀)
 *   보이는 조건: cos c = sinφ₀·sinφ + cosφ₀·cosφ·cos(λ−λ₀) > 0
 * 뒷반구 정점은 원판 가장자리(림)로 밀어붙여 실루엣을 닫는다.
 * 지구본이 줍이를 따라 도니, 줍이 마커는 항상 화면 중앙이다.
 */

const SIZE = 220;
const C = SIZE / 2;
const R = 96;
const DEG = Math.PI / 180;

interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

function project(p: GeoPoint, center: GeoPoint): Projected {
  const phi = p.lat * DEG;
  const phi0 = center.lat * DEG;
  const dLam = (p.lon - center.lon) * DEG;
  const cosc =
    Math.sin(phi0) * Math.sin(phi) +
    Math.cos(phi0) * Math.cos(phi) * Math.cos(dLam);
  let x = Math.cos(phi) * Math.sin(dLam);
  let y =
    Math.cos(phi0) * Math.sin(phi) -
    Math.sin(phi0) * Math.cos(phi) * Math.cos(dLam);
  if (cosc < 0) {
    // 뒷반구 — 림(가장자리)으로 밀어서 대륙 실루엣이 찢기지 않게 한다
    const len = Math.hypot(x, y);
    if (len < 1e-6) return { x: C, y: C, visible: false };
    x /= len;
    y /= len;
  }
  return { x: C + x * R, y: C - y * R, visible: cosc > 0 };
}

/** 점열 → 보이는 구간만 이어붙인 폴리라인 path 목록 */
function visiblePaths(points: GeoPoint[], center: GeoPoint): string[] {
  const paths: string[] = [];
  let d = "";
  for (const p of points) {
    const pr = project(p, center);
    if (!pr.visible) {
      if (d.includes("L")) paths.push(d);
      d = "";
      continue;
    }
    d += d === "" ? `M${pr.x.toFixed(1)} ${pr.y.toFixed(1)}` : ` L${pr.x.toFixed(1)} ${pr.y.toFixed(1)}`;
  }
  if (d.includes("L")) paths.push(d);
  return paths;
}

export default function OrbitGlobe({ now }: { now: number }) {
  const sub = subpointAt(now);

  // 대륙: 전 정점이 뒷반구인 폴리곤은 통째로 생략
  const landPaths = useMemo(() => {
    const out: string[] = [];
    for (const { points } of CONTINENTS) {
      const projected = points.map(([lon, lat]) =>
        project({ lon, lat }, sub),
      );
      if (!projected.some((p) => p.visible)) continue;
      out.push(
        projected
          .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ") + " Z",
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 5_000)]);

  // 위경도 격자 (20°)
  const graticule = useMemo(() => {
    const lines: GeoPoint[][] = [];
    for (let lat = -60; lat <= 60; lat += 20) {
      const line: GeoPoint[] = [];
      for (let lon = -180; lon <= 180; lon += 5) line.push({ lat, lon });
      lines.push(line);
    }
    for (let lon = -180; lon < 180; lon += 20) {
      const line: GeoPoint[] = [];
      for (let lat = -85; lat <= 85; lat += 5) line.push({ lat, lon });
      lines.push(line);
    }
    return lines.flatMap((line) => visiblePaths(line, sub));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 5_000)]);

  // 최근 40분 자취
  const trailPaths = useMemo(() => {
    const points: GeoPoint[] = [];
    for (let t = now - 40 * 60_000; t <= now; t += 30_000)
      points.push(subpointAt(t));
    return visiblePaths(points, sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(now / 5_000)]);

  // 기지국 (보일 때만)
  const gs = project(GROUND_STATION, sub);
  const gsCoverage = useMemo(
    () =>
      visiblePaths(sphericalCircle(GROUND_STATION, coverageRadiusDeg()), sub),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(now / 5_000)],
  );

  const nadir = `NADIR ${sub.lat >= 0 ? "N" : "S"}${Math.abs(sub.lat).toFixed(2)}° · ${
    sub.lon >= 0 ? "E" : "W"
  }${Math.abs(sub.lon).toFixed(2)}°`;

  return (
    <section className="rounded-3xl border border-panel-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em]">
        <span className="text-foreground/60">ORBIT VIEW</span>
        <span className="text-emerald-300/80">LIVE</span>
      </header>

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto w-full max-w-[300px]"
        role="img"
        aria-label="줍이 직하점 중심의 지구본"
      >
        <defs>
          <radialGradient id="globe-shade" cx="0.38" cy="0.32" r="0.95">
            <stop offset="0" stopColor="#16224A" />
            <stop offset="0.7" stopColor="#0C1430" />
            <stop offset="1" stopColor="#070C20" />
          </radialGradient>
        </defs>
        {/* 지구 원판 */}
        <circle cx={C} cy={C} r={R} fill="url(#globe-shade)" stroke="#2C4270" strokeWidth="1.2" />
        {/* 격자 */}
        <g stroke="#22335E" strokeWidth="0.4" fill="none">
          {graticule.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* 대륙 */}
        <g fill="#1D2E56" stroke="#2C4270" strokeWidth="0.5" strokeLinejoin="round">
          {landPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* 기지국 커버리지·마커 */}
        <g stroke="#5EC8E8" fill="none" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.8">
          {gsCoverage.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {gs.visible && (
          <path
            d={`M${gs.x} ${gs.y - 3.4} L${gs.x - 3} ${gs.y + 2.2} L${gs.x + 3} ${gs.y + 2.2} Z`}
            fill="#5EC8E8"
          />
        )}
        {/* 최근 자취 */}
        <g stroke="#7EE8A2" fill="none" strokeWidth="1.4" opacity="0.9">
          {trailPaths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {/* 줍이 — 직하점 중심이라 항상 정중앙 */}
        <g>
          <circle cx={C} cy={C} r="12" fill="none" stroke="#7EE8A2" strokeWidth="0.8" opacity="0.45">
            <animate attributeName="r" values="9;15;9" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={C} cy={C} r="7" fill="none" stroke="#7EE8A2" strokeWidth="1" opacity="0.8" />
          <circle cx={C} cy={C} r="3.2" fill="#7EE8A2" />
          <text x={C} y={C - 17} fontSize="10" fontWeight="bold" fill="#7EE8A2" textAnchor="middle">
            줍이
          </text>
        </g>
      </svg>

      <p className="mt-3 text-center font-mono text-xs tracking-[0.15em] text-foreground/60">
        {nadir}
      </p>
    </section>
  );
}
