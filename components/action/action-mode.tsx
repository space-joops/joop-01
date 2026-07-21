"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FULL_DATA_EFFICIENCY,
  GAUGE_MAX,
  usePetStore,
} from "@/stores/pet-store";
import {
  BG_SPACE_SRC,
  UI_SRC,
  petSprite,
  preloadList,
} from "@/components/action/sortie-assets";
import AmbientOrbit from "@/components/action/ambient-orbit";
import SortieField, {
  type SortieResult,
} from "@/components/action/sortie-field";
import { RISK_ZONES, type RiskZone } from "@/components/action/sortie-tuning";

/**
 * 액션 모드 (수동 관제·출격) — 셸.
 *
 * 흐름: 브리핑(작업 구역 선택) → 비행(SortieField) → 결과 보고 → 정산.
 * 게임 자체는 SortieField가 담당하고, 이 컴포넌트는 앞뒤 화면과
 * 보상 정산(위험 수당 배율·데이터 가득 페널티)만 맡는다.
 *
 * 위험 수당제 (기획서 V3): 위험한 구역일수록 고속 파편이 잦은 대신
 * 보상 배율이 크다. 안전 ×1.0 / 표준 ×1.5 / 밀집 ×2.0.
 *
 * 정산 계약은 기존과 동일 — finishSortie({debris, exp, durabilityLoss}).
 * 스토어가 데이터 축적·내구도 하한을 처리하고, 30초 동기화가 서버로 나른다.
 */

/** 고속 파편 1회 피격당 내구도 손상 — 구 액션 모드의 암석 데미지 계승 */
const HIT_DURABILITY_DAMAGE = 5;

interface ActionModeProps {
  onClose: () => void;
}

