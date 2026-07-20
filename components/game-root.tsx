"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import IntroCutscene from "@/components/intro/intro-cutscene";
import HomeScreen from "@/components/home/home-screen";

/**
 * 게임 진입 분기 — 첫 방문이면 오프닝 컷신, 아니면 바로 홈 화면.
 *
 * "봤다" 기록은 일단 localStorage에 남긴다 (기기별 기록).
 * Supabase 인증이 붙으면 유저 프로필로 옮겨 기기가 바뀌어도 유지되게 한다.
 * 주소 뒤에 ?intro=1 을 붙이면 언제든 컷신을 다시 볼 수 있다.
 */
const INTRO_SEEN_KEY = "joops.intro-seen.v1";

type Stage = "boot" | "intro" | "game";

export default function GameRoot() {
  // 서버는 localStorage를 모르므로, 서버가 그리는 첫 화면은 무조건 "boot"(검은 화면).
  // 마운트 후(브라우저에서만 실행되는 useEffect) 분기해야 hydration이 어긋나지 않는다.
  const [stage, setStage] = useState<Stage>("boot");

  useEffect(() => {
    const forceIntro = new URLSearchParams(window.location.search).has("intro");
    const seen = window.localStorage.getItem(INTRO_SEEN_KEY);
    setStage(forceIntro || !seen ? "intro" : "game");
  }, []);

  const finishIntro = () => {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    setStage("game");
  };

  return (
    <div className="h-full bg-black">
      <AnimatePresence mode="wait">
        {stage === "intro" && (
          <motion.div
            key="intro"
            className="h-full"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          >
            <IntroCutscene onFinish={finishIntro} />
          </motion.div>
        )}
        {stage === "game" && (
          <motion.div
            key="game"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <HomeScreen />
          </motion.div>
        )}
        {/* stage === "boot"이면 아무것도 그리지 않음 — 컷신 첫 장면(암전)과 자연스럽게 이어진다 */}
      </AnimatePresence>
    </div>
  );
}
