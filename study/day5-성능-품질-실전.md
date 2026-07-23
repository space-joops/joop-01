# Day 5 — 성능, 품질, 그리고 1티어의 사고법 🏁

> 오늘의 목표: 번들·렌더 성능을 측정하고 줄이는 법, 자동 검증하는 법을
> 익히고, 지난 4일을 "판단 기준"으로 압축한다. 마지막 날은 기술이 아니라
> **태도**를 배우는 날입니다.

## 1. 번들 다이어트 — 실화: 509KB → 261KB (-48%)

이 프로젝트에서 실제로 일어난 일(devlog 15): 홈 펫을 3D(R3F)에서 2D
스티커로 바꾸며 three 계열 의존성을 제거하자 First Load JS가 **반토막**.

배울 것 세 가지:

- **측정이 먼저**: `npm run build`의 Route 테이블이 기본 계기판.
  First Load JS = 첫 화면에 필요한 JS 총량 — 모바일에서 이 숫자가 곧
  로딩 속도이자 이탈률.
- **트리셰이킹의 조건**: import를 지우는 순간 번들에서 빠집니다.
  "혹시 몰라서" 남긴 import가 최대의 적. (`satellite-3d.tsx`의 import를
  끊자마자 three가 통째로 빠졌습니다 — 파일 삭제 전에 이미.)
- **의존성 추가는 부채 계약**: `npm install` 전에 물어야 할 것 —
  "이거 없이 표준 API로 되나?" 우리는 사운드를 라이브러리 대신 Web Audio
  합성으로(`components/intro/sound.ts`), 공유를 SDK 대신 Web Share API로
  (`share-panel.tsx`) 해결했습니다. requirements.txt를 다이어트하는
  감각 그대로.

**렌더 성능 체크 3종** (Day 1 파이프라인의 실전 적용):
① 매 프레임 바뀌는 건 transform/opacity만인가 ② 애니메이션 filter를
프레임마다 바꾸지 않는가(우리는 상수 filter만 — `ambient-orbit.tsx` 주석)
③ 초당 수십 번 setState하고 있지 않은가(React DevTools Profiler로 확인).

## 2. Playwright — 눈으로 보던 것을 코드로 보증

이 프로젝트의 모든 기능은 병합 전에 Playwright로 실기 검증됐습니다.
pytest 감각 그대로, 대상이 브라우저일 뿐:

```js
await page.goto("http://localhost:3000/?intro=1");
await page.getByText("게임 시작하기").click();
const state = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("joops.pet.v1")).state);
// 화면이 아니라 "상태"를 단언 — debris가 실제로 늘었는가
```

실전에서 배운 함정 두 개(devlog 16):

- **끊임없이 움직이는 요소는 tap()이 실패**합니다(안정성 대기). 게임 UI는
  `dispatchEvent("pointerdown")`나 `{force:true}`로. "테스트 실패 ≠ 제품
  결함" — 도구의 가정을 아는 것도 실력.
- **개발용 쿼리 파라미터**(`?intro=1`, `?mood=hibernate`, `?action=1`,
  `?variant=magnet`)를 미리 심어두면 테스트가 순식간에 원하는 상태로
  점프합니다. 테스트 가능성(testability)은 설계 단계의 결정.

## 3. 접근성·UX 디테일 — 1티어가 코드 리뷰에서 보는 것들

이 저장소에 이미 있는 것들로 배우기:

- `aria-label` — 이모지 버튼(⚙️, 📡, ✕)엔 반드시. 스크린 리더가 읽을 말.
- 실제 `<button>` — canvas 위 그림 버튼 대신 (jd-03과 갈라진 지점).
- `noopener,noreferrer` — `window.open`의 탭내빙 방어 (`share-panel.tsx`).
- 타이핑 스킵 — 연출은 강요하지 않는다. 탭하면 즉시 완성
  (`typewriter-narration.tsx`), 컷신엔 항상 "건너뛰기".
