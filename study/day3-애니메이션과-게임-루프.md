# Day 3 — 애니메이션과 게임 루프 🕹️

> 오늘의 목표: 선언형 애니메이션(Framer Motion)과 명령형 게임 루프(rAF)를
> 구분해 쓰고, 60fps를 만드는 물리·수학의 최소 세트를 손에 넣는다.
> **이 날이 이 커리큘럼의 심장입니다.**

## 1. 두 세계 지도 — 선언형 vs 명령형

| | 선언형 (Framer Motion) | 명령형 (rAF + DOM 직접) |
| --- | --- | --- |
| 사고 | "이 상태일 때 이 모습" | "매 프레임 이만큼 움직여" |
| 적합 | UI 전환, 등장/퇴장, 제스처 반응 | 게임, 초당 수십 번 변하는 것 |
| 실례 | 시트 슬라이드, 펫 둥실, 컷신 | 미니게임 전체, 플라이바이 |
| 파이썬 비유 | 상태 기계 정의 | pygame 메인 루프 |

**같은 화면에 공존**시키는 게 실전입니다. 홈 펫(`pet-sticker.tsx`)은
Framer로 둥실거리고, 미니게임(`sortie-field.tsx`)은 rAF로 돌며, 그 배경의
플라이바이(`ambient-orbit.tsx`)도 자체 rAF를 씁니다.

## 2. Framer Motion 5분 정복

```tsx
<motion.div
  initial={{ y: -120, opacity: 0 }}          // 등장 전
  animate={{ y: 0, opacity: 1 }}             // 목표 — 바뀌면 알아서 보간
  exit={{ opacity: 0 }}                      // 퇴장 (AnimatePresence 필요)
  transition={{ type: "spring", bounce: 0.5 }}
/>
```

- **`animate`에 배열**을 주면 키프레임: `y: [0, -22, 0, -10, 0]`
  (펫 버스트 홉, `pet-sticker.tsx`). `repeat: Infinity`로 루프.
- **`AnimatePresence`**: React에서 컴포넌트가 사라질 때 원래는 즉시
  제거됩니다. 이 래퍼가 exit 애니메이션이 끝날 때까지 붙잡아 줌.
  `mode="wait"`는 "전 장면 퇴장 완료 후 다음 장면 등장" — 컷신 크로스페이드
  (`intro-cutscene.tsx`).
- **`key`가 바뀌면 리마운트** = 처음부터 재생. 감정 스티커 크로스페이드가
  `key={src}` 하나로 되는 이유 (`pet-sticker.tsx`).

## 3. rAF 게임 루프 — 4계명

`sortie-field.tsx`(미니게임 본체)에 전부 구현되어 있습니다. 4계명:

**① 초당 60번 변하는 상태는 React가 모르게 하라.**
좌표·속도는 클로저 지역변수. `<img>` 노드를 직접 만들고
`el.style.transform`으로 옮기고 `el.remove()`. React는 껍데기(HUD·모달)만.
"pygame 루프를 React 안에 숨긴다"(devlog 9).

**② dt를 곱하라 (프레임레이트 독립).**
```ts
const dt = Math.min(0.05, (now - last) / 1000);
pet.x += vx * dt;   // 60Hz든 120Hz든 같은 속도
```
`min(0.05)` 상한이 중요: 탭이 백그라운드에 갔다 오면 dt가 수십 초 —
그대로 곱하면 물체가 벽을 뚫습니다(터널링).

**③ update와 draw(sync)를 분리하라.**
update는 상태만 바꾸고, sync는 상태를 읽어 DOM에 반영만. 디버깅과
테스트가 갈라집니다.

**④ 종료는 한 곳으로 수렴시켜라.**
어떤 경로(에너지 소진/귀환 버튼)로 끝나든 `finish()` 하나를 지나
`onEnd(결과)` — 정산 누락 버그가 원천 차단됩니다.

## 4. 게임 물리 최소 세트 — 고등학교 수학의 복수

**오일러 적분** (관성 조종의 전부):
```ts
vx += (dx / dist) * acc * dt;   // 가속도 → 속도  ((dx/dist)는 단위벡터)
pet.x += vx * dt;               // 속도 → 위치
vx -= vx * friction * dt;       // 마찰 감쇠
```

**2차 베지에 곡선** (플라이바이 포물선, `ambient-orbit.tsx`):
```
B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2      // P1은 "끌어당기는" 제어점
B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)          // 도함수 = 진행 방향 (기수 회전에 사용)
```

