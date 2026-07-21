"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePetStore } from "@/stores/pet-store";
import type { PetVariant } from "@/lib/supabase/types";

/**
 * 액션 모드 (수동 관제·출격) — 45초 파편 청소 아케이드.
 *
 * 줍이는 궤도 중심(화면 정중앙)에 고정되어 있고, 파편이 그 주위로
 * 흘러 들어온다. 제스처 3종은 그대로 전투 조작이 된다:
 *   Tap            작은 파편(볼트·너트·기어…) 레이저 요격 (+1)
 *   Drag           경고 파편(샤프심 조각)을 직접 붙잡아 궤도 밖으로 밀어내기
 *                  — 손을 안 대면 그대로 줍이에게 충돌해 내구도 -5 (하한 30)
 *   Hold & Release 골드 코어 조준·로봇 팔(또는 그물·자석·레이저) 포획
 *
 * 구현 노트:
 * - rAF 게임 루프. 엔티티·통계는 ref에 두고(리렌더 무관), 프레임마다
 *   틱 카운터 하나만 setState해서 화면을 갱신한다.
 * - 비주얼은 이모지 대신 `plan/img/satellite pet svg pack`의 벡터 에셋을
 *   그대로 씀(public/action/**) — 홈 화면 3D 팩과 팔레트가 같아 톤이 이어진다.
 * - 줍이 스프라이트는 홈 화면 3D 모델 선택 로직(satellite-3d.tsx의
 *   modelUrlFor)과 동일한 레벨/장비 분기를 따른다.
 * - 보상·피해는 라운드 종료에 finishSortie()로 한 번에 반영 —
 *   30초 동기화가 서버로 나른다.
 */

/* ── 밸런스 상수: 라운드의 호흡 ── */
const ROUND_SECONDS = 45;
const SMALL_REWARD = 1; // 작은 파편 요격 보상
const SMALL_EXP = 2;
const GOLD_REWARD = 10; // 골드 코어 포획 보상
const GOLD_EXP = 15;
const ROCK_DAMAGE = 5; // 경고 파편 피격 데미지
const SMALL_SPAWN_EVERY = 0.9; // 초
const ROCK_SPAWN_EVERY = 3.4;
const GOLD_SPAWN_EVERY = 6.5; // 이 주기마다 확률 굴림
const GOLD_CHANCE = 0.4;
const HOLD_CHARGE_SECONDS = 1.0; // 조준 게이지 만충 시간
const HOLD_MIN_CHARGE = 0.55; // 이만큼은 조준해야 포획 발사
const CENTER_X = 50; // 줍이는 궤도 중심에 고정 — 더 이상 좌우로 움직이지 않는다
const CENTER_Y = 46;
const HIT_RANGE_X = 13; // 피격 판정 가로 반경(%)
const HIT_RANGE_Y = 5; // 피격 판정 세로 반경(%)
const ROCK_SPAWN_SPREAD = 30; // 경고 파편은 중심 근처로 쏠려서 떨어진다(진짜 위협이 되도록)

interface Entity {
  id: number;
  kind: "small" | "rock" | "gold";
  x: number; // 0~100 (%)
  y: number;
  vy: number; // %/s
  vx: number;
  src: string; // 표시할 SVG 경로
  dragging?: boolean; // rock 전용 — 손가락으로 붙잡혀 있는 동안 낙하 정지
}

interface Particle {
  id: number;
  x: number;
  y: number;
  src: string;
  size: number;
}

const SMALL_DEBRIS_FILES = [
  "bolt",
  "nut",
  "gear",
  "chip",
  "solar_fragment",
  "antenna_piece",
  "fuel_tank",
];
const smallDebrisSrc = () =>
  `/action/debris/${SMALL_DEBRIS_FILES[Math.floor(Math.random() * SMALL_DEBRIS_FILES.length)]}.svg`;
