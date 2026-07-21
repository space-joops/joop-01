"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePetStore } from "@/stores/pet-store";

/**
 * 액션 모드 (수동 관제·출격) — 45초 파편 청소 아케이드.
 *
 * 기획서의 제스처 3종이 그대로 전투 조작이 된다:
 *   Tap            ☄️ 작은 파편 레이저 요격 (+1)
 *   Drag           🪨 암석 회피 — 맞으면 내구도 -5 (하한 30)
 *   Hold & Release 🌟 골드 코어 조준·로봇 팔 포획 (+10, EXP 보너스)
 *
 * 구현 노트:
 * - rAF 게임 루프. 엔티티·통계는 ref에 두고(리렌더 무관), 프레임마다
 *   틱 카운터 하나만 setState해서 화면을 갱신한다.
 * - R3F를 쓰지 않는다 — 이모지 DOM ~15개면 충분하고, 미니게임 중
 *   GPU 부하(발열)를 아끼는 게 모바일 원칙(개발 원칙 3)에 맞다.
 * - 보상·피해는 라운드 종료에 finishSortie()로 한 번에 반영 —
 *   30초 동기화가 서버로 나른다.
 */

/* ── 밸런스 상수: 라운드의 호흡 ── */
const ROUND_SECONDS = 45;
const SMALL_REWARD = 1; // ☄️ 요격 보상
const SMALL_EXP = 2;
const GOLD_REWARD = 10; // 🌟 포획 보상
const GOLD_EXP = 15;
const ROCK_DAMAGE = 5; // 🪨 피격 데미지
const SMALL_SPAWN_EVERY = 0.9; // 초
const ROCK_SPAWN_EVERY = 3.4;
const GOLD_SPAWN_EVERY = 6.5; // 이 주기마다 확률 굴림
const GOLD_CHANCE = 0.4;
const HOLD_CHARGE_SECONDS = 1.0; // 조준 게이지 만충 시간
const HOLD_MIN_CHARGE = 0.55; // 이만큼은 조준해야 포획 발사
const PLAYER_Y = 84; // 줍이의 화면 세로 위치(%)
const HIT_RANGE_X = 11; // 피격 판정 가로 반경(%)

interface Entity {
  id: number;
  kind: "small" | "rock" | "gold";
  x: number; // 0~100 (%)
  y: number;
  vy: number; // %/s
  vx: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

const ENTITY_EMOJI: Record<Entity["kind"], string> = {
  small: "☄️",
  rock: "🪨",
  gold: "🌟",
};

interface ActionModeProps {
  onClose: () => void;
}

export default function ActionMode({ onClose }: ActionModeProps) {
  /* 게임 상태 — 전부 ref (rAF 루프가 직접 읽고 쓴다) */
  const entitiesRef = useRef<Entity[]>([]);
  const statsRef = useRef({ smalls: 0, golds: 0, hits: 0 });
  const playerXRef = useRef(50);
  const spawnRef = useRef({ small: 0, rock: 2, gold: 3, nextId: 1 });
  const holdRef = useRef<{
    moved: number;
    charge: number;
    active: boolean;
    lastX: number;
  }>({ moved: 0, charge: 0, active: false, lastX: 0 });

  /* 렌더 상태 */
  const [, setTick] = useState(0); // 프레임마다 +1 — 리렌더 트리거
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState<"play" | "result">("play");
  const [shakeNonce, setShakeNonce] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(1000);

  const spawnParticle = (emoji: string, x: number, y: number) => {
    const id = particleIdRef.current++;
    setParticles((prev) => [...prev, { id, x, y, emoji }]);
    setTimeout(
      () => setParticles((prev) => prev.filter((p) => p.id !== id)),
      900,
    );
  };

  /* ── 게임 루프 ── */
  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let prev = performance.now() / 1000;
    let clock = ROUND_SECONDS;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - prev, 0.05);
      prev = now;

      // 시계
      clock -= dt;
      if (clock <= 0) {
        setPhase("result");
        return;
      }
      setTimeLeft(Math.ceil(clock));

