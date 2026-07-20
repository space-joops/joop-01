"use client";

import { usePetStore, isDataFull } from "@/stores/pet-store";

/**
 * 3대 상태 지표 게이지 (배터리 · 내구도 · 데이터).
 *
 * 각 게이지가 스토어에서 "자기 값 하나만" 골라 구독(selector)하므로,
 * 배터리가 변해도 내구도 게이지는 다시 렌더링되지 않는다.
 */

interface GaugeProps {
  icon: string;
  label: string;
  value: number;
  colorClass: string; // 채움 막대 색 (Tailwind 클래스)
  warning?: boolean; // true면 빨갛게 깜빡여 경고
}

function Gauge({ icon, label, value, colorClass, warning }: GaugeProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-center text-sm" aria-hidden>
        {icon}
      </span>
      <div className="flex-1">
        <div className="mb-0.5 flex justify-between text-[10px] leading-none text-foreground/60">
          <span>{label}</span>
          <span className={warning ? "font-bold text-danger" : ""}>
            {Math.round(value)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-panel-border/60">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              warning ? "animate-pulse bg-danger" : colorClass
            }`}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function StatusGauges() {
  // 값 하나씩 골라 구독 — 통째로 구독하면 아무 값이나 바뀔 때마다 전부 재렌더링된다
  const battery = usePetStore((state) => state.battery);
  const durability = usePetStore((state) => state.durability);
  const dataUsed = usePetStore((state) => state.dataUsed);

  return (
    <section
      aria-label="위성 상태 지표"
      className="flex flex-col gap-2 rounded-2xl border border-panel-border bg-panel/80 p-3"
    >
      <Gauge
        icon="🔋"
        label="배터리"
        value={battery}
        colorClass="bg-battery"
        warning={battery <= 15}
      />
      <Gauge
        icon="🔧"
        label="내구도"
        value={durability}
        colorClass="bg-durability"
      />
      <Gauge
        icon="📡"
        label="데이터"
        value={dataUsed}
        colorClass="bg-data"
        warning={isDataFull(dataUsed)}
      />
    </section>
  );
}
