# 기초 3 — JavaScript: 우리 코드로 배우기 ⚡

> 준비 운동 3/3. 파이썬 사용자가 JS를 배울 때 필요한 건 문법 나열이 아니라
> **"파이썬의 이것 = JS의 저것" 변환기**와, 파이썬에 없는 개념 3개(클로저
> 활용, 이벤트 루프, 프로토타입 대신 함수)입니다. 예제는 전부 우리 코드.

## 1. 변수와 기본 문법 — 30초 요약

```js
const TUNE = { joyMax: 56 };   // 재할당 불가 (기본값 — 우리 코드의 95%)
let energy = 100;              // 재할당 필요할 때만 (게임 루프 지역변수들)
// var는 쓰지 않는다 (함수 스코프 유령 — 역사적 유물)
```

`const`는 파이썬에 없는 축복입니다. **"이 이름은 다시 안 묶인다"**를
컴파일러가 보증 — 객체 내용 변경은 가능(`const arr; arr.push(x)` OK)이라
파이썬 튜플과는 다릅니다.

## 2. 파이썬 ↔ JS 변환기 (핵심 문법)

| 파이썬 | JS | 우리 코드 실례 |
| --- | --- | --- |
| `def f(x): return x*2` | `const f = (x) => x * 2` | `const rand = (min, max) => min + Math.random() * (max - min)` (`ambient-orbit.tsx`) |
| `[x*2 for x in xs]` | `xs.map((x) => x * 2)` | `RISK_ZONES.map((z) => <button…>)` (`action-mode.tsx`) |
| `[x for x in xs if p(x)]` | `xs.filter(p)` | `prev.filter((p) => p.id !== id)` (파티클 제거) |
| `sum(xs)` | `xs.reduce((a, b) => a + b, 0)` | `Object.values(collection).reduce((a,b)=>a+b,0)` (`inventory-sheet.tsx`) |
| `f"{name}님"` | `` `${name}님` `` | `` `translate3d(${x}px, ${y}px, 0)` `` (게임 루프 전체) |
| `d.get("k", 0)` | `d.k ?? 0` | `(state.collection[kind] ?? 0) + count` (`pet-store.ts`) |
| `obj.attr if obj else None` | `obj?.attr` | `containerRef.current?.getBoundingClientRect()` |
| `dict(**a, **b)` | `{ ...a, ...b }` | `{ ...state.collection, [kind]: n }` — **불변 갱신**의 핵심 |
| `a, b = t` | `const [a, b] = t` / `const { x } = obj` | `const { elev } = stationViewAt(t)` (`orbit-math.ts`) |
| `import x from m` | `import { x } from "m"` | 모든 파일 첫 줄 |
| `math.hypot(a,b)` | `Math.hypot(a, b)` | 충돌 거리 계산 (`sortie-field.tsx`) |

**불변 갱신**(spread로 새 객체)이 낯설 텐데, React/Zustand는 "참조가
바뀌어야 변경으로 감지"하기 때문입니다. `state.collection[kind] += 1`처럼
제자리 수정하면 화면이 안 바뀌는 버그 1순위 — pandas의 "뷰 vs 복사"
논쟁과 비슷한 냄새가 나죠.

## 3. 클로저 — 이 게임의 엔진룸

파이썬에도 클로저는 있지만(nonlocal), JS에선 **일상 도구**입니다. 함수가
자기가 태어난 스코프의 변수를 계속 기억하는 것:

```ts
// sortie-field.tsx의 뼈대 — useEffect 안이 전부 클로저
useEffect(() => {
  let energy = 100;            // ← 이 변수들은 React 몰래 존재한다
  const junks: Junk[] = [];
  const update = (dt) => { energy -= cost * dt; };  // 바깥 변수를 기억
  const frame = () => { update(dt); raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);  // 정리 함수도 raf를 기억
}, []);
```

Day 3의 "게임 상태는 클로저 지역변수에"가 바로 이 구조입니다. 60fps로
변하는 값을 리렌더 없이 다루는 비법이 문법 하나(클로저)에서 나옵니다.

## 4. 비동기 — 이벤트 루프, 파이썬 asyncio의 사촌

JS는 **싱글 스레드 + 이벤트 루프**입니다. asyncio와 같은 모델이라 개념은
이미 아는 것: 블로킹하면 전부 멈춘다, I/O는 비동기로.

```ts
// share-panel.tsx 실제 코드
const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl());   // await = 파이썬과 동일
    setNotice("🔗 링크를 복사했어요!");
  } catch {
    setNotice(`주소를 직접 복사해 주세요: ${shareUrl()}`);
  }
};
```

`async/await`는 Promise의 설탕 문법. `fetch(src).then(r => r.json())`
(체이닝, `lottie-stage.tsx`)과 같은 것입니다. **타이머 3형제**의 용도 구분:

| 도구 | 용도 | 우리 실례 |
| --- | --- | --- |
| `setTimeout` | 한 번 뒤에 | 컷신 장면 전환 타이머 (`scene-*.tsx`) |
| `setInterval` | 주기 반복 (UI 갱신용) | 배너 확률 굴림 15초, 관제 시계 500ms |
| `requestAnimationFrame` | **화면 주사율 동기화** (그리기용) | 게임 루프 전부 |

