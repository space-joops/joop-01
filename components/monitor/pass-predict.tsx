"use client";

import { MIN_LINK_ELEV, type Pass } from "@/components/monitor/orbit-math";

/**
 * PASS PREDICT — 24시간 내 기지국 상공 통과(패스) 예측.
 * 다음 패스까지 카운트다운 + 목록. ★는 최대 고도각 45° 이상의 특급 패스.
 * (지금은 볼거리 — 특급 패스 보상 연동은 후속 과제)
 */

const STAR_ELEV = 45;

const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `T-${hh}:${mm}:${ss}`;
};

const fmtTime = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
};

export default function PassPredict({
  now,
  passes,
}: {
  now: number;
  passes: Pass[];
}) {
  const next = passes.find((p) => p.startMs + p.durationS * 1000 > now);
  const inPass = next && next.startMs <= now;

  return (
    <section className="rounded-3xl border border-panel-border bg-panel p-4">
      <header className="mb-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.2em]">
        <span className="text-foreground/60">PASS PREDICT · 24H</span>
        <span className="text-foreground/40">ELEV ≥ {MIN_LINK_ELEV}°</span>
      </header>

      {/* 다음 패스 카운트다운 */}
      <div className="rounded-xl border border-panel-border bg-background/50 py-3 text-center text-sm font-bold">
        {!next ? (
          <span className="text-foreground/50">24시간 내 패스 없음</span>
        ) : inPass ? (
          <span className="text-emerald-300">📡 지금 관제소 상공 통과 중!</span>
        ) : (
          <>
            NEXT PASS{" "}
            <span className="font-mono text-emerald-300">
              {fmtCountdown(next.startMs - now)}
            </span>
          </>
        )}
      </div>

      {/* 패스 목록 */}
      <ul className="mt-2 space-y-1.5">
        {passes.map((pass, i) => {
          const star = pass.maxElev >= STAR_ELEV;
          return (
            <li
              key={pass.startMs}
              className="flex items-center gap-3 rounded-xl border border-panel-border bg-background/40 px-3 py-2.5 text-sm"
            >
              <span className="font-mono text-xs text-data/70">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 font-mono">{fmtTime(pass.startMs)}</span>
              <span className="text-xs text-foreground/60">
                {Math.round(pass.durationS / 60)}분
              </span>
              <span
                className={`font-mono text-xs ${star ? "font-bold text-amber-300" : "text-foreground/70"}`}
              >
                max {Math.round(pass.maxElev)}°{star && " ★"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-center text-[10px] text-foreground/45">
        ★ = 최대 고도각 {STAR_ELEV}° 이상 — 관제소 머리 위를 지나는 특급 패스!
      </p>
    </section>
  );
}
