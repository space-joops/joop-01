"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import BabySatellite from "@/components/intro/baby-satellite";
import Narration from "@/components/intro/narration";

/**
 * [Scene 2] 새로운 시작.
 * 어질러진 좁은 방, 모니터 불빛만 켜진 책상.
 * 접속 문구가 타자기처럼 찍히고, 화면 너머로 아기 위성이 인사한다.
 */

const LOGIN_TEXT = "재택근무 오퍼레이터 접속 완료";
/** 타자기 효과 속도 (ms/글자) */
const TYPE_INTERVAL_MS = 75;

const NARRATION_LINES = [
  "우주는 닫혔고, 모두가 포기했죠.",
  "하지만 우리는 다릅니다.",
];

export default function SceneOperatorRoom({ onDone }: { onDone: () => void }) {
  const [monitorOn, setMonitorOn] = useState(false);
  const [typedCount, setTypedCount] = useState(0); // 찍힌 글자 수
  const [showSatellite, setShowSatellite] = useState(false);
  const [step, setStep] = useState(0);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setMonitorOn(true), 600),
      setTimeout(() => setStep(1), 4300),
      setTimeout(() => setStep(2), 6900),
      setTimeout(() => onDoneRef.current(), 10000),
    ];

    // 타자기 효과 — 파이썬의 time.sleep 루프 대신 setInterval로 한 글자씩
    let typer: ReturnType<typeof setInterval>;
    timers.push(
      setTimeout(() => {
        typer = setInterval(() => {
          setTypedCount((count) => {
            if (count >= LOGIN_TEXT.length) {
              clearInterval(typer);
              // 접속 완료 직후 아기 위성 등장
              timers.push(setTimeout(() => setShowSatellite(true), 500));
              return count;
            }
            return count + 1;
          });
        }, TYPE_INTERVAL_MS);
      }, 1500),
    );

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(typer);
    };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-[#050508]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onClick={() => onDoneRef.current()}
    >
      {/* 방의 어스름 — 가장자리로 갈수록 어두운 비네트 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(49,46,129,0.18),transparent_65%)]" />

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* 모니터 백라이트 글로우 */}
        <motion.div
          className="absolute h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl"
          initial={false}
          animate={{ opacity: monitorOn ? 1 : 0 }}
          transition={{ duration: 1.2 }}
        />

        {/* 모니터 — 켜질 때 형광등처럼 깜빡인다 */}
        <motion.div
          className="relative z-10 w-72 rounded-xl border-4 border-[#23263a] bg-[#0b1120] p-4 shadow-[0_0_70px_rgba(99,102,241,0.3)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: monitorOn ? [0, 1, 0.4, 1] : 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] font-bold tracking-[0.35em] text-indigo-300">
            CLEAR SKY
          </p>
          <p className="mt-2 h-5 font-mono text-xs text-emerald-300">
            {LOGIN_TEXT.slice(0, typedCount)}
            <span className="animate-pulse">▌</span>
          </p>
          {/* 모니터 속 위성 관제 화면 */}
          <div className="mt-3 flex h-32 items-center justify-center overflow-hidden rounded-md bg-[#060a18]">
            {showSatellite ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.55, duration: 0.9 }}
              >
                <BabySatellite mood="happy" className="w-28" />
              </motion.div>
            ) : (
              <span className="font-mono text-[10px] tracking-widest text-foreground/25">
                NO SIGNAL
              </span>
            )}
          </div>
        </motion.div>

        {/* 모니터 스탠드와 책상 실루엣 */}
        <div className="z-10 h-8 w-3 bg-[#191b2b]" />
        <div className="z-10 h-2.5 w-36 rounded-full bg-[#191b2b]" />
        <div className="relative z-10 mt-1 h-16 w-[115%] rounded-t-[28px] bg-[#101221]">
          {/* 어질러진 책상 위 잡동사니 — 식은 커피와 수첩 더미 */}
          <div className="absolute -top-6 left-[16%] h-6 w-5 rounded-b-md rounded-t-sm bg-[#1c1e30]" />
          <div className="absolute -top-3 right-[18%] h-3 w-14 rotate-2 rounded-sm bg-[#181a2a]" />
          <div className="absolute -top-5 right-[20%] h-2.5 w-11 -rotate-3 rounded-sm bg-[#1c1e30]" />
        </div>
      </div>

      <Narration lines={NARRATION_LINES} step={step} />

      <div className="absolute inset-x-0 bottom-5 flex justify-center">
        <motion.span
          className="text-xs text-foreground/40"
          animate={{ opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          ▾
        </motion.span>
      </div>
    </motion.div>
  );
}
