# Day 2 — 상태 관리, TypeScript, Tailwind 🧠

> 오늘의 목표: "이 상태는 어디에 살아야 하는가"를 판단하는 눈을 기르고,
> TypeScript를 방패로, Tailwind를 손발로 만든다.

## 1. 상태의 주소 정하기 — 프론트엔드 설계의 절반

프론트엔드 버그의 태반은 로직이 아니라 **상태를 잘못된 곳에 둔 것**에서
옵니다. 이 프로젝트의 상태 주소록:

| 상태 | 사는 곳 | 왜 거기인가 |
| --- | --- | --- |
| 배터리·내구도·데이터·파편·EXP | Zustand 스토어 (`stores/pet-store.ts`) | 여러 화면이 공유 + 영속 필요 |
| 설정 시트 열림/닫힘 | `useState` (`home-screen.tsx`) | 그 화면만의 일시적 UI 상태 |
| 미니게임 좌표·속도 | **클로저 지역변수** (`sortie-field.tsx`) | 초당 60번 변함 — React가 알면 재앙 |
| 포인터 추적(드래그 거리) | `useRef` (`pet-satellite.tsx`) | 렌더와 무관, 리렌더 유발 금지 |
| 진실의 원천(정산·진화) | **서버(Postgres 함수)** | 클라이언트는 치트 가능 (Day 4) |

**판단 순서**: ① 서버가 진실이어야 하나? → 서버. ② 여러 컴포넌트가
공유하나? → 스토어. ③ 초당 수십 번 변하나? → ref/클로저. ④ 나머지 →
`useState`. 이 순서를 외우면 설계 리뷰에서 1티어처럼 말할 수 있습니다.

## 2. Zustand — 전역 싱글톤 dataclass + 옵저버

`stores/pet-store.ts` 파일 머리 주석이 이미 정답을 말합니다:
"파이썬으로 비유하면 **전역 싱글톤 dataclass + 메서드 묶음**".

```ts
export const usePetStore = create<PetState>()(
  persist(
    (set, get) => ({
      battery: 80,
      eatDebris: () => set((state) => ({ ... })),  // 메서드
    }),
    { name: "joops.pet.v1", partialize: (s) => ({ ... }) },  // 피클링 대상 선별
  ),
);
```

핵심 세 가지:

- **선택 구독**: `usePetStore((s) => s.battery)` — battery가 바뀔 때만
  그 컴포넌트가 리렌더. SQL의 `SELECT battery FROM store`와 같은 감각.
  `usePetStore()`로 통째로 구독하면 모든 변경에 리렌더 — 안티패턴.
- **렌더 밖에서 읽기**: `usePetStore.getState()` — 이벤트 핸들러·게임
  루프에서 최신값을 구독 없이. 실례: `home-screen.tsx:88`(배너 타이머가
  interval을 다시 걸지 않고도 최신 상태를 읽는 트릭 — 주석 참조).
- **persist + partialize**: localStorage 자동 저장. 함수는 저장 못 하니
  데이터 필드만 선별(피클링 대상 선별, `pet-store.ts:287`). 스키마가
  바뀌면 키를 v2로 — 낡은 저장본과의 충돌 회피 전략까지 주석에 있습니다.

**2단 영속 구조**(이 프로젝트의 백미): localStorage는 1차(로컬 모드의
전부), Supabase는 2차(연결 시 서버가 진실). `hydrateFromServer`가 서버
정산 결과로 스토어를 덮어씁니다. 캐시 vs DB의 구분 — 데이터 엔지니어의
직감이 그대로 통하는 지점.

## 3. TypeScript — mypy가 컴파일러가 된 세계

파이썬의 type hints는 선택이지만 TS의 타입은 **빌드가 거부권을 행사**합니다.
이 프로젝트에서 실제로 겪은 사례 두 개가 최고의 교재:

- **리터럴 타입 함정**: `const D = { startEnergy: 100 } as const` 후
  `useState(D.startEnergy)` → 상태 타입이 `number`가 아니라 **`100`**으로
  추론되어 `setEnergy(87)`이 컴파일 에러. 해법: `useState<number>(...)`.
  (`sortie-field.tsx`에서 실제로 밟은 지뢰 — devlog 9 참조)
- **유니온 타입으로 상태 기계**: `type Phase = "briefing" | "play" | "result"`
  (`action-mode.tsx`). enum보다 가볍고, switch에서 빠뜨린 케이스를
  컴파일러가 잡아줍니다. 파이썬 `Literal["a","b"]`과 동일 개념, 강제력만 다름.

