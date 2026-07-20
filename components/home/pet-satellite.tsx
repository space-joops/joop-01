"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { usePetStore, isSleeping, type PetMood } from "@/stores/pet-store";

/**
 * 위성 펫 (임시 2D SVG 버전).
 *
 * 제스처 2종을 Pointer 이벤트로 직접 판별한다:
 * - Tap(짧게 콕): 파편 냠냠
 * - Drag(문지르기): 쓰다듬어 수리
 *
 * 나중에 R3F 로우폴리 3D 모델로 교체할 때도
 * 이 제스처 판별 로직과 스토어 연결은 그대로 재사용한다.
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
  const happyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [particles, setParticles] = useState<Particle[]>([]);
  const [happy, setHappy] = useState(false);

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

  /** 잠깐 행복한 표정 짓기 */
  const flashHappy = () => {
    setHappy(true);
    if (happyTimerRef.current) clearTimeout(happyTimerRef.current);
    happyTimerRef.current = setTimeout(() => setHappy(false), 700);
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
    track.totalMove += dist;

    // 드래그로 판정된 뒤부터는 거리가 쌓일 때마다 쓰다듬기 발동
    if (track.totalMove > TAP_MAX_MOVE) {
      track.strokeGauge += dist;
      while (track.strokeGauge >= STROKE_STEP) {
        track.strokeGauge -= STROKE_STEP;
        soothe();
        // 동면 깨우기 중엔 온기(💗)가, 평소엔 수리(💚)가 피어오른다
        if (hibernating) {
          spawnParticle("💗", event.clientX, event.clientY);
        } else {
          flashHappy();
          spawnParticle("💚", event.clientX, event.clientY);
        }
      }
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    trackRef.current = null;
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
    flashHappy();
    spawnParticle("✨", event.clientX, event.clientY);
  };

  return (
    <div
      ref={containerRef}
      className="touch-game relative flex h-full w-full items-center justify-center"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="button"
      aria-label="위성 펫 — 탭하면 파편을 먹고, 문지르면 수리돼요"
    >
      {/* 위성 본체 — 동면: 얼어붙어 채도까지 잃는다 / 절전: 둥실거림만 멈춘다 */}
      <div
        className={
          hibernating
            ? "opacity-60 saturate-[0.35] transition-all duration-700"
            : sleeping
              ? "opacity-70"
              : "animate-pet-float"
        }
      >
        <SatelliteSvg sleeping={sleeping} happy={happy} mood={mood} />
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

/** 로우폴리 감성의 임시 2D 위성 — 추후 R3F 3D 모델로 교체 예정 */
function SatelliteSvg({
  sleeping,
  happy,
  mood,
}: {
  sleeping: boolean;
  happy: boolean;
  mood: PetMood;
}) {
  const hibernating = mood === "hibernate";
  // 표정 우선순위: 동면(꽁꽁) > 행복(쓰다듬는 순간) > 절전 > 시무룩 > 평상시
  const face = hibernating
    ? "closed"
    : happy
      ? "happy"
      : sleeping
        ? "closed"
        : mood === "sulky"
          ? "sulky"
          : "normal";

  return (
    <svg
      viewBox="0 0 220 170"
      className="w-64 drop-shadow-[0_0_24px_rgba(129,140,248,0.35)]"
      aria-hidden
    >
      {/* 안테나 — 끝의 램프는 상태등 (정상: 초록 / 절전: 빨강 / 동면: 얼음빛) */}
      <line x1="110" y1="30" x2="110" y2="56" stroke="#8b93bd" strokeWidth="4" />
      <circle
        cx="110"
        cy="24"
        r="7"
        fill={hibernating ? "#7dd3fc" : sleeping ? "#f87171" : "#34d399"}
      >
        {!sleeping && !hibernating && (
          <animate
            attributeName="opacity"
            values="1;0.4;1"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </circle>

      {/* 왼쪽 태양광 패널 */}
      <g>
        <rect x="58" y="86" width="14" height="10" fill="#8b93bd" />
        <rect
          x="8"
          y="70"
          width="52"
          height="42"
          rx="5"
          fill="#3b4aa0"
          stroke="#5c6fd6"
          strokeWidth="2"
        />
        <line x1="25" y1="72" x2="25" y2="110" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="42" y1="72" x2="42" y2="110" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="10" y1="91" x2="58" y2="91" stroke="#5c6fd6" strokeWidth="1.5" />
      </g>

      {/* 오른쪽 태양광 패널 */}
      <g>
        <rect x="148" y="86" width="14" height="10" fill="#8b93bd" />
        <rect
          x="160"
          y="70"
          width="52"
          height="42"
          rx="5"
          fill="#3b4aa0"
          stroke="#5c6fd6"
          strokeWidth="2"
        />
        <line x1="177" y1="72" x2="177" y2="110" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="194" y1="72" x2="194" y2="110" stroke="#5c6fd6" strokeWidth="1.5" />
        <line x1="162" y1="91" x2="210" y2="91" stroke="#5c6fd6" strokeWidth="1.5" />
      </g>

      {/* 몸통 — 밝은 면/어두운 면을 나눠 로우폴리 느낌 */}
      <rect
        x="72"
        y="56"
        width="76"
        height="70"
        rx="16"
        fill="#e8eaf6"
        stroke="#b9c0e4"
        strokeWidth="2"
      />
      <path
        d="M72 100 L148 88 L148 110 A16 16 0 0 1 132 126 L88 126 A16 16 0 0 1 72 110 Z"
        fill="#c9d0ef"
      />

      {/* 얼굴 */}
      {face === "closed" ? (
        // 절전·동면: 지그시 감은 눈
        <g stroke="#1f2547" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M88 84 q6 5 12 0" />
          <path d="M120 84 q6 5 12 0" />
        </g>
      ) : face === "happy" ? (
        // 행복: ∪∪ 웃는 눈
        <g stroke="#1f2547" strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M88 86 q6 -7 12 0" />
          <path d="M120 86 q6 -7 12 0" />
        </g>
      ) : face === "sulky" ? (
        // 시무룩: 눈꼬리가 처진 반달 눈 + 그렁그렁 눈물 한 방울
        <g>
          <g
            stroke="#1f2547"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M88 81 q6 6 12 3" />
            <path d="M132 81 q-6 6 -12 3" />
          </g>
          <circle cx="99" cy="92" r="2.6" fill="#7dd3fc" opacity="0.9" />
        </g>
      ) : (
        // 평상시: 동그란 눈
        <g fill="#1f2547">
          <circle cx="94" cy="84" r="5.5" />
          <circle cx="126" cy="84" r="5.5" />
        </g>
      )}

      {/* 볼터치 — 동면 중엔 혈색도 옅어진다 */}
      <circle cx="85" cy="97" r="5" fill="#f9a8d4" opacity={hibernating ? 0.25 : 0.6} />
      <circle cx="135" cy="97" r="5" fill="#f9a8d4" opacity={hibernating ? 0.25 : 0.6} />

      {/* 입 — 시무룩할 땐 뿌루퉁하게 뒤집힌다 */}
      {face !== "closed" && (
        <path
          d={
            face === "happy"
              ? "M104 100 q6 8 12 0"
              : face === "sulky"
                ? "M104 104 q6 -6 12 0"
                : "M106 101 q4 4 8 0"
          }
          stroke="#1f2547"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* 동면: 몸에 내려앉은 성에 */}
      {hibernating && (
        <g fill="#bae6fd" opacity="0.85">
          <path d="M80 62 l2.5 5 5 2.5 -5 2.5 -2.5 5 -2.5 -5 -5 -2.5 5 -2.5 Z" />
          <path d="M138 112 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 Z" />
          <path d="M126 60 l1.5 3 3 1.5 -3 1.5 -1.5 3 -1.5 -3 -3 -1.5 3 -1.5 Z" />
        </g>
      )}
    </svg>
  );
}
