"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { usePetStore, isSleeping } from "@/stores/pet-store";
import Satellite3D from "@/components/home/satellite-3d";

/**
 * 위성 펫 — 제스처 레이어(DOM) + 3D 본체(R3F) 조합.
 *
 * 터치는 전부 이 DOM 레이어가 받고(3D 캔버스는 pointer-events 없음),
 * 판별 결과만 스토어와 3D 연출에 전달한다. 엄지 하나로 노는 게임이라
 * "펫 영역 전체가 터치 대상"이 3D 레이캐스트 명중 판정보다 낫다.
 *
 * 제스처 2종을 Pointer 이벤트로 직접 판별한다:
 * - Tap(짧게 콕): 파편 냠냠 + 기쁨 버스트(홉·파닥임)
 * - Drag(문지르기): 쓰다듬어 수리 (시무룩 달래기 · 동면 깨우기)
 */

/** 이만큼(px) 이상 움직이면 탭이 아니라 드래그로 판정 */
const TAP_MAX_MOVE = 10;
/** 이 시간(ms) 안에 떼야 탭으로 인정 */
const TAP_MAX_DURATION = 300;
/** 드래그 누적 거리가 이만큼(px) 쌓일 때마다 쓰다듬기 1회 발동 */
const STROKE_STEP = 28;

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

/** 포인터가 눌린 동안 추적하는 값들 (렌더링과 무관하므로 ref에 보관) */
interface PointerTrack {
  startTime: number;
  totalMove: number; // 누적 이동 거리
  strokeGauge: number; // 쓰다듬기 발동용 거리 게이지
  lastX: number;
  lastY: number;
}

export default function PetSatellite() {
  const battery = usePetStore((state) => state.battery);
  const mood = usePetStore((state) => state.mood);
  const eatDebris = usePetStore((state) => state.eatDebris);
  const soothe = usePetStore((state) => state.soothe);

  const sleeping = isSleeping(battery);
  const hibernating = mood === "hibernate";

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<PointerTrack | null>(null);
  const particleIdRef = useRef(0);

  const [particles, setParticles] = useState<Particle[]>([]);
  // 3D 연출에 전달하는 신호 — 쓰다듬는 중(안테나 잔파닥임) / 기쁨 버스트 횟수
  const [petting, setPetting] = useState(false);
  const [burstNonce, setBurstNonce] = useState(0);

  /** 터치 지점에 이모지 파티클을 띄운다 (0.9초 뒤 자동 제거) */
  const spawnParticle = (emoji: string, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = particleIdRef.current++;
    setParticles((prev) => [
      ...prev,
      { id, x: clientX - rect.left, y: clientY - rect.top, emoji },
    ]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 900);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // 포인터 캡처: 손가락이 영역 밖으로 나가도 move/up 이벤트를 계속 받는다
    event.currentTarget.setPointerCapture(event.pointerId);
    trackRef.current = {
      startTime: performance.now(),
      totalMove: 0,
      strokeGauge: 0,
      lastX: event.clientX,
      lastY: event.clientY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;

    const dx = event.clientX - track.lastX;
    const dy = event.clientY - track.lastY;
    const dist = Math.hypot(dx, dy);
    track.lastX = event.clientX;
    track.lastY = event.clientY;

    // 드래그로 판정되는 순간부터 "쓰다듬는 중" 표시 (상태 전환 시 한 번만 set)
    const wasDrag = track.totalMove > TAP_MAX_MOVE;
    track.totalMove += dist;
    if (!wasDrag && track.totalMove > TAP_MAX_MOVE) setPetting(true);

    // 드래그로 판정된 뒤부터는 거리가 쌓일 때마다 쓰다듬기 발동
    if (track.totalMove > TAP_MAX_MOVE) {
      track.strokeGauge += dist;
      while (track.strokeGauge >= STROKE_STEP) {
        track.strokeGauge -= STROKE_STEP;
        soothe();
        // 동면 깨우기 중엔 온기(💗)가, 평소엔 수리(💚)가 피어오른다
        spawnParticle(hibernating ? "💗" : "💚", event.clientX, event.clientY);
      }
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    trackRef.current = null;
    setPetting(false);
    if (!track) return;

    const elapsed = performance.now() - track.startTime;
    const isTap = track.totalMove <= TAP_MAX_MOVE && elapsed <= TAP_MAX_DURATION;
    if (!isTap) return;

    if (hibernating) {
      // 동면: 탭으로는 깨어나지 않는다 — 쓰다듬어 달라는 신호만
      spawnParticle("❄️", event.clientX, event.clientY);
      return;
    }
    if (sleeping) {
      // 절전 모드: 먹일 수 없다 — 잠꼬대만 한다
      spawnParticle("💤", event.clientX, event.clientY);
      return;
    }
    eatDebris();
    setBurstNonce((n) => n + 1); // 기쁨 버스트: 홉 + 안테나 파닥임
    spawnParticle("✨", event.clientX, event.clientY);
  };

  return (
    <div
      ref={containerRef}
      className="touch-game relative flex h-full w-full items-center justify-center"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="button"
      aria-label="위성 펫 — 탭하면 파편을 먹고, 문지르면 수리돼요"
    >
      {/* 3D 줍이 — 감정 포즈(호버·처짐·접힘·눈빛)는 스토어를 보고 스스로 연기한다 */}
      <div className="absolute inset-0">
        <Satellite3D petting={petting} burstNonce={burstNonce} />
      </div>

      {/* 터치 피드백 파티클 레이어 */}
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="animate-particle-rise pointer-events-none absolute text-2xl"
          style={{ left: particle.x, top: particle.y }}
          aria-hidden
        >
          {particle.emoji}
        </span>
      ))}

      {/* 상태 표시 — 동면이 절전보다 우선 (동면이면 배터리도 0이므로) */}
      {hibernating ? (
        <span className="pointer-events-none absolute right-[18%] top-[22%] animate-pulse text-3xl">
          ❄️
        </span>
      ) : (
        sleeping && (
          <span className="pointer-events-none absolute right-[18%] top-[22%] animate-pulse text-3xl">
            💤
          </span>
        )
      )}
    </div>
  );
}
