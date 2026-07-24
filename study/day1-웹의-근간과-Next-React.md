# Day 1 — 웹의 근간, React, Next.js 🧱

> 오늘의 목표: 브라우저가 화면을 그리는 원리를 이해하고, React의 "상태 →
> UI" 사고방식과 Next.js의 서버/클라이언트 경계를 몸에 새긴다.

## 1. 브라우저는 어떻게 그리는가 — 렌더링 파이프라인

백엔드 엔지니어에게 브라우저는 "HTML을 받는 곳"이지만, 프론트엔드에게는
**초당 60번 도는 렌더링 엔진**입니다. 파이프라인:

```
HTML → DOM 트리 ─┐
CSS → CSSOM ─────┴→ 렌더 트리 → Layout(위치·크기 계산) → Paint(픽셀 칠하기) → Composite(층 합성)
```

핵심 성능 법칙 — **어느 단계를 건드리느냐가 비용을 정한다**:

- `width`, `top` 변경 → Layout부터 다시 (비쌈)
- `background` 변경 → Paint부터 (중간)
- `transform`, `opacity` 변경 → **Composite만** (거의 공짜, GPU가 처리)

이 법칙이 우리 게임의 심장입니다. 미니게임의 파편이 전부
`transform: translate3d(...)`로 움직이는 이유(`components/action/sortie-field.tsx`의
sync 함수), 플라이바이 위성이 opacity/transform만 만지는 이유
(`components/action/ambient-orbit.tsx`)가 이것. **"레이아웃을 건드리지 않고
합성만 움직인다"** — 오늘 하나만 기억한다면 이것.

## 2. React — "상태가 바뀌면 UI는 따라온다"

파이썬으로 UI를 짠다면 이렇게 쓸 겁니다: `if battery < 15: label.set_text("경고")`.
명령형이죠. React는 반대로 **선언형**입니다:

```tsx
// components/home/home-screen.tsx 의 실제 패턴
const battery = usePetStore((s) => s.battery);
return <p>{battery <= 15 ? "배터리가 얼마 남지 않았어요…" : "순항 중 ✨"}</p>;
```

"battery가 이 값일 때 화면은 이렇다"라는 **함수**를 쓰면, 값이 바뀔 때
React가 알아서 다시 그립니다. `UI = f(state)` — 데이터 엔지니어에게
익숙한 표현으로는 "머티리얼라이즈드 뷰"에 가깝습니다. 원본(상태)이 바뀌면
뷰(화면)가 재계산되는.

### 렌더 사이클의 실제

1. 상태 변경(`setState`/스토어 갱신) → 2. 컴포넌트 함수 **재실행** →
3. 이전 JSX와 새 JSX를 비교(재조정, reconciliation) → 4. 달라진 DOM만 패치.

여기서 두 가지 함정과 우리의 실제 해법:

- **함수는 통째로 다시 실행된다** → 매 렌더마다 다시 만들면 안 되는 것
  (타이머, 구독)은 `useEffect`(마운트/의존성 변경 시에만 실행)와
  `useRef`(렌더와 무관한 보관함)에. 실례: `components/home/pet-satellite.tsx`의
  `trackRef`(포인터 추적값은 렌더와 무관 → ref).
- **초당 60번 setState는 재앙** → 게임 상태는 React 밖(클로저 변수)에 두고
  DOM을 직접 만진다. Day 3의 주제. 실례: `sortie-field.tsx` 전체.

### 훅 3형제 요약 (이 프로젝트 사용 빈도순)

| 훅 | 한 줄 정의 | 파이썬 비유 | 대표 사용처 |
| --- | --- | --- | --- |
| `useState` | 바뀌면 다시 그리는 값 | 옵저버 패턴 붙은 속성 | 모든 화면 |
| `useEffect` | 렌더 밖 세계와의 접점(타이머·구독·fetch) + 정리(cleanup) | context manager (`__enter__/__exit__`) | `home-screen.tsx:86` 배너 타이머 |
| `useRef` | 렌더를 유발하지 않는 보관함 / DOM 손잡이 | 그냥 인스턴스 속성 | `sortie-field.tsx` 전부 |

