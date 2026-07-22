"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GROUND_STATION, predictPasses } from "@/components/monitor/orbit-math";
import GroundTrackMap from "@/components/monitor/ground-track-map";
import OrbitGlobe from "@/components/monitor/orbit-globe";
import TelemetryPanel from "@/components/monitor/telemetry-panel";
import PassPredict from "@/components/monitor/pass-predict";

/**
 * 궤도 관제 화면 — 줍이가 지금 지구 어디 위를 날고 있는지 모니터링.
 *
 * 전체 화면 오버레이(액션 모드와 같은 패턴). 500ms 시계 하나가 유일한
 * 상태이고, 네 패널은 그 시각에서 각자 필요한 값을 orbit-math의 순수
 * 함수로 계산한다. 게임 상태(스토어)와는 완전히 무관한 읽기 전용 화면.
 */

export default function MonitorScreen({ onClose }: { onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // 패스 예측은 무거운 편(24h 스캔)이라 10분 단위로만 다시 계산
  const passWindow = Math.floor(now / (10 * 60_000));
  const passes = useMemo(
    () => predictPasses(passWindow * 10 * 60_000),
    [passWindow],
  );

  return (
    <motion.div
      className="absolute inset-0 z-50 overflow-y-auto bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.25em] text-foreground/50">
              CLEAR SKY ‧ 궤도 관제
            </p>
            <h2 className="text-lg font-bold">🛰️ 줍이 실시간 추적</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="관제 화면 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-panel-border bg-panel text-sm transition active:scale-95"
          >
            ✕
          </button>
        </header>

        <GroundTrackMap now={now} />
        <OrbitGlobe now={now} />
        <TelemetryPanel now={now} />
        <PassPredict now={now} passes={passes} />

        <p className="text-center text-[10px] text-foreground/40">
          기지국: {GROUND_STATION.name} · 궤도는 케플러 법칙 근사로 계산돼요
        </p>
      </div>
    </motion.div>
  );
}
