/**
 * 오프닝 컷신 에셋 경로 — 한곳에 모아 두어 교체를 쉽게.
 *
 * Lottie JSON은 지금 `scripts/gen-lottie.mjs`가 만든 플레이스홀더다.
 * 진짜 After Effects 에셋이 준비되면 public/lottie/*.json 을 덮어쓰기만 하면
 * 코드 수정 없이 반영된다 (같은 파일명 유지).
 *
 * 사운드는 아직 파일이 아니라 Web Audio 합성(components/intro/sound.ts)으로
 * 대체 중 — 실제 SFX를 넣을 때 이 경로로 로드하도록 바꾸면 된다.
 */
export const ASSET_URLS = {
  lottie: {
    scene1Earth: "/lottie/scene1_earth.json",
    scene2Console: "/lottie/scene2_console.json",
    scene3Space: "/lottie/scene3_space.json",
    joopsIdle: "/lottie/joops_idle.json",
    joopsHappy: "/lottie/joops_happy.json",
    joopsLaunch: "/lottie/joops_launch.json",
  },
  sfx: {
    // 미래 실제 SFX용 경로 (현재는 sound.ts의 합성음으로 대체)
    happy: "/sfx/happy.mp3",
    launch: "/sfx/launch.mp3",
  },
} as const;
