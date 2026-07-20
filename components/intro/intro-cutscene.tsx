"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import SceneLostSky from "@/components/intro/scene-lost-sky";
import SceneOperatorRoom from "@/components/intro/scene-operator-room";
import SceneFirstTouch from "@/components/intro/scene-first-touch";

/**
 * 오프닝 컷신 오케스트레이터.
 *
 * 장면 번호(state)만 관리하고, 연출은 각 장면 컴포넌트에 위임한다.
 * AnimatePresence(mode="wait")가 이전 장면의 퇴장 애니메이션이
 * 끝나기를 기다렸다가 다음 장면을 등장시켜 크로스페이드를 만든다.
 */
export default function IntroCutscene({ onFinish }: { onFinish: () => void }) {
  const [scene, setScene] = useState<1 | 2 | 3>(1);

  return (
    <div className="touch-game relative h-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        {scene === 1 && <SceneLostSky key="scene-1" onDone={() => setScene(2)} />}
        {scene === 2 && (
          <SceneOperatorRoom key="scene-2" onDone={() => setScene(3)} />
        )}
        {scene === 3 && <SceneFirstTouch key="scene-3" onDone={onFinish} />}
      </AnimatePresence>

      {/* 언제든 탈출할 수 있게 — 스킵은 유저의 권리 */}
      <button
        type="button"
        onClick={onFinish}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-full border border-panel-border bg-panel/60 px-3 py-1.5 text-[11px] text-foreground/50 active:scale-95"
      >
        건너뛰기
      </button>
    </div>
  );
}
