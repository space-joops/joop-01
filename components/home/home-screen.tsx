"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  usePetStore,
  isSleeping,
  isDataFull,
  evolveTarget,
  EVOLVE_EXP,
  HIBERNATE_WAKE_STROKES,
  SULKY_CHEER_STROKES,
} from "@/stores/pet-store";
import { APP_VERSION } from "@/lib/pwa";
import StatusGauges from "@/components/home/status-gauges";
import PetSatellite from "@/components/home/pet-satellite";
import ConsoleSettings from "@/components/home/console-settings";
import EvolveSheet, { VARIANT_INFO } from "@/components/home/evolve-sheet";
import ActionMode from "@/components/action/action-mode";
import UpgradeSheet from "@/components/home/upgrade-sheet";

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
  const level = usePetStore((state) => state.level);
  const variant = usePetStore((state) => state.variant);
  const mood = usePetStore((state) => state.mood);
  const moodProgress = usePetStore((state) => state.moodProgress);
  const chargeSolar = usePetStore((state) => state.chargeSolar);
  const transmitData = usePetStore((state) => state.transmitData);

  const sleeping = isSleeping(battery);
  const dataFull = isDataFull(dataUsed);
  const hibernating = mood === "hibernate";

  // 관제 설정 시트 (알림 · 설치 · 버전 정보)
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 기체 강화 시트 (파편 소비처)
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // 진화: 다음 목표 레벨(임계값 도달 시), 시트 열림, 레벨업 플래시
  const target = evolveTarget(level, exp);
  const [evolveOpen, setEvolveOpen] = useState(false);
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const prevLevelRef = useRef(level);
  useEffect(() => {
    // 레벨이 "올라간" 순간에만 축하 플래시 (하이드레이션 첫 세팅은 제외)
    if (level > prevLevelRef.current) {
      setLevelUpFlash(true);
      const timer = setTimeout(() => setLevelUpFlash(false), 1800);
      prevLevelRef.current = level;
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = level;
  }, [level]);

  // 다음 레벨까지의 경험치 목표 (만렙이면 없음)
  const nextExp = level === 1 ? EVOLVE_EXP[2] : level === 2 ? EVOLVE_EXP[3] : null;

  // 출격(액션 모드): 돌발 이벤트 배너 — 레이더가 가끔 파편 군집을 포착한다
  const [sortieOpen, setSortieOpen] = useState(false);
  const [sortieBanner, setSortieBanner] = useState(false);
  const sortieStateRef = useRef({ open: false, banner: false });
  sortieStateRef.current = { open: sortieOpen, banner: sortieBanner };
  useEffect(() => {
    const roll = setInterval(() => {
      const s = usePetStore.getState();
      const { open, banner } = sortieStateRef.current;
      const awake = s.mood !== "hibernate" && s.battery > 0;
      // 15초마다 22% 확률 — 평균 1~2분에 한 번 레이더가 울린다
      if (!open && !banner && awake && s.battery >= 20 && Math.random() < 0.22) {
        setSortieBanner(true);
        setTimeout(() => setSortieBanner(false), 20_000); // 20초 내 미응답 시 소멸
      }
    }, 15_000);
    return () => clearInterval(roll);
  }, []);

  const enterSortie = () => {
    // 배터리 차감 포함 — 조건 미달이면 스토어가 거절한다
    if (!usePetStore.getState().startSortie()) return;
    setSortieBanner(false);
    setSortieOpen(true);
  };

  // 궤도 순항 중 배터리 자연 소모.
  // getState()로 호출하면 interval을 다시 걸지 않고도 항상 최신 상태를 쓴다.
  useEffect(() => {
    const timer = setInterval(() => {
      usePetStore.getState().tickIdle();
    }, IDLE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 개발 중 연출 확인용: ?mood=hibernate|sulky, ?action=1 (프로덕션에선 무시)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const params = new URLSearchParams(window.location.search);
    const forced = params.get("mood");
    if (forced === "hibernate" || forced === "sulky") {
      usePetStore.setState({ mood: forced, moodProgress: 0 });
    }
    if (params.has("action")) setSortieBanner(true);
  }, []);

  // 펫의 지금 기분/상황을 한 줄로 알려주는 상태 메시지.
  // 우선순위: 동면(모든 시스템 잠김) > 절전 > 시무룩 > 데이터 > 배터리 경고
  const statusMessage = hibernating
    ? `동면 중이에요… 🧊 부드럽게 쓰다듬어 깨워 주세요 (${moodProgress}/${HIBERNATE_WAKE_STROKES})`
    : sleeping
      ? "절전 모드예요… ☀️ 태양광 충전이 필요해요"
      : mood === "sulky"
        ? `오래 기다려서 시무룩해요… 🥺 쓰다듬어 주세요 (${moodProgress}/${SULKY_CHEER_STROKES})`
        : dataFull
          ? "데이터가 꽉 찼어요! 📡 기지국으로 전송해 주세요"
          : battery <= 15
            ? "배터리가 얼마 남지 않았어요… 🔋"
            : "궤도를 순항하며 파편을 줍는 중 ✨";

  return (
    <main className="relative flex h-full flex-col gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
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
          <h1 className="text-lg font-bold">
            줍이 · LV.{level}
            {variant && (
              <span className="ml-1">{VARIANT_INFO[variant].emoji}</span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p>
              ☄️ 파편 <span className="font-bold">{Math.floor(debris)}</span>
            </p>
            <p className="text-[11px] text-foreground/50">
              EXP {exp}
              {nextExp !== null && ` / ${nextExp}`}
            </p>
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

      {/* 돌발 이벤트 — 레이더가 파편 군집을 포착하면 출격 기회! */}
      <AnimatePresence>
        {sortieBanner && !hibernating && !sleeping && (
          <motion.button
            key="sortie-banner"
            type="button"
            onClick={enterSortie}
            className="rounded-2xl border border-sky-300/60 bg-sky-400/15 py-3 text-sm font-bold transition active:scale-95"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            📡 파편 군집 포착! 출격하기 (🔋 -10)
          </motion.button>
        )}
      </AnimatePresence>

      {/* 진화 준비 완료 — 임계값에 닿으면 나타나는 승급 버튼 */}
      {target && !hibernating && (
        <button
          type="button"
          onClick={() => setEvolveOpen(true)}
          className="animate-pulse rounded-2xl border border-amber-300/60 bg-amber-400/15 py-3 text-sm font-bold transition active:scale-95"
        >
          ⬆️ 진화 준비 완료! LV.{level} → LV.{target}
        </button>
      )}

      {/* 액션 버튼 — 엄지 하나가 닿는 하단에 배치 */}
      <footer className="flex gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={chargeSolar}
          disabled={battery >= 100 || hibernating}
          className="flex-1 rounded-2xl border border-panel-border bg-panel py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
        >
          ☀️ 태양광 충전
        </button>
        <button
          type="button"
          onClick={() => setUpgradeOpen(true)}
          disabled={hibernating}
          className="rounded-2xl border border-panel-border bg-panel px-4 py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          aria-label="기체 강화"
        >
          🔧
        </button>
        <button
          type="button"
          onClick={transmitData}
          disabled={dataUsed === 0 || hibernating}
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

      {/* 출격 — 수동 관제 모드 전체 화면 */}
      <AnimatePresence>
        {sortieOpen && (
          <ActionMode key="sortie" onClose={() => setSortieOpen(false)} />
        )}
      </AnimatePresence>

      {/* 기체 강화 시트 */}
      <AnimatePresence>
        {upgradeOpen && (
          <UpgradeSheet key="upgrade" onClose={() => setUpgradeOpen(false)} />
        )}
      </AnimatePresence>

      {/* 진화 시트 + 레벨업 플래시 */}
      <AnimatePresence>
        {evolveOpen && target && (
          <EvolveSheet
            key="evolve-sheet"
            targetLevel={target}
            onClose={() => setEvolveOpen(false)}
          />
        )}
        {levelUpFlash && (
          <motion.div
            key="level-up-flash"
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle,rgba(255,255,255,0.9)_0%,rgba(255,214,120,0.4)_45%,transparent_75%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, times: [0, 0.15, 0.55, 1] }}
          >
            <motion.p
              className="text-3xl font-black tracking-widest text-slate-900 drop-shadow"
              initial={{ scale: 0.4 }}
              animate={{ scale: [0.4, 1.15, 1] }}
              transition={{ duration: 0.7, times: [0, 0.7, 1] }}
            >
              ⬆️ LV.{level} 진화!
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