const ROCK_SRC = "/action/debris/shard.svg";
const GOLD_SRC = "/action/debris/gold_core.svg";

/** 줍이 스프라이트 — 홈 화면 3D 모델과 같은 레벨/장비 분기 (satellite-3d.tsx 참고) */
function spriteFor(level: number, variant: PetVariant | null) {
  if (level >= 3 && variant) return `/action/characters/pet_stage3_${variant}.svg`;
  if (level >= 2) return "/action/characters/pet_stage2_junior.svg";
  return "/action/characters/pet_stage1_baby.svg";
}

/** 포획 이펙트 — 3단계 장비마다 다른 연출을 준다 */
function captureEffectFor(variant: PetVariant | null) {
  if (variant === "net") return "/action/effects/fx_net_throw.svg";
  if (variant === "magnet") return "/action/effects/fx_magnet_field.svg";
  if (variant === "laser") return "/action/effects/fx_laser_beam.svg";
  return "/action/effects/fx_collect_ring.svg";
}

interface ActionModeProps {
  onClose: () => void;
}

export default function ActionMode({ onClose }: ActionModeProps) {
  const level = usePetStore((state) => state.level);
  const variant = usePetStore((state) => state.variant);

  /* 게임 상태 — 전부 ref (rAF 루프가 직접 읽고 쓴다) */
  const entitiesRef = useRef<Entity[]>([]);
  const statsRef = useRef({ smalls: 0, golds: 0, hits: 0 });
  const spawnRef = useRef({ small: 0, rock: 2, gold: 3, nextId: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<{
    moved: number;
    charge: number;
    active: boolean;
    lastX: number;
  }>({ moved: 0, charge: 0, active: false, lastX: 0 });
  const dragRef = useRef<{ id: number } | null>(null);

  /* 렌더 상태 */
  const [, setTick] = useState(0); // 프레임마다 +1 — 리렌더 트리거
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [phase, setPhase] = useState<"play" | "result">("play");
  const [shakeNonce, setShakeNonce] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const particleIdRef = useRef(1000);

  const spawnParticle = (src: string, x: number, y: number, size = 44) => {
    const id = particleIdRef.current++;
    setParticles((prev) => [...prev, { id, x, y, src, size }]);
    setTimeout(
      () => setParticles((prev) => prev.filter((p) => p.id !== id)),
      900,
    );
  };

  /* 화면 좌표(px) → 게임 좌표(%) */
  const toPercent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: CENTER_X, y: CENTER_Y };
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
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
          src: smallDebrisSrc(),
        });
      }
      if (sp.rock <= 0) {
        sp.rock = ROCK_SPAWN_EVERY;
        entities.push({
          id: sp.nextId++,
          kind: "rock",
          // 경고 파편은 궤도 중심(줍이) 근처로 쏠려서 떨어진다 — 직접 밀어내야 한다!
          x: Math.max(
            6,
            Math.min(94, CENTER_X + (Math.random() - 0.5) * ROCK_SPAWN_SPREAD),
          ),
          y: -8,
          vy: (15 + Math.random() * 6) * speedUp,
          vx: 0,
          src: ROCK_SRC,
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
            src: GOLD_SRC,
          });
        }
      }

      // 이동·충돌
      for (const e of entities) {
        if (e.dragging) continue; // 손가락으로 붙잡힌 파편은 낙하 정지
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        if (e.x < 4 || e.x > 96) e.vx = -e.vx;
      }
      const survivors: Entity[] = [];
      for (const e of entities) {
        // 경고 파편 피격 판정: 줍이(궤도 중심) 높이·가로 범위에 들어오면 충돌
        if (
          e.kind === "rock" &&
          !e.dragging &&
          e.y >= CENTER_Y - HIT_RANGE_Y &&
          e.y <= CENTER_Y + HIT_RANGE_Y + 4 &&
          Math.abs(e.x - CENTER_X) < HIT_RANGE_X
        ) {
          statsRef.current.hits += 1;
          setShakeNonce((n) => n + 1);
          spawnParticle("/action/effects/fx_alert.svg", CENTER_X, CENTER_Y, 56);
          continue; // 충돌한 파편은 소멸
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

  /* ── 제스처: Hold&Release(포획) — 배경 레벨 ── */
  const handleBackgroundPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "play") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdRef.current = {
      moved: 0,
      charge: 0,
      active: true,
      lastX: event.clientX,
    };
  };

  const handleBackgroundPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (phase !== "play" || !holdRef.current.active) return;
    holdRef.current.moved += Math.abs(event.clientX - holdRef.current.lastX);
    holdRef.current.lastX = event.clientX;
    // 조준 중 손가락이 흔들리면(끌리면) 조준이 풀린다 — 가만히 눌러야 충전된다
    if (holdRef.current.moved > 8) {
      holdRef.current.charge = 0;
    }
  };

  const handleBackgroundPointerUp = () => {
    if (phase !== "play") return;
    const hold = holdRef.current;
    holdRef.current = { moved: 0, charge: 0, active: false, lastX: 0 };
    // Hold & Release: 충분히 조준했다면 궤도 중심에서 가장 가까운 골드 코어를 포획
    if (hold.moved <= 8 && hold.charge >= HOLD_MIN_CHARGE) {
      const golds = entitiesRef.current.filter((e) => e.kind === "gold");
      if (golds.length > 0) {
        const target = golds.reduce((a, b) =>
          Math.abs(a.x - CENTER_X) < Math.abs(b.x - CENTER_X) ? a : b,
        );
        entitiesRef.current = entitiesRef.current.filter(
          (e) => e.id !== target.id,
        );
        statsRef.current.golds += 1;
        spawnParticle(captureEffectFor(variant), CENTER_X, CENTER_Y - 6, 64);
        spawnParticle("/action/effects/fx_sparkle.svg", target.x, target.y, 40);
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
    spawnParticle("/action/effects/fx_sparkle.svg", entity.x, entity.y, 36);
  };

  /* Drag: 경고 파편을 직접 붙잡아 궤도 중심 밖으로 밀어낸다 */
  const grabRock = (entity: Entity) => (event: PointerEvent) => {
    if (phase !== "play") return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    entity.dragging = true;
    dragRef.current = { id: entity.id };
    setTick((t) => t + 1);
  };

  const dragRockMove = (entity: Entity) => (event: PointerEvent) => {
    if (phase !== "play" || dragRef.current?.id !== entity.id) return;
    event.stopPropagation();
    const { x, y } = toPercent(event.clientX, event.clientY);
    entity.x = Math.max(2, Math.min(98, x));
    entity.y = Math.max(2, Math.min(104, y));
    setTick((t) => t + 1);
  };

  const releaseRock = (entity: Entity) => (event: PointerEvent) => {
    if (phase !== "play" || dragRef.current?.id !== entity.id) return;
    event.stopPropagation();
    entity.dragging = false;
    dragRef.current = null;
    // 중심에서 충분히 밀어냈으면 안전하게 회피 성공 — 그대로 두면 다시 떨어진다
    if (Math.abs(entity.x - CENTER_X) > HIT_RANGE_X + 3) {
      entitiesRef.current = entitiesRef.current.filter((e) => e.id !== entity.id);
      spawnParticle("/action/effects/fx_sparkle.svg", entity.x, entity.y, 32);
    }
    setTick((t) => t + 1);
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
      className="absolute inset-0 z-50 overflow-hidden bg-[#0b1026]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 배경 — 별과 지구 (SVG 팩 원본 그대로) */}
      <img
        src="/action/background/bg_space_portrait.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* 피격 흔들림 — nonce가 바뀔 때마다 짧게 요동 */}
      <motion.div
        ref={containerRef}
        key={shakeNonce}
        className="absolute inset-0 touch-game"
        animate={
          shakeNonce > 0 ? { x: [0, -8, 7, -4, 0], y: [0, 4, -3, 2, 0] } : {}
        }
        transition={{ duration: 0.35 }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
        onPointerCancel={handleBackgroundPointerUp}
      >
        {/* HUD — 상단 진행 바 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 overflow-hidden bg-white/10">
          <div
            className="h-full bg-emerald-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]">
          <span className="text-xs font-semibold tracking-[0.2em] text-white/60">
            수동 관제 모드
          </span>
          <span className="text-right text-xs font-semibold text-white/80">
            <span className="block">
              🛰 +{rewardDebris}
              {stats.hits > 0 && (
                <span className="ml-2 text-rose-300">⚠ {stats.hits}</span>
              )}
            </span>
            <span className="block text-white/40">T-{timeLeft}s</span>
          </span>
        </div>

        {/* 조기 귀환 버튼 — 좌상단 */}
        <button
          type="button"
          onClick={() => setPhase("result")}
          className="pointer-events-auto absolute left-3 top-[max(3.4rem,calc(env(safe-area-inset-top)+2.6rem))] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/40 text-sm text-white"
          aria-label="조기 귀환"
        >
          ✕
        </button>

        {/* 파편들 */}
        {entitiesRef.current.map((e) => (
          <img
            key={e.id}
            src={e.src}
            alt=""
            aria-hidden
            onPointerDown={
              e.kind === "small"
                ? shootSmall(e)
                : e.kind === "rock"
                  ? grabRock(e)
                  : undefined
            }
            onPointerMove={e.kind === "rock" ? dragRockMove(e) : undefined}
            onPointerUp={e.kind === "rock" ? releaseRock(e) : undefined}
            onPointerCancel={e.kind === "rock" ? releaseRock(e) : undefined}
            className={
              e.kind === "small"
                ? "absolute -translate-x-1/2 -translate-y-1/2 p-1.5" // 엄지 판정 여유
                : e.kind === "rock"
                  ? `absolute -translate-x-1/2 -translate-y-1/2 touch-none ${e.dragging ? "drop-shadow-[0_0_10px_rgba(255,139,126,0.9)]" : "drop-shadow-[0_0_6px_rgba(255,139,126,0.5)]"}`
                  : "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-pulse"
            }
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              width: e.kind === "small" ? 40 : e.kind === "rock" ? 52 : 44,
              height: e.kind === "small" ? 40 : e.kind === "rock" ? 52 : 44,
            }}
          />
        ))}

        {/* 터치 피드백 파티클 */}
        {particles.map((p) => (
          <img
            key={p.id}
            src={p.src}
            alt=""
            aria-hidden
            className="animate-particle-rise pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          />
        ))}

        {/* 줍이 — 궤도 중심에 고정, 살짝 떠 있는 정도로만 흔들린다 */}
        <motion.img
          src={spriteFor(level, variant)}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_18px_rgba(129,140,248,0.6)]"
          style={{ left: `${CENTER_X}%`, top: `${CENTER_Y}%`, width: 96, height: 96 }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* 조준 게이지 — Hold 중에만 줍이 위에 차오른다 */}
        {charge > 0.05 && (
          <div
            className="pointer-events-none absolute h-1.5 w-16 -translate-x-1/2 overflow-hidden rounded-full bg-white/15"
            style={{ left: `${CENTER_X}%`, top: `${CENTER_Y - 11}%` }}
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
            className="pointer-events-none absolute inset-x-0 top-1/4 text-center text-xs text-white/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            톡톡 탭! · 경고 파편은 끌어서 치우기! · 꾹 눌렀다 떼기!
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
                  <span className="text-foreground/70">요격한 파편</span>
                  <span className="font-bold">{stats.smalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">포획한 골드 코어</span>
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
                    <span className="text-foreground/70">피격 손상</span>
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
