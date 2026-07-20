import { create } from "zustand";

/**
 * PWA 상태 스토어 — 서비스 워커 업데이트와 설치 프롬프트를 앱 전역에서 공유한다.
 *
 * 왜 스토어가 필요할까?
 * - beforeinstallprompt 이벤트는 "한 번만" 도착하는데, 그걸 쓰고 싶은 곳은
 *   여러 곳이다 (자동 넛지 배너, 설정 시트의 설치 버튼).
 * - "새 배포 대기 중" 상태도 토스트와 설정 시트가 함께 봐야 한다.
 * 이벤트를 잡는 곳(PwaProvider)과 쓰는 곳(UI들)을 분리하는 전형적인 패턴이다.
 */

/** Chromium 계열이 쏘는 설치 프롬프트 이벤트 — 표준 타입이 아직 없어 직접 선언 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** 새 배포의 서비스 워커가 설치를 마치고 대기(waiting) 중인가 */
  waitingWorker: ServiceWorker | null;
  /** Chromium이 넘겨준 설치 프롬프트 (null이면 이 브라우저에선 아직/영영 불가) */
  installPrompt: BeforeInstallPromptEvent | null;
  /** 이미 홈 화면 앱으로 실행 중인가 (standalone 모드) */
  isStandalone: boolean;

  setWaitingWorker: (worker: ServiceWorker | null) => void;
  setInstallPrompt: (event: BeforeInstallPromptEvent | null) => void;
  setIsStandalone: (value: boolean) => void;

  /** 대기 중인 새 워커를 즉시 활성화 → controllerchange → 페이지 새로고침으로 이어진다 */
  applyUpdate: () => void;
  /** 네이티브 설치 다이얼로그 띄우기 */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export const usePwaStore = create<PwaState>((set, get) => ({
  waitingWorker: null,
  installPrompt: null,
  isStandalone: false,

  setWaitingWorker: (worker) => set({ waitingWorker: worker }),
  setInstallPrompt: (event) => set({ installPrompt: event }),
  setIsStandalone: (value) => set({ isStandalone: value }),

  applyUpdate: () => {
    // 서비스 워커에게 "대기 그만하고 지금 교대해" 신호를 보낸다 (sw.js의 message 핸들러 참고)
    get().waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  },

  promptInstall: async () => {
    const prompt = get().installPrompt;
    if (!prompt) return "unavailable";
    await prompt.prompt();
    const choice = await prompt.userChoice;
    // 프롬프트는 1회용 — 쓰고 나면 비워야 한다
    set({ installPrompt: null });
    return choice.outcome;
  },
}));
