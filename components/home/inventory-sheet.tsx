"use client";

import { motion } from "framer-motion";
import { usePetStore } from "@/stores/pet-store";
import { DEBRIS_SRC, type DebrisKind } from "@/components/action/sortie-assets";

/**
 * 수집함(인벤토리) 시트 — 지금까지 주운 것들의 도감.
 *
 * 종류별 누적 개수는 로컬 전용 통계(스토어 collection)에서 읽는다.
 * 아직 못 주운 종류는 흐린 실루엣 + ? — "다음엔 뭘 줍게 될까"의 재미.
 */

const KIND_INFO: { kind: DebrisKind; name: string }[] = [
  { kind: "chip", name: "회로 칩" },
  { kind: "bolt", name: "볼트" },
  { kind: "nut", name: "너트" },
  { kind: "gear", name: "기어" },
  { kind: "antenna_piece", name: "안테나 조각" },
  { kind: "fuel_tank", name: "연료탱크" },
  { kind: "solar_fragment", name: "태양전지 파편" },
  { kind: "shard", name: "고속 파편" },
];

export default function InventorySheet({ onClose }: { onClose: () => void }) {
  const collection = usePetStore((state) => state.collection);
  const sortieCount = usePetStore((state) => state.sortieCount);
  const hitCount = usePetStore((state) => state.hitCount);
  const debris = usePetStore((state) => state.debris);

  const totalCollected = Object.values(collection).reduce((a, b) => a + b, 0);

  return (
    <>
      {/* 배경 딤 — 탭하면 닫힘 */}
      <motion.button
        type="button"
        aria-label="수집함 닫기"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60"
      />
      <motion.section
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border border-b-0 border-panel-border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide">🎒 수집함</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-foreground/40 transition active:scale-95"
          >
            ✕
          </button>
        </header>

        {/* 파편 도감 — 8종 그리드 */}
        <div className="grid grid-cols-4 gap-2">
          {KIND_INFO.map(({ kind, name }) => {
            const count = collection[kind] ?? 0;
            const found = count > 0;
            return (
              <div
                key={kind}
                className="flex flex-col items-center gap-1 rounded-2xl border border-panel-border bg-background/50 px-1 py-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 아이콘 */}
                <img
                  src={DEBRIS_SRC[kind]}
                  alt={found ? name : "미발견 파편"}
                  className={`h-10 w-10 ${found ? "" : "opacity-25 grayscale"}`}
                  draggable={false}
                />
                <p className="text-[10px] text-foreground/70">
                  {found ? name : "???"}
                </p>
                <p className="font-mono text-xs font-bold">
                  {found ? `×${count}` : "?"}
                </p>
              </div>
            );
          })}
        </div>

        {/* 활동 요약 */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center justify-between rounded-2xl border border-panel-border bg-background/50 px-4 py-3">
            <span className="text-xs text-foreground/60">☄️ 보유 파편</span>
            <span className="font-bold">{Math.floor(debris)}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-panel-border bg-background/50 px-4 py-3">
            <span className="text-xs text-foreground/60">🧺 총 수집</span>
            <span className="font-bold">{totalCollected}</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-panel-border bg-background/50 px-4 py-3">
            <span className="text-xs text-foreground/60">🚀 출격</span>
            <span className="font-bold">{sortieCount}회</span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-panel-border bg-background/50 px-4 py-3">
            <span className="text-xs text-foreground/60">💥 충돌</span>
            <span className="font-bold">{hitCount}회</span>
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] text-foreground/40">
          파편은 미니게임 출격과 홈에 떠다니는 조각으로 모을 수 있어요
        </p>
      </motion.section>
    </>
  );
}