`useEffect`의 **cleanup 반환 함수**는 `__exit__`입니다. 타이머를 걸었으면
반드시 해제 — 안 하면 컴포넌트가 죽어도 타이머가 유령처럼 돕니다.
(`clearInterval` 패턴이 이 저장소에 10곳 넘게 있습니다. 하나 찾아보세요.)

## 3. Next.js App Router — 서버와 클라이언트의 경계선

Next.js의 대발명은 **컴포넌트를 서버에서 실행할지 브라우저에서 실행할지
파일 단위로 정하는 것**입니다.

- **Server Component(기본값)**: 서버에서 실행되고 HTML만 내려온다.
  브라우저 JS 번들에 **포함되지 않는다**. DB 접근·비밀키 사용 가능.
- **Client Component(`"use client"`)**: 브라우저에서 실행. 상태·이벤트·
  브라우저 API를 쓸 수 있다. 우리 게임 컴포넌트는 전부 이쪽.

이 프로젝트의 경계 실례:

```
app/layout.tsx        ← Server. 메타데이터(OG 태그)가 여기 있는 이유:
                         크롤러는 JS를 안 돌리므로 서버가 HTML에 박아줘야 함
app/page.tsx          ← Server → components/game-root.tsx("use client")로 진입
app/actions/pet.ts    ← "use server" — Server Action (Day 4)
components/**         ← 거의 전부 "use client" (게임은 상호작용 덩어리)
```

### Hydration — SSR의 함정 하나는 꼭 알아야 한다

서버가 먼저 HTML을 그려 보내고(빠른 첫 화면), 브라우저가 JS를 받아
그 HTML에 이벤트를 "물"처럼 입힙니다(hydration). 함정: **서버가 그린 것과
클라이언트 첫 렌더가 다르면 에러**. 그래서 —

- `Math.random()`을 렌더 중에 쓰면 안 됨 → 홈 별 배치가 인덱스 기반
  의사난수인 이유 (`home-screen.tsx:34`의 `STARS` 주석을 읽어보세요)
- `localStorage`는 서버에 없음 → `game-root.tsx`가 첫 렌더를 "boot"(빈
  화면)로 두고 `useEffect`에서 분기하는 이유 (`game-root.tsx:23` 주석)
- `lottie-web`은 `document`를 만짐 → `next/dynamic(ssr:false)`로 클라이언트
  전용 로드 (`components/intro/lottie-stage.tsx`)

## 4. 오늘의 코드 리딩 (순서대로)

1. `app/layout.tsx` — 서버 컴포넌트, 메타데이터, 폰트, 셸(h-dvh)
2. `components/game-root.tsx` — hydration 안전 분기, 스테이지 전환
3. `components/home/home-screen.tsx` — 훅 3형제 총출동, 컴포넌트 조립
4. `components/home/pet-satellite.tsx` — ref로 포인터 추적, 제스처 판별

## 5. 손 실습

1. **[관찰]** `npm run dev` → 홈에서 우클릭·검사 → Elements에서 게이지
   `<div>`의 width가 바뀌는 순간을 관찰. Rendering 탭 → Paint flashing을
   켜고 펫을 탭해 어디가 다시 칠해지는지 보기.
2. **[수정]** `home-screen.tsx`의 상태 메시지에 새 조건 하나 추가
   (예: `debris >= 100`이면 "부자가 됐어요 🤑"). 우선순위 체인의 어디에
   넣어야 자연스러운지 고민할 것.
3. **[파괴 실험]** `game-root.tsx`의 `useEffect` 분기를 지우고 렌더 중에
   `localStorage`를 직접 읽어 보세요. hydration 에러를 **직접 목격**하는
   것이 백 마디 설명보다 낫습니다. (본 뒤 되돌리기)

## 6. 셀프 체크

- transform/opacity가 "싼" 이유를 파이프라인 단계로 설명할 수 있는가?
- `useEffect`의 cleanup이 언제 실행되는지 두 경우를 말할 수 있는가?
- Server Component에 `onClick`을 못 쓰는 이유는?
- 홈 별 배치에 `Math.random()`을 쓰면 무슨 일이 나는가?

## 심화

- devlog: `01-홈-화면과-3대-지표.md`, `04-Supabase와-방치형-루프.md`(앞부분)
- 공식 문서: react.dev "Thinking in React", nextjs.org "Server and Client Components"
