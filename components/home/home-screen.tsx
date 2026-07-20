"use client";

import { useEffect, useState } from "react";
import { usePetStore, isSleeping, isDataFull } from "@/stores/pet-store";
import { APP_VERSION } from "@/lib/pwa";
import StatusGauges from "@/components/home/status-gauges";
import PetSatellite from "@/components/home/pet-satellite";
import ConsoleSettings from "@/components/home/console-settings";

/**
 * 홈 화면 (관제 콘솔) — 헤더 · 게이지 · 펫 · 액션 버튼을 조립한다.
 */

/** 배터리 자연 소모 주기 (ms) — 데모 단계라 빠르게 체감되도록 짧게 설정 */
const IDLE_TICK_MS = 5000;

/*
 * 배경 별들의 위치.
 * 렌더링 중 Math.random()을 쓰면 서버가 그린 HTML과 브라우저가 그린 결과가
 * 달라져 hydration 오류가 나므로, 인덱스 기반 공식으로 "항상 같은 랜덤"을 만든다.
 */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: (i * 53 + 17) % 100,
  size: 1.5 + ((i * 7) % 3),
  duration: 1.8 + ((i * 11) % 10) / 5,
}));

export default function HomeScreen() {
  const battery = usePetStore((state) => state.battery);
  const dataUsed = usePetStore((state) => state.dataUsed);
  const debris = usePetStore((state) => state.debris);
  const exp = usePetStore((state) => state.exp);
  const chargeSolar = usePetStore((state) => state.chargeSolar);
  const transmitData = usePetStore((state) => state.transmitData);

  const sleeping = isSleeping(battery);
  const dataFull = isDataFull(dataUsed);

  // 관제 설정 시트 (알림 · 설치 · 버전 정보)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 궤도 순항 중 배터리 자연 소모.
  // getState()로 호출하면 interval을 다시 걸지 않고도 항상 최신 상태를 쓴다.
  useEffect(() => {
    const timer = setInterval(() => {
      usePetStore.getState().tickIdle();
    }, IDLE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 펫의 지금 기분/상황을 한 줄로 알려주는 상태 메시지
  const statusMessage = sleeping
    ? "절전 모드예요… ☀️ 태양광 충전이 필요해요"
    : dataFull
      ? "데이터가 꽉 찼어요! 📡 기지국으로 전송해 주세요"
      : battery <= 15
        ? "배터리가 얼마 남지 않았어요… 🔋"
        : "궤도를 순항하며 파편을 줍는 중 ✨";

  return (
    <main className="flex h-full flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      {/* 헤더: 운영사 + 보유 자원 + 설정 */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-foreground/50">
            CLEAR SKY ‧ 관제 콘솔
            {/* 배포 확인용 버전 — 관제 장비의 펌웨어 버전처럼 슬쩍 표기 */}
            <span className="ml-1.5 font-mono text-[9px] font-normal tracking-normal text-foreground/30">
              v{APP_VERSION}
            </span>
          </p>
          <h1 className="text-lg font-bold">줍이 · LV.1</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p>
              ☄️ 파편 <span className="font-bold">{Math.floor(debris)}</span>
            </p>
            <p className="text-[11px] text-foreground/50">EXP {exp}</p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="관제 설정 열기"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-panel-border bg-panel text-sm transition active:scale-95"
          >
            ⚙️
          </button>
        </div>
      </header>

      <StatusGauges />

      {/* 펫 영역 — 별이 반짝이는 궤도 위 */}
      <section className="relative min-h-0 flex-1 overflow-hidden rounded-3xl border border-panel-border bg-[radial-gradient(ellipse_at_center,#141737_0%,#060714_75%)]">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="animate-star-twinkle absolute rounded-full bg-white"
            style={{
              left: `${star.left}%`,
              top: `${star.top}%`,
              width: star.size,
              height: star.size,
              ["--twinkle-duration" as string]: `${star.duration}s`,
            }}
            aria-hidden
          />
        ))}
        <PetSatellite />
      </section>

      {/* 상태 메시지 */}
      <p className="text-center text-xs text-foreground/70">{statusMessage}</p>

      {/* 액션 버튼 — 엄지 하나가 닿는 하단에 배치 */}
      <footer className="flex gap-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={chargeSolar}
          disabled={battery >= 100}
          className="flex-1 rounded-2xl border border-panel-border bg-panel py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
        >
          ☀️ 태양광 충전
        </button>
        <button
          type="button"
          onClick={transmitData}
          disabled={dataUsed === 0}
          className={`flex-1 rounded-2xl border py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
            dataFull
              ? "animate-pulse border-danger/60 bg-danger/20"
              : "border-panel-border bg-panel"
          }`}
        >
          📡 데이터 전송
        </button>
      </footer>

      <ConsoleSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
