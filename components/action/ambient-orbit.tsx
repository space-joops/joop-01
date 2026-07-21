"use client";

import { useEffect, useRef } from "react";
import { AMBIENT_SAT_SRC } from "@/components/action/sortie-assets";

/**
 * 배경 궤도 연출 — 지구 뒤에서 날아드는 원경 위성들.
 *
 * 파편은 평면에서 움직이지만, 이 레이어의 위성들은 "멀리 지구 궤도를
 * 돌고 있다"는 착시를 만든다: 좌하단 지구 수평선 뒤에서 작고 흐리게
 * 나타나 → 포물선을 그리며 점점 커지다가 → 화면 옆으로 스쳐 나간다.
 * 스타워즈에서 카메라 옆을 지나가는 우주선의 문법이다.
 *
 * 순수 장식 레이어 — 충돌·점수·게임플레이와 완전히 무관하다.
 *   - pointer-events 없음, 게임 레이어(sortie-field)보다 뒤 z-order.
 *   - 피격 화면 흔들림 밖에 둔다: 원경은 흔들리지 않아야 멀어 보인다.
 *   - sortie-field와 같은 escape hatch 패턴: 자체 rAF가 <img> 노드를
 *     직접 만들고 transform으로 옮긴다. 한 번에 한 기뿐이라 부하는 미미.
 *
 * 원근 착시의 재료 두 가지:
 *   1) 경로 = 2차 베지에 곡선 B(t) = (1-t)²P0 + 2(1-t)t·P1 + t²P2
 *      — 제어점 P1이 포물선의 "꼭짓점" 역할을 한다.
 *   2) 크기 = t^1.8 ease-in — 멀리 있을 땐 천천히, 다가올수록 훅 커진다.
 *      일정하게 커지면 "커지는 그림"이고, 가속하며 커져야 "다가오는 물체"다.
 */

/** 연출 상수 — 게임성(TUNE/DIFFICULTY)이 아닌 장식이라 여기서 관리 */
const AMBIENT = {
  /** 첫 기체 등장까지(초) */
  firstDelay: 1.5,
  /** 다음 기체 스폰 간격 범위(초) */
  spawnEvery: [6, 10],
  /** 동시 최대 기체 수 — 큰 기체가 한 대씩 지나가야 영화처럼 장엄하다 */
  maxSats: 1,
  /** 한 기체가 곡선을 완주하는 시간 범위(초) — 느릴수록 장엄하다 */
  travelSec: [9, 14],
  /** 크기: 시작 배율 → 끝 배율 — 막판엔 화면을 압도할 만큼 가까이 */
  scaleFrom: 0.1,
  scaleTo: 2.2,
  /** 크기 가속 지수 — 클수록 막판에 급격히 커진다 */
  scaleEase: 2.0,
  /** 등장 페이드인 구간 (t 비율) — "지구 뒤에서 스윽" */
  fadeIn: 0.15,
  /** 기준 이미지 크기(px) — 위성 에셋은 2:1 가로형 */
  imgW: 144,
  imgH: 72,
  /** 최대 불투명도 — 다가올수록 또렷하게 */
  maxOpacity: 1,
} as const;

interface AmbientSat {
  el: HTMLImageElement;
  /** 베지에 제어점 (px) */
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  travel: number;
  t: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export default function AmbientOrbit() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const sats: AmbientSat[] = [];
    let spawnTimer: number = AMBIENT.firstDelay;
    let raf = 0;

    /**
     * 새 원경 위성 — 좌하단 지구 수평선 부근에서 출발해(P0),
     * 중상단을 정점으로(P1) 좌/우 화면 밖으로 빠진다(P2).
     */
    const spawn = () => {
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      if (w === 0 || h === 0) return;

      const exitRight = Math.random() < 0.5;
      const p0 = { x: rand(0.05, 0.45) * w, y: rand(0.78, 0.95) * h };
      const p1 = { x: rand(0.25, 0.75) * w, y: rand(0.15, 0.4) * h };
      const p2 = {
        x: (exitRight ? 1.15 : -0.15) * w,
        y: rand(0.25, 0.55) * h,
      };

      const el = document.createElement("img");
      el.src = AMBIENT_SAT_SRC;
      el.alt = "";
      el.className = "pointer-events-none absolute left-0 top-0";
      el.style.width = `${AMBIENT.imgW}px`;
      el.style.height = `${AMBIENT.imgH}px`;
      el.style.willChange = "transform, opacity";
      // 원경 표현: 살짝 어둡게 — 상수라 프레임마다 리페인트하지 않는다
      el.style.filter = "brightness(0.85) saturate(0.9)";
      el.style.opacity = "0";
      layer.appendChild(el);

      sats.push({
        el,
        p0,
        p1,
        p2,
        travel: rand(AMBIENT.travelSec[0], AMBIENT.travelSec[1]),
        t: 0,
      });
    };

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      spawnTimer -= dt;
      if (spawnTimer <= 0 && sats.length < AMBIENT.maxSats) {
        spawn();
        spawnTimer = rand(AMBIENT.spawnEvery[0], AMBIENT.spawnEvery[1]);
      }

      for (let i = sats.length - 1; i >= 0; i--) {
        const s = sats[i];
        s.t += dt / s.travel;
        if (s.t >= 1) {
          s.el.remove();
          sats.splice(i, 1);
          continue;
        }
        const t = s.t;
        const u = 1 - t;

        // 2차 베지에: 위치
        const x = u * u * s.p0.x + 2 * u * t * s.p1.x + t * t * s.p2.x;
        const y = u * u * s.p0.y + 2 * u * t * s.p1.y + t * t * s.p2.y;

        // 접선(도함수) 방향으로 기수를 기울인다 — 진행 방향을 향한 비행感.
        // 사실풍 위성은 위아래가 있으므로, 왼쪽으로 갈 땐 180° 회전 대신
        // 좌우 미러(scaleX 반전)를 쓰고, 기울기는 완만하게 눌러 장엄함을 지킨다.
        const dx = 2 * u * (s.p1.x - s.p0.x) + 2 * t * (s.p2.x - s.p1.x);
        const dy = 2 * u * (s.p1.y - s.p0.y) + 2 * t * (s.p2.y - s.p1.y);
        let heading = (Math.atan2(dy, dx) * 180) / Math.PI;
        const facingLeft = Math.abs(heading) > 90;
        if (facingLeft) heading = heading > 0 ? heading - 180 : heading + 180;
        const deg = heading * 0.6; // 완만한 뱅킹
        const flip = facingLeft ? -1 : 1;

        // 원근: ease-in 스케일 — 다가올수록 가속하며 커진다
        const scale =
          AMBIENT.scaleFrom +
          (AMBIENT.scaleTo - AMBIENT.scaleFrom) * Math.pow(t, AMBIENT.scaleEase);

        s.el.style.transform = `translate3d(${x - AMBIENT.imgW / 2}px, ${y - AMBIENT.imgH / 2}px, 0) rotate(${deg}deg) scale(${scale * flip}, ${scale})`;
        s.el.style.opacity = String(
          AMBIENT.maxOpacity * Math.min(1, t / AMBIENT.fadeIn),
        );
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const s of sats) s.el.remove();
    };
  }, []);

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    />
  );
}
