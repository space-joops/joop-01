"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import LottieStage from "@/components/intro/lottie-stage";
import TypewriterNarration from "@/components/intro/typewriter-narration";
import { ASSET_URLS } from "@/components/intro/intro-assets";

/**
 * [Scene 1] 암울한 현실.
 * 다면체 지구를 파편이 빽빽이 둘러싼 궤도. 반짝임의 정체는 별빛이 아니다.
 */

const TEXT =
  "한때 인류는 저 너머의 별을 꿈꿨습니다. 하지만 지금 우리가 보는 반짝임은… 별빛이 아닙니다.";

export default function Scene1Reality({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  const [skip, setSkip] = useState(0);

  const advance = () => {
    if (!done) setSkip((n) => n + 1); // 타이핑 중이면 먼저 완성
    else onDone();
  };

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-[#04050d]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      onPointerDown={advance}
    >
      {/* 지구+파편 Lottie — 천천히 회전, 텍스트 완성되면 앞쪽으로 살짝 흐려진다 */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={false}
        animate={{ scale: done ? 1.12 : 1, filter: done ? "blur(2px)" : "blur(0px)" }}
        transition={{ duration: 2.4, ease: "easeInOut" }}
      >
        <LottieStage
          src={ASSET_URLS.lottie.scene1Earth}
          fit="contain"
          className="h-[70%] w-[92%]"
        />
      </motion.div>

      {/* 차가운 우주 비네트 */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,transparent_45%,rgba(4,5,13,0.85)_100%)]" />

      <TypewriterNarration
        text={TEXT}
        completeSignal={skip}
        onComplete={() => setDone(true)}
      />
    </motion.div>
  );
}
