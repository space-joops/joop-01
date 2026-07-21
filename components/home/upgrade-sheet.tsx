"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { buyUpgrade } from "@/app/actions/pet";
import {
  usePetStore,
  UPGRADE_COSTS,
  UPGRADE_MAX_LEVEL,
} from "@/stores/pet-store";
import type { UpgradeKey } from "@/lib/supabase/types";

/**
 * 강화 시트 — 파편의 소비처. 모으기만 하던 게임의 루프가 여기서 닫힌다.
 * 비용 검증·차감의 진실은 서버(DB 함수)에 있고, 여기는 요청과 표시만.
 */

const UPGRADE_INFO: Record<
  UpgradeKey,
  { emoji: string; name: string; desc: string; effect: (lv: number) => string }
> = {
  cargo: {
    emoji: "📦",
    name: "화물칸",
    desc: "파편을 압축 저장 — 데이터가 천천히 쌓여요",
    effect: (lv) => `압축률 +${lv * 25}%`,
  },
  ai_core: {
    emoji: "🤖",
    name: "AI 코어",
    desc: "자리를 비운 동안 더 부지런히 주워요",
    effect: (lv) => `자동 수집 +${lv * 20}%`,
  },
  solar: {
    emoji: "☀️",
    name: "태양광 패널",
    desc: "한 번의 충전이 더 든든해져요",
    effect: (lv) => `충전량 +${lv * 25}%`,
  },
};

interface UpgradeSheetProps {
  onClose: () => void;
}

export default function UpgradeSheet({ onClose }: UpgradeSheetProps) {
  const debris = usePetStore((state) => state.debris);
  const upgrades = usePetStore((state) => state.upgrades);
  const [busyKey, setBusyKey] = useState<UpgradeKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = async (key: UpgradeKey) => {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);

    const result = await buyUpgrade(key);
    // 로컬 모드: 같은 비용 규칙을 클라이언트에서 적용
    if (!result.configured) {
      usePetStore.getState().buyUpgradeLocal(key);
      setBusyKey(null);
      return;
    }
    if (result.ok && result.pet && result.level !== undefined) {
      const store = usePetStore.getState();
      // 서버가 확정한 파편 잔액이 진실
      store.hydrateFromServer(result.pet, { keepMood: true });
      store.setUpgrades({ ...store.upgrades, [key]: result.level });
      setBusyKey(null);
      return;
    }
    setBusyKey(null);
    setError(
      result.reason === "not_enough"
        ? `파편이 부족해요 (필요: ${result.need})`
        : result.reason === "max_level"
          ? "이미 최고 레벨이에요!"
          : "강화에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  };

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full rounded-t-3xl border border-panel-border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
            CLEAR SKY ‧ 기체 강화
          </p>
          <p className="text-sm font-bold">☄️ {Math.floor(debris)}</p>
        </div>

        <div className="mt-4 space-y-3">
          {(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map((key) => {
            const info = UPGRADE_INFO[key];
            const level = upgrades[key];
            const maxed = level >= UPGRADE_MAX_LEVEL;
            const cost = maxed ? null : UPGRADE_COSTS[level];
            const affordable = cost !== null && debris >= cost;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded-2xl border border-panel-border bg-black/25 p-3"
              >
                <span className="text-3xl">{info.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {info.name}
                    {level > 0 && (
                      <span className="ml-1.5 text-[11px] font-semibold text-emerald-300">
                        {info.effect(level)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-foreground/60">
                    {info.desc}
                  </p>
                  {/* 레벨 핍 — 채워진 만큼이 현재 레벨 */}
                  <div className="mt-1.5 flex gap-1">
                    {Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-5 rounded-full ${
                          i < level ? "bg-amber-300" : "bg-white/15"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => buy(key)}
                  disabled={maxed || !affordable || busyKey !== null}
                  className="shrink-0 rounded-xl border border-amber-300/60 bg-amber-400/15 px-3 py-2.5 text-xs font-bold transition active:scale-95 disabled:border-panel-border disabled:bg-black/20 disabled:opacity-50"
                >
                  {maxed ? "MAX" : busyKey === key ? "…" : `☄️ ${cost}`}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="mt-3 text-center text-xs text-rose-300">{error}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl border border-panel-border bg-white/10 py-3 text-sm font-semibold transition active:scale-95"
        >
          닫기
        </button>
      </motion.div>
    </motion.div>
  );
}
