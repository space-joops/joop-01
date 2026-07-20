"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { PointerEvent } from "react";
import BabySatellite from "@/components/intro/baby-satellite";
import FacetedEarth from "@/components/intro/faceted-earth";
import Narration from "@/components/intro/narration";

/**
 * [Scene 3] 교감과 출격 — 유일한 인터랙티브 장면.
 *
 * 컷신을 "보기만" 하지 않는다. 유저가 직접 화면을 쓰다듬어야
 * 위성이 용기를 얻어 출격한다 (온보딩 원칙: 텍스트 설명 없이
 * 손 아이콘 힌트만으로 터치를 유도).
 *
 * 진행: pet(쓰다듬기 대기) → shake(설레는 떨림) → fly(발진) → title(로고)
 */

type Phase = "pet" | "shake" | "fly" | "title";

/** 누적 이동 거리 이만큼(px)마다 교감 1회 */
const STROKE_STEP = 30;
/** 이만큼 교감하면 출격 */
const STROKE_GOAL = 8;

/** 배경의 각진 별들 (결정적 배치) */
const STARS = Array.from({ length: 20 }, (_, i) => ({
  left: (i * 43 + 9) % 100,
  top: 4 + ((i * 31 + 3) % 58),
  size: 7 + ((i * 11) % 8),
  twinkleDur: 1.8 + ((i * 7) % 10) / 5,
}));

/** 발진할 때 스쳐 지나가는 별빛 줄기 */
const STREAKS = Array.from({ length: 12 }, (_, i) => ({
  left: (i * 37 + 13) % 100,
  duration: 0.7 + ((i * 13) % 8) / 10,
  delay: ((i * 19) % 12) / 10,
}));

const NARRATION_LINES = [
  "우리의 작은 친구와 함께,",
  "잃어버린 별빛을 되찾으러 갈 시간입니다.",
];

interface Particle {
  id: number;
  x: number;
  y: number;
}

