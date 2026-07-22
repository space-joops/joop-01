"use client";

import {
  ORBIT_ALT,
  ORBIT_VEL,
  PERIOD_S,
  isSunlit,
  revAt,
  stationViewAt,
  subpointAt,
} from "@/components/monitor/orbit-math";

/**
 * TELEMETRY — 줍이의 현재 궤도 수치 3×3 타일.
 * 라벨은 관제 콘솔 연출로 영문 축약(LAT/LON…)을 쓰되, 값은 전부
 * orbit-math에서 유도된다 (고도·속도·주기는 궤도 상수의 자동 결과).
 */

function Tile({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "danger" | "ok";
}) {
  return (
    <div className="rounded-xl border border-panel-border bg-background/50 px-3 py-2.5">
      <p className="text-[9px] font-semibold tracking-[0.18em] text-data/80">
        {label}
      </p>
      <p
        className={`mt-0.5 font-mono text-sm font-bold ${
          tone === "danger"
            ? "text-foreground/45"
            : tone === "ok"
              ? "text-emerald-300"
              : ""
        }`}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[10px] font-normal text-foreground/45">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export default function TelemetryPanel({ now }: { now: number }) {
  const sub = subpointAt(now);
  const view = stationViewAt(now);
  const sunlit = isSunlit(now);

  return (
    <section className="rounded-3xl border border-panel-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em]">
        <span className="text-foreground/60">TELEMETRY · 줍이</span>
        <span className={sunlit ? "text-amber-300" : "text-indigo-300"}>
          {sunlit ? "☀ SUNLIT" : "◑ ECLIPSE"}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Tile label="LAT" value={sub.lat.toFixed(2)} unit="°" />
        <Tile
          label="LON"
          value={`${sub.lon >= 0 ? "+" : ""}${sub.lon.toFixed(2)}`}
          unit="°"
        />
        <Tile label="ALT" value={String(ORBIT_ALT)} unit="km" />
        <Tile label="VEL" value={ORBIT_VEL.toFixed(2)} unit="km/s" />
        <Tile label="PERIOD" value={(PERIOD_S / 60).toFixed(1)} unit="min" />
        <Tile label="REV" value={`#${revAt(now)}`} />
        <Tile label="ELEV @GS" value={view.elev.toFixed(1)} unit="°" />
        <Tile label="RANGE @GS" value={String(Math.round(view.range))} unit="km" />
        <Tile
          label="LINK"
          value={view.linked ? "LINK OK" : "NO SIGNAL"}
          tone={view.linked ? "ok" : "danger"}
        />
      </div>
    </section>
  );
}
