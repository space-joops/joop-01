"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  usePetStore,
  isSleeping,
  isDataFull,
  type PetMood,
} from "@/stores/pet-store";

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

const MODEL_URL = "/models/pet_stage1_baby.glb";

/* ── 성형 튜닝 (오퍼레이터 피드백 반영) ──────────────────────────
 * 원본 에셋 대비: 전체 크기 70%, 눈 150%, 코 30%, 입 200%.
 * 모델에는 얼굴 가운데 짙은 점('o') 하나뿐이라 이를 코로 삼아 줄이고,
 * 입은 스마일 아크를 새로 만들어 붙인다 (같은 mouth 재질 재사용).
 * 눈은 피벗(눈알 중심) 기준으로 키워야 하이라이트가 제자리에 남는다.
 */
const PET_SHRINK = 0.7;
const EYE_SCALE = 1.5;
const NOSE_SCALE = 0.3;
/** 새로 붙이는 스마일 입 — 원본 'o'(폭 0.03) 대비 폭 배율 */
const MOUTH_SCALE = 2.0;

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

  // 눈: StatusLight 아래 메시들을 좌/우로 나눠, 같은 쪽 눈알 중심을 피벗으로 축소
  const statusLight = nodes.StatusLight as THREE.Object3D | undefined;
  if (statusLight) {
    const meshes: THREE.Mesh[] = [];
    statusLight.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const pivots = new Map<number, THREE.Vector3>(); // 키: 좌(-1)/우(+1)
    for (const m of meshes) {
      if ((m.material as THREE.Material).name === "eye") {
        const c = centerOf(m);
        pivots.set(Math.sign(c.x), c);
      }
    }
    for (const m of meshes) {
      const pivot = pivots.get(Math.sign(centerOf(m).x));
      if (pivot) shrinkAboutPivot(m, pivot, EYE_SCALE);
    }
  }

  // 코: Body 직속 자식 중 mouth 머티리얼 메시(가운데 점) — 제 중심 기준으로 축소
  const body = nodes.Body as THREE.Object3D | undefined;
  const nose = body?.children.find(
    (o) =>
      (o as THREE.Mesh).isMesh &&
      ((o as THREE.Mesh).material as THREE.Material).name === "mouth",
  ) as THREE.Mesh | undefined;
  if (!nose || !body) return;
  const noseCenter = centerOf(nose);
  const noseFrontZ = nose.geometry.boundingBox!.max.z;
  shrinkAboutPivot(nose, noseCenter, NOSE_SCALE);

  // 입: 코 아래에 스마일 아크(토러스 일부)를 새로 만들어 붙인다.
  // 폭 = 원본 'o' × MOUTH_SCALE. 호가 원 아래쪽에 오도록 돌리면 ∪(스마일).
  const arc = 1.8; // 호의 각도(rad) — 클수록 활짝 웃는 입
  const width = 0.03 * MOUTH_SCALE;
  const radius = width / (2 * Math.sin(arc / 2));
  const mouth = new THREE.Mesh(
    // (반지름, 선 굵기, 단면 분할, 호 분할, 호 각도) — 로우폴리 유지
    new THREE.TorusGeometry(radius, 0.0045, 6, 14, arc),
    nose.material,
  );
  mouth.rotation.z = -Math.PI / 2 - arc / 2; // 호를 원의 맨 아래로
  // 호의 최하단이 코보다 살짝 아래(-0.024)에 오도록 토러스 중심을 배치
  mouth.position.set(0, noseCenter.y - 0.024 + radius, noseFrontZ - 0.001);
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
function PetModel({ petting, burstNonce }: Satellite3DProps) {
  const { scene, nodes, materials } = useGLTF(MODEL_URL);

  // 리그 준비: 노드 참조 + "초기 자세" 백업 + 화면 프레이밍 계산.
  // GLB의 힌지 노드는 기본 자세(matrix)를 갖고 있으므로, 매 프레임
  // "초기 쿼터니언 × 오프셋 회전"으로 합성해야 원래 각도가 보존된다.
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
    return {
      tips: [grab("Antenna_Tip")].filter(Boolean).map((t, i) => ({
        ...t!,
        dir: i % 2 === 0 ? 1 : -1,
      })),
      // 메시 좌표 실측 기준: Panel_L은 -X 방향, Panel_R은 +X 방향으로 뻗는다
      panels: [
        { ...grab("Panel_L"), sx: -1 },
        { ...grab("Panel_R"), sx: 1 },
      ].filter((p) => p.node) as { node: THREE.Object3D; q0: THREE.Quaternion; sx: number }[],
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
    prevEmotion: "normal" as Emotion,
  }).current;

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

    // 날개(팔): 절전·동면 접힘 + 시무룩 축 처짐
    for (const { node, q0, sx } of rig.panels) {
      offsetEuler.set(
        0,
        sx * st.fold * 1.75,
        (emotion === "sulky" ? -sx * 0.16 : 0) * (1 - st.fold),
      );
      node.quaternion.copy(q0).multiply(offsetQuat.setFromEuler(offsetEuler));
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
    <group scale={rig.scale}>
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
  return (
    <Canvas
      camera={{ fov: 42, position: [0.35, 0.3, 1.6], near: 0.05, far: 50 }}
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
        <PetModel {...props} />
      </Suspense>
    </Canvas>
  );
}

// 모듈 로드 시점에 GLB 미리 받기 — 첫 등장 순간의 빈 화면을 줄인다
if (typeof window !== "undefined") {
  useGLTF.preload(MODEL_URL);
}
