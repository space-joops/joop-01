/*
 * 오프닝 컷신용 플레이스홀더 Lottie(bodymovin) 생성기.
 *
 * 진짜 After Effects 에셋이 준비되면 public/lottie/*.json 을 교체하면 된다
 * (경로는 components/intro/intro-assets.ts 의 ASSET_URLS). 그 전까지는 이
 * 스크립트가 만드는 단순 도형 애니메이션이 파이프라인을 채운다.
 *
 * 실행: node scripts/gen-lottie.mjs  (표준 파이썬… 아니 표준 Node만 필요)
 *
 * Lottie JSON은 레이어(ty:4=shape) 배열이고, 각 레이어의 ks(transform)와
 * shapes(도형)로 이뤄진다. 애니메이션 프로퍼티는 { a:1, k:[키프레임…] }.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "lottie");
mkdirSync(OUT, { recursive: true });

/* ── 헬퍼 ─────────────────────────────────────────────── */
const hex = (h) => {
  const n = h.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
    1,
  ];
};
/** 정적 프로퍼티 */
const s = (k) => ({ a: 0, k });
/** 애니메이션 프로퍼티 — kfs: [{t, v}], ease는 부드럽게 */
const anim = (kfs) => ({
  a: 1,
  k: kfs.map((kf, i) => {
    const isLast = i === kfs.length - 1;
    const base = { t: kf.t, s: Array.isArray(kf.v) ? kf.v : [kf.v] };
    if (isLast) return base;
    return {
      ...base,
      i: { x: [0.55], y: [1] },
      o: { x: [0.45], y: [0] },
    };
  }),
});

/** fill 도형 아이템 */
const fill = (h, opacity = 100) => ({ ty: "fl", c: s(hex(h)), o: s(opacity), r: 1 });
/** 타원 (지름 w,h) */
const ellipse = (w, h, cx = 0, cy = 0) => ({ ty: "el", p: s([cx, cy]), s: s([w, h]) });
/** 둥근 사각형 */
const roundRect = (w, h, r = 0, cx = 0, cy = 0) => ({
  ty: "rc",
  p: s([cx, cy]),
  s: s([w, h]),
  r: s(r),
});
/** 별/다각형 (points 각, 외/내반지름) */
const star = (points, outer, inner, cx = 0, cy = 0) => ({
  ty: "sr",
  sy: 1, // 1=star, 2=polygon
  d: 1,
  p: s([cx, cy]),
  or: s(outer),
  ir: s(inner),
  pt: s(points),
  r: s(0),
  os: s(0), // 바깥 모서리 둥글기
  is: s(0), // 안쪽 모서리 둥글기 (누락 시 lottie 파싱 실패)
});
/** group transform (기본값) — pos/scale/rot/opacity 오버라이드 가능 */
const trans = (o = {}) => ({
  ty: "tr",
  p: o.p ?? s([0, 0]),
  a: o.a ?? s([0, 0]),
  s: o.s ?? s([100, 100]),
  r: o.r ?? s(0),
  o: o.o ?? s(100),
});
/** shape group */
const group = (items, tr = trans()) => ({ ty: "gr", it: [...items, tr] });

/** 레이어 하나 (shape) */
let indCounter = 1;
const layer = (shapes, ks = {}, op = 90) => ({
  ddd: 0,
  ind: indCounter++,
  ty: 4,
  nm: `l${indCounter}`,
  sr: 1,
  ks: {
    o: ks.o ?? s(100),
    r: ks.r ?? s(0),
    p: ks.p ?? s([0, 0, 0]),
    a: ks.a ?? s([0, 0, 0]),
    s: ks.s ?? s([100, 100, 100]),
  },
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
});

const comp = (w, h, op, layers, fr = 30) => {
  indCounter = 1;
  return {
    v: "5.9.0",
    fr,
    ip: 0,
    op,
    w,
    h,
    nm: "joops",
    ddd: 0,
    assets: [],
    layers,
  };
};

const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data));
  console.log("wrote", name);
};

