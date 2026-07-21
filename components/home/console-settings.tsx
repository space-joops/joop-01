"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { APP_VERSION, BUILD_STAMP, detectIos } from "@/lib/pwa";
import {
  getPushSubscription,
  hasVapidKey,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";
import {
  removePushSubscription,
  savePushSubscription,
  sendPushToSelf,
} from "@/app/actions/push";
import { PUSH_MESSAGES, type PushMessageKey } from "@/lib/push-messages";
import { usePwaStore } from "@/stores/pwa-store";

/**
 * 관제 설정 시트 — 헤더의 ⚙️ 버튼으로 여는 하단 시트.
 *
 * 시스템 정보(버전/빌드), 관제 알림(웹 푸시), 홈 화면 설치를 담당한다.
 * 버전 표기가 여기 "정식으로" 있고, 헤더 캡션에도 아주 작게 상시 노출된다 —
 * 배포가 잘 반영됐는지는 헤더만 봐도 알 수 있게.
 */

/** 푸시 기능의 현재 상황 — UI가 이 상태 기계를 따라 그려진다 */
type PushStatus =
  | "loading" // 상태 파악 중
  | "unsupported" // 브라우저가 푸시 미지원
  | "ios-needs-install" // iOS는 홈 화면 설치 후에만 푸시 가능
  | "no-sw" // 서비스 워커 없음 (개발 모드 등)
  | "no-key" // VAPID 키 미설정
  | "denied" // 유저가 알림 권한을 차단함
  | "off" // 꺼짐 (구독 안 됨)
  | "on"; // 켜짐 (구독됨)

const TEST_MESSAGE_KEYS = Object.keys(PUSH_MESSAGES) as PushMessageKey[];

export default function ConsoleSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isStandalone = usePwaStore((state) => state.isStandalone);
  const installPrompt = usePwaStore((state) => state.installPrompt);
  const promptInstall = usePwaStore((state) => state.promptInstall);

  const [pushStatus, setPushStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /* 시트를 열 때마다 푸시 상태를 새로 파악한다 */
  useEffect(() => {
    if (!open) return;
    setNotice(null);
    let cancelled = false;

    (async () => {
      if (!isPushSupported()) {
        return detectIos() && !isStandalone
          ? "ios-needs-install"
          : "unsupported";
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return "no-sw";
      if (!hasVapidKey()) return "no-key";
      if (Notification.permission === "denied") return "denied";
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // 드리프트 자가 치유: 브라우저엔 구독이 있는데 DB엔 없는 상태
        // (익명 계정 교체, DB 초기화 등)를 방문 때마다 조용히 복구한다.
        // 결과는 기다리지 않는다 — UI 상태 표시와는 무관하므로.
        void savePushSubscription(subscription.toJSON());
        return "on";
      }
      return "off";
    })().then((status) => {
      if (!cancelled) setPushStatus(status as PushStatus);
    });

    return () => {
      cancelled = true;
    };
  }, [open, isStandalone]);

  const enablePush = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const subscription = await subscribeToPush();
      if (subscription) {
        setPushStatus("on");
        // 구독을 서버 주소록에도 등록 — 이제부터 크론이 먼저 말을 건다
        const saved = await savePushSubscription(subscription.toJSON());
        if (saved.ok) {
          setNotice("📡 관제 회선이 연결됐어요. 줍이의 위급 상황을 자동으로 알려드려요!");
        } else if (saved.reason === "not-configured") {
          setNotice("📡 알림은 켜졌어요. 관제 서버가 없어 지금은 테스트 전파만 가능해요.");
        } else {
          setNotice("📡 알림은 켜졌어요. 서버 등록은 다음 접속 때 자동으로 다시 시도해요.");
        }
      } else {
        setPushStatus(
          Notification.permission === "denied" ? "denied" : "off",
        );
        setNotice("알림 권한이 허용되지 않았어요.");
      }
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      // 해지 "전"의 endpoint를 받아 서버 주소록에서도 지운다
      const endpoint = await unsubscribeFromPush();
      if (endpoint) void removePushSubscription(endpoint);
      setPushStatus("off");
      setNotice(null);
    } finally {
      setBusy(false);
    }
  };

  /** 게임 알림 템플릿 중 하나를 골라 자기 자신에게 시험 발송 */
  const sendTestPush = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const subscription = await getPushSubscription();
      if (!subscription) {
        setPushStatus("off");
        return;
      }
      const key =
        TEST_MESSAGE_KEYS[Math.floor(Math.random() * TEST_MESSAGE_KEYS.length)];
      const result = await sendPushToSelf(subscription.toJSON(), key);
      setNotice(
        result.ok
          ? "🛰️ 테스트 전파를 쐈어요! 곧 알림이 도착해요."
          : `⚠️ ${result.error}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      window.localStorage.setItem("joops.pwa-installed.v1", "1");
      setNotice("🏠 홈 화면에 줍이가 착륙했어요!");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 배경 딤 — 탭하면 닫힘 */}
          <motion.button
            type="button"
            aria-label="설정 닫기"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60"
          />
          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-3xl border border-b-0 border-panel-border bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wide">⚙️ 관제 설정</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-2 py-1 text-foreground/40 transition active:scale-95"
              >
                ✕
              </button>
            </header>

            {/* ── 관제 알림 (웹 푸시) ── */}
            <div className="rounded-2xl border border-panel-border bg-background/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">📡 관제 알림</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">
                    {pushStatus === "on" &&
                      "배터리 방전 · 데이터 가득참 · 순찰 보상을 알려드려요."}
                    {pushStatus === "off" &&
                      "앱을 꺼 두어도 줍이의 위급 상황을 알려드려요."}
                    {pushStatus === "ios-needs-install" &&
                      "iOS에서는 홈 화면에 추가한 뒤 알림을 켤 수 있어요."}
                    {pushStatus === "unsupported" &&
                      "이 브라우저는 푸시 알림을 지원하지 않아요."}
                    {pushStatus === "no-sw" &&
                      "프로덕션 빌드에서 사용할 수 있어요 (npm run build && npm start)."}
                    {pushStatus === "no-key" &&
                      "서버에 VAPID 키가 아직 설정되지 않았어요."}
                    {pushStatus === "denied" &&
                      "브라우저 설정에서 이 사이트의 알림 차단을 풀어주세요."}
                    {pushStatus === "loading" && "상태 확인 중…"}
                  </p>
                </div>
                {pushStatus === "off" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={enablePush}
                    className="shrink-0 rounded-xl bg-data/90 px-3.5 py-2 text-xs font-semibold text-background transition active:scale-95 disabled:opacity-50"
                  >
                    켜기
                  </button>
                )}
                {pushStatus === "on" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={disablePush}
                    className="shrink-0 rounded-xl border border-panel-border px-3.5 py-2 text-xs font-semibold text-foreground/70 transition active:scale-95 disabled:opacity-50"
                  >
                    끄기
                  </button>
                )}
              </div>
              {pushStatus === "on" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={sendTestPush}
                  className="mt-3 w-full rounded-xl border border-panel-border bg-panel py-2.5 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
                >
                  {busy ? "발신 중…" : "🧪 테스트 전파 수신해 보기"}
                </button>
              )}
            </div>

            {/* ── 홈 화면 설치 ── */}
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-panel-border bg-background/50 p-4">
              <div>
                <p className="text-sm font-semibold">🏠 홈 화면 설치</p>
                <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">
                  {isStandalone
                    ? "지금 홈 화면 앱으로 실행 중이에요. ✓"
                    : installPrompt
                      ? "전체 화면 + 한 번의 탭으로 접속할 수 있어요."
                      : detectIos()
                        ? "Safari 공유 버튼(⬆️) → '홈 화면에 추가'를 선택하세요."
                        : "브라우저 주소창 메뉴에서 설치할 수 있어요."}
                </p>
              </div>
              {!isStandalone && installPrompt && (
                <button
                  type="button"
                  onClick={install}
                  className="shrink-0 rounded-xl bg-data/90 px-3.5 py-2 text-xs font-semibold text-background transition active:scale-95"
                >
                  설치
                </button>
              )}
            </div>

            {/* ── 시스템 정보 ── */}
            {notice && (
              <p className="mt-3 text-center text-[11px] text-foreground/70">
                {notice}
              </p>
            )}
            <p className="mt-4 text-center font-mono text-[10px] text-foreground/30">
              JOOPS 관제 콘솔 v{APP_VERSION} · 빌드 {BUILD_STAMP}
            </p>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}
