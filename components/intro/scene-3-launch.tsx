"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import LottieStage from "@/components/intro/lottie-stage";
import TypewriterNarration from "@/components/intro/typewriter-narration";
import { ASSET_URLS } from "@/components/intro/intro-assets";
import { playHappySound, playLaunchSound } from "@/components/intro/sound";

/**
 * [Scene 3] 교감과 출격 — 유일한 핵심 인터랙션.
 * 유저가 줍이를 터치해 격려하면(기쁨) → 부스터를 켜고 발진 → 타이틀 로고.
 * 컷신을 "보기만" 하지 않고 직접 손으로 밀어 출격시키는 순간이 정체성.
 */

type Phase = "idle" | "happy" | "launch" | "title";

const TEXT = "우리의 작은 친구와 함께, 잃어버린 별빛을 되찾으러 갈 시간입니다.";

export default function Scene3Launch({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [textDone, setTextDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  /** 격려 터치 — 기쁨 → 1.5초 후 발진 */
  const encourage = () => {
    if (phase !== "idle") return;
    setPhase("happy");
    playHappySound();
    timersRef.current.push(
      setTimeout(() => {
        setPhase("launch");
        playLaunchSound();
        // 발진 Lottie 길이(≈1.5s) 안전망 — onComplete가 안 오면 타이머로 진행
        timersRef.current.push(setTimeout(() => setPhase("title"), 1700));
      }, 1500),
    );
  };

  const petSrc =
    phase === "happy"
      ? ASSET_URLS.lottie.joopsHappy
      : phase === "launch"
        ? ASSET_URLS.lottie.joopsLaunch
        : ASSET_URLS.lottie.joopsIdle;

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-[#04060f]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      onPointerDown={encourage}
    >
      {/* 저궤도 우주 배경 Lottie */}
      <div className="pointer-events-none absolute inset-0">
        <LottieStage src={ASSET_URLS.lottie.scene3Space} fit="cover" className="h-full w-full" />
      </div>

      {/* 줍이 — 타이틀 단계 전까지 중앙에 */}
      {phase !== "title" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-16">
          <LottieStage
            src={petSrc}
            loop={phase !== "launch"}
            onComplete={phase === "launch" ? () => setPhase("title") : undefined}
            fit="contain"
            className="h-64 w-64 drop-shadow-[0_0_26px_rgba(129,140,248,0.4)]"
          />
        </div>
      )}

      {/* 격려 유도 — idle에서만 손가락 + 문구 */}
      {phase === "idle" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-56">
          <motion.span
            className="text-4xl"
            animate={{ y: [0, -14, 0], scale: [1, 0.9, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            👆
          </motion.span>
          <motion.p
            className="mt-3 rounded-full bg-black/30 px-4 py-1.5 text-xs text-indigo-100"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            터치하여 줍스를 격려해 주세요!
          </motion.p>
        </div>
      )}

      {/* 타이틀 — 위성이 사라진 자리에 로고가 떠오른다 */}
      <AnimatePresence>
        {phase === "title" && (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.h1
              initial={{ y: 28, scale: 0.9, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className="bg-gradient-to-b from-white via-indigo-100 to-indigo-400 bg-clip-text text-7xl font-black tracking-[0.1em] text-transparent drop-shadow-[0_0_30px_rgba(129,140,248,0.7)]"
            >
              JOOPS
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="mt-3 text-xs tracking-[0.6em] text-indigo-200/80"
            >
              줍스 · 별빛을 되찾는 자들
            </motion.p>

            <AnimatePresence>
              {textDone && (
                <motion.button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onDone();
                  }}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7 }}
                  className="mt-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-9 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(99,102,241,0.55)] active:scale-95"
                >
                  🛰️ 게임 시작하기
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 나레이션은 타이틀 단계에서 타이핑 → 완료되면 시작 버튼 공개 */}
      {phase === "title" && (
        <TypewriterNarration text={TEXT} onComplete={() => setTextDone(true)} />
      )}
    </motion.div>
  );
}