/* ── 팔레트 (SVG 에셋 팩과 동일 톤) ─────────────────────── */
const C = {
  earth: "#5D9DE8",
  earthDark: "#2E5AA8",
  land: "#8FE3B8",
  debris: "#8b93a7",
  body: "#FFF7EF",
  belly: "#FFE3C9",
  wing: "#8FC1EF",
  eye: "#23D9CE",
  antenna: "#FFCE59",
  outline: "#3E4A63",
  star: "#CFE0FF",
  flame: "#FFB13D",
};

/* ── 줍이 큐브 본체 (idle/happy/launch 공용) ────────────────
 * Lottie는 배열 앞쪽 아이템이 '앞면'이다 — 얼굴을 먼저, 몸통·날개를 뒤로. */
const joopsBody = () => [
  group([ellipse(13, 13, -37, -9), fill("#FFFFFF")]), // 좌 하이라이트 (맨 앞)
  group([ellipse(13, 13, 25, -9), fill("#FFFFFF")]), // 우 하이라이트
  group([ellipse(40, 44, -31, -2), fill(C.eye)]), // 좌 눈
  group([ellipse(40, 44, 31, -2), fill(C.eye)]), // 우 눈
  group([ellipse(22, 15, -60, 14), fill("#FFB1C1")]), // 좌 볼터치
  group([ellipse(22, 15, 60, 14), fill("#FFB1C1")]), // 우 볼터치
  group([roundRect(75, 42, 20), fill(C.belly)], trans({ p: s([0, 42]) })), // 배
  group([roundRect(150, 130, 34), fill(C.body)]), // 몸통
  group([roundRect(150, 130, 34), fill(C.wing)], trans({ p: s([-92, 8]), s: s([46, 32]) })), // 좌 날개 (맨 뒤)
  group([roundRect(150, 130, 34), fill(C.wing)], trans({ p: s([92, 8]), s: s([46, 32]) })),
];

/* ── 1) 지구 + 파편 링 ───────────────────────────────────── */
{
  const debris = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const R = 168;
    debris.push(
      group(
        [roundRect(16, 10, 2), fill(C.debris)],
        trans({ p: s([Math.cos(ang) * R, Math.sin(ang) * R]), r: s((i * 47) % 360) }),
      ),
    );
  }
  write(
    "scene1_earth.json",
    comp(400, 400, 150, [
      // 파편 링 — 천천히 회전 (레이어 회전)
      layer(debris, { p: s([200, 200, 0]), a: s([0, 0, 0]), r: anim([{ t: 0, v: 0 }, { t: 150, v: 360 }]) }, 150),
      // 대륙 얼룩
      layer([group([ellipse(70, 40, -40, -20), fill(C.land)]), group([ellipse(46, 28, 44, 30), fill(C.land)])], { p: s([200, 200, 0]) }, 150),
      // 지구 본체 (그림자 겹침)
      layer([group([ellipse(300, 300, 40, 40), fill(C.earthDark)]), group([ellipse(300, 300), fill(C.earth)])], { p: s([200, 200, 0]) }, 150),
    ]),
  );
}

/* ── 2) 콘솔 배경 (스캔라인 + 글로우 펄스) ──────────────── */
{
  write(
    "scene2_console.json",
    comp(400, 400, 90, [
      // 스캔라인 — 위아래로 훑는다
      layer([group([roundRect(360, 4, 2), fill("#7DF5EA")])], {
        o: s(35),
        p: anim([{ t: 0, v: [200, 40, 0] }, { t: 45, v: [200, 360, 0] }, { t: 90, v: [200, 40, 0] }]),
      }),
      // 글로우 — 은은한 명멸
      layer([group([ellipse(300, 300), fill("#6366F1")])], {
        p: s([200, 200, 0]),
        o: anim([{ t: 0, v: 12 }, { t: 45, v: 28 }, { t: 90, v: 12 }]),
      }),
    ]),
  );
}