      // 스폰 — 시간이 갈수록 살짝 빨라진다 (후반 긴장감)
      const speedUp = 1 + (1 - clock / ROUND_SECONDS) * 0.5;
      const sp = spawnRef.current;
      sp.small -= dt * speedUp;
      sp.rock -= dt * speedUp;
      sp.gold -= dt;
      const entities = entitiesRef.current;
      if (sp.small <= 0) {
        sp.small = SMALL_SPAWN_EVERY;
        entities.push({
          id: sp.nextId++,
          kind: "small",
          x: 8 + Math.random() * 84,
          y: -6,
          vy: (14 + Math.random() * 10) * speedUp,
          vx: (Math.random() - 0.5) * 6,
        });
      }
      if (sp.rock <= 0) {
        sp.rock = ROCK_SPAWN_EVERY;
        entities.push({
          id: sp.nextId++,
          kind: "rock",
          // 암석은 줍이의 현재 위치를 노리고 떨어진다 — 회피를 강제!
          x: Math.max(6, Math.min(94, playerXRef.current + (Math.random() - 0.5) * 24)),
          y: -8,
          vy: (17 + Math.random() * 6) * speedUp,
          vx: 0,
        });
      }
      if (sp.gold <= 0) {
        sp.gold = GOLD_SPAWN_EVERY;
        const hasGold = entities.some((e) => e.kind === "gold");
        if (!hasGold && Math.random() < GOLD_CHANCE) {
          entities.push({
            id: sp.nextId++,
            kind: "gold",
            x: 12 + Math.random() * 76,
            y: -6,
            vy: 6, // 천천히 — 조준할 시간을 준다
            vx: (Math.random() - 0.5) * 10,
          });
        }
      }

      // 이동·충돌
      for (const e of entities) {
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        if (e.x < 4 || e.x > 96) e.vx = -e.vx;
      }
      const survivors: Entity[] = [];
      for (const e of entities) {
        // 암석 피격 판정: 줍이 높이에 도달했을 때 가로 거리로
        if (
          e.kind === "rock" &&
          e.y >= PLAYER_Y - 4 &&
          e.y <= PLAYER_Y + 6 &&
          Math.abs(e.x - playerXRef.current) < HIT_RANGE_X
        ) {
          statsRef.current.hits += 1;
          setShakeNonce((n) => n + 1);
          spawnParticle("💥", e.x, e.y);
          continue; // 충돌한 암석은 소멸
        }
        if (e.y < 108) survivors.push(e); // 화면 밖으로 나가면 소멸
      }
      entitiesRef.current = survivors;

      // 조준 게이지 (Hold 중)
      if (holdRef.current.active) {
        holdRef.current.charge = Math.min(
          1,
          holdRef.current.charge + dt / HOLD_CHARGE_SECONDS,
        );
      }