export default function ActionMode({ onClose }: ActionModeProps) {
  const [phase, setPhase] = useState<"briefing" | "play" | "result">(
    "briefing",
  );
  const [zone, setZone] = useState<RiskZone | null>(null);
  const [result, setResult] = useState<SortieResult | null>(null);

  // 라운드 동안 변하지 않는 스냅샷 — 게임 중 본편 상태 변화에 흔들리지 않게
  const [snapshot] = useState(() => {
    const s = usePetStore.getState();
    return {
      level: s.level,
      variant: s.variant,
      aiCoreLevel: s.upgrades.ai_core,
      dataFull: s.dataUsed >= GAUGE_MAX,
    };
  });

  // 브리핑을 읽는 동안 스프라이트를 브라우저 캐시에 실어 둔다 —
  // 비행 첫 프레임에 파편이 늦게 뜨는 깜빡임 방지
  useEffect(() => {
    for (const src of preloadList(snapshot.level, snapshot.variant)) {
      const img = new Image();
      img.src = src;
    }
  }, [snapshot.level, snapshot.variant]);

  /* ── 정산: 배율 적용 전 원값(result)에 구역 배율·페널티를 얹는다 ── */
  const collectMul =
    (zone?.mul ?? 1) * (snapshot.dataFull ? FULL_DATA_EFFICIENCY : 1);
  const rewardDebris = result ? result.debris * collectMul : 0;
  const rewardExp = result ? Math.round(result.exp * (zone?.mul ?? 1)) : 0;
  const durabilityLoss = (result?.hits ?? 0) * HIT_DURABILITY_DAMAGE;

  const returnHome = () => {
    usePetStore.getState().finishSortie({
      debris: rewardDebris,
      exp: rewardExp,
      durabilityLoss,
    });
    onClose();
  };

  return (
    <motion.div
      className="absolute inset-0 z-50 overflow-hidden bg-[#05060f]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 우주 배경 — 에셋 팩의 세로(9:16) 배경 한 장 */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 배경은 next/image 최적화 대상이 아니다 */}
      <img
        src={BG_SPACE_SRC}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
        draggable={false}
      />

      {/* 배경 궤도 연출 — 게임 레이어보다 뒤, 피격 흔들림 밖 (원경은 흔들리지 않는다) */}
      <AmbientOrbit />

      {/* ── 비행 — 게임 본체 ── */}
      {phase === "play" && zone && (
        <SortieField
          config={{
            hazardWeight: zone.hazardWeight,
            hazardSpeedMul: zone.hazardSpeedMul,
            level: snapshot.level,
            variant: snapshot.variant,
            aiCoreLevel: snapshot.aiCoreLevel,
          }}
          onEnd={(r) => {
            setResult(r);
            setPhase("result");
          }}
        />
      )}

      {/* ── 브리핑: 작업 구역 선택 ── */}
      <AnimatePresence>
        {phase === "briefing" && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col justify-end bg-black/50 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 출격 취소 — 주입한 연료(배터리 -10)는 돌아오지 않는다 */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-[max(1rem,env(safe-area-inset-top))] flex h-9 w-9 items-center justify-center rounded-full border border-panel-border bg-black/40 text-sm"
              aria-label="출격 취소"
            >
              ✕
            </button>

            <motion.div
              className="rounded-3xl border border-panel-border bg-panel/95 p-5"
              initial={{ y: 48 }}
              animate={{ y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
                CLEAR SKY ‧ 출격 브리핑
              </p>
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 스프라이트 */}
                <img
                  src={petSprite(snapshot.level, snapshot.variant)}
                  alt="출격 준비 중인 줍이"
                  className="h-14 w-14"
                  draggable={false}
                />
                <div className="text-sm">
                  <p className="font-bold">어느 구역을 청소할까요?</p>
                  <p className="mt-0.5 text-xs text-foreground/60">
                    위험한 곳일수록 수당이 두둑해요
                  </p>
                </div>
              </div>

              {snapshot.dataFull && (
                <p className="mt-3 rounded-xl bg-data/15 px-3 py-2 text-xs text-data">
                  📦 데이터 저장소가 가득 — 수집 효율이 절반이에요. 기지국
                  전송으로 비우고 오면 좋아요!
                </p>
              )}

              {/* 작업 구역 3택 — 고르는 즉시 출격 */}
              <div className="mt-4 space-y-2">
                {RISK_ZONES.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => {
                      setZone(z);
                      setPhase("play");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-panel-border bg-black/30 p-3 text-left transition active:scale-[0.98]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 배지 */}
                    <img src={z.badge} alt="" className="h-11 w-11" />
                    <span className="flex-1">
                      <span className="block text-sm font-bold">{z.name}</span>
                      <span className="block text-xs text-foreground/60">
                        {z.desc}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-emerald-300">
                      ×{z.mul.toFixed(1)}
                    </span>
                  </button>
                ))}
              </div>

              {/* 조작 안내 — 텍스트 최소화 (온보딩 원칙) */}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-foreground/60">
                {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 아이콘 */}
                <img src={UI_SRC.gestureDrag} alt="" className="h-6 w-6" />
                <span>누르고 끌면 그 방향으로 슝 — 깊게 끌수록 강한 분사!</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 결과 보고 ── */}
      <AnimatePresence>
        {phase === "result" && result && zone && (
          <motion.div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-full rounded-3xl border border-panel-border bg-panel p-6 text-center"
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
                CLEAR SKY ‧ 출격 결과
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 스프라이트 */}
              <img
                src={petSprite(snapshot.level, snapshot.variant, true)}
                alt="기뻐하는 줍이"
                className="mx-auto mt-3 h-24 w-24"
                draggable={false}
              />
              <p className="mt-2 text-sm font-bold">
                {result.hits === 0
                  ? "무결점 비행! 흠집 하나 없이 돌아왔어요"
                  : "임무 완료 — 몇 번 부딪혔지만 무사히 귀환했어요"}
              </p>
              <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/70">수거한 파편</span>
                  <span className="font-bold">
                    {result.eaten}개 · {Math.floor(result.sec / 60)}분{" "}
                    {String(result.sec % 60).padStart(2, "0")}초 비행
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">
                    {zone.name} 위험 수당
                  </span>
                  <span className="font-bold">×{zone.mul.toFixed(1)}</span>
                </div>
                {snapshot.dataFull && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">📦 데이터 가득</span>
                    <span className="font-bold text-data">효율 50%</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-foreground/70">획득 자원 / 경험치</span>
                  <span className="font-bold text-emerald-300">
                    +{Math.floor(rewardDebris)} / +{rewardExp}
                  </span>
                </div>
                {durabilityLoss > 0 && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">💥 피격 손상</span>
                    <span className="font-bold text-rose-300">
                      내구도 −{durabilityLoss}%
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={returnHome}
                className="mt-5 w-full rounded-2xl border border-panel-border bg-white/10 py-3.5 text-sm font-bold transition active:scale-95"
              >
                귀환 · 보상 받기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