/* ── 3) 줍이 idle (둥실 + 안테나 파닥임) ─────────────────── */
{
  write(
    "joops_idle.json",
    comp(300, 300, 90, [
      // 안테나 방울 (파닥임 = 좌우 흔들)
      layer([group([ellipse(30, 30), fill(C.antenna)])], {
        p: anim([{ t: 0, v: [150, 78, 0] }, { t: 22, v: [156, 74, 0] }, { t: 45, v: [150, 78, 0] }, { t: 68, v: [144, 74, 0] }, { t: 90, v: [150, 78, 0] }]),
      }),
      // 안테나 대
      layer([group([roundRect(6, 34, 3), fill(C.outline)])], { p: s([150, 100, 0]) }),
      // 본체 — 둥실 부유
      layer(joopsBody(), {
        p: anim([{ t: 0, v: [150, 160, 0] }, { t: 45, v: [150, 150, 0] }, { t: 90, v: [150, 160, 0] }]),
      }),
    ]),
  );
}

/* ── 4) 줍이 happy (스핀 + 반짝임) ───────────────────────── */
{
  const sparkles = [];
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    sparkles.push(
      layer([group([star(4, 16, 6, Math.cos(ang) * 110 + 150, Math.sin(ang) * 100 + 150), fill("#FFFFFF")])], {
        o: anim([{ t: 0, v: 0 }, { t: 20 + i * 3, v: 100 }, { t: 45, v: 0 }]),
        s: anim([{ t: 0, v: [40, 40, 100] }, { t: 45, v: [120, 120, 100] }]),
      }),
    );
  }
  write(
    "joops_happy.json",
    comp(300, 300, 60, [
      ...sparkles,
      // 본체 — 신나게 회전
      layer(joopsBody(), {
        p: s([150, 150, 0]),
        a: s([0, 0, 0]),
        r: anim([{ t: 0, v: 0 }, { t: 60, v: 360 }]),
      }, 60),
    ], 30),
  );
}

/* ── 5) 줍이 launch (부스터 발진, 1회) ──────────────────── */
{
  write(
    "joops_launch.json",
    comp(300, 300, 45, [
      // 화염 — 명멸
      layer([group([star(3, 40, 16), fill(C.flame)])], {
        p: anim([{ t: 0, v: [150, 210, 0] }, { t: 45, v: [150, 120, 0] }]),
        s: anim([{ t: 0, v: [100, 60, 100] }, { t: 10, v: [140, 120, 100] }, { t: 20, v: [100, 70, 100] }, { t: 45, v: [40, 40, 100] }]),
        o: anim([{ t: 0, v: 0 }, { t: 8, v: 90 }, { t: 45, v: 0 }]),
      }, 45),
      // 본체 — 위로 발진하며 작아진다
      layer(joopsBody(), {
        p: anim([{ t: 0, v: [150, 160, 0] }, { t: 12, v: [150, 175, 0] }, { t: 45, v: [150, -140, 0] }]),
        a: s([0, 0, 0]),
        s: anim([{ t: 0, v: [100, 100, 100] }, { t: 45, v: [34, 34, 100] }]),
        r: anim([{ t: 0, v: 0 }, { t: 45, v: -8 }]),
      }, 45),
    ]),
  );
}

/* ── 6) 우주 배경 (별 트윙클 + 행성 커브) ───────────────── */
{
  const stars = [];
  for (let i = 0; i < 22; i++) {
    const x = (i * 53 + 20) % 400;
    const y = (i * 71 + 15) % 320;
    const sz = 3 + ((i * 7) % 4);
    stars.push(
      layer([group([ellipse(sz, sz, x, y), fill(C.star)])], {
        o: anim([{ t: 0, v: 20 }, { t: 20 + (i % 10) * 3, v: 90 }, { t: 60, v: 20 }]),
      }, 90),
    );
  }
  write(
    "scene3_space.json",
    comp(400, 400, 90, [
      ...stars,
      // 행성 커브 (하단)
      layer([group([ellipse(560, 560), fill(C.earthDark)]), group([ellipse(520, 520), fill(C.earth)])], { p: s([200, 620, 0]) }, 90),
    ]),
  );
}

console.log("done — 6 lottie files in public/lottie/");
