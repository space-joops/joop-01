"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  usePetStore,
  isSleeping,
  isDataFull,
  type PetMood,
} from "@/stores/pet-store";
import type { PetVariant } from "@/lib/supabase/types";
import { petSprite } from "@/components/action/sortie-assets";

/**
 * 3D 줍이 — 캐릭터 에셋 팩 v2의 GLB + 감정 포즈 레시피 구현.
 *
 * 에셋 팩 규약(plan/img 참조):
 *   - PascalCase 노드만 애니메이션 대상. 힌지 피벗이 노드 원점에 정렬되어
 *     있어 "회전값만 주면" 접힘/파닥임이 된다.
 *   - 눈 = StatusLight의 'eye' 머티리얼. emissive 색·강도로 기분을 말한다.
 *
 * 성능 원칙(개발 원칙 3): 로우폴리 GLB(63KB) + 조명 3개 + 그림자 없음.
 */

const STAGE1_URL = "/models/pet_stage1_baby.glb";

/** 진화 단계·장비 → GLB 경로 (에셋 팩 v2의 6종 중 펫 5종) */
function modelUrlFor(level: number, variant: PetVariant | null): string {
  if (level >= 3 && variant) return `/models/pet_stage3_${variant}.glb`;
  if (level >= 2) return "/models/pet_stage2_junior.glb";
  return STAGE1_URL;
}

/* ── 성형 튜닝 (오퍼레이터 피드백 반영) ──────────────────────────
 * 원본의 납작한 알약 눈은 키울수록 슬래브처럼 튀어나와 귀엽지 않다
 * (스크린샷 피드백). 그래서 원본 눈 메시를 숨기고 동그란 눈알 +
 * 반짝 하이라이트로 교체한다. 코(가운데 점)는 30%로 축소, 입은
 * 도톰한 스마일 아크를 새로 붙인다. 재질은 전부 원본 것을 재사용 —
 * 눈알이 eye 재질을 쓰므로 상태등(감정별 emissive) 연출이 그대로 산다.
 */
const PET_SHRINK = 0.7;
/** 동그란 눈알 반지름 — 원본 알약 반폭(0.033)과 비슷한 크기감 */
const EYE_RADIUS = 0.034;
const NOSE_SCALE = 0.3;
/** 코를 눈 쪽으로 끌어올리는 거리 — 원본 'o'는 너무 아래에 있다 */
const NOSE_LIFT = 0.015;
/** 스마일 입 폭·선 굵기 (모델 단위 m) */
const MOUTH_WIDTH = 0.08;
const MOUTH_THICK = 0.009;

/**
 * 메시를 지정한 피벗 기준으로 s배 축소한다.
 * 원리: 정점 v의 최종 위치 = v×s + pivot×(1-s) → pivot은 제자리에 남고
 * 나머지가 피벗 쪽으로 모여든다 (스케일의 중심 이동 공식).
 */
function shrinkAboutPivot(mesh: THREE.Mesh, pivot: THREE.Vector3, s: number) {
  mesh.scale.setScalar(s);
  mesh.position.copy(pivot).multiplyScalar(1 - s);
}

