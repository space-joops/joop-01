"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { evolvePet } from "@/app/actions/pet";
import { usePetStore } from "@/stores/pet-store";
import type { PetVariant } from "@/lib/supabase/types";

/**
 * 진화 시트 — 승급 확인과 3단계 장비 선택.
 *
 * 검증의 진실은 서버(DB 함수)에 있다: 이 컴포넌트는 요청만 보내고,
 * 성공하면 서버가 돌려준 펫 상태로 스토어를 덮어쓴다.
 * Supabase 미설정(로컬 모드)이면 같은 규칙의 로컬 폴백을 쓴다.
 */

/** 3단계 장비 소개 — 물리 용어 대신 친숙한 말로 (개발 원칙 9) */
export const VARIANT_INFO: Record<
  PetVariant,
  { emoji: string; name: string; desc: string }
> = {
  net: { emoji: "🕸️", name: "그물망", desc: "구슬 그물을 활짝 — 넓게 쓸어 담는 청소부" },
  magnet: { emoji: "🧲", name: "자석", desc: "말굽자석으로 착 — 금속 파편 전문가" },
  laser: { emoji: "✨", name: "레이저", desc: "미니 터렛으로 콕 — 정밀 요격수" },
};

interface EvolveSheetProps {
  /** 이번에 도달할 레벨 (2 또는 3) */
  targetLevel: 2 | 3;
  onClose: () => void;
}

export default function EvolveSheet({ targetLevel, onClose }: EvolveSheetProps) {
  const [variant, setVariant] = useState<PetVariant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needVariant = targetLevel === 3;
  const ready = !needVariant || variant !== null;

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const result = await evolvePet(needVariant ? variant : null);

    // 로컬 모드: 같은 임계값 규칙을 클라이언트에서 적용
    if (!result.configured) {
      usePetStore.getState().evolveLocal(variant);
      onClose();
      return;
    }
    if (result.ok && result.pet) {
      // 서버가 확정한 상태가 진실 — 무드는 유지한 채 덮어쓴다
      usePetStore.getState().hydrateFromServer(result.pet, { keepMood: true });
      onClose();
      return;
    }
    setBusy(false);
    setError(
      result.reason === "exp_low"
        ? `경험치가 아직 부족해요 (필요: ${result.need})`
        : result.reason === "max_level"
          ? "이미 최고 단계예요!"
          : "진화에 실패했어요. 잠시 후 다시 시도해 주세요.",
    );
  };

  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full rounded-3xl border border-panel-border bg-panel p-6 text-center"
        initial={{ scale: 0.85, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
      >
        <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
          CLEAR SKY ‧ 진화 승인 요청
        </p>
        <motion.p
          className="mt-3 text-5xl"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.1 }}
        >
          {targetLevel === 2 ? "🛰️" : "🚀"}
        </motion.p>
        <p className="mt-3 text-sm font-bold">
          {targetLevel === 2
            ? "줍이가 더 자랄 준비를 마쳤어요!"
            : "마지막 진화 — 전문 장비를 골라 주세요"}
        </p>
        <p className="mt-1 text-xs text-foreground/70">
          {targetLevel === 2
            ? "몸이 커지고 로봇 팔과 접이식 날개가 생겨요"
            : "한 번 고르면 바꿀 수 없어요. 줍이의 평생 직업이랍니다"}
        </p>

        {needVariant && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(Object.keys(VARIANT_INFO) as PetVariant[]).map((key) => {
              const info = VARIANT_INFO[key];
              const selected = variant === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVariant(key)}
                  className={`rounded-2xl border p-3 text-center transition active:scale-95 ${
                    selected
                      ? "border-amber-300/70 bg-amber-400/15"
                      : "border-panel-border bg-black/25"
                  }`}
                >
                  <span className="text-2xl">{info.emoji}</span>
                  <p className="mt-1 text-xs font-bold">{info.name}</p>
                  <p className="mt-1 text-[10px] leading-snug text-foreground/60">
                    {info.desc}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-2xl border border-panel-border bg-black/25 py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
          >
            다음에
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready || busy}
            className="flex-[2] rounded-2xl border border-amber-300/60 bg-amber-400/20 py-3.5 text-sm font-bold transition active:scale-95 disabled:opacity-40"
          >
            {busy ? "진화 중…" : `LV.${targetLevel}로 진화! ⬆️`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
