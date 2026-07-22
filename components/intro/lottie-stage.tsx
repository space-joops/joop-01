"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Lottie 무대 — bodymovin JSON 하나를 컨테이너에 꽉 채워 재생한다.
 *
 * lottie-web은 document를 만지므로 SSR에서 실행되면 안 된다.
 * next/dynamic(ssr:false)로 클라이언트에서만 로드한다.
 *
 * 상태 교체(idle→happy→launch)는 src만 바꾸면 된다 — key={src}로
 * 깨끗하게 리마운트되어 새 애니메이션이 처음부터 재생된다.
 */
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/** 같은 JSON을 여러 번 fetch하지 않도록 모듈 레벨 캐시 */
const cache = new Map<string, object>();
async function loadJson(src: string): Promise<object> {
  const hit = cache.get(src);
  if (hit) return hit;
  const res = await fetch(src);
  const json = (await res.json()) as object;
  cache.set(src, json);
  return json;
}

interface LottieStageProps {
  src: string;
  loop?: boolean;
  /** 재생 완료 콜백 — loop=false일 때만 발화 */
  onComplete?: () => void;
  className?: string;
  /** cover=꽉 채우고 넘침 자르기(배경) / contain=비율 유지 안쪽 맞춤(캐릭터) */
  fit?: "cover" | "contain";
}

export default function LottieStage({
  src,
  loop = true,
  onComplete,
  className,
  fit = "contain",
}: LottieStageProps) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    loadJson(src).then((json) => {
      if (alive) setData(json);
    });
    return () => {
      alive = false;
    };
  }, [src]);

  if (!data) return <div className={className} aria-hidden />;

  return (
    <Lottie
      key={src}
      animationData={data}
      loop={loop}
      onComplete={onComplete}
      className={className}
      rendererSettings={{
        preserveAspectRatio: fit === "cover" ? "xMidYMid slice" : "xMidYMid meet",
      }}
    />
  );
}
