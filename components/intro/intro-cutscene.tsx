"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Scene1Reality from "@/components/intro/scene-1-reality";
import Scene2Console from "@/components/intro/scene-2-console";
import Scene3Launch from "@/components/intro/scene-3-launch";

/**
 * 오프닝 컷신 오케스트레이터 — Lottie 기반 3장 시네마틱.
 *
 * currentScene(1/2/3)만 관리하고 연출은 각 장면에 위임한다.
 * AnimatePresence(mode="wait")가 퇴장 애니메이션을 기다렸다가 다음 장면을
 * 등장시켜 크로스페이드를 만든다.
 *
 * 모바일 최적화:
 * - 100dvh(svh 폴백)로 주소창 접힘에도 꽉 찬 높이 유지
 * - touch-game 클래스(touch-action:none)로 스크롤·핀치줌 차단, 텍스트 선택 방지
 * - 진행은 각 장면이 onPointerDown으로 즉응 처리
 */
export default function IntroCutscene({ onFinish }: { onFinish: () => void }) {
  const [scene, setScene] = useState<1 | 2 | 3>(1);

  return (
    <div
      className="touch-game relative overflow-hidden bg-black"
      style={{ height: "100dvh" }}
    >
      <AnimatePresence mode="wait">
        {scene === 1 && <Scene1Reality key="s1" onDone={() => setScene(2)} />}
        {scene === 2 && <Scene2Console key="s2" onDone={() => setScene(3)} />}
        {scene === 3 && <Scene3Launch key="s3" onDone={onFinish} />}
      </AnimatePresence>

      {/* 스킵은 유저의 권리 — 언제든 탈출 */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation();
          onFinish();
        }}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-full border border-panel-border bg-panel/60 px-3 py-1.5 text-[11px] text-foreground/50 active:scale-95"
      >
        건너뛰기
      </button>
    </div>
  );
}
