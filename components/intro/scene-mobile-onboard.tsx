"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import BabySatellite from "@/components/intro/baby-satellite";
import Narration from "@/components/intro/narration";

/**
 * [Scene 2] 새로운 시작 — 손안의 관제소.
 *
 * 어두운 화면 한가운데 스마트폰이 켜지고, 메신저로 클리어 스카이의
 * 환영 인사가 도착한다. "지금 들고 있는 그 폰이 관제 콘솔" — 게임을
 * 플레이하는 바로 그 기기가 세계관 속 장비가 되는 모바일 디제시스.
 * 마지막엔 폰 화면 속에서 파트너(아기 위성)가 첫 신호를 보낸다.
 */

/** 채팅 대본 — from: cs(클리어 스카이) / sat(위성) */
const CHAT: { from: "cs" | "sat"; text: string }[] = [
  { from: "cs", text: "축하해요! 클리어 스카이의 새 오퍼레이터가 되셨어요 🎉" },
  { from: "cs", text: "장비는 필요 없어요 — 지금 들고 계신 그 폰이 관제 콘솔이거든요 📱" },
  { from: "cs", text: "당신의 파트너를 소개할게요. 지금 궤도에서 신호를 보내는 중…" },
  { from: "sat", text: "삐빅! 반가워요 🛰️" },
];

/** 각 버블이 나타나는 시각(ms) — 그 전엔 타이핑 인디케이터가 깜빡인다 */
const CHAT_AT = [1400, 3400, 5600, 8200];
/** 위성 영상 카드가 뜨는 시각 — 세 번째 버블("신호를 보내는 중") 직후 */
const SATELLITE_AT = 7400;

const NARRATION_LINES = [
  "우주는 닫혔고, 모두가 포기했죠.",
  "하지만 손안의 작은 화면에서, 다시 시작하는 사람들이 있습니다.",
];

export default function SceneMobileOnboard({ onDone }: { onDone: () => void }) {
  const [phoneOn, setPhoneOn] = useState(false);
  const [shownChats, setShownChats] = useState(0);
  const [showSatellite, setShowSatellite] = useState(false);
  const [step, setStep] = useState(0);

  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhoneOn(true), 500),
      ...CHAT_AT.map((at, i) =>
        setTimeout(() => setShownChats(i + 1), at),
      ),
      setTimeout(() => setShowSatellite(true), SATELLITE_AT),
      setTimeout(() => setStep(1), 4600),
      setTimeout(() => setStep(2), 9200),
      setTimeout(() => onDoneRef.current(), 12500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // 다음에 올 말이 남아 있으면 타이핑 인디케이터 (위성 버블 직전엔 위성이 "입력 중")
  const typingFrom =
    shownChats < CHAT.length ? CHAT[shownChats].from : null;

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-[#050508]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onClick={() => onDoneRef.current()}
    >
      {/* 어스름 비네트 + 폰 백라이트 글로우 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(49,46,129,0.18),transparent_65%)]" />
      <motion.div
        className="absolute left-1/2 top-1/2 h-96 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-3xl"
        initial={false}
        animate={{ opacity: phoneOn ? 1 : 0 }}
        transition={{ duration: 1.2 }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        {/* 스마트폰 — 손에 든 느낌으로 살짝 기울어 있다 */}
        <motion.div
          className="relative z-10 h-[420px] w-64 rotate-[-3deg] rounded-[2rem] border-4 border-[#23263a] bg-[#0b1120] p-3 shadow-[0_0_70px_rgba(99,102,241,0.3)]"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phoneOn ? [0, 1, 0.5, 1] : 0, y: phoneOn ? 0 : 30 }}
          transition={{ duration: 0.7 }}
        >
          {/* 펀치홀 카메라 */}
          <div className="absolute left-1/2 top-2.5 h-2 w-2 -translate-x-1/2 rounded-full bg-black ring-1 ring-[#23263a]" />

          {/* 메신저 헤더 */}
          <div className="mt-3 flex items-center gap-2 border-b border-white/5 pb-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/30 text-[10px]">
              ✦
            </span>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-indigo-300">
                CLEAR SKY
              </p>
              <p className="text-[8px] text-emerald-300/80">● 온라인</p>
            </div>
          </div>

          {/* 채팅 영역 — 실제 메신저처럼 최신 메시지가 아래에 붙는다 */}
          <div className="mt-2 flex h-[240px] flex-col justify-end gap-1.5 overflow-hidden">
            {CHAT.slice(0, shownChats).map((msg) => (
              <motion.p
                key={msg.text}
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className={
                  msg.from === "cs"
                    ? "max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-[#1b2340] px-3 py-2 text-[11px] leading-snug text-indigo-50"
                    : "max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-emerald-500/20 px-3 py-2 text-[11px] leading-snug text-emerald-100"
                }
              >
                {msg.text}
              </motion.p>
            ))}

            {/* 타이핑 인디케이터 — 다음 말을 "입력 중" */}
            <AnimatePresence>
              {phoneOn && typingFrom && !showSatellite && (
                <motion.span
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex w-12 items-center justify-center gap-1 self-start rounded-2xl rounded-tl-sm bg-[#161d33] px-3 py-2"
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1 w-1 rounded-full bg-indigo-300/70"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.18,
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </AnimatePresence>

            {/* 궤도 생중계 카드 — 파트너의 첫 신호 */}
            {showSatellite && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
                className="mt-1 self-center overflow-hidden rounded-xl border border-indigo-400/25 bg-[#060a18]"
              >
                <p className="px-2 pt-1.5 text-center font-mono text-[8px] tracking-[0.3em] text-indigo-300/70">
                  LIVE · 궤도 생중계
                </p>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", bounce: 0.55, duration: 0.9, delay: 0.2 }}
                  className="px-4 pb-2"
                >
                  <BabySatellite mood="happy" className="w-24" />
                </motion.div>
              </motion.div>
            )}
          </div>

          {/* 입력창 흉내 — 폰다움을 완성하는 디테일 */}
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-[#161d33] px-3 py-2">
            <span className="flex-1 text-[10px] text-foreground/25">
              메시지 보내기…
            </span>
            <span className="text-[10px] text-indigo-300/60">➤</span>
          </div>
        </motion.div>
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