"그리는 일에 setInterval을 쓰지 않는다" — rAF는 주사율에 맞고, 백그라운드
탭에서 자동 정지(배터리 절약 공짜)라서입니다(devlog 7).

## 5. DOM API — React 밖의 원시 세계

React가 대신해 주지만, 게임 루프에선 직접 씁니다. 원시 4종
(`sortie-field.tsx`·`ambient-orbit.tsx`가 교재):

```ts
const el = document.createElement("img");  // 만들고
el.style.transform = `translate3d(…)`;     // 만지고
layer.appendChild(el);                     // 붙이고
el.remove();                               // 뗀다
```

`el.animate([...], {duration})`(Web Animations API)로 CSS 키프레임을 JS에서
즉석 생성하는 것도 씁니다 — 수집 링 이펙트 `burstFx`.

## 6. 이벤트 — 버블링과 캡처링, 그리고 우리가 밟은 지뢰

이벤트는 트리를 타고 **위로 전파(버블링)**됩니다. 부모가 자식의 이벤트를
받을 수 있는 이유이자, 사고의 근원:

- **`stopPropagation()`**: 부유 파편을 탭했을 때 그 탭이 펫 영역까지
  전파되면 "파편 수집 + 펫 냠냠"이 중복 발동 → 파편 핸들러에서 전파 차단
  (`floating-debris.tsx`).
- **`setPointerCapture()`**: 드래그 중 손가락이 요소 밖으로 나가도 계속
  이벤트를 받겠다는 선언 (`pet-satellite.tsx`). **함정**: 캡처는 이후
  클릭 이벤트까지 가로챕니다 — 귀환 버튼이 안 눌리던 실제 버그의 범인
  (devlog 9의 "오늘의 버그", `sortie-field.tsx`의 `closest("button")` 방어).
- **Pointer 이벤트 통일**: mouse/touch/pen을 하나로. 모바일 게임은
  `onClick`(지연 있음) 대신 `onPointerDown`(즉응).

## 7. 파이썬에 없어서 헷갈리는 것 정리

- **`===`만 쓴다**: `==`는 암묵 형변환(`"1" == 1`이 true)의 지뢰밭.
- **falsy 목록**: `0, "", null, undefined, NaN` — `if (count)`는 0에서
  거짓! 그래서 개수 검사는 `if (count > 0)`로 명시 (우리 코드 관례).
- **`null` vs `undefined`**: "비어 있음"이 둘. 우리 관례 — 의도적 부재는
  `null`(`variant: null`), 아직 없음은 `undefined`(옵셔널 파라미터).
- **JSON**: `JSON.parse(localStorage.getItem("joops.pet.v1"))` — 파이썬
  `json.loads`. localStorage는 문자열만 저장(동기 API, 파이썬의
  shelve 비슷하지만 문자열 전용).
- **숫자는 전부 float**: 정수 나눗셈이 없다. `Math.floor(debris)`가 곳곳에
  있는 이유 (`//` 연산자 없음).

## 8. 연습

1. **[변환 훈련]** 파이썬으로 먼저 쓰고 JS로 번역:
   `kinds = {k: v for k, v in counts.items() if v > 0}` →
   (힌트: `Object.entries` + `filter` + `Object.fromEntries`.
   `pet-store.ts`의 `recordSortie`가 비슷한 일을 루프로 합니다 — 비교해 보기)
2. **[클로저 체감]** 브라우저 콘솔에서 카운터 클로저를 직접:
   `const make = () => { let n = 0; return () => ++n; }; const c = make();`
   `c(); c(); c()` — 상태가 함수에 붙어 다니는 감각.
3. **[버블링 실험]** `floating-debris.tsx`의 `stopPropagation()`을 주석
   처리하고 파편을 탭해 보세요. 무슨 일이 두 번 일어나는지 관찰 후 복원.
4. **[이벤트 루프 퀴즈]** 다음 출력 순서를 예측하고 콘솔에서 확인:
   ```js
   console.log(1);
   setTimeout(() => console.log(2), 0);
   Promise.resolve().then(() => console.log(3));
   console.log(4);
   ```
   (마이크로태스크 vs 매크로태스크 — asyncio의 콜백 큐와 비교해 보기)
5. **[원시 DOM]** 콘솔에서 홈 화면에 파편 이미지를 직접 하나 붙여보기:
   `createElement → src 지정 → style.position/transform → body.appendChild`.
   React 없이도 화면은 바뀐다 — React는 이것의 "관리인"일 뿐임을 체감.

## 셀프 체크

- 불변 갱신(spread)을 안 하면 React/Zustand에서 무슨 버그가 나는가?
- 게임 상태를 클로저에 두는 이유를 두 문장으로?
- setInterval 대신 rAF로 그리는 이유 두 가지는?
- `if (count)`가 위험한 값 다섯 개를 나열할 수 있는가?
- setPointerCapture가 일으킨 우리 프로젝트의 실제 버그는 무엇이었나?