      setTick((t) => t + 1); // 화면 갱신
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  /* ── 제스처: Drag(회피) / Hold&Release(포획) — 컨테이너 레벨 ── */
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "play") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdRef.current = {
      moved: 0,
      charge: 0,
      active: true,
      lastX: event.clientX,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "play" || !holdRef.current.active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    holdRef.current.moved += Math.abs(event.clientX - holdRef.current.lastX);
    holdRef.current.lastX = event.clientX;
    // 조금이라도 끌면 조준 대신 회피 기동 — 줍이가 손가락을 따라간다
    if (holdRef.current.moved > 8) {
      holdRef.current.charge = 0;
      playerXRef.current = Math.max(6, Math.min(94, x));
    }
  };

  const handlePointerUp = () => {
    if (phase !== "play") return;
    const hold = holdRef.current;
    holdRef.current = { moved: 0, charge: 0, active: false, lastX: 0 };
    // Hold & Release: 충분히 조준했다면 가장 가까운 골드 코어를 로봇 팔로 포획
    if (hold.moved <= 8 && hold.charge >= HOLD_MIN_CHARGE) {
      const golds = entitiesRef.current.filter((e) => e.kind === "gold");
      if (golds.length > 0) {
        const target = golds.reduce((a, b) =>
          Math.abs(a.x - playerXRef.current) < Math.abs(b.x - playerXRef.current)
            ? a
            : b,
        );
        entitiesRef.current = entitiesRef.current.filter(
          (e) => e.id !== target.id,
        );
        statsRef.current.golds += 1;
        spawnParticle("🦾", playerXRef.current, PLAYER_Y - 6);
        spawnParticle("✨", target.x, target.y);
      }
    }
  };

  /* Tap: 작은 파편 요격 — 엔티티 자신이 받는다 (버블링 차단) */
  const shootSmall = (entity: Entity) => (event: PointerEvent) => {
    if (phase !== "play") return;
    event.stopPropagation();
    entitiesRef.current = entitiesRef.current.filter(
      (e) => e.id !== entity.id,
    );
    statsRef.current.smalls += 1;
    spawnParticle("⚡", entity.x, entity.y);
  };

  /* ── 결과 정산 ── */
  const stats = statsRef.current;
  const rewardDebris = stats.smalls * SMALL_REWARD + stats.golds * GOLD_REWARD;
  const rewardExp = stats.smalls * SMALL_EXP + stats.golds * GOLD_EXP;
  const durabilityLoss = stats.hits * ROCK_DAMAGE;

  const returnHome = () => {
    usePetStore.getState().finishSortie({
      debris: rewardDebris,
      exp: rewardExp,
      durabilityLoss,
    });
    onClose();
  };

  const charge = holdRef.current.charge;

  return (
    <motion.div
      className="absolute inset-0 z-50 overflow-hidden bg-[radial-gradient(ellipse_at_top,#101433_0%,#05060f_80%)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 피격 흔들림 — nonce가 바뀔 때마다 짧게 요동 */}
      <motion.div
        key={shakeNonce}
        className="absolute inset-0 touch-game"
        animate={
          shakeNonce > 0 ? { x: [0, -8, 7, -4, 0], y: [0, 4, -3, 2, 0] } : {}
        }
        transition={{ duration: 0.35 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="tracking-[0.2em] text-foreground/50">
              수동 관제 모드
            </span>
            <span>
              ☄️ +{rewardDebris}
              {stats.hits > 0 && (
                <span className="ml-2 text-rose-300">💥 {stats.hits}</span>
              )}
            </span>
          </div>
          {/* 남은 시간 바 */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-sky-400 transition-[width] duration-1000 ease-linear"
              style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
            />
          </div>
        </div>

        {/* 조기 귀환 버튼 */}
        <button
          type="button"
          onClick={() => setPhase("result")}
          className="absolute right-3 top-[max(3.2rem,calc(env(safe-area-inset-top)+2.4rem))] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-panel-border bg-black/40 text-sm"
          aria-label="조기 귀환"
        >
          ✕
        </button>

        {/* 파편들 */}
        {entitiesRef.current.map((e) => (
          <span
            key={e.id}
            onPointerDown={e.kind === "small" ? shootSmall(e) : undefined}
            className={
              e.kind === "small"
                ? "absolute -translate-x-1/2 -translate-y-1/2 p-2 text-2xl" // p-2: 엄지 판정 여유
                : e.kind === "rock"
                  ? "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-4xl"
                  : "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-pulse text-3xl"
            }
            style={{ left: `${e.x}%`, top: `${e.y}%` }}
          >
            {ENTITY_EMOJI[e.kind]}
          </span>
        ))}

        {/* 터치 피드백 파티클 */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="animate-particle-rise pointer-events-none absolute text-2xl"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            aria-hidden
          >
            {p.emoji}
          </span>
        ))}

        {/* 줍이 — 드래그를 따라 움직인다 */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-5xl drop-shadow-[0_0_18px_rgba(129,140,248,0.6)]"
          style={{ left: `${playerXRef.current}%`, top: `${PLAYER_Y}%` }}
        >
          🛰️
        </div>

        {/* 조준 게이지 — Hold 중에만 줍이 위에 차오른다 */}
        {charge > 0.05 && (
          <div
            className="pointer-events-none absolute h-1.5 w-16 -translate-x-1/2 overflow-hidden rounded-full bg-white/15"
            style={{ left: `${playerXRef.current}%`, top: `${PLAYER_Y - 9}%` }}
          >
            <div
              className={`h-full rounded-full ${charge >= HOLD_MIN_CHARGE ? "bg-amber-300" : "bg-white/50"}`}
              style={{ width: `${charge * 100}%` }}
            />
          </div>
        )}

        {/* 첫 3초 조작 안내 — 텍스트 최소화 (온보딩 원칙) */}
        {timeLeft > ROUND_SECONDS - 3 && (
          <motion.p
            className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-foreground/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            ☄️ 탭! · 🪨 끌어서 피하기! · 🌟 꾹 눌렀다 떼기!
          </motion.p>
        )}
      </motion.div>

      {/* 결과 보고 */}
      <AnimatePresence>
        {phase === "result" && (
          <motion.div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-full rounded-3xl border border-panel-border bg-panel p-6 text-center"
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
                CLEAR SKY ‧ 출격 결과
              </p>
              <p className="mt-3 text-5xl">{stats.hits === 0 ? "🎉" : "🛰️"}</p>
              <p className="mt-3 text-sm font-bold">
                {stats.hits === 0
                  ? "무결점 비행! 흠집 하나 없이 돌아왔어요"
                  : "임무 완료 — 몇 번 부딪혔지만 무사히 귀환했어요"}
              </p>
              <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/70">☄️ 요격한 파편</span>
                  <span className="font-bold">{stats.smalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">🌟 포획한 골드 코어</span>
                  <span className="font-bold">{stats.golds}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">획득 자원 / 경험치</span>
                  <span className="font-bold text-emerald-300">
                    +{rewardDebris} / +{rewardExp}
                  </span>
                </div>
                {durabilityLoss > 0 && (
                  <div className="flex justify-between">
                    <span className="text-foreground/70">💥 피격 손상</span>
                    <span className="font-bold text-rose-300">
                      내구도 −{durabilityLoss}%
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={returnHome}
                className="mt-5 w-full rounded-2xl border border-panel-border bg-white/10 py-3.5 text-sm font-bold transition active:scale-95"
              >
                귀환 · 보상 받기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
