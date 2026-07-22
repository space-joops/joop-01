"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * 타이핑 나레이션 — 하단 고정 자막이 한 글자씩 찍힌다.
 *
 * completeSignal(논스)이 바뀌면 즉시 전체를 보여준다 — "타이핑 중 탭하면
 * 바로 완성"의 접근성 배려. 다 찍히면 onComplete를 한 번 호출하고
 * "터치하여 계속 ▾" 힌트를 띄운다.
 */
interface Props {
  text: string;
  /** 이 값이 증가하면 타이핑을 건너뛰고 전체 표시 */
  completeSignal?: number;
  /** 타이핑이 끝난 순간 1회 호출 */
  onComplete?: () => void;
  speedMs?: number;
}

export default function TypewriterNarration({
  text,
  completeSignal = 0,
  onComplete,
  speedMs = 55,
}: Props) {
  const [shown, setShown] = useState(0);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 텍스트가 바뀌면 처음부터
  useEffect(() => {
    setShown(0);
    doneRef.current = false;
  }, [text]);

  // 한 글자씩 — 다 찍히면 onComplete 1회
  useEffect(() => {
    if (shown >= text.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    const timer = setTimeout(() => setShown((n) => n + 1), speedMs);
    return () => clearTimeout(timer);
  }, [shown, text, speedMs]);

  // completeSignal 증가 → 즉시 전체 표시
  useEffect(() => {
    if (completeSignal > 0) setShown(text.length);
  }, [completeSignal, text.length]);

  const done = shown >= text.length;

  return (
    <div className="pointer-events-none absolute inset-x-6 bottom-[14%] z-20 flex flex-col items-center gap-3 text-center">
      <p className="min-h-[3.5rem] text-[15px] leading-relaxed text-indigo-50 [text-shadow:0_0_14px_rgba(99,102,241,0.6)]">
        {text.slice(0, shown)}
        {!done && <span className="animate-pulse">▌</span>}
      </p>
      {done && (
        <motion.span
          className="text-xs text-foreground/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.25, 0.85, 0.25] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          터치하여 계속 ▾
        </motion.span>
      )}
    </div>
  );
}
