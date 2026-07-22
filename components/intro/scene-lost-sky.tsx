"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import FacetedEarth from "@/components/intro/faceted-earth";
import Narration from "@/components/intro/narration";

/**
 * [Scene 1] 암울한 현실.
 * 아름답게 반짝이던 '별빛'에 줌인하면, 사실은 궤도를 둘러싼
 * 금속 파편(우주 쓰레기)이었다는 반전이 드러난다.
 *
 * 구현: 별과 파편을 같은 자리에 겹쳐 두고 opacity 크로스페이드.
 * 배치는 인덱스 기반 의사 랜덤 — 렌더마다 같은 값이라 hydration 안전.
 */

const SHARDS = Array.from({ length: 26 }, (_, i) => ({
  left: (i * 41 + 7) % 100, // %
  top: 6 + ((i * 29 + 5) % 50), // % — 지구 위 하늘 영역에만
  size: 9 + ((i * 13) % 10), // px
  twinkleDur: 1.6 + ((i * 7) % 12) / 6, // 반짝임 주기
  delay: ((i * 17) % 20) / 10, // 반짝임 시차
  rot: (i * 47) % 360, // 파편으로 변할 때의 회전각
  variant: i % 3,
}));

/** 날카로운 금속 파편 실루엣 3종 */
const SHARD_PATHS = [
  "M2 6 L9 1 L14 5 L11 13 L4 12 Z",
  "M1 8 L7 2 L13 4 L12 11 L5 14 Z",
  "M3 3 L11 2 L14 9 L8 14 L2 10 Z",
];

/*
 * 대폐색(The Great Blockade) 서사 — 배경 스토리 문서의 캐논.
 * 버려진 위성들의 연쇄 충돌(케슬러 신드롬)로 하늘이 파편 띠에 갇힌 날.
 */
const NARRATION_LINES = [
  "한때 인류는 저 너머의 별을 꿈꿨습니다.",
  "하지만 버려진 위성들이 부딪히고, 또 부딪혀… 하늘은 거대한 파편 띠에 갇혔습니다.",
  "사람들은 그날을 '대폐색'이라 부릅니다. 지금 보이는 반짝임은… 별빛이 아닙니다.",
];

export default function SceneLostSky({ onDone }: { onDone: () => void }) {
  const [revealed, setRevealed] = useState(false); // 파편 정체 공개 여부
  const [step, setStep] = useState(0); // 나레이션 진행

  // onDone이 바뀌어도 타이머를 다시 걸지 않도록 ref로 들고 있는다
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 700),
      setTimeout(() => setRevealed(true), 3800), // 줌인 + 반전 시작
      setTimeout(() => setStep(2), 4300),
      setTimeout(() => setStep(3), 8200),
      setTimeout(() => onDoneRef.current(), 13000), // 자동 진행
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      onClick={() => onDoneRef.current()}
    >
      {/* 하늘 — 꿈결 같은 남보라색이 반전 후 차갑게 식는다 */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ backgroundColor: revealed ? "#04050d" : "#0b0d2b" }}
        transition={{ duration: 2 }}
      />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(129,140,248,0.28),transparent_60%)]"
        initial={false}
        animate={{ opacity: revealed ? 0 : 1 }}
        transition={{ duration: 2 }}
      />

      {/* 줌 컨테이너 — 반짝임을 향해 카메라가 다가간다 */}
      <motion.div
        className="absolute inset-0 origin-[50%_38%]"
        initial={false}
        animate={{ scale: revealed ? 1.45 : 1 }}
        transition={{ duration: 3, ease: "easeInOut" }}
      >
        {SHARDS.map((shard, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${shard.left}%`,
              top: `${shard.top}%`,
              width: shard.size,
              height: shard.size,
            }}
          >
            {/* 별인 척하는 반짝임 */}
            <motion.span
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: revealed ? 0 : 1 }}
              transition={{ duration: 1.2 }}
            >
              <span
                className="animate-star-twinkle block h-full w-full"
                style={
                  {
                    "--twinkle-duration": `${shard.twinkleDur}s`,
                    animationDelay: `${shard.delay}s`,
                  } as CSSProperties
                }
              >
                <svg viewBox="0 0 16 16" className="h-full w-full">
                  <polygon
                    points="8,0 10,6 16,8 10,10 8,16 6,10 0,8 6,6"
                    fill="#ffffff"
                  />
                </svg>
              </span>
            </motion.span>
            {/* 정체: 날카로운 금속 파편 */}
            <motion.span
              className="absolute inset-0"
              initial={{ opacity: 0, rotate: 0 }}
              animate={{
                opacity: revealed ? 1 : 0,
                rotate: revealed ? shard.rot : shard.rot - 70,
              }}
              transition={{ duration: 1.6 }}
            >
              <svg viewBox="0 0 16 16" className="h-full w-full">
                <path
                  d={SHARD_PATHS[shard.variant]}
                  fill="#8b93a7"
                  stroke="#cbd5e1"
                  strokeWidth="0.8"
                />
              </svg>
            </motion.span>
          </span>
        ))}

        {/* 다면체 지구 */}
        <FacetedEarth className="absolute -bottom-4 left-[-15%] w-[130%]" />
      </motion.div>

      {/* 연대기 캡션 — 반전 후 지금이 '어느 시대'인지 못박는다 */}
      <motion.p
        className="pointer-events-none absolute inset-x-0 top-[12%] z-20 text-center text-[11px] tracking-[0.4em] text-slate-400/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: revealed ? 1 : 0 }}
        transition={{ duration: 1.6, delay: 0.8 }}
      >
        — 궤도 대폐색 이후 7년 —
      </motion.p>

      <Narration lines={NARRATION_LINES} step={step} />

      {/* 탭하면 다음 장면으로 — 은은한 진행 힌트 */}
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