/** 얼굴 성형 — GLTF 캐시가 재사용되므로 두 번 적용되지 않게 표식을 남긴다 */
function applyFaceTweaks(scene: THREE.Group, nodes: Record<string, unknown>) {
  if (scene.userData.faceTweaked) return;
  scene.userData.faceTweaked = true;

  const centerOf = (mesh: THREE.Mesh) => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  };

  // 기준 좌표: 코(가운데 점)의 중심과 얼굴 앞면 z
  const body = nodes.Body as THREE.Object3D | undefined;
  const statusLight = nodes.StatusLight as THREE.Object3D | undefined;
  const nose = body?.children.find(
    (o) =>
      (o as THREE.Mesh).isMesh &&
      ((o as THREE.Mesh).material as THREE.Material).name === "mouth",
  ) as THREE.Mesh | undefined;
  if (!body || !statusLight || !nose) return;
  const noseCenter = centerOf(nose);
  const faceZ = nose.geometry.boundingBox!.max.z;

  // ── 배 패치 숨기기: 정면 구도에선 얼굴 한가운데 거대한 코처럼 보인다
  //    (스크린샷 피드백의 "뭉퉁한 코"의 정체가 이 belly 메시였다)
  for (const child of body.children) {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && (mesh.material as THREE.Material).name === "belly") {
      mesh.visible = false;
    }
  }

  // ── 눈 교체: 원본 알약·하이라이트 메시를 숨기고 위치만 물려받는다
  const originals: THREE.Mesh[] = [];
  statusLight.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) originals.push(o as THREE.Mesh);
  });
  let eyeMat: THREE.Material | null = null;
  let hiMat: THREE.Material | null = null;
  const pivots = new Map<number, THREE.Vector3>(); // 키: 좌(-1)/우(+1)
  for (const m of originals) {
    const name = (m.material as THREE.Material).name;
    if (name === "eye") {
      eyeMat = m.material as THREE.Material;
      pivots.set(Math.sign(centerOf(m).x), centerOf(m));
    } else if (name === "hi") {
      hiMat = m.material as THREE.Material;
    }
    m.visible = false;
  }
  if (eyeMat && hiMat) {
    const eyeGeo = new THREE.SphereGeometry(EYE_RADIUS, 20, 14);
    const hiBigGeo = new THREE.SphereGeometry(EYE_RADIUS * 0.34, 10, 8);
    const hiSmallGeo = new THREE.SphereGeometry(EYE_RADIUS * 0.16, 8, 6);
    for (const [, pivot] of pivots) {
      const cy = pivot.y + 0.004;
      const cz = faceZ - EYE_RADIUS * 0.45; // 절반쯤 얼굴에 파묻힌 볼록 눈
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      ball.position.set(pivot.x, cy, cz);
      ball.scale.z = 0.72; // 살짝 납작하게 — 옆에서 봐도 과하게 안 튀어나오게
      statusLight.add(ball);
      // 반짝임 2개: 왼쪽 위 큰 것 + 오른쪽 아래 작은 것 (애니메 눈 문법)
      const sparkleBig = new THREE.Mesh(hiBigGeo, hiMat);
      sparkleBig.position.set(
        pivot.x - EYE_RADIUS * 0.32,
        cy + EYE_RADIUS * 0.36,
        cz + EYE_RADIUS * 0.5,
      );
      statusLight.add(sparkleBig);
      const sparkleSmall = new THREE.Mesh(hiSmallGeo, hiMat);
      sparkleSmall.position.set(
        pivot.x + EYE_RADIUS * 0.3,
        cy - EYE_RADIUS * 0.22,
        cz + EYE_RADIUS * 0.55,
      );
      statusLight.add(sparkleSmall);
    }
  }

  // ── 코: 가운데 점을 30%로 줄이고 눈 쪽으로 끌어올린다 — 아담한 점코
  shrinkAboutPivot(nose, noseCenter, NOSE_SCALE);
  nose.position.y += NOSE_LIFT;
  const noseY = noseCenter.y + NOSE_LIFT;

  // ── 입: 도톰한 스마일 아크(토러스 일부). 호가 원 아래쪽에 오도록 돌리면 ∪
  const arc = 2.0; // 호의 각도(rad) — 클수록 활짝 웃는 입
  const radius = MOUTH_WIDTH / (2 * Math.sin(arc / 2));
  const mouth = new THREE.Mesh(
    // (반지름, 선 굵기, 단면 분할, 호 분할, 호 각도) — 로우폴리 유지
    new THREE.TorusGeometry(radius, MOUTH_THICK, 8, 16, arc),
    nose.material,
  );
  mouth.rotation.z = -Math.PI / 2 - arc / 2; // 호를 원의 맨 아래로
  // 스마일 양 끝이 코 높이, 최하단이 코 아래 0.022에 오도록 배치 — 코 바로 밑 미소
  mouth.position.set(0, noseY - 0.022 + radius, faceZ - 0.002);
  body.add(mouth);
}

