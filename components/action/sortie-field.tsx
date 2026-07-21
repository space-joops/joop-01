"use client";

import { useEffect, useRef, useState } from "react";
import type { PetVariant } from "@/lib/supabase/types";
import {
  DEBRIS_SRC,
  FX_SRC,
  UI_SRC,
  petSprite,
  type DebrisKind,
} from "@/components/action/sortie-assets";
import {
  DIFFICULTY,
  KIND_STAT,
  TUNE,
  type KindStat,
} from "@/components/action/sortie-tuning";

/**
 * 출격 필드 — 조종 미니게임의 심장. jd-03(STELLAPET)의 Sortie 게임 루프 이식.
 *
 * 게임 방식 (연료 서바이벌):
 * - 시간 제한 없음. 추진 에너지가 바닥나면 4초 표류 유예 후 자동 귀환.
 *   유예 중 태양전지 파편을 먹으면 "재점화!" — 이 부활이 게임의 명장면.
 * - 조그셔틀: 화면 아무 곳이나 누르면 그 점이 스틱 원점. 드래그 방향으로
 *   추진하고, 드래그 깊이가 액셀 페달(3단 분사 — 가속↑ = 에너지 소모↑).
 * - 위치가 아니라 "속도"를 조종한다 — 관성이 남는 우주 조종감.
 *
 * 구현 원칙 (jd-03 계승 + DOM 번안):
 * - 초당 60번 변하는 상태는 전부 useEffect 클로저 지역 변수. React는 모른다.
 * - 엔티티는 rAF 루프가 <img> 노드를 직접 만들고 transform으로 옮기고 지운다.
 *   (Canvas 대신 DOM인 이유: 벡터 SVG가 그대로 선명하고, 합성 레이어의
 *   translate3d 이동은 리페인트가 없어 모바일 발열에 유리 — 개발 원칙 3)
 * - React는 저빈도 HUD 숫자와 껍데기만 담당 — 값이 안 변하면 리렌더도 없다.
 * - 획득 판정은 보이는 것보다 후하게, 피격은 짜게. 자석으로 슬쩍 돕는다.
 */

/** 셸(action-mode)이 브리핑 결과로 넘겨주는 라운드 설정 */
export interface SortieConfig {
  /** 위험 수당 배율 — 정산은 셸이 하고, 필드는 위험도 조절에만 관여 */
  hazardWeight: number;
  hazardSpeedMul: number;
  level: number;
  variant: PetVariant | null;
  aiCoreLevel: number;
}

/** 필드가 셸에 돌려주는 라운드 원장 — 배율 적용 전 원값 */
export interface SortieResult {
  /** 수거한 파편 가치 합 */
  debris: number;
  exp: number;
  /** 수거 개수 */
  eaten: number;
  /** 고속 파편 피격 횟수 */
  hits: number;
  /** 비행 시간(초) */
  sec: number;
}

/** 분사 단계별 화염 색 — 1단 하늘색 → 3단 빨강 */
const THRUST_COLORS = ["#7dd3fc", "#f4b860", "#ff6b6b"];

/** 수거 팝업 문구 — 줍이가 신나서 하는 말 */
const EAT_WORDS = ["냠!", "꿀꺽!", "주웠다!", "좋아!"];

/** HUD가 차지하는 상단 높이(px) — 이 아래부터가 비행 영역 */
const TOP_SAFE = 88;

/** 진화 단계별 펫 표시 크기(px) — 클수록 든든하고, 그만큼 잘 부딪힌다 */
const PET_IMG_BY_LEVEL = [84, 84, 92, 96];

interface Junk {
  kind: DebrisKind;
  stat: KindStat;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  /** -1이면 평소, 0 이상이면 "꿀꺽" 연출 경과 시간 */
  eatT: number;
  el: HTMLImageElement;
}

interface SortieFieldProps {
  config: SortieConfig;
  onEnd: (result: SortieResult) => void;
}

