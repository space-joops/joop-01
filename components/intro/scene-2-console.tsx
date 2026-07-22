"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import LottieStage from "@/components/intro/lottie-stage";
import TypewriterNarration from "@/components/intro/typewriter-narration";
import { ASSET_URLS } from "@/components/intro/intro-assets";

/**
 * [Scene 2] 새로운 시작 — 손안의 관제 콘솔.
 * SF 레트로 콘솔이 팝업되고, 접속 문구가 깜빡이며, 화면 속 줍이가 인사한다.
 * "장비는 필요 없다 — 지금 이 화면이 관제 콘솔"이라는 모바일 정체성.
 */

const TEXT = "우주는 닫혔고, 모두가 포기했죠. 하지만 우리는 다릅니다.";

export default function Scene2Console({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [skip, setSkip] = useState(0);
  const [booted, setBooted] = useState(false);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 500);
    return () => clearTimeout(t);
  }, []);

  const advance = () => {
    if (!done) setSkip((n) => n + 1);
    else onDoneRef.current();
  };

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-[#050508]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      onPointerDown={advance}
    >
      {/* 콘솔 백라이트 글로우 */}
      <motion.div
        className="absolute left-1/2 top-[42%] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/25 blur-3xl"
        initial={false}
        animate={{ opacity: booted ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        {/* SF 레트로 콘솔 프레임 — 켜질 때 형광등처럼 깜빡 */}
        <motion.div
          className="relative w-72 overflow-hidden rounded-2xl border-[3px] border-[#2b2f4a] bg-[#080c1a] shadow-[0_0_60px_rgba(99,102,241,0.35)]"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{
            opacity: booted ? [0, 1, 0.5, 1] : 0,
            scale: booted ? 1 : 0.9,
            y: booted ? 0 : 20,
          }}
          transition={{ duration: 0.7 }}
        >
          {/* 스캔라인 배경 Lottie */}
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <LottieStage src={ASSET_URLS.lottie.scene2Console} fit="cover" className="h-full w-full" />
          </div>

          {/* 콘솔 헤더 — 접속 문구 깜빡임 */}
          <div className="relative border-b border-white/5 px-4 py-2.5">
            <p className="text-[10px] font-bold tracking-[0.3em] text-indigo-300">
              CLEAR SKY
            </p>
            <motion.p
              className="mt-0.5 font-mono text-[11px] text-emerald-300"
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              관제 콘솔 접속 완료 ●
            </motion.p>
          </div>

          {/* 화면 속 줍이 — idle Lottie 파닥임 */}
          <div className="relative flex h-44 items-center justify-center">
            {booted && (
              <motion.div
                className="h-40 w-40"
                initial={{ opacity: 0, scale: 0.6, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.9, delay: 0.6 }}
              >
                <LottieStage src={ASSET_URLS.lottie.joopsIdle} fit="contain" className="h-full w-full" />
              </motion.div>
            )}
          </div>

          {/* 콘솔 하단 상태바 */}
          <div className="relative flex items-center gap-2 border-t border-white/5 px-4 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-[9px] tracking-[0.2em] text-foreground/40">
              LINK ESTABLISHED · 손안의 관제소
            </span>
          </div>
        </motion.div>
      </div>

      <TypewriterNarration
        text={TEXT}
        completeSignal={skip}
        onComplete={() => setDone(true)}
      />
    </motion.div>
  );
}