/** 연출용 감정 상태 — 스토어의 무드·게이지에서 파생된다 */
type Emotion =
  | "normal"
  | "low_battery"
  | "data_full"
  | "sulky"
  | "powersave"
  | "hibernate";

/** 홈 화면 상태 메시지와 같은 우선순위로 감정을 결정한다 */
function deriveEmotion(
  mood: PetMood,
  battery: number,
  dataUsed: number,
): Emotion {
  if (mood === "hibernate") return "hibernate";
  if (isSleeping(battery)) return "powersave";
  if (mood === "sulky") return "sulky";
  if (isDataFull(dataUsed)) return "data_full";
  if (battery <= 15) return "low_battery";
  return "normal";
}

/** 감정 → 목표 포즈 (에셋 팩 README의 레시피 수치 그대로) */
const POSE: Record<Emotion, { droop: number; fold: number; floatK: number }> = {
  normal: { droop: 0, fold: 0, floatK: 1 },
  low_battery: { droop: 0.35, fold: 0, floatK: 0.5 },
  data_full: { droop: 0, fold: 0, floatK: 1 },
  sulky: { droop: 0.9, fold: 0, floatK: 0.45 },
  powersave: { droop: 1.2, fold: 0.8, floatK: 0.25 },
  hibernate: { droop: 1.4, fold: 1, floatK: 0 },
};

/** 감정 → 눈(상태등) 색·깜빡임 모드 */
const EYE: Record<
  Emotion,
  { color: number; mode: "nat" | "heavy" | "fast" | "dim" | "pulse" | "off"; base: number }
> = {
  normal: { color: 0x14e0d2, mode: "nat", base: 0.95 },
  low_battery: { color: 0xffb13d, mode: "heavy", base: 0.55 },
  data_full: { color: 0x14e0d2, mode: "fast", base: 0.95 },
  sulky: { color: 0xe8b84a, mode: "dim", base: 0.4 },
  powersave: { color: 0xff8a3d, mode: "pulse", base: 0.35 },
  hibernate: { color: 0x9adfe0, mode: "off", base: 0 },
};

interface Satellite3DProps {
  /** 드래그로 쓰다듬는 중인가 — 안테나 잔파닥임 + 눈빛 밝아짐 */
  petting: boolean;
  /** 값이 바뀔 때마다 기쁨 버스트(홉 + 파닥임 1.6초) 발동 */
  burstNonce: number;
}

