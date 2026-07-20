"use client";

import { motion } from "framer-motion";

/**
 * 컷신 하단 나레이션 자막.
 * step(현재까지 공개된 줄 수)이 늘어날 때마다 새 줄이 아래에서 떠오르고,
 * 이전 줄은 은은하게 어두워져 시선을 최신 줄로 모은다.
 */
export default function Narration({
  lines,
  step,
}: {
  lines: string[];
  step: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-6 bottom-[15%] z-20 flex flex-col items-center gap-2 text-center">
      {lines.slice(0, step).map((line, i) => (
        <motion.p
          key={line}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: i === step - 1 ? 1 : 0.4, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="text-sm leading-relaxed text-indigo-100 [text-shadow:0_0_14px_rgba(99,102,241,0.6)]"
        >
          {line}
        </motion.p>
      ))}
    </div>
  );
}