export default function SortieField({ config, onEnd }: SortieFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLImageElement>(null);
  const flameRef = useRef<HTMLDivElement>(null);
  const joyRingRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  /** HUD [귀환] 버튼이 부르는 종료 함수 — 루프 안 finish()를 밖으로 노출 */
  const finishRef = useRef<() => void>(() => {});

  /* HUD 저빈도 상태 — 같은 값이면 React가 리렌더를 건너뛴다 */
  const [energyView, setEnergyView] = useState<number>(DIFFICULTY.startEnergy);
  const [scoreView, setScoreView] = useState(0);
  const [hitsView, setHitsView] = useState(0);
  const [secView, setSecView] = useState(0);
  const [driftLeft, setDriftLeft] = useState<number | null>(null);

  const petImgSize =
    PET_IMG_BY_LEVEL[Math.min(config.level, PET_IMG_BY_LEVEL.length - 1)];

  useEffect(() => {
    const field = fieldRef.current;
    const layer = layerRef.current;
    const petEl = petRef.current;
    const flameEl = flameRef.current;
    const joyRing = joyRingRef.current;
    const joyKnob = joyKnobRef.current;
    if (!field || !layer || !petEl || !flameEl || !joyRing || !joyKnob) return;

    const DIFF = DIFFICULTY;
    /** 충돌용 펫 반지름 — 스티커의 몸통만 잡는 느낌으로 표시 크기보다 작게 */
    const petR = Math.round(petImgSize * 0.36);
    const accelMul = 1;
    const magnetRange = TUNE.magnetRange;

    // ---- 화면 맞춤: 실제 px 좌표계 (resize 대응) ----
    let w = field.clientWidth;
    let h = field.clientHeight;
    let originX = 0;
    let originY = 0;
    const fit = () => {
      const rect = field.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      originX = rect.left;
      originY = rect.top;
    };
    fit();

    // ---- 게임 상태 (전부 클로저 지역 변수 — React는 모른다) ----
    const pet = { x: w / 2, y: (h + TOP_SAFE) / 2 };
    let vx = 0;
    let vy = 0;
    let joyActive = false;
    let joyOx = 0;
    let joyOy = 0;
    let joyCx = 0;
    let joyCy = 0;
    let thrustLevel = 0;
    let thrusting = false;
    let energy: number = DIFF.startEnergy;
    /** 에너지 소진 시각(elapsed 기준). null이면 정상 비행 중 */
    let emptyAt: number | null = null;

    let elapsed = 0;
    let spawnTimer = 0.3;
    let invincible = 0;
    let debrisValue = 0;
    let expGain = 0;
    let eaten = 0;
    let hits = 0;
    const junks: Junk[] = [];
    let done = false;
    let raf = 0;

    // ---- 임시 노드 헬퍼: 팝업·이펙트는 만들고 스스로 사라진다 ----
    const popup = (text: string, x: number, y: number, color: string) => {
      const el = document.createElement("span");
      el.textContent = text;
      el.className =
        "animate-particle-rise pointer-events-none absolute text-sm font-bold";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.color = color;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 900);
    };

    /** 수집 링·반짝임 등 96×96 이펙트를 그 자리에서 펑 터뜨린다 */
    const burstFx = (src: string, x: number, y: number, size = 72) => {
      const el = document.createElement("img");
      el.src = src;
      el.alt = "";
      el.className = "pointer-events-none absolute";
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${x - size / 2}px`;
      el.style.top = `${y - size / 2}px`;
      layer.appendChild(el);
      el.animate(
        [
          { transform: "scale(0.4)", opacity: 1 },
          { transform: "scale(1.5)", opacity: 0 },
        ],
        { duration: 380, easing: "ease-out" },
      ).onfinish = () => el.remove();
    };

    const shakeScreen = () => {
      const a = TUNE.shakeAmp;
      layer.animate(
        [
          { transform: "translate(0,0)" },
          { transform: `translate(${-a}px,${a * 0.6}px)` },
          { transform: `translate(${a * 0.8}px,${-a * 0.5}px)` },
          { transform: `translate(${-a * 0.4}px,${a * 0.3}px)` },
          { transform: "translate(0,0)" },
        ],
        { duration: TUNE.shakeTime * 1000, easing: "ease-out" },
      );
    };

    // ---- 스폰: 가중치 뽑기 + 사방 가장자리 진입 ----
    const pickKind = (allowShard: boolean): DebrisKind => {
      const table = (Object.keys(KIND_STAT) as DebrisKind[]).map((kind) => ({
        kind,
        w: kind === "shard" ? (allowShard ? config.hazardWeight : 0) : KIND_STAT[kind].weight,
      }));
      const totalW = table.reduce((acc, k) => acc + k.w, 0);
      let r = Math.random() * totalW;
      for (const k of table) {
        r -= k.w;
        if (r <= 0) return k.kind;
      }
      return "chip";
    };

    /** 사방 가장자리 중 한 곳에서, 화면 안쪽을 향해(±0.7rad) 진입한다 */
    const makeJunk = (kind: DebrisKind): Junk => {
      const stat = KIND_STAT[kind];
      let speed = stat.speed[0] + Math.random() * (stat.speed[1] - stat.speed[0]);
      if (kind === "shard") speed *= config.hazardSpeedMul;
      const edge = Math.floor(Math.random() * 4);
      let x: number;
      let y: number;
      let baseAng: number;
      const fieldTop = TOP_SAFE + 10;
      if (edge === 0) {
        x = Math.random() * w;
        y = -40;
        baseAng = Math.PI / 2;
      } else if (edge === 1) {
        x = w + 40;
        y = fieldTop + Math.random() * Math.max(1, h - fieldTop - 20);
        baseAng = Math.PI;
      } else if (edge === 2) {
        x = Math.random() * w;
        y = h + 40;
        baseAng = -Math.PI / 2;
      } else {
        x = -40;
        y = fieldTop + Math.random() * Math.max(1, h - fieldTop - 20);
        baseAng = 0;
      }
      const ang = baseAng + (Math.random() * 2 - 1) * 0.7;

      const el = document.createElement("img");
      el.src = DEBRIS_SRC[kind];
      el.alt = "";
      el.className = "pointer-events-none absolute left-0 top-0";
      el.style.width = `${stat.img}px`;
      el.style.height = `${stat.img}px`;
      el.style.willChange = "transform";
      layer.appendChild(el);

      return {
        kind,
        stat,
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() * 2 - 1) * 115, // deg/s
        eatT: -1,
        el,
      };
    };

    const removeJunk = (index: number) => {
      junks[index].el.remove();
      junks.splice(index, 1);
    };

    // ---- 종료: 어떤 경로로 끝나든 여기 한 곳으로 수렴한다 ----
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      onEndRef.current({
        debris: debrisValue,
        exp: expGain,
        eaten,
        hits,
        sec: Math.round(elapsed),
      });
    };
    finishRef.current = finish;

    // ---- 상호작용 3종: 수거 / 태양전지 / 피격 ----
    const eat = (j: Junk) => {
      j.eatT = 0;
      debrisValue += j.stat.debris;
      expGain += j.stat.exp;
      eaten += 1;
      burstFx(FX_SRC.collectRing, j.x, j.y);
      popup(
        Math.random() < 0.5
          ? `+${j.stat.debris}`
          : EAT_WORDS[Math.floor(Math.random() * EAT_WORDS.length)],
        j.x,
        j.y - 14,
        "#7ee8a2",
      );
    };

    const pickupCell = (j: Junk) => {
      j.eatT = 0;
      const revived = emptyAt !== null;
      energy = Math.min(DIFF.startEnergy, energy + DIFF.cellRefill);
      emptyAt = null;
      burstFx(FX_SRC.sparkle, j.x, j.y);
      popup(
        revived ? "재점화!" : `에너지 +${DIFF.cellRefill}`,
        j.x,
        j.y - 14,
        "#66fcf1",
      );
    };

    const hit = (j: Junk) => {
      hits += 1;
      invincible = TUNE.invincible;
      energy = Math.max(0, energy - DIFF.hazardDamage);
      burstFx(FX_SRC.alert, pet.x, pet.y - petR - 20, 48);
      popup(`아야! 에너지 -${DIFF.hazardDamage}`, pet.x, pet.y - petR - 16, "#ff6b6b");
      shakeScreen();
      removeJunk(junks.indexOf(j));
    };

    // ---- update: 상태만 바꾼다 (표시는 아래 sync가 담당) ----
    const update = (dt: number) => {
      elapsed += dt;
      if (invincible > 0) invincible -= dt;

      // 에너지 소진 → 관성 표류 유예 → 종료 (유예 중 태양전지를 먹으면 부활)
      if (energy <= 0 && emptyAt === null) emptyAt = elapsed;
      if (emptyAt !== null && elapsed - emptyAt >= DIFF.driftGrace) {
        finish();
        return;
      }

      // 스폰 — 일정 리듬이 외워지지 않게 ±30% 지터
      spawnTimer -= dt;
      if (spawnTimer <= 0 && junks.length < DIFF.maxEntities) {
        junks.push(makeJunk(pickKind(elapsed > TUNE.grace)));
        spawnTimer = DIFF.spawnBase * (0.7 + Math.random() * 0.6);
      }

      // --- 조그셔틀 추진: 드래그 방향으로 가속, 깊이로 3단 분사 ---
      thrusting = false;
      if (joyActive && energy > 0) {
        const dx = joyCx - joyOx;
        const dy = joyCy - joyOy;
        const dist = Math.hypot(dx, dy);
        if (dist > TUNE.joyDead) {
          thrustLevel = dist < TUNE.levelAt[0] ? 0 : dist < TUNE.levelAt[1] ? 1 : 2;
          const cost = DIFF.thrustCosts[thrustLevel] * dt;
          if (energy >= cost) {
            energy -= cost;
            const acc = TUNE.thrustAccel[thrustLevel] * accelMul;
            vx += (dx / dist) * acc * dt;
            vy += (dy / dist) * acc * dt;
            thrusting = true;
          } else {
            energy = 0;
          }
        }
      }

      // --- 우주 관성: 마찰 감쇠 + 최소 표류 속도 유지 ---
      vx -= vx * TUNE.friction * dt;
      vy -= vy * TUNE.friction * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > 0 && sp < TUNE.minSpeed) {
        vx = (vx / sp) * TUNE.minSpeed;
        vy = (vy / sp) * TUNE.minSpeed;
      }
      pet.x += vx * dt;
      pet.y += vy * dt;

      // --- 벽 반동 — 화면 밖 대신 통통 튕긴다 ---
      if (pet.x < petR) {
        pet.x = petR;
        vx *= -TUNE.bounce;
      }
      if (pet.x > w - petR) {
        pet.x = w - petR;
        vx *= -TUNE.bounce;
      }
      if (pet.y < TOP_SAFE + petR) {
        pet.y = TOP_SAFE + petR;
        vy *= -TUNE.bounce;
      }
      if (pet.y > h - petR) {
        pet.y = h - petR;
        vy *= -TUNE.bounce;
      }

      // 파편: 역순 순회 + splice (삭제하면서 돌아도 건너뛰지 않게)
      for (let i = junks.length - 1; i >= 0; i--) {
        const j = junks[i];

        // "꿀꺽" 연출 중 — 펫 쪽으로 빨려들며 사라진다
        if (j.eatT >= 0) {
          j.eatT += dt;
          const suck = Math.min(1, dt * 18);
          j.x += (pet.x - j.x) * suck;
          j.y += (pet.y - j.y) * suck;
          j.rot += 1400 * dt;
          if (j.eatT >= TUNE.eatAnim) removeJunk(i);
          continue;
        }

        j.x += j.vx * dt;
        j.y += j.vy * dt;
        j.rot += j.rotSpeed * dt;

        // 자석: 위험물 빼고 전부 슬쩍 끌려온다 — 티 안 나는 어시스트
        if (j.kind !== "shard") {
          const dx = pet.x - j.x;
          const dy = pet.y - j.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1 && dist < petR + magnetRange) {
            const pull = (TUNE.magnetPull * dt) / dist;
            j.x += dx * pull;
            j.y += dy * pull;
          }
        }

        const dist = Math.hypot(pet.x - j.x, pet.y - j.y);
        if (j.kind === "shard") {
          // 피격 판정은 짜게 — 스치는 정도는 봐준다
          if (invincible <= 0 && dist < petR * TUNE.hitShrink + j.stat.radius) {
            hit(j);
            continue;
          }
        } else if (dist < petR + j.stat.radius + TUNE.eatBonus) {
          // 획득 판정은 후하게 — 아깝게 놓치는 억울함이 없게
          if (j.kind === "solar_fragment") pickupCell(j);
          else eat(j);
        }

        if (j.x < -70 || j.x > w + 70 || j.y < -70 || j.y > h + 70) removeJunk(i);
      }
    };

    // ---- sync: 상태를 화면(DOM·HUD)에 반영만 한다 ----
    const sync = () => {
      // 펫 — 속도 방향으로 살짝 기울어 비행감을 낸다
      const tilt = Math.max(-12, Math.min(12, vx * 0.04));
      const blinking =
        invincible > 0 && Math.floor(elapsed * TUNE.blinkHz * 2) % 2 === 1;
      petEl.style.transform = `translate3d(${pet.x - petImgSize / 2}px, ${
        pet.y - petImgSize / 2
      }px, 0) rotate(${tilt}deg)`;
      petEl.style.opacity = blinking ? "0.25" : "1";

      // 추진 화염 — 분사 반대편에서 단계 색으로 타오른다
      if (thrusting) {
        const ang = Math.atan2(joyCy - joyOy, joyCx - joyOx);
        const size = 10 + thrustLevel * 6 + (Math.random() < 0.4 ? 3 : 0);
        const fx = pet.x - Math.cos(ang) * (petR + 10);
        const fy = pet.y - Math.sin(ang) * (petR + 10);
        flameEl.style.display = "block";
        flameEl.style.width = `${size}px`;
        flameEl.style.height = `${size}px`;
        flameEl.style.background = THRUST_COLORS[thrustLevel];
        flameEl.style.boxShadow = `0 0 ${size}px ${THRUST_COLORS[thrustLevel]}`;
        flameEl.style.transform = `translate3d(${fx - size / 2}px, ${fy - size / 2}px, 0)`;
      } else {
        flameEl.style.display = "none";
      }

      // 조그셔틀 링·노브
      if (joyActive) {
        joyRing.style.display = "block";
        joyRing.style.transform = `translate3d(${joyOx - TUNE.joyMax}px, ${
          joyOy - TUNE.joyMax
        }px, 0)`;
        joyKnob.style.display = "block";
        joyKnob.style.background =
          energy > 0 ? THRUST_COLORS[thrustLevel] : "#5a6284";
        joyKnob.style.transform = `translate3d(${joyCx - 11}px, ${joyCy - 11}px, 0)`;
      } else {
        joyRing.style.display = "none";
        joyKnob.style.display = "none";
      }

      // 파편들
      for (const j of junks) {
        const sc = j.eatT >= 0 ? Math.max(0, 1 - j.eatT / TUNE.eatAnim) : 1;
        j.el.style.transform = `translate3d(${j.x - j.stat.img / 2}px, ${
          j.y - j.stat.img / 2
        }px, 0) rotate(${j.rot}deg) scale(${sc})`;
      }

      // HUD — 같은 값이면 React가 알아서 리렌더를 건너뛴다
      setEnergyView(Math.ceil(energy));
      setScoreView(Math.floor(debrisValue));
      setHitsView(hits);
      setSecView(Math.floor(elapsed));
      setDriftLeft(
        emptyAt === null
          ? null
          : Math.max(0, Math.ceil(DIFF.driftGrace - (elapsed - emptyAt))),
      );
    };

    // ---- 메인 루프: dt 상한으로 프레임 독립 + 터널링 방지 ----
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(TUNE.maxDt, (now - last) / 1000);
      last = now;
      update(dt);
      if (done) return;
      sync();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- 입력: 누른 지점이 조그셔틀 원점이 된다 ----
    const toLocal = (e: PointerEvent) => ({
      x: e.clientX - originX,
      y: e.clientY - originY,
    });
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      joyOx = p.x;
      joyOy = p.y;
      joyCx = p.x;
      joyCy = p.y;
      joyActive = true;
      field.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!joyActive) return;
      const p = toLocal(e);
      const dx = p.x - joyOx;
      const dy = p.y - joyOy;
      const dist = Math.hypot(dx, dy);
      // 스틱이 반경을 넘으면 노브만 가장자리에 붙는다 (방향은 유지)
      if (dist > TUNE.joyMax) {
        joyCx = joyOx + (dx / dist) * TUNE.joyMax;
        joyCy = joyOy + (dy / dist) * TUNE.joyMax;
      } else {
        joyCx = p.x;
        joyCy = p.y;
      }
    };
    const onUp = () => {
      joyActive = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    field.addEventListener("pointerdown", onDown);
    field.addEventListener("pointermove", onMove);
    field.addEventListener("pointerup", onUp);
    field.addEventListener("pointercancel", onUp);
    field.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", fit);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      field.removeEventListener("pointerdown", onDown);
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerup", onUp);
      field.removeEventListener("pointercancel", onUp);
      field.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", fit);
    };
    // config는 마운트 시점 값만 쓴다 — 게임 도중 본편 상태 변화에 흔들리지 않게
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lowEnergy = energyView <= DIFFICULTY.startEnergy * 0.25;

  return (
    <div ref={fieldRef} className="absolute inset-0 touch-game overflow-hidden">
      {/* 흔들리는 레이어 — 파편·펫·이펙트가 모두 여기 산다 */}
      <div ref={layerRef} className="absolute inset-0">
        <div
          ref={flameRef}
          className="pointer-events-none absolute left-0 top-0 hidden rounded-full"
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- rAF가 transform을 직접 옮기는 게임 스프라이트 */}
        <img
          ref={petRef}
          src={petSprite(config.level, config.variant)}
          alt="비행 중인 줍이"
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: petImgSize, height: petImgSize, willChange: "transform" }}
          draggable={false}
        />
      </div>

      {/* 조그셔틀 — 누른 곳에 나타나는 가상 스틱 (흔들림 밖) */}
      <div
        ref={joyRingRef}
        className="pointer-events-none absolute left-0 top-0 hidden rounded-full bg-white/15"
        style={{ width: TUNE.joyMax * 2, height: TUNE.joyMax * 2 }}
        aria-hidden
      />
      <div
        ref={joyKnobRef}
        className="pointer-events-none absolute left-0 top-0 hidden h-[22px] w-[22px] rounded-full opacity-90"
        aria-hidden
      />

      {/* HUD — React 저빈도 상태만 그린다 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="tracking-[0.2em] text-foreground/50">
            T+{String(secView).padStart(2, "0")}s
          </span>
          <span className="flex items-center gap-2">
            {hitsView > 0 && <span className="text-rose-300">×{hitsView}</span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 아이콘은 next/image 최적화 대상이 아니다 */}
            <img src={UI_SRC.coinScrap} alt="" className="h-4 w-4" />
            <span className="text-emerald-300">+{scoreView}</span>
          </span>
        </div>
        {/* 추진 에너지 게이지 — 이 바가 이 게임의 시계다 */}
        <div className="mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 아이콘은 next/image 최적화 대상이 아니다 */}
          <img src={UI_SRC.statBattery} alt="추진 에너지" className="h-5 w-5" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${lowEnergy ? "bg-danger" : "bg-sky-400"}`}
              style={{ width: `${(energyView / DIFFICULTY.startEnergy) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 귀환 버튼 — 언제든 수동 종료 */}
      <button
        type="button"
        onClick={() => finishRef.current()}
        className="absolute right-3 top-[max(3.6rem,calc(env(safe-area-inset-top)+2.8rem))] z-20 rounded-full border border-panel-border bg-black/40 px-3 py-1.5 text-xs font-bold"
      >
        귀환
      </button>

      {/* 에너지 소진 — 표류 카운트다운 (태양전지를 먹으면 재점화!) */}
      {driftLeft !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 z-10 flex animate-pulse flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 아이콘은 next/image 최적화 대상이 아니다 */}
          <img src={FX_SRC.alert} alt="" className="h-10 w-10" />
          <p className="text-sm font-bold text-rose-300">
            에너지 소진 — 표류 {driftLeft}초
          </p>
          <p className="text-xs text-foreground/70">
            반짝이는 태양전지를 먹으면 재점화!
          </p>
        </div>
      )}
    </div>
  );
}