- `disabled:opacity-40` + 사유 안내 — 왜 안 되는지 말해주는 버튼
  (`console-settings.tsx`의 수동 출격 줄).

## 4. 협업 워크플로 — 이 프로젝트가 굴러온 방식

- **브랜치 → PR → main** (main 직접 커밋 금지). PR 본문은 "무엇을·왜".
- **커밋 = 학습 단위**: 이 저장소의 `git log`를 읽어보세요. 에셋 → 코어 →
  셸 → 폴리시 → 문서 순의 커밋이 그대로 튜토리얼입니다.
- **배포 = 버전 업**: PWA 업데이트 감지가 `package.json` 버전에 걸려
  있으므로 main 병합마다 올립니다 (Day 4의 서비스 워커 절 참조).
- **문서는 자산**: devlog 16편이 마케팅(Devlog) 자산이자 온보딩 교재.
  당신이 지금 읽는 이 커리큘럼도 그 산물.

## 5. 1티어의 판단 기준 — 4일의 압축

1. **상태의 주소를 먼저 정한다** (서버/스토어/ref/useState — Day 2).
2. **비용은 파이프라인 단계로 계산한다** (Layout/Paint/Composite — Day 1).
3. **선언형이 기본, 명령형은 탈출구** — 그러나 탈출할 땐 과감히 (Day 3).
4. **클라이언트는 입력, 서버가 진실** (Day 4).
5. **인터페이스를 좁게** — `finishSortie` 계약 하나로 게임을 통째로
   갈아치웠다 (Day 4).
6. **측정 없이 최적화 없다** — build 테이블, Profiler, Paint flashing (Day 5).
7. **버릴 용기** — 열심히 만든 것과 좋은 것은 다르다. 3D를 접은 날의
   교훈 (devlog 15). 매몰 비용은 git 히스토리가 보관해 준다.

## 6. 졸업 과제 (택 1, 반나절)

**A. 기능 신설 — "일일 보급품"**
하루 한 번 홈에 보급 캡슐이 떠오르고, 탭하면 랜덤 보상(파편 5~20).
요구: 상태 주소 판단(마지막 수령 시각은 어디에? 서버 시간 문제는?),
Framer 등장 연출, 도감 통계 연동, Playwright 검증까지. — Day 1~4 총동원.

**B. 성능 리포트 — "우리 게임 건강검진"**
Lighthouse(모바일)와 build 테이블로 현재 성능을 측정하고, 병목 3개와
개선안을 `study/성능-리포트.md`로. 개선 하나는 직접 구현·재측정. — 측정
근육 단련.

**C. 미니게임 모드 신설 — "보스 파편"**
60초마다 거대 파편(체력 3, 세 번 부딪혀야 파괴, 보상 20)이 등장하는
모드. 요구: KIND 테이블 확장의 한계 파악(체력 개념이 없다 → 어디를
고칠지 설계 먼저), TUNE/DIFFICULTY 원칙 유지. — Day 3 심화.

과제를 마치면 **PR을 직접 열어보세요**(연습 브랜치라도). 제목·본문을
한국어로 "무엇을·왜"가 드러나게 — 이 저장소의 PR들이 견본입니다.

## 7. 셀프 체크 (최종)

- First Load JS가 크면 정확히 무엇이 느려지는가?
- 트리셰이킹이 작동하는 조건은?
- 움직이는 요소를 Playwright로 탭하는 법 두 가지는?
- "인터페이스를 좁게 유지하라"를 이 프로젝트의 사례로 설명할 수 있는가?
- 7가지 판단 기준 중 오늘의 당신에게 가장 부족한 것은? (정직하게 — 그게
  6일차의 커리큘럼입니다)

## 심화

- devlog: `15-3D를-접은-날-2D-스티커-펫.md`(필독), `13-모바일-온보딩과-3D-심리스-등장.md`
- 도구: Chrome DevTools Performance 탭, React DevTools Profiler, Lighthouse
- 다음 여정: React 공식 문서의 "You Might Not Need an Effect" — 중급에서
  고급으로 가는 관문 문서입니다.
