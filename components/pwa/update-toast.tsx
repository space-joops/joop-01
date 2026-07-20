"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePwaStore } from "@/stores/pwa-store";

/**
 * 새 배포 알림 토스트.
 *
 * 새 서비스 워커가 대기(waiting) 상태가 되면 화면 위쪽에 조용히 나타난다.
 * [업데이트]를 누르면 새 워커로 교대 → PwaProvider가 controllerchange를 받고
 * 1회 새로고침해서 새 배포가 즉시 반영된다.
 * 강제 새로고침이 아니라 유저에게 선택권을 주는 이유: 액션 모드 플레이 중에
 * 갑자기 화면이 리셋되면 안 되기 때문이다.
 */
export default function UpdateToast() {
  const waitingWorker = usePwaStore((state) => state.waitingWorker);
  const applyUpdate = usePwaStore((state) => state.applyUpdate);
  const dismiss = usePwaStore((state) => state.setWaitingWorker);
  const [applying, setApplying] = useState(false);

  return (
    <AnimatePresence>
      {waitingWorker && (
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-panel-border bg-panel/90 py-1.5 pl-4 pr-1.5 text-xs shadow-lg backdrop-blur"
        >
          <span aria-hidden>🛰️</span>
          <span className="text-foreground/80">새 버전이 도착했어요</span>
          <button
            type="button"
            disabled={applying}
            onClick={() => {
              setApplying(true);
              applyUpdate();
            }}
            className="rounded-full bg-data/90 px-3 py-1.5 font-semibold text-background transition active:scale-95 disabled:opacity-60"
          >
            {applying ? "적용 중…" : "업데이트"}
          </button>
          <button
            type="button"
            onClick={() => dismiss(null)}
            aria-label="나중에 업데이트"
            className="rounded-full px-2 py-1.5 text-foreground/40 transition active:scale-95"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
