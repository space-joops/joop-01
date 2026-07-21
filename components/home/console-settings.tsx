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
import { sendPushToSelf } from "@/app/actions/push";
import { PUSH_MESSAGES, type PushMessageKey } from "@/lib/push-messages";
import { usePwaStore } from "@/stores/pwa-store";
import {
  usePetStore,
  SORTIE_BATTERY_COST,
  SORTIE_MIN_BATTERY,
} from "@/stores/pet-store";

/**
 * 관제 설정 시트 — 헤더의 ⚙️ 버튼으로 여는 하단 시트.
 *
 * 시스템 정보(버전/빌드), 관제 알림(웹 푸시), 홈 화면 설치를 담당한다.
 * 버전 표기가 여기 "정식으로" 있고, 헤더 캡션에도 아주 작게 상시 노출된다 —
 * 배포가 잘 반영됐는지는 헤더만 봐도 알 수 있게.
 */

/** 즉시 출격 줄 — 배터리·동면 조건을 보여주고, 가능할 때만 버튼을 살린다 */
function SortieLaunchRow({ onSortie }: { onSortie: () => void }) {
  const battery = usePetStore((state) => state.battery);
  const mood = usePetStore((state) => state.mood);
  const ready = mood !== "hibernate" && battery >= SORTIE_MIN_BATTERY;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-panel-border bg-background/50 p-4">
      <div>
        <p className="text-sm font-semibold">🚀 수동 출격</p>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/55">
          {mood === "hibernate"
            ? "동면 중이에요 — 먼저 쓰다듬어 깨워 주세요."
            : battery < SORTIE_MIN_BATTERY
              ? `배터리가 부족해요 (${SORTIE_MIN_BATTERY} 이상 필요). ☀️ 충전 먼저!`
              : "레이더 신호를 기다리지 않고 바로 파편 청소에 나서요."}
        </p>
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={onSortie}
        className="shrink-0 rounded-xl bg-sky-400/90 px-3.5 py-2 text-xs font-semibold text-background transition active:scale-95 disabled:opacity-40"
      >
        출격 (🔋 -{SORTIE_BATTERY_COST})
      </button>
    </div>
  );
}

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
  onSortie,
}: {
  open: boolean;
  onClose: () => void;
  /** 즉시 출격 — 홈 화면의 출격 경로(배터리 차감 포함)를 그대로 태운다 */
  onSortie: () => void;
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
      return subscription ? "on" : "off";
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
        setNotice("📡 관제 회선이 연결됐어요. 줍이의 소식을 전해 드릴게요!");
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
      await unsubscribeFromPush();
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

            {/* ── 즉시 출격 — 레이더 신호를 기다리지 않는 수동 출격 ── */}
            <SortieLaunchRow onSortie={onSortie} />

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