/** GLB를 로드해 감정 연출을 입히는 본체 (Canvas 안에서만 렌더 가능) */
function PetModel({
  url,
  petting,
  burstNonce,
  onReady,
}: Satellite3DProps & { url: string; onReady?: () => void }) {
  const { scene, nodes, materials } = useGLTF(url);

  // useGLTF가 suspend를 풀고 여기까지 왔다 = 모델 준비 완료.
  // 부모에게 알려 2D 폴백을 크로스페이드로 걷어낸다.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // 리그 준비: 노드 참조 + "초기 자세" 백업 + 화면 프레이밍 계산.
  // GLB의 힌지 노드는 기본 자세(matrix)를 갖고 있으므로, 매 프레임
  // "초기 쿼터니언 × 오프셋 회전"으로 합성해야 원래 각도가 보존된다.
  // 노드 구성은 단계마다 다르다(3단계는 귀 2쌍, 2단계+는 아우터 패널…)
  // — 이름 규약으로 있는 것만 수집하므로 어떤 모델이 와도 동작한다.
  const rig = useMemo(() => {
    const grab = (name: string) => {
      const node = nodes[name] as THREE.Object3D | undefined;
      return node ? { node, q0: node.quaternion.clone() } : null;
    };
    // 바운딩 박스로 중심·크기를 재서 어떤 모델이든 같은 구도로 잡는다
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const scale = (1.15 / Math.max(size.x, size.y, size.z)) * PET_SHRINK;

    // 눈·코 성형은 프레이밍 측정 후에 적용 (외곽 크기에 영향 없음)
    applyFaceTweaks(scene, nodes as Record<string, unknown>);

    // 안테나(귀·꼬리): 1~2단계 Antenna_Tip 1개, 3단계 좌우 쫑긋 귀 2개
    const tips = ["Antenna_Tip", "Antenna_L_Tip", "Antenna_R_Tip"]
      .map((name) => ({ grabbed: grab(name), dir: name.includes("_R_") ? -1 : 1 }))
      .filter((t) => t.grabbed)
      .map((t) => ({ ...t.grabbed!, dir: t.dir }));

    // 패널(팔·날개): 메시 좌표 실측 기준 Panel_L = -X, Panel_R = +X.
    // 2단계+의 _Outer는 부모 패널 기준 아코디언 역방향(배율 -2.9)으로 접힌다
    const panelSpecs: [string, number, number][] = [
      ["Panel_L", -1, 1.75],
      ["Panel_R", 1, 1.75],
      ["Panel_L_Outer", -1, -2.9],
      ["Panel_R_Outer", 1, -2.9],
    ];
    const panels = panelSpecs
      .map(([name, sx, mult]) => ({ grabbed: grab(name), sx, mult }))
      .filter((p) => p.grabbed)
      .map((p) => ({ ...p.grabbed!, sx: p.sx, mult: p.mult }));

    return {
      tips,
      panels,
      // 장비 마이크로 아이들 (있는 모델에서만): 그물 후프 회전, 터렛 두리번
      netRing: grab("NetRing"),
      turretHead: grab("Turret_Head"),
      eyeMat: materials.eye as THREE.MeshStandardMaterial | undefined,
      center,
      scale,
    };
  }, [scene, nodes, materials]);

  // 렌더링과 무관한 연출 상태 — ref에 두면 매 프레임 갱신해도 리렌더가 없다
  const st = useRef({
    droop: 0,
    fold: 0,
    floatK: 1,
    flapT: -9, // 마지막 기쁨 버스트 시각
    nextBlink: 2.5,
    wakeFlash: 0,
    ringAngle: 0, // 그물 후프 누적 회전각
    prevEmotion: "normal" as Emotion,
    entrance: 0, // 착륙 연출 진행도 (0→1)
  }).current;

  const rootRef = useRef<THREE.Group>(null);
  const hoverRef = useRef<THREE.Group>(null);
  const offsetEuler = useMemo(() => new THREE.Euler(), []);
  const offsetQuat = useMemo(() => new THREE.Quaternion(), []);
  const eyeColor = useMemo(() => new THREE.Color(), []);

  // 기쁨 버스트 트리거 (탭 = 함께 일하는 신호!)
  useEffect(() => {
    if (burstNonce > 0) st.flapT = performance.now() / 1000;
  }, [burstNonce, st]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now() / 1000;
    const state = usePetStore.getState();
    const emotion = deriveEmotion(state.mood, state.battery, state.dataUsed);

    // 착륙 연출: 인트로에서 발진한 줍이가 관제 화면에 "도착"한다.
    // 위에서 스르륵 내려앉으며 커지는 0.9초 — 진화(모델 교체) 때도 재생.
    st.entrance = Math.min(1, st.entrance + dt / 0.9);
    const arrive = 1 - Math.pow(1 - st.entrance, 3); // ease-out cubic
    const root = rootRef.current;
    if (root) {
      root.scale.setScalar(rig.scale * (0.55 + 0.45 * arrive));
      root.position.y = (1 - arrive) * 0.4;
    }

    // 동면에서 깨어나는 순간: 복귀 시퀀스 — 눈 플래시 후 0.55초 뒤 파닥임
    if (st.prevEmotion === "hibernate" && emotion !== "hibernate") {
      st.wakeFlash = 1;
      st.flapT = now + 0.55;
    }
    st.prevEmotion = emotion;

    // 목표 포즈로 지수 감쇠 보간 — "몇 초에 걸쳐"가 아니라 "초당 비율로" 다가간다
    const pose = POSE[emotion];
    const k = 1 - Math.exp(-4.5 * dt);
    st.droop += (pose.droop - st.droop) * k;
    st.fold += (pose.fold - st.fold) * (1 - Math.exp(-3 * dt));
    st.floatK += (pose.floatK - st.floatK) * k;

    // 몸통: 호버링 + 기쁨 홉 + 데이터 만충 부르르
    const burst = now - st.flapT;
    const inBurst = burst >= 0 && burst < 1.6;
    const hop = inBurst ? Math.abs(Math.sin(burst * 9)) * 0.028 * (1 - burst / 1.6) : 0;
    const jitter = emotion === "data_full" ? 0.008 : 0;
    const hover = hoverRef.current;
    if (hover) {
      hover.position.set(
        (Math.random() - 0.5) * 2 * jitter,
        Math.sin(now * 2.3) * 0.02 * st.floatK + hop,
        (Math.random() - 0.5) * 2 * jitter,
      );
      hover.rotation.y = inBurst ? Math.sin(burst * 12) * 0.06 * (1 - burst / 1.6) : 0;
    }

    // 안테나(귀): 처짐(rotX) + 파닥임(rotZ)
    const flapAmp = inBurst
      ? 0.5 * (1 - burst / 1.6)
      : petting
        ? 0.24
        : 0;
    for (const { node, q0, dir } of rig.tips) {
      offsetEuler.set(
        st.droop,
        0,
        Math.sin(now * 2 * Math.PI * 8) * flapAmp * dir +
          (emotion === "data_full" ? Math.sin(now * 40) * 0.04 * dir : 0),
      );
      node.quaternion.copy(q0).multiply(offsetQuat.setFromEuler(offsetEuler));
    }

    // 날개(팔): 절전·동면 접힘 + 시무룩 축 처짐 (아우터는 역방향 아코디언)
    for (const { node, q0, sx, mult } of rig.panels) {
      const isBasePanel = mult > 0;
      offsetEuler.set(
        0,
        sx * st.fold * mult,
        (emotion === "sulky" && isBasePanel ? -sx * 0.16 : 0) * (1 - st.fold),
      );
      node.quaternion.copy(q0).multiply(offsetQuat.setFromEuler(offsetEuler));
    }

    // 장비 마이크로 아이들 — 깨어 있을 때만 살아 움직인다
    const awake = emotion !== "hibernate" && emotion !== "powersave";
    if (rig.netRing) {
      st.ringAngle += dt * (awake ? 0.5 : 0.05);
      offsetEuler.set(0, 0, st.ringAngle);
      rig.netRing.node.quaternion
        .copy(rig.netRing.q0)
        .multiply(offsetQuat.setFromEuler(offsetEuler));
    }
    if (rig.turretHead) {
      offsetEuler.set(0, awake ? Math.sin(now * 0.9) * 0.18 : 0, 0);
      rig.turretHead.node.quaternion
        .copy(rig.turretHead.q0)
        .multiply(offsetQuat.setFromEuler(offsetEuler));
    }

    // 눈 = 상태등: 감정별 색·깜빡임 패턴
    const eye = EYE[emotion];
    eyeColor.setHex(eye.color);
    let intensity = eye.base;
    if (eye.mode === "nat") {
      // 자연 깜빡임: 2.2~4.4초마다 0.12초간 감는다
      st.nextBlink -= dt;
      if (st.nextBlink < 0) st.nextBlink = 2.2 + Math.random() * 2.2;
      if (st.nextBlink < 0.12) intensity = 0.08;
    } else if (eye.mode === "heavy") {
      intensity = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(now * 2.6));
    } else if (eye.mode === "fast") {
      intensity = 0.7 + 0.45 * (0.5 + 0.5 * Math.sin(now * 34));
    } else if (eye.mode === "dim") {
      intensity = 0.32 + 0.12 * Math.sin(now * 1.7);
    } else if (eye.mode === "pulse") {
      intensity = 0.12 + 0.3 * Math.max(0, Math.sin(now * 1.9));
    } else {
      // off(동면): 3초에 한 번 희미하게 깜빡 — 살아 있다는 최소한의 신호
      intensity = now % 3 < 0.1 ? 0.5 : 0.02;
    }
    if (inBurst) intensity = Math.max(intensity, 1.5);
    if (petting) intensity = Math.max(intensity, 1.25);
    if (st.wakeFlash > 0) {
      st.wakeFlash -= dt * 1.4;
      intensity = Math.max(intensity, st.wakeFlash * 2);
    }
    if (rig.eyeMat) {
      rig.eyeMat.emissive.copy(eyeColor);
      rig.eyeMat.color
        .copy(eyeColor)
        .multiplyScalar(0.25 + Math.min(intensity, 1) * 0.75);
      rig.eyeMat.emissiveIntensity = intensity;
    }
  });

  return (
    <group ref={rootRef} scale={rig.scale}>
      <group ref={hoverRef}>
        <primitive
          object={scene}
          position={[-rig.center.x, -rig.center.y, -rig.center.z]}
        />
      </group>
    </group>
  );
}

