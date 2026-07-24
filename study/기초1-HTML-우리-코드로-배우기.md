# 기초 1 — HTML: 우리 코드로 배우기 🏗️

> 5일 플랜의 준비 운동 1/3. JSX를 쓰더라도 그 밑은 전부 HTML입니다.
> "무슨 태그가 있나"가 아니라 **"왜 이 태그를 골랐나"**를 우리 코드로 배웁니다.

## 1. HTML은 문서가 아니라 "트리"다

브라우저는 HTML 텍스트를 **DOM 트리**로 바꿉니다. 파이썬으로 치면
`xml.etree`가 XML을 노드 트리로 파싱하는 것과 같고, 이후의 모든 것(CSS
매칭, JS 조작, React 재조정)은 이 트리 위에서 일어납니다.

```html
<body>
 └─ <main>                ← 트리의 가지
     ├─ <header>…</header>
     ├─ <section>…</section>
     └─ <footer>…</footer>
```

우리 홈 화면(`components/home/home-screen.tsx`)의 JSX가 정확히 이 구조입니다.
JSX는 "JS 안에서 쓰는 HTML"일 뿐 — 태그 선택의 고민은 동일합니다.

## 2. 시맨틱 태그 — div로 다 되는데 왜?

전부 `<div>`로 만들어도 화면은 같습니다. 그런데 우리 코드는 태그를 가려
씁니다:

| 우리 코드의 실제 사용 | 태그 | 왜 |
| --- | --- | --- |
| 홈 전체 래퍼 (`home-screen.tsx`) | `<main>` | "이 페이지의 본문"을 기계(스크린 리더·검색엔진)에게 선언 |
| 상단 타이틀·자원 표시 | `<header>` | 머리말 영역 |
| 펫 영역, 관제 패널들 (`ground-track-map.tsx`) | `<section>` | 의미 있는 구역 단위 |
| 하단 4버튼 | `<footer>` | 꼬리말/행동 영역 |
| 제목 | `<h1>`, `<h2>` | 문서의 개요(outline). h1은 페이지에 하나 |
| 패스 목록 (`pass-predict.tsx`) | `<ul>`/`<li>` | "목록"이라는 의미 |

**이유는 접근성과 협업**: 스크린 리더는 `<main>`으로 바로 점프할 수 있고,
동료는 태그만 봐도 구조를 읽습니다. 시맨틱은 공짜 문서화입니다.

## 3. `<button>` — 이 프로젝트에서 가장 중요한 태그

우리 코드에 `<button>`이 수십 개인데, `<div onClick>`은 **하나도 없습니다**.
1티어의 고집이 여기 있습니다:

```tsx
// console-settings.tsx — 실제 패턴
<button
  type="button"          // ① 폼 안에서 submit으로 오작동 방지 (기본값이 submit!)
  disabled={!ready}      // ② 비활성 상태를 브라우저가 처리 (클릭 차단 + 스타일 훅)
  aria-label="관제 설정 열기"  // ③ ⚙️ 같은 이모지 버튼에 "읽을 말" 제공
  onClick={...}
>
```

`<button>`이 공짜로 주는 것: 키보드 포커스/Enter·Space 동작, 스크린 리더
"버튼" 안내, `disabled` 처리. `<div>`로 흉내 내려면 tabindex·role·키 핸들러
전부 수동 — 그래서 안 합니다. **예외**: 플라이바이 위성처럼 상호작용이
없는 순수 장식엔 `aria-hidden`을 붙여 기계가 무시하게 합니다
(`ambient-orbit.tsx`).

## 4. 속성(attribute)의 문법과 우리 코드의 어휘

`<태그 이름="값">` — 파이썬 함수의 키워드 인자 같은 것. 자주 쓰는 것들:

- `class`(JSX에선 `className`) — CSS의 갈고리. 기초 2에서 집중.
- `src`, `alt` — `<img>`의 짝. **alt는 의무**: 의미 있는 이미지엔 설명
  (`alt="비행 중인 줍이"`), 장식이면 빈 값 `alt=""`(스크린 리더가 건너뜀).
  우리 파편·이펙트 이미지가 전부 `alt=""`인 이유입니다.
