# 기초 2 — CSS: 우리 코드로 배우기 🎨

> 준비 운동 2/3. Tailwind 클래스는 결국 CSS 한 줄의 별명입니다. 별명 뒤의
> **원문**을 읽을 수 있어야 1티어입니다. 모든 예제는 우리 화면에 실재합니다.

## 1. 선택자와 캐스케이드 — "누가 이기는가"

```css
/* app/globals.css 실제 코드 */
.touch-game {              /* 클래스 선택자 */
  user-select: none;
  touch-action: none;
}
:root {                    /* 문서 루트 — 전역 변수 선언처 */
  --background: #060714;
}
```

같은 속성을 여럿이 선언하면 **구체성(specificity) → 나중 선언** 순으로
이깁니다. Tailwind는 이 전쟁을 "유틸리티 클래스는 전부 같은 구체성"으로
평정한 것 — 캐스케이드 디버깅 시간이 사라진 게 유행의 진짜 이유입니다.
인라인 `style=`은 클래스보다 항상 우선 — rAF가 만지는 transform이
클래스와 충돌하지 않는 이유이기도 합니다.

## 2. 박스 모델과 단위 — 크기의 문법

모든 요소는 `content + padding + border + margin`의 상자입니다.

| 우리 코드 | CSS 원문 | 뜻 |
| --- | --- | --- |
| `p-4` | `padding: 1rem` | 안쪽 여백 16px (1rem = 16px 기준) |
| `px-3.5 py-2` | `padding: 0.5rem 0.875rem` | 가로/세로 따로 |
| `-ml-8 -mt-8` | `margin-left: -2rem; …` | **음수 마진** — 부유 파편을 좌표 중심에 정렬하는 트릭 (`floating-debris.tsx`) |
| `rounded-2xl` | `border-radius: 1rem` | 둥근 모서리 |
| `border border-panel-border` | `border: 1px solid var(--panel-border)` | 테두리 + 변수 색 |

단위 고르기: 텍스트·여백은 `rem`(사용자 글꼴 설정 존중), 게임 좌표는
`px`(물리 계산), 레이아웃 비율은 `%`, 화면 높이는 `dvh`(Day 2에서 배운
모바일 주소창 문제).

## 3. Flexbox — 이 프로젝트 레이아웃의 90%

한 방향(행/열)으로 요소를 배치하고 남는 공간을 분배하는 도구.

```tsx
// home-screen.tsx 푸터 — 4버튼 동일 폭의 전부
<footer className="flex gap-2">        {/* display:flex; gap:0.5rem */}
  <button className="flex-1">☀️ 충전</button>   {/* flex:1 — 남는 공간 1지분 */}
  <button className="flex-1">📡 전송</button>   {/* 넷 다 1지분 → 자동 균등 */}
  ...
```

핵심 어휘: `flex`(켜기) · `flex-col`(세로 방향) · `items-center`(교차축
정렬) · `justify-between`(주축 양끝 분배 — 텔레메트리 타일 내부) ·
`flex-1`(공간 지분) · `gap-2`(사이 간격) · `shrink-0`(줄어들지 마 —
설정 시트의 버튼들).

**scene 2 채팅**(`scene-mobile-onboard.tsx` 시절 → 현재 `pass-predict.tsx`
목록도 동일)의 `flex-col justify-end`는 "새 항목이 아래에 붙는 메신저
스크롤"을 CSS 한 줄로 만든 사례입니다.

## 4. Grid — 2차원이 필요할 때만

```tsx
// telemetry-panel.tsx — 3×3 계기판
<div className="grid grid-cols-3 gap-2">
// inventory-sheet.tsx — 4열 도감
<div className="grid grid-cols-4 gap-2">
```

`grid-template-columns: repeat(3, 1fr)` — 행과 열이 **동시에** 필요하면
Grid, 한 줄이면 Flex. 우리 코드의 분업이 정확히 그 기준입니다.

## 5. position — 게임 화면은 층 쌓기다

```
relative  ← 기준점 선언 (내 안의 absolute들의 원점)
absolute  ← 기준점으로부터 좌표 배치 (문서 흐름에서 이탈)
fixed     ← 뷰포트 기준 고정 (설정 시트, 딤 배경)
```

미니게임(`action-mode.tsx` → `sortie-field.tsx`)의 층 구조가 교과서:

