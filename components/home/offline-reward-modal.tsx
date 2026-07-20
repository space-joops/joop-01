"use client";

import { motion } from "framer-motion";
import type { OfflineSettlement, PetStatus } from "@/lib/supabase/types";

/**
 * 귀환 보고 모달 — 자리를 비운 사이 줍이가 해낸 일을 보고한다.
 * 기획서 4.1: "접속 시 위성 펫이 모아둔 쓰레기를 기분 좋게 뱉어내는 귀환 보고"
 */

/** 초 단위를 "N일 N시간 / N시간 N분 / N분"으로 — 유저에게 초는 너무 잘다 */
function formatAway(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}일 ${hours % 24}시간`;
  if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
  return `${minutes}분`;
}

/** 정산 후 상태별 줍이의 한 마디 */
const STATUS_REPORT: Record<PetStatus, { emoji: string; message: string }> = {
  active: { emoji: "🛰️", message: "궤도를 씩씩하게 돌며 파편을 모았어요!" },
  sulky: {
    emoji: "🥺",
    message: "오래 기다려서 조금 시무룩해요… 쓰다듬어 주세요",
  },
  sleep: {
    emoji: "😴",
    message: "배터리가 다 닳아 절전 모드로 잠들었어요. 태양광 충전이 필요해요!",
  },
  hibernate: {
    emoji: "🧊",
    message: "너무 오래 혼자 있어서 동면에 들어갔어요… 천천히 깨워 주세요",
  },
};

interface OfflineRewardModalProps {
  settlement: OfflineSettlement;
  onClose: () => void;
}

export default function OfflineRewardModal({
  settlement,
  onClose,
}: OfflineRewardModalProps) {
  const status = settlement.status_after ?? "active";
  const report = STATUS_REPORT[status];
  const debrisGained = Math.floor(settlement.debris_gained ?? 0);
  const durabilityLost = settlement.durability_lost ?? 0;

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
          CLEAR SKY ‧ 귀환 보고
        </p>

        {/* 줍이가 모아둔 걸 뱉어내는 연출 — 살짝 통통 튀는 이모지 */}
        <motion.p
          className="mt-3 text-5xl"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 12, delay: 0.15 }}
        >
          {report.emoji}
        </motion.p>

        <p className="mt-3 text-sm font-semibold">
          {formatAway(settlement.away_seconds)} 동안의 궤도 순항 결과
        </p>
        <p className="mt-1 text-xs text-foreground/70">{report.message}</p>

        <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-foreground/70">☄️ 수집한 파편</span>
            <motion.span
              className="font-bold text-emerald-300"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              +{debrisGained}
            </motion.span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-foreground/70">🔋 소모한 배터리</span>
            <span className="font-bold text-amber-300">
              −{Math.round(settlement.battery_drained ?? 0)}%
            </span>
          </div>
          {durabilityLost > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-foreground/70">💥 잔파편에 스침</span>
              <span className="font-bold text-rose-300">
                내구도 −{durabilityLost}%
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-panel-border bg-white/10 py-3.5 text-sm font-bold transition active:scale-95"
        >
          보고 확인 · 파편 받기
        </button>
      </motion.div>
    </motion.div>
  );
}