**이징이 곧 감정**:
- `t` 그대로(선형) = 기계적
- `t^1.8`(ease-in) = 멀리서 천천히, 가까이서 훅 — **원근의 착시** (플라이바이 스케일)
- `1-(1-t)³`(ease-out) = 빠르게 와서 사뿐히 — **도착의 느낌** (펫 착륙)

**가중치 룰렛** (`random.choices(weights=)`의 JS 손구현, 3곳에서 재사용):
```ts
let r = Math.random() * totalW;
for (const k of table) { r -= k.w; if (r <= 0) return k.kind; }
```

## 5. 게임 필(game feel) — 수학이 아니라 심리학

`components/action/sortie-tuning.ts`의 TUNE 상수들이 교재:

- **비대칭 판정**: 획득은 후하게(`petR + size + eatBonus`), 피격은 짜게
  (`petR × 0.75`). 플레이어는 "아깝게 놓침"과 "스쳤는데 맞음" 양쪽에
  분노합니다. 양쪽 다 유저 편으로 속이면 "손에 붙는다"고 느낌.
- **티 안 나는 자석**: 근처 파편을 슬쩍 끌어옴 — 유저는 자기가 잘한다고
  착각하고, 그 착각이 재미.
- **무적 시간 + 화면 흔들림**: 연속 피격의 억울함 방지 + "맞았다"는 촉각.
- **조작감(TUNE) vs 난이도(DIFFICULTY) 상수 분리**: 밸런스 패치가 손맛을
  건드리지 못하게 하는 구조적 장치.

## 6. 렌더링 기술 선택 — DOM vs Canvas vs SVG vs Lottie

이 프로젝트가 실제로 내린 선택과 이유:

| 기술 | 우리의 사용처 | 선택 이유 |
| --- | --- | --- |
| DOM + transform | 미니게임 전체 | 벡터 SVG가 그대로 선명, 합성만 건드려 발열↓, 엔티티 ~40개면 충분 |
| Canvas 2D | (안 씀 — jd-03은 사용) | 픽셀아트·수백 엔티티면 유리. 우리는 벡터라 부적합 |
| SVG | 모든 에셋 + 관제 지도/지구본 | 무손실 확대, `<path>`로 데이터 시각화 |
| Lottie | 인트로 컷신 | AE 에셋 드롭인 교체 가능한 표준 포맷 (devlog 14) |
| ~~WebGL/R3F~~ | **버렸음** | 귀여움 실패 + 번들 248KB + 발열 (devlog 15) |

1티어의 판단 기준: "**가장 화려한 기술이 아니라, 요구(선명함·발열·개수)에
맞는 가장 값싼 기술**".

## 7. 오늘의 코드 리딩

1. `components/action/sortie-field.tsx` — 4계명 전부 (60분 잡고 정독)
2. `components/action/sortie-tuning.ts` — 게임 필 상수와 주석
3. `components/action/ambient-orbit.tsx` — 베지에·원근·페이드 대칭
4. `components/home/pet-sticker.tsx` — Framer 키프레임·AnimatePresence

## 8. 손 실습

1. **[물리 체감]** `sortie-tuning.ts`에서 `friction`을 1.2 → 5로 바꾸고
   플레이(`설정 → 수동 출격`). 우주감이 사라지는 걸 몸으로 느낀 뒤 복원.
   `thrustAccel`을 두 배로도 해 볼 것.
2. **[새 파편]** KIND_STAT에 "황금 파편"(gold, 가치 20, 아주 빠르고 작음,
   weight 2)을 추가해 보세요. SVG는 기존 bolt를 복사해 노랗게. 도감까지
   나오면 성공.
3. **[이징 실험]** `ambient-orbit.tsx`의 `scaleEase`를 2.0 → 1.0(선형)으로
   바꾸고 플라이바이를 보세요. "다가오는 물체"가 "커지는 그림"으로
   퇴화하는 순간을 목격하기. 복원 필수.

## 9. 셀프 체크

- dt 상한이 없으면 백그라운드 복귀 시 무슨 일이 나는가?
- 획득 판정과 피격 판정을 왜 비대칭으로 두는가?
- 베지에의 P1을 화면 아래로 옮기면 경로가 어떻게 변하는가?
- 우리가 미니게임에 Canvas를 안 쓴 두 가지 이유는?

## 심화

- devlog: `09-출격-리메이크-조종-미니게임.md`(필독), `10-배경-궤도-연출-베지에와-원근.md`, `14-Lottie-파이프라인과-시네마틱-오프닝.md`
- 검색 키워드: "game feel", "juice it or lose it"(GDC 강연), MDN requestAnimationFrame