```tsx
<div className="absolute inset-0">          {/* inset-0 = top/right/bottom/left:0 — 꽉 채움 */}
  <img className="absolute inset-0 …" />    {/* 배경 */}
  <AmbientOrbit />                          {/* 원경 위성 층 */}
  <SortieField />                           {/* 게임 층 */}
  {/* 브리핑/결과 = absolute inset-0 z-30 */}
</div>
```

`z-index`(우리 어휘: `z-10` HUD, `z-30` 모달, `z-40` 딤, `z-50` 시트)로
층 순서를 명시. **함정**: z-index는 같은 쌓임 맥락(stacking context)
안에서만 싸웁니다 — transform·opacity가 새 맥락을 만들어 "z-9999인데 왜
밑에 깔리지?"의 범인이 되곤 합니다.

## 6. 변수·그라디언트·필터 — 분위기의 기술

```css
/* globals.css — 팀의 색은 변수로 한 곳에 */
:root { --accent-battery: #fbbf24; }
@theme inline { --color-battery: var(--accent-battery); }  /* → bg-battery 유틸리티 생성 */
```

- **그라디언트**: `bg-[radial-gradient(ellipse_at_center,#141737_0%,#060714_75%)]`
  — 홈 펫 영역의 "우주 느낌"이 배경 이미지가 아니라 CSS 수식입니다.
- **필터**: `drop-shadow`(발광 — 부유 파편), `blur-3xl`(콘솔 백라이트 글로우),
  `brightness/saturate`(동면 펫을 어둡게 — `pet-sticker.tsx`).
  주의: 필터를 **매 프레임 바꾸면** 리페인트 폭탄 — 우리는 상수로만
  (`ambient-orbit.tsx` 주석 참조).
- **임의 값 문법** `[...]`: 스케일 밖 값의 탈출구.
  `[filter:brightness(1.2)_drop-shadow(0_0_14px_…)]` — 공백은 `_`로.

## 7. 애니메이션 — transition vs @keyframes

**transition**: "값이 바뀌면 부드럽게" (2점 사이 보간):
```css
transition: opacity 0.5s;   /* 우리 코드: transition-opacity duration-500 —
                               3D→2D 크로스페이드(과거 satellite-3d)의 원리 */
```

**@keyframes**: 다단계 안무의 정의 (`globals.css` 실제 코드):
```css
@keyframes particle-rise {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
  100% { opacity: 0; transform: translate(-50%, calc(-50% - 72px)) scale(1.35); }
}
.animate-particle-rise { animation: particle-rise 0.9s ease-out forwards; }
```

터치 파티클(✨💥)이 떠오르며 사라지는 그 연출입니다. `forwards`는 "끝
프레임에서 멈춰"(안 쓰면 원위치로 튕김), `infinite`는 루프(별 반짝임
`star-twinkle`). CSS 애니메이션은 컴포지터가 처리해서 JS가 바빠도 안
끊깁니다 — 가벼운 반복 연출은 CSS, 상태 의존 연출은 Framer, 물리는 rAF.
**3단 분업**이 이 프로젝트의 애니메이션 철학입니다.

## 8. 연습

1. **[번역 훈련]** `inventory-sheet.tsx`의 클래스 문자열 하나를 골라
   전부 CSS 원문으로 손번역해 보세요 (DevTools에서 답 맞추기 가능).
2. **[레이아웃 실험]** 푸터의 `flex-1`을 하나만 `flex-2`(임의값
   `flex-[2]`)로 바꿔 지분 분배를 관찰. 복원.
3. **[층 실험]** 미니게임 브리핑의 `z-30`을 `z-0`으로 바꾸면 무슨 일이?
   예측 → 실행 → 복원.
4. **[키프레임 창작]** `globals.css`에 `@keyframes wobble`(좌우 3° 기울기
   반복)을 만들고 부유 파편에 붙여보기. 완성되면 되돌리거나 PR 연습으로.
5. **[번역표 완성]** 아래 표의 빈칸을 채우기:

| Tailwind | CSS 원문 |
| --- | --- |
| `absolute inset-0` | ? |
| `flex-col items-center gap-3` | ? |
| `text-sm font-bold tracking-wide` | ? |
| `disabled:opacity-40` | ? |

## 셀프 체크

- 인라인 style이 클래스를 이기는 성질을 우리 게임이 어떻게 활용하는가?
- Flex와 Grid의 선택 기준 한 문장은?
- transform이 만든 stacking context가 z-index에 끼치는 영향은?
- CSS 애니메이션 / Framer / rAF — 각각 언제 쓰는가(3단 분업)?