- `aria-*` — 접근성 보강. `aria-label`(읽을 말), `aria-hidden`(무시해라).
- `draggable={false}` — 게임 이미지가 드래그로 유령처럼 끌려나오는 것 방지.
- `style` — 인라인 스타일. JSX에선 객체: `style={{ width: 96 }}`.
  rAF 루프가 매 프레임 만지는 값(transform)은 클래스가 아니라 이걸 씁니다.

## 5. `<head>` — 눈에 안 보이는 절반

브라우저 탭·공유 카드·설치 배너는 전부 `<head>`에서 나옵니다. 우리는
Next.js가 대신 써 주지만, 결과물은 순수 HTML입니다:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, ...">
<!-- ↑ 이게 없으면 모바일이 데스크톱 폭으로 렌더해서 깨알 글씨가 됩니다 -->
<meta property="og:image" content="https://…/og.png">
<!-- ↑ 카톡 미리보기 카드 (app/layout.tsx의 metadata가 생성) -->
<link rel="manifest" href="/manifest.webmanifest">
<!-- ↑ PWA 신분증 (app/manifest.ts가 생성) -->
```

`npm run dev` 켜고 페이지 소스 보기(Ctrl+U)로 **실제 생성된 head를 꼭
읽어보세요.** JSX가 결국 무엇이 되는지 눈으로 확인하는 순간입니다.

## 6. SVG — HTML 속의 벡터 그림

이 게임의 그래픽 전부가 SVG입니다. SVG도 XML이라 HTML처럼 태그로 읽힙니다:

```xml
<!-- public/game/debris/bolt.svg 요약 -->
<svg viewBox="0 0 96 96">          <!-- 논리 좌표계 96×96 — 몇 px로 띄우든 이 좌표로 그림 -->
  <g transform="translate(48 50)"> <!-- 그룹 + 좌표 이동 -->
    <circle cx="0" cy="-14" r="17" fill="#C7CEDB" stroke="#3E4A63" stroke-width="3.5"/>
    <rect x="-7" y="0" width="14" height="34" rx="6"/>  <!-- rx = 둥근 모서리 -->
    <path d="M 26 -33 L 28 -28 …Z"/>  <!-- d = 펜 움직임 명령(M 이동, L 선, Z 닫기) -->
  </g>
</svg>
```

`viewBox` 덕분에 무손실 확대 — 플라이바이 위성이 2.7배로 커져도 선명한
이유. 관제 화면(`ground-track-map.tsx`)에선 SVG를 JSX 안에 **인라인**으로
써서 `viewBox="0 0 360 180"`을 "경도×위도 좌표계"로 삼습니다 — SVG가
데이터 시각화 도구가 되는 순간.

## 7. 연습

1. **[소스 읽기]** `npm run dev` → 페이지 소스 보기 → `<head>`의 메타 태그
   10개에 각각 "누가 생성했고 무슨 역할인지" 주석을 달아보세요(메모장에).
2. **[시맨틱 감사]** `inventory-sheet.tsx`를 열고: 도감 그리드의 각 칸이
   `<div>`인데, 만약 "칸을 탭하면 상세 설명" 기능이 생긴다면 무엇으로
   바꿔야 할까? (답: button — 이유 3가지를 말할 수 있어야 함)
3. **[SVG 손그림]** `scripts/` 옆에 `my-badge.svg`를 만들어 `circle` +
   `path`로 간단한 배지를 그리고 브라우저로 열어보기. `viewBox`를 절반으로
   줄이면 무슨 일이 나는지 관찰.
4. **[접근성 체험]** 크롬 DevTools → 요소 선택 → Accessibility 탭에서
   ⚙️ 버튼이 어떻게 읽히는지 확인. `aria-label`을 지우면?

## 셀프 체크

- `<button type="button">`에서 `type`을 빼면 생길 수 있는 사고는?
- 장식 이미지의 alt는 왜 "빈 문자열"이어야 하나(alt 자체를 빼면 안 되나)?
- `viewBox`와 실제 표시 크기(width)의 관계를 설명할 수 있는가?
- 시맨틱 태그가 "기계"에게 주는 이득 두 가지는?
