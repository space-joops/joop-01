/*
 * PWA 아이콘 생성 스크립트.
 *
 * 홈 화면의 위성 펫(SatelliteSvg)과 같은 도면으로 SVG를 조립한 뒤
 * sharp(Next.js가 이미지 최적화용으로 함께 설치하는 라이브러리)로 PNG를 굽는다.
 *
 * 실행: node scripts/generate-icons.mjs
 * 결과물(public/icons/*.png)은 저장소에 커밋한다 — 빌드 때마다 새로 만들 필요가 없고,
 * 위성 디자인이 바뀔 때만 다시 실행하면 된다.
 *
 * 아이콘 종류가 여러 개인 이유:
 * - icon-192/512: 일반 아이콘. 안드로이드 설치 배너, 스플래시 화면 등에 쓰인다.
 * - icon-maskable-*: 안드로이드가 기기별 모양(원형/스쿼클)으로 "잘라 쓰는" 아이콘.
 *   가장자리가 잘려나가도 안전하도록 위성을 중앙 80% 안에 작게 배치한다.
 * - apple-touch-icon: iOS 홈 화면용. iOS가 모서리를 알아서 둥글리므로 꽉 찬 정사각형.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
);

/** 위성 펫 도면 — components/home/pet-satellite.tsx 의 SatelliteSvg와 동일한 좌표계(220×170) */
const SATELLITE = `
  <line x1="110" y1="30" x2="110" y2="56" stroke="#8b93bd" stroke-width="4" />
  <circle cx="110" cy="24" r="7" fill="#34d399" />

  <rect x="58" y="86" width="14" height="10" fill="#8b93bd" />
  <rect x="8" y="70" width="52" height="42" rx="5" fill="#3b4aa0" stroke="#5c6fd6" stroke-width="2" />
  <line x1="25" y1="72" x2="25" y2="110" stroke="#5c6fd6" stroke-width="1.5" />
  <line x1="42" y1="72" x2="42" y2="110" stroke="#5c6fd6" stroke-width="1.5" />
  <line x1="10" y1="91" x2="58" y2="91" stroke="#5c6fd6" stroke-width="1.5" />

  <rect x="148" y="86" width="14" height="10" fill="#8b93bd" />
  <rect x="160" y="70" width="52" height="42" rx="5" fill="#3b4aa0" stroke="#5c6fd6" stroke-width="2" />
  <line x1="177" y1="72" x2="177" y2="110" stroke="#5c6fd6" stroke-width="1.5" />
  <line x1="194" y1="72" x2="194" y2="110" stroke="#5c6fd6" stroke-width="1.5" />
  <line x1="162" y1="91" x2="210" y2="91" stroke="#5c6fd6" stroke-width="1.5" />

  <rect x="72" y="56" width="76" height="70" rx="16" fill="#e8eaf6" stroke="#b9c0e4" stroke-width="2" />
  <path d="M72 100 L148 88 L148 110 A16 16 0 0 1 132 126 L88 126 A16 16 0 0 1 72 110 Z" fill="#c9d0ef" />

  <g fill="#1f2547">
    <circle cx="94" cy="84" r="5.5" />
    <circle cx="126" cy="84" r="5.5" />
  </g>
  <circle cx="85" cy="97" r="5" fill="#f9a8d4" opacity="0.6" />
  <circle cx="135" cy="97" r="5" fill="#f9a8d4" opacity="0.6" />
  <path d="M106 101 q4 4 8 0" stroke="#1f2547" stroke-width="3" stroke-linecap="round" fill="none" />
`;

/** 배경 별 — 홈 화면처럼 인덱스 기반 고정 랜덤 */
const stars = Array.from({ length: 18 }, (_, i) => {
  const x = ((i * 137 + 43) % 480) + 16;
  const y = ((i * 211 + 87) % 480) + 16;
  const r = 2 + ((i * 7) % 3);
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="${0.35 + ((i * 13) % 5) / 10}" />`;
}).join("\n  ");

/**
 * 512×512 아이콘 SVG를 만든다.
 * @param {number} widthRatio 위성이 캔버스 폭에서 차지하는 비율 (maskable은 안전 영역 때문에 작게)
 */
function iconSvg(widthRatio) {
  const scale = (512 * widthRatio) / 220;
  const tx = (512 - 220 * scale) / 2;
  const ty = (512 - 170 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="space" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#1a1e45" />
      <stop offset="60%" stop-color="#0d0f26" />
      <stop offset="100%" stop-color="#060714" />
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#space)" />
  ${stars}
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale.toFixed(3)})">${SATELLITE}</g>
</svg>`;
}

const normalSvg = Buffer.from(iconSvg(0.92));
const maskableSvg = Buffer.from(iconSvg(0.66));

await mkdir(outDir, { recursive: true });

const jobs = [
  ["icon-192.png", normalSvg, 192],
  ["icon-512.png", normalSvg, 512],
  ["icon-maskable-192.png", maskableSvg, 192],
  ["icon-maskable-512.png", maskableSvg, 512],
  ["apple-touch-icon.png", normalSvg, 180],
];

for (const [file, svg, size] of jobs) {
  await sharp(svg).resize(size, size).png().toFile(path.join(outDir, file));
  console.log(`✓ ${file} (${size}×${size})`);
}

// 참고용으로 SVG 원본도 남겨둔다 (디자인 수정 시 미리보기 편의)
await writeFile(path.join(outDir, "icon-source.svg"), normalSvg);
console.log("✓ icon-source.svg");