export default function SceneFirstTouch({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("pet");
  const [strokes, setStrokes] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [happy, setHappy] = useState(false);
  const [step, setStep] = useState(0);
  const [showStart, setShowStart] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<{ lastX: number; lastY: number; gauge: number } | null>(
    null,
  );
  const particleIdRef = useRef(0);
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 언마운트 시 모든 타이머 정리
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // 타이틀 단계: 나레이션과 시작 버튼을 차례로 공개
  useEffect(() => {
    if (phase !== "title") return;
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 1300),
      setTimeout(() => setShowStart(true), 2300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  const spawnHeart = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = particleIdRef.current++;
    setParticles((prev) => [
      ...prev,
      { id, x: clientX - rect.left, y: clientY - rect.top },
    ]);
    timersRef.current.push(
      setTimeout(
        () => setParticles((prev) => prev.filter((p) => p.id !== id)),
        900,
      ),
    );
  };

  const flashHappy = () => {
    setHappy(true);
    if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
    happyTimerRef.current = setTimeout(() => setHappy(false), 650);
  };

  /** 교감 1회 — 목표에 도달하면 출격 시퀀스 시작 */
  const registerStroke = (clientX: number, clientY: number) => {
    spawnHeart(clientX, clientY);
    flashHappy();
    setStrokes((count) => {
      const next = count + 1;
      if (next >= STROKE_GOAL && phase === "pet") {
        // 출격! 설레는 떨림 → 발진 → 타이틀
        setPhase("shake");
        timersRef.current.push(
          setTimeout(() => setPhase("fly"), 600),
          setTimeout(() => setPhase("title"), 2800),
        );
      }
      return next;
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "pet") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    trackRef.current = { lastX: event.clientX, lastY: event.clientY, gauge: 0 };
    // 콕 찍기만 해도 교감으로 인정 (관대한 온보딩)
    registerStroke(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "pet") return;
    const track = trackRef.current;
    if (!track) return;
    const dist = Math.hypot(
      event.clientX - track.lastX,
      event.clientY - track.lastY,
    );
    track.lastX = event.clientX;
    track.lastY = event.clientY;
    track.gauge += dist;
    while (track.gauge >= STROKE_STEP) {
      track.gauge -= STROKE_STEP;
      registerStroke(event.clientX, event.clientY);
    }
  };

  const handlePointerUp = () => {
    trackRef.current = null;
  };

  const flying = phase === "fly" || phase === "title";

  // 단계별 위성 움직임: 둥실 → 떨림 → 하늘로 발진
  const satelliteAnimate = flying
    ? { y: -560, x: 0, scale: 0.4, rotate: -6 }
    : phase === "shake"
      ? { x: [0, -5, 5, -4, 4, 0], y: 0 }
      : { y: [0, -10, 0], x: 0 };
  const satelliteTransition = flying
    ? { duration: 2.2, ease: "easeIn" as const }
    : phase === "shake"
      ? { duration: 0.55 }
      : { duration: 3, repeat: Infinity, ease: "easeInOut" as const };

  return (
    <motion.div
      ref={containerRef}
      className="touch-game absolute inset-0 overflow-hidden bg-[#04050d]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 각진 별 배경 */}
      {STARS.map((star, i) => (
        <span
          key={i}
          className="animate-star-twinkle absolute"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            "--twinkle-duration": `${star.twinkleDur}s`,
          } as React.CSSProperties}
        >
          <svg viewBox="0 0 16 16" className="h-full w-full">
            <polygon
              points="8,0 10,6 16,8 10,10 8,16 6,10 0,8 6,6"
              fill="#ffffff"
              opacity="0.8"
            />
          </svg>
        </span>
      ))}

      {/* 발진 시 스쳐가는 별빛 줄기 — 위로 나는 속도감 연출 */}
      {flying &&
        STREAKS.map((streak, i) => (
          <motion.span
            key={i}
            className="absolute h-24 w-px bg-gradient-to-b from-transparent via-white/70 to-transparent"
            style={{ left: `${streak.left}%` }}
            initial={{ y: -120, opacity: 0 }}
            animate={{ y: 900, opacity: [0, 0.8, 0] }}
            transition={{
              duration: streak.duration,
              repeat: Infinity,
              delay: streak.delay,
              ease: "linear",
            }}
          />
        ))}

      {/* 다면체 지구 — 위성이 떠오르면 아래로 밀려나는 시차(패럴랙스) */}
      <motion.div
        className="absolute -bottom-6 left-[-10%] w-[120%]"
        initial={false}
        animate={{ y: flying ? 180 : 0 }}
        transition={{ duration: 2.4, ease: "easeIn" }}
      >
        <FacetedEarth className="w-full opacity-90" />
      </motion.div>

      {/* 아기 위성 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-16">
        <motion.div animate={satelliteAnimate} transition={satelliteTransition}>
          <BabySatellite
            mood={happy || phase !== "pet" ? "happy" : "idle"}
            thruster={phase !== "pet"}
            className="w-44 drop-shadow-[0_0_26px_rgba(129,140,248,0.4)]"
          />
        </motion.div>
      </div>

      {/* 쓰다듬기 유도 손 아이콘 — 텍스트 없이 제스처만 보여준다 */}
      {phase === "pet" && strokes === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <motion.span
            className="mt-24 text-4xl"
            animate={{ x: [-38, 38, -38], y: [0, -16, 0], rotate: [-8, 8, -8] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          >
            👆
          </motion.span>
        </div>
      )}

      {/* 교감 하트 파티클 */}
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="animate-particle-rise pointer-events-none absolute text-2xl"
          style={{ left: particle.x, top: particle.y }}
          aria-hidden
        >
          💛
        </span>
      ))}

      {/* 타이틀 로고 */}
      {phase === "title" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
          <motion.h1
            initial={{ y: 28, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            className="bg-gradient-to-b from-white via-indigo-100 to-indigo-400 bg-clip-text text-6xl font-black tracking-[0.12em] text-transparent drop-shadow-[0_0_28px_rgba(129,140,248,0.7)]"
          >
            JOOPS
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-3 text-xs tracking-[0.65em] text-indigo-200/80"
          >
            줍스 · 별빛을 되찾는 자들
          </motion.p>
          {showStart && (
            <motion.button
              type="button"
              onClick={onDone}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="mt-10 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-8 py-3.5 text-sm font-bold text-white shadow-[0_0_30px_rgba(99,102,241,0.55)] active:scale-95"
            >
              🛰️ 관제 콘솔 접속
            </motion.button>
          )}
        </div>
      )}

      <Narration lines={NARRATION_LINES} step={step} />
    </motion.div>
  );
}
