"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { detectIos } from "@/lib/pwa";
import { usePwaStore } from "@/stores/pwa-store";

/**
 * 홈 화면 설치 넛지 — "거슬리지 않게, 그러나 주기적으로".
 *
 * 정책:
 * - 이미 앱으로 실행 중이거나 설치를 마쳤으면 절대 안 나옴
 * - 오프닝 컷신을 보는 중(첫 교감의 90초!)에는 방해하지 않음
 * - 접속 후 25초가 지나야 등장 — 게임부터 즐기게 한다
 * - [다음에]를 누를수록 재등장 간격이 3일 → 7일 → 14일로 길어진다 (백오프)
 * - 화면을 가리는 모달이 아니라 하단에 슬쩍 올라오는 카드
 *
 * 브라우저별 분기:
 * - Chromium(안드로이드/데스크톱): beforeinstallprompt를 잡아 네이티브 설치 다이얼로그
 * - iOS Safari: 이벤트가 없으므로 공유 메뉴 안내 문구
 */

const NUDGE_KEY = "joops.install-nudge.v1";
const INSTALLED_KEY = "joops.pwa-installed.v1";
const INTRO_SEEN_KEY = "joops.intro-seen.v1";

/** 접속 후 이만큼 지나야 첫 등장 */
const FIRST_DELAY_MS = 25_000;
/** 조건이 아직 안 맞으면 이 주기로 다시 확인 */
const RECHECK_MS = 45_000;
/** [다음에] 횟수에 따른 재등장 간격 (일) — 마지막 값에서 고정 */
const BACKOFF_DAYS = [3, 7, 14];

interface NudgeRecord {
  dismissCount: number;
  lastDismissedAt: number;
}

function readRecord(): NudgeRecord {
  try {
    const raw = window.localStorage.getItem(NUDGE_KEY);
    if (raw) return JSON.parse(raw) as NudgeRecord;
  } catch {
    // 손상된 값은 초기화
  }
  return { dismissCount: 0, lastDismissedAt: 0 };
}

function writeRecord(record: NudgeRecord) {
  window.localStorage.setItem(NUDGE_KEY, JSON.stringify(record));
}

type NudgeMode = "native" | "ios";

export default function InstallNudge() {
  const isStandalone = usePwaStore((state) => state.isStandalone);
  const promptInstall = usePwaStore((state) => state.promptInstall);

  const [mode, setMode] = useState<NudgeMode | null>(null);

  /* 등장 조건을 주기적으로 검사하다가, 맞아떨어지는 순간 한 번 등장 */
  useEffect(() => {
    if (isStandalone) return;

    let elapsed = FIRST_DELAY_MS;
    const tryShow = () => {
      // 설치 완료 기록이 있으면 영구 중단
      if (window.localStorage.getItem(INSTALLED_KEY)) return;
      // 오프닝 컷신을 아직 끝내지 않았으면 다음 기회에
      if (!window.localStorage.getItem(INTRO_SEEN_KEY)) return schedule();

      // 백오프: 마지막 [다음에]로부터 충분한 시간이 지났는지
      const record = readRecord();
      const backoffIndex = Math.min(
        record.dismissCount,
        BACKOFF_DAYS.length - 1,
      );
      const waitMs = BACKOFF_DAYS[backoffIndex] * 24 * 60 * 60 * 1000;
      if (record.lastDismissedAt + waitMs > Date.now()) return;

      if (usePwaStore.getState().installPrompt) {
        setMode("native");
      } else if (detectIos()) {
        setMode("ios");
      } else {
        // 설치 수단이 없는 브라우저(데스크톱 Firefox 등) — 프롬프트가 늦게
        // 도착할 수도 있으니 조금 더 기다려 본다
        schedule();
      }
    };

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(tryShow, elapsed);
      elapsed = RECHECK_MS;
    };
    schedule();
    return () => clearTimeout(timer);
  }, [isStandalone]);

  const dismiss = () => {
    const record = readRecord();
    writeRecord({
      dismissCount: record.dismissCount + 1,
      lastDismissedAt: Date.now(),
    });
    setMode(null);
  };

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      window.localStorage.setItem(INSTALLED_KEY, "1");
      setMode(null);
    } else {
      // 네이티브 다이얼로그에서 취소한 것도 [다음에]로 취급
      dismiss();
    }
  };

  return (
    <AnimatePresence>
      {mode && !isStandalone && (
        <motion.aside
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-4"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-panel-border bg-panel/95 p-3.5 shadow-xl backdrop-blur">
            <Image
              src="/icons/icon-192.png"
              alt=""
              width={44}
              height={44}
              className="rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">줍이를 홈 화면에 데려가기</p>
              <p className="mt-0.5 text-[11px] leading-snug text-foreground/60">
                {mode === "native"
                  ? "설치하면 전체 화면으로, 한 번의 탭으로 접속할 수 있어요."
                  : "Safari 하단 공유 버튼(⬆️)을 누른 뒤 '홈 화면에 추가'를 선택하세요."}
              </p>
            </div>
            {mode === "native" ? (
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={install}
                  className="rounded-xl bg-data/90 px-3 py-1.5 text-xs font-semibold text-background transition active:scale-95"
                >
                  추가하기
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-xl px-3 py-1 text-[11px] text-foreground/45 transition active:scale-95"
                >
                  다음에
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="shrink-0 rounded-xl border border-panel-border px-3 py-1.5 text-xs font-semibold transition active:scale-95"
              >
                알겠어요
              </button>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
