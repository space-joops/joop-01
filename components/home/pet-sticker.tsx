"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  usePetStore,
  isSleeping,
  isDataFull,
  type PetMood,
} from "@/stores/pet-store";
import {
  FX_SRC,
  petSprite,
  type PetEmotion,
} from "@/components/action/sortie-assets";

/**
 * 2D 스티커 줍이 — 홈 화면의 펫 본체.
 *
 * 3D(R3F+GLB)를 접고 SVG 에셋 팩의 카와이 스티커로 전환했다.
 * 감정 연출은 팩에 미리 구워진 프리베이크 6종(안테나 처짐·날개 접힘·
 * 눈빛까지 포즈가 완성된 파일)을 스왑하는 방식 — 리그를 코드로 돌리는
 * 대신 "잘 그린 그림을 갈아끼운다". 미니게임·OG 카드·플라이바이와
 * 같은 얼굴이라 게임 전체의 인상이 통일된다.
 *
 * 연속적인 생명감(둥실 부유·버스트 홉·쓰다듬기 반응)은 컨테이너의
 * Framer Motion이 담당한다. 터치는 부모(pet-satellite)의 DOM 레이어가
 * 받아 petting/burstNonce 신호로 내려온다 — 3D 시절과 같은 계약.
 */

/** 홈 화면 상태 메시지와 같은 우선순위로 감정을 결정한다 (3D 시절 로직 이식) */
function deriveEmotion(
  mood: PetMood,
  battery: number,
  dataUsed: number,
): PetEmotion | undefined {
  if (mood === "hibernate") return "hibernate";
  if (isSleeping(battery)) return "powersave";
  if (mood === "sulky") return "sulky";
  if (isDataFull(dataUsed)) return "data_full";
  if (battery <= 15) return "low_battery";
  return undefined; // 평상(normal)
}

/** 감정별 연출 파라미터 — 부유 진폭·주기, 스티커 톤 */
const MOTION: Record<
  "normal" | PetEmotion,
  { floatY: number; floatSec: number; filter?: string }
> = {
  normal: { floatY: 10, floatSec: 3 },
  happy: { floatY: 12, floatSec: 2.4 },
  low_battery: { floatY: 6, floatSec: 3.8 },
  data_full: { floatY: 9, floatSec: 3 },
  sulky: { floatY: 5, floatSec: 4.2 },
  powersave: { floatY: 3, floatSec: 5, filter: "brightness(0.8) saturate(0.85)" },
  hibernate: { floatY: 1.5, floatSec: 6, filter: "brightness(0.62) saturate(0.6)" },
};

interface PetStickerProps {
  /** 드래그로 쓰다듬는 중 — 기울기 + 기쁨 표정 */
  petting: boolean;
  /** 값이 바뀔 때마다 기쁨 버스트(홉 + 바운스) */
  burstNonce: number;
}

export default function PetSticker({ petting, burstNonce }: PetStickerProps) {
  const battery = usePetStore((state) => state.battery);
  const dataUsed = usePetStore((state) => state.dataUsed);
  const mood = usePetStore((state) => state.mood);
  const level = usePetStore((state) => state.level);
  const variant = usePetStore((state) => state.variant);

  // 탭 버스트: 잠깐 기쁨 표정 + 홉 (1.4초 뒤 원복)
  const [bursting, setBursting] = useState(false);
  useEffect(() => {
    if (burstNonce === 0) return;
    setBursting(true);
    const timer = setTimeout(() => setBursting(false), 1400);
    return () => clearTimeout(timer);
  }, [burstNonce]);

  const stateEmotion = deriveEmotion(mood, battery, dataUsed);
  // 교감 중엔 기쁨이 우선 — 단, 동면은 깨기 전까지 무표정을 유지한다
  const emotion =
    stateEmotion === "hibernate"
      ? stateEmotion
      : bursting || petting
        ? "happy"
        : stateEmotion;

  const motionSpec = MOTION[emotion ?? "normal"];
  const src = petSprite(level, variant, emotion);

  return (
    <div className="pointer-events-none relative flex h-full w-full items-center justify-center">
      {/* 착륙 등장 + 연속 부유 + 버스트 홉 + 쓰다듬기 기울기 */}
      <motion.div
        className="relative"
        initial={{ y: -120, scale: 0.6, opacity: 0 }}
        animate={{
          opacity: 1,
          y: bursting ? [0, -22, 0, -10, 0] : [0, -motionSpec.floatY, 0],
          scale: petting ? 1.06 : bursting ? [1, 1.08, 1] : 1,
          rotate: petting ? [0, -3, 3, -3, 0] : 0,
          // 데이터 가득: 미세한 부르르 (좌우 지터)
          x: emotion === "data_full" ? [0, -1.5, 1.5, -1.5, 0] : 0,
        }}
        transition={{
          opacity: { duration: 0.5 },
          y: bursting
            ? { duration: 1.2 }
            : {
                duration: motionSpec.floatSec,
                repeat: Infinity,
                ease: "easeInOut",
              },
          scale: { duration: bursting ? 0.6 : 0.25 },
          rotate: petting
            ? { duration: 1.1, repeat: Infinity }
            : { duration: 0.3 },
          x:
            emotion === "data_full"
              ? { duration: 0.35, repeat: Infinity }
              : { duration: 0.2 },
        }}
      >
        {/* 감정 스티커 — 전환 시 크로스페이드 */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.img
            key={src}
            src={src}
            alt="줍이"
            className="w-52 drop-shadow-[0_0_28px_rgba(129,140,248,0.45)]"
            style={{ filter: motionSpec.filter }}
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          />
        </AnimatePresence>

        {/* 동면: Zzz가 머리맡에 떠오른다 */}
        {emotion === "hibernate" && (
          <motion.img
            src={FX_SRC.zzz}
            alt=""
            className="absolute -right-4 -top-6 w-12"
            draggable={false}
            animate={{ y: [-2, -12], opacity: [0.9, 0], scale: [0.8, 1.15] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </motion.div>
    </div>
  );
}