/** 홈 화면에 얹는 3D 캔버스 — 배경 투명이라 별밤 CSS가 그대로 비친다 */
export default function Satellite3D(props: Satellite3DProps) {
  // 진화하면 모델이 바뀐다. key로 강제 리마운트해 리그를 깨끗하게 다시 준비
  const level = usePetStore((state) => state.level);
  const variant = usePetStore((state) => state.variant);
  const url = modelUrlFor(level, variant);

  /*
   * 심리스 등장: GLB가 로드되는 동안 같은 캐릭터의 2D 스티커(SVG 팩)를
   * 보여주고, 3D가 준비되면 0.5초 크로스페이드로 바꾼다.
   * fallback={null}이던 시절엔 펫 자리가 비어 있다가 툭 나타났다(팝인).
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false); // 진화로 모델이 바뀌면 새 단계의 2D 스티커로 이어받는다
    useGLTF.preload(url);
  }, [url]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        // 거의 정면에서 살짝 위 — 얼굴(눈·입)이 가장 사랑스럽게 보이는 각도
        camera={{ fov: 42, position: [0.16, 0.14, 1.55], near: 0.05, far: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        className="pointer-events-none" // 제스처는 부모 레이어가 받는다
      >
        {/* 조명 3개로 끝 — 모바일 발열 최소화 (뷰어 레퍼런스와 동일 구성) */}
        <hemisphereLight args={[0x9fb8ff, 0x1a2440, 0.9]} />
        <directionalLight color={0xfff4e0} intensity={1.0} position={[1.4, 2.2, 1.6]} />
        <directionalLight color={0x7df5ea} intensity={0.4} position={[-2, 0.6, -2]} />
        <Suspense fallback={null}>
          <PetModel key={url} url={url} onReady={() => setReady(true)} {...props} />
        </Suspense>
      </Canvas>

      {/* 2D 폴백 스티커 — 3D 준비 전까지 자리를 지키다 스르륵 사라진다 */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
          ready ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 벡터 SVG 폴백 스프라이트 */}
        <img
          src={petSprite(level, variant)}
          alt=""
          className="w-40 animate-pulse drop-shadow-[0_0_26px_rgba(129,140,248,0.45)]"
          draggable={false}
        />
      </div>
    </div>
  );
}

// 모듈 로드 시점에 1단계 GLB 미리 받기 — 첫 등장 순간의 빈 화면을 줄인다.
// 상위 단계 모델(각 100KB 안팎)은 진화 순간에 받아도 충분히 빠르다.
if (typeof window !== "undefined") {
  useGLTF.preload(STAGE1_URL);
}