자주 쓰는 어휘: `interface`(dict 스키마), `Partial<T>`(전부 Optional),
`Record<K,V>`(dict[K,V]), `as const`(불변+리터럴), 제네릭 `create<PetState>()`.
`lib/supabase/types.ts`를 열어 DB 스키마가 타입으로 미러되는 걸 보세요 —
pydantic 모델과 정확히 같은 역할입니다.

## 4. Tailwind v4 — 유틸리티는 인라인 스타일이 아니다

```tsx
<button className="flex-1 rounded-2xl border border-panel-border bg-panel py-3.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40">
```

처음엔 "클래스 지옥"으로 보이지만 1티어들이 쓰는 이유:

- **제약된 디자인 시스템**: `py-3.5`는 임의 픽셀이 아니라 스페이싱 스케일의
  한 칸. 팀 전체의 간격이 자동으로 일관됨.
- **상태 변형이 한 줄**: `active:scale-95 disabled:opacity-40` — CSS
  선택자를 따로 쓸 필요 없음.
- **죽은 CSS가 없다**: 쓰는 클래스만 빌드에 포함.

v4의 특이점: `tailwind.config.js`가 없고 **CSS 안에서 테마를 정의**
(`app/globals.css`의 `@theme inline`). `--color-panel` 같은 CSS 변수를
선언하면 `bg-panel` 유틸리티가 생깁니다. 우리 팔레트(배터리 호박색·내구도
에메랄드·데이터 인디고)가 전부 여기 삽니다.

임의 값 문법 `[...]`도 자주 씁니다: `drop-shadow-[0_0_14px_rgba(...)]`,
`[filter:brightness(1.2)]` (`floating-debris.tsx`). 스케일 밖의 값이 필요할
때의 탈출구.

## 5. 모바일 뷰포트 — 게임이 가르쳐준 4가지

1. **`100dvh`**: 모바일 주소창이 접혔다 펴지며 `100vh`가 변합니다.
   dynamic viewport height가 해답 (`app/layout.tsx:101`, `intro-cutscene.tsx`).
2. **`touch-action: none`**: 게임 영역에서 브라우저 기본 스크롤/핀치줌을
   끄고 Pointer 이벤트를 우리가 처리 (`globals.css`의 `.touch-game` 주석).
3. **safe-area**: 노치 폰 대응 `pb-[max(0.5rem,env(safe-area-inset-bottom))]`
   — 이 패턴이 저장소에 10곳쯤 있습니다.
4. **Pointer 이벤트 + `setPointerCapture`**: 마우스/터치/펜 통합 +
   손가락이 영역 밖으로 나가도 추적 (`pet-satellite.tsx:76` 주석).

## 6. 오늘의 코드 리딩

1. `stores/pet-store.ts` — 처음부터 끝까지. 주석이 교과서입니다.
2. `app/globals.css` — @theme inline, .touch-game, 키프레임들
3. `components/home/inventory-sheet.tsx` — 선택 구독 + Tailwind 그리드
4. `lib/supabase/types.ts` — 타입 = 스키마 미러

## 7. 손 실습

1. **[스토어]** `pet-store.ts`에 `luckyCount`(럭키 파편 수) 상태와
   `recordLucky()` 액션을 추가하고 persist 대상에 넣기. 인벤토리 시트에
   표시까지. (끝나면 되돌려도 좋고, 남겨서 PR 연습을 해도 좋음)
2. **[타입]** `type Phase = ...` 유니온에 가짜 상태 하나를 추가하고,
   처리 안 한 곳에서 컴파일 에러가 나는지 확인. TS가 지켜주는 감각.
3. **[Tailwind]** 푸터 버튼 하나에 `hover:` 변형과 임의 값 그림자를 넣어
   데스크톱에서 확인. 그리고 **모바일엔 hover가 없다**는 사실을 검색해
   보기 — 왜 우리는 `active:`만 쓸까?

## 8. 셀프 체크

- 새 상태가 생겼을 때 주소(서버/스토어/ref/useState)를 고르는 4단 판단을
  말할 수 있는가?
- `getState()`와 훅 구독의 차이·각각의 용처는?
- `as const`가 만든 리터럴 타입이 useState를 어떻게 오염시키는가?
- `100vh` 대신 `100dvh`를 쓰는 이유는?

## 심화

- devlog: `08-방치형-업그레이드.md`, `16-부유-파편과-수집-인벤토리.md`(로컬 통계의 경계)
- 공식 문서: zustand 문서의 "selector", tailwindcss.com v4 "Theme variables"
