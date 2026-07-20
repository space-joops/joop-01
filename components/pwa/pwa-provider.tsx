"use client";

import { useEffect } from "react";
import { SW_URL, detectStandalone } from "@/lib/pwa";
import { usePwaStore, type BeforeInstallPromptEvent } from "@/stores/pwa-store";
import UpdateToast from "@/components/pwa/update-toast";
import InstallNudge from "@/components/pwa/install-nudge";
import DynamicFavicon from "@/components/pwa/dynamic-favicon";

/**
 * PWA 배선반 — 앱에 딱 하나 마운트되어 다음을 담당한다:
 * 1. 서비스 워커 등록 + 새 배포 감지 (주기 점검 & 탭 복귀 시 점검)
 * 2. beforeinstallprompt 이벤트 포획 → 스토어에 보관
 * 3. 업데이트 토스트 · 설치 넛지 · 동적 파비콘 렌더링
 */

/** 새 배포 확인 주기 — 너무 잦으면 낭비, 너무 드물면 반영이 늦는다 */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export default function PwaProvider() {
  /* ── 설치 프롬프트 포획 ───────────────────── */
  useEffect(() => {
    const store = usePwaStore.getState();
    store.setIsStandalone(detectStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      // 크롬의 기본 미니 배너를 막고, 우리가 원하는 타이밍에 띄우기 위해 보관
      event.preventDefault();
      usePwaStore.getState().setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      usePwaStore.getState().setInstallPrompt(null);
      // 설치 완료 기록 — 넛지가 다시는 나타나지 않게
      window.localStorage.setItem("joops.pwa-installed.v1", "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  /* ── 서비스 워커 등록 + 업데이트 감지 ───────── */
  useEffect(() => {
    // 개발 서버(HMR)와 서비스 워커 캐시는 상극이라 프로덕션에서만 켠다.
    // 로컬에서 PWA를 확인하려면: npm run build && npm start
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // 첫 방문(controller 없음)에는 새로고침하지 않기 위한 기준점
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      // 새 워커로 교대 완료 → 새 배포의 파일들로 다시 그리기 위해 1회 새로고침
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    let interval: ReturnType<typeof setInterval> | undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
    };

    navigator.serviceWorker
      .register(SW_URL)
      .then((registration) => {
        const store = usePwaStore.getState();

        // 지난 세션에 배포가 있었다면 이미 대기 중인 워커가 있을 수 있다
        if (registration.waiting && navigator.serviceWorker.controller) {
          store.setWaitingWorker(registration.waiting);
        }

        // 새 워커 설치가 시작되면 → 설치 완료(installed) 시점에 토스트를 띄운다
        registration.addEventListener("updatefound", () => {
          const fresh = registration.installing;
          if (!fresh) return;
          fresh.addEventListener("statechange", () => {
            if (
              fresh.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              usePwaStore.getState().setWaitingWorker(fresh);
            }
          });
        });

        // 오래 켜 둔 탭도 배포를 놓치지 않도록: 주기 점검 + 탭으로 돌아올 때 점검
        interval = setInterval(
          () => registration.update().catch(() => undefined),
          UPDATE_CHECK_INTERVAL_MS,
        );
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch((error) => {
        console.error("[pwa] 서비스 워커 등록 실패:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", onVisible);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <>
      <DynamicFavicon />
      <UpdateToast />
      <InstallNudge />
    </>
  );
}
