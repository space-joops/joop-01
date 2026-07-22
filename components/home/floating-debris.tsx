"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePetStore, isSleeping } from "@/stores/pet-store";
import { DEBRIS_SRC, type DebrisKind } from "@/components/action/sortie-assets";

/**
 * 홈 화면 부유 파편 — 궤도를 떠다니는 우주 쓰레기 간식.
 *
 * 미니게임의 파편이 홈에도 가끔(동시 최대 2개) 흘러들어온다. 탭하면
 * 줍이에게 빨려가며 수집 — 보상은 펫 탭과 같은 eatDebris 규칙(파편+1·
 * EXP+2·데이터 축적·배터리-2)이라 밸런스가 새지 않는다. 아이템의
 * 주 획득처는 어디까지나 미니게임 — 여기는 방치와 액션 사이의 간식이다.
 *
 * 레이어는 pointer-events-none, 파편 버튼에만 auto — 펫 제스처(탭 냠냠·
 * 쓰다듬기)를 방해하지 않는다.
 */

/** 동시 최대 개수 — 홈은 간식, 잔치는 미니게임에서 */
const MAX_ITEMS = 2;
/** 스폰 판정 주기(ms)와 확률 — 평균 ~48초에 한 개, 듬성듬성 */
const SPAWN_ROLL_MS = 12_000;
const SPAWN_CHANCE = 0.25;
/** 첫 파편 등장(ms) — 홈에 들어오면 하나쯤은 곧 흘러온다 (발견의 순간) */
const FIRST_SPAWN_MS = 6_000;
/** 화면을 가로지르는 시간(초) — 서두르지 않는 표류 */
const DRIFT_SEC = 95;

/** 홈에 흘러드는 소형 파편들 (대형·위험물은 미니게임 전용) */
const HOME_KINDS: DebrisKind[] = ["chip", "bolt", "nut", "gear"];

interface FloatItem {
  id: number;
  kind: DebrisKind;
  /** 왼→오(1) / 오→왼(-1) */
  dir: 1 | -1;
  /** 세로 위치(%) */
  top: number;
  collected: boolean;
}

export default function FloatingDebris() {
  const [items, setItems] = useState<FloatItem[]>([]);
  const idRef = useRef(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const spawn = () => {
    const s = usePetStore.getState();
    // 동면·절전엔 수집 자체가 안 되니 스폰하지 않는다
    if (s.mood === "hibernate" || isSleeping(s.battery)) return;
    if (itemsRef.current.length >= MAX_ITEMS) return;
    setItems((prev) => [
      ...prev,
      {
        id: idRef.current++,
        kind: HOME_KINDS[Math.floor(Math.random() * HOME_KINDS.length)],
        dir: Math.random() < 0.5 ? 1 : -1,
        top: 15 + Math.random() * 55,
        collected: false,
      },
    ]);
  };

  useEffect(() => {
    const first = setTimeout(spawn, FIRST_SPAWN_MS);
    const roll = setInterval(() => {
      if (Math.random() < SPAWN_CHANCE) spawn();
    }, SPAWN_ROLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(roll);
    };
  }, []);

  const remove = (id: number) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  const collect = (item: FloatItem) => {
    if (item.collected) return;
    const s = usePetStore.getState();
    if (s.mood === "hibernate" || isSleeping(s.battery)) return;
    // 펫 탭과 같은 규칙으로 수집 + 도감 기록
    s.eatDebris();
    s.recordCollect(item.kind);
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, collected: true } : it)),
    );
    // 빨려가는 연출이 끝나면 제거
    setTimeout(() => remove(item.id), 450);
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {items.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            aria-label="떠다니는 파편 수집"
            className="pointer-events-auto absolute -ml-6 -mt-6 p-1.5"
            style={{ top: `${item.top}%` }}
            initial={{ left: item.dir === 1 ? "-8%" : "108%", opacity: 0 }}
            animate={
              item.collected
                ? // 수집: 펫(중앙)으로 빨려들며 사라진다
                  { left: "50%", top: "48%", scale: 0.15, opacity: 0, rotate: 360 }
                : {
                    left: item.dir === 1 ? "108%" : "-8%",
                    opacity: [0, 1, 1, 1, 0.9],
                    rotate: item.dir * 300,
                  }
            }
            exit={{ opacity: 0, scale: 0.4 }}
            transition={
              item.collected
                ? { duration: 0.42, ease: "easeIn" }
                : { duration: DRIFT_SEC, ease: "linear" }
            }
            onAnimationComplete={() => {
              // 표류가 끝나(반대편 도달) 화면 밖으로 나가면 자연 소멸
              if (!item.collected) remove(item.id);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              collect(item);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 파편 */}
            <img
              src={DEBRIS_SRC[item.kind]}
              alt=""
              className="w-9 animate-pulse drop-shadow-[0_0_10px_rgba(207,224,255,0.45)]"
              draggable={false}
            />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
