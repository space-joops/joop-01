# 개발 일지 #14 — Lottie 파이프라인과 시네마틱 오프닝 🎬

> 2026-07-22 · 브랜치 `claude/cinematic-intro`
> 이번 편에서 배우는 것: **Lottie가 무엇인가, bodymovin JSON을 코드로 생성하기, 상태 교체로 캐릭터 연기시키기, 타이핑 나레이션, dvh·touch-action 모바일 최적화, Web Audio 합성음**

오프닝을 **완전히 새로** 만들었습니다. 기존의 SVG/Framer 연출을 버리고, 이번엔 **Lottie 파이프라인**을 도입했어요. 왜 Lottie냐 — 나중에 디자이너가 After Effects로 뽑은 진짜 고품질 애니메이션을 **코드 수정 없이** 끼워 넣을 수 있는 표준 포맷이기 때문입니다.

## 1. Lottie가 뭐길래

Lottie는 **벡터 애니메이션을 JSON으로 기술하는 포맷**입니다. After Effects에서 Bodymovin 플러그인으로 내보내면 `.json` 하나가 나오고, `lottie-web`(웹)·lottie-ios·lottie-android가 그 JSON을 읽어 똑같이 재생합니다. GIF/동영상과 달리 **벡터라 무한 확대해도 선명하고 용량이 작으며**, 코드로 재생/정지/속도/구간을 제어할 수 있어요.

파이썬으로 비유하면, 애니메이션을 `matplotlib` 코드가 아니라 **선언적 데이터(JSON)**로 들고 있다가 플레이어가 렌더하는 구조입니다. 그림과 재생을 분리한 거죠.

## 2. 에셋이 없어서… JSON을 코드로 찍어냈다

문제: 진짜 Lottie 파일이 아직 없습니다(디자이너의 AE 작업물 대기 중). 그래서 **플레이스홀더를 프로그램으로 생성**했습니다 — `scripts/gen-lottie.mjs`.

Lottie JSON은 레이어(`ty:4`) 배열이고, 각 레이어는 `ks`(transform: 위치·회전·크기·투명도)와 `shapes`(도형)로 이뤄집니다. 애니메이션 값은 `{ a:1, k:[키프레임…] }`:

```js
// 파편 링을 0→360° 회전 (150프레임)
r: anim([{ t: 0, v: 0 }, { t: 150, v: 360 }])
```

손으로 JSON을 타이핑하면 오타 지옥이라, 헬퍼 함수(`ellipse`, `roundRect`, `star`, `group`, `layer`)로 조립하는 생성기를 짰습니다. 기존 `og-image.svg`·`generate-icons.mjs`와 같은 "에셋은 스크립트로 재생성" 원칙이에요. 덕분에 팔레트만 바꿔 재실행하면 6종이 한 번에 갱신됩니다.

**오늘의 함정 두 개:**
- `star` 도형에서 `is`(안쪽 모서리 둥글기) 필드를 빠뜨렸더니 그 레이어부터 렌더가 통째로 죽었습니다. Lottie 스키마는 생각보다 엄격해요.
- Lottie는 **배열 앞쪽 아이템이 앞면(front)**입니다. AE의 레이어 순서와 같죠. 눈을 배열 뒤에 뒀더니 몸통에 가려 얼굴이 안 보였습니다 — 순서를 뒤집어 해결.

## 3. 상태 교체로 캐릭터를 연기시키기

Scene 3의 핵심은 줍이가 **idle → happy → launch**로 변신하는 것. 이걸 `LottieStage`에 넘기는 `src`만 바꿔서 처리합니다:

```tsx
const petSrc = phase === "happy" ? joopsHappy
             : phase === "launch" ? joopsLaunch
             : joopsIdle;
<LottieStage src={petSrc} loop={phase !== "launch"}
             onComplete={phase === "launch" ? () => setPhase("title") : undefined} />
```

`key={src}`로 리마운트되어 새 애니메이션이 처음부터 재생됩니다. launch는 `loop=false`라 재생이 끝나면 `onComplete`가 발화 → 타이틀로 넘어가요. "애니메이션이 끝나는 순간"을 이벤트로 받는 이 패턴이 컷 전환의 뼈대입니다.

주의: `lottie-web`은 `document`를 만지므로 SSR에서 실행되면 터집니다. `next/dynamic(ssr:false)`로 **클라이언트에서만** 로드했어요.

## 4. 모바일 최적화 3종

- **주소창 문제 → `100dvh`**: 모바일 브라우저는 스크롤에 따라 주소창이 접혔다 펴지며 `100vh`가 들쭉날쭉합니다. `dvh`(dynamic viewport height)는 실제 보이는 높이를 따라가서 컷신이 항상 꽉 찹니다.
- **스크롤·줌 차단 → `touch-action: none`**: 컷신 중 실수로 화면이 스크롤되거나 핀치줌되면 몰입이 깨집니다. `touch-game` 클래스가 이걸 막아요.
- **터치 즉응 → `onPointerDown`**: `onClick`은 모바일에서 ~300ms 지연이 있을 수 있습니다. Pointer 이벤트로 손이 닿는 즉시 반응하게 했습니다.

## 5. 소리도 넣었다 — Web Audio 합성

오디오 파일이 없어서, 격려 순간의 "띠링"과 발진의 "휘잉"을 **오실레이터로 즉석 합성**했습니다(`sound.ts`). 브라우저는 사용자 제스처 후에만 소리를 허용하는데, 마침 Scene 3의 터치가 그 제스처라 자연스럽게 울립니다.

```ts
// 기쁨 — 도미솔도 아르페지오
[523, 659, 784, 1047].forEach((f, i) => blip(c, f, now + i*0.08, ...));
```

진짜 SFX가 생기면 `ASSET_URLS.sfx` 경로로 로드하도록 바꾸면 됩니다.

## 6. 나중에 진짜 Lottie로 교체하는 법

이게 이 구조의 핵심 가치입니다. 디자이너가 AE로 뽑은 `scene1_earth.json`을 주면 — `public/lottie/scene1_earth.json`을 **덮어쓰기만** 하면 끝. 코드는 `ASSET_URLS`의 경로만 참조하므로 한 줄도 안 바뀝니다. 지금은 소박한 도형이지만, 파이프라인은 브로드캐스트급 에셋을 그대로 받을 준비가 돼 있어요.

## 배울 포인트 정리

- **포맷이 곧 확장성**: Lottie 같은 표준을 쓰면 "지금은 임시, 나중에 고급"의 교체 비용이 0에 수렴한다.
- **에셋은 생성기로**: JSON/SVG 손타이핑 대신 스크립트로 찍으면 재생성·리뷰·팔레트 교체가 쉽다.
- **완료 이벤트로 연출을 잇는다**: `onComplete`가 컷 전환의 신호. 타이머보다 정확하다(안전망 타이머는 곁들이되).
- **모바일은 dvh·touch-action·pointer** 3종이 기본 예의.

---

_이전 오프닝의 역사는 [2편](./02-오프닝-컷신.md)·[13편](./13-모바일-온보딩과-3D-심리스-등장.md)에 남아 있어요. 이번 편이 그 계보를 잇는 세 번째 리메이크입니다._
