# Day 4 — PWA와 백엔드 연동 📡

> 오늘의 목표: 웹앱이 "설치되는 앱"이 되는 원리(PWA)를 이해하고,
> "클라이언트를 믿지 않는" 백엔드 연동 설계를 백엔드 엔지니어의 눈으로
> 재발견한다. 오늘은 당신의 홈그라운드와 프론트가 만나는 날입니다.

## 1. PWA — 웹앱이 앱이 되는 3종 세트

**① 매니페스트** (`app/manifest.ts` → `/manifest.webmanifest`):
"이 사이트는 설치 가능한 앱입니다"라는 신분증. 이름·아이콘·`display:
standalone`(주소창 없이 실행)·`orientation: portrait`(세로 고정 — 기획
원칙을 OS 레벨에서 강제). maskable 아이콘은 안드로이드가 원형/스쿼클로
잘라 쓰는 여백 있는 버전.

**② 서비스 워커** (`public/sw.js`): 페이지와 별개 스레드에서 도는
**네트워크 프록시**. 요청을 가로채 캐시에서 응답 → 오프라인 동작.
파이썬 비유: 앱 앞단의 캐싱 리버스 프록시(nginx)를 브라우저 안에 심는 것.

이 프로젝트의 실전 디테일 — **배포 감지**: SW는 URL이 같으면 갱신을
모릅니다. 그래서 `?v=버전-빌드스탬프` 쿼리로 등록하고, `package.json`
버전을 **배포마다 올리는 것이 규칙**이 됐습니다(우리가 매 PR마다 버전을
올린 이유가 이것). 새 SW 감지 → 업데이트 토스트 → 새로고침.

**③ 웹 푸시** (`lib/push-client.ts`, `app/actions/push.ts`): 앱이 꺼져
있어도 알림. 구조는 크론 워커와 비슷합니다:

```
브라우저 pushManager.subscribe(VAPID 공개키)
  → 구독 정보(엔드포인트+키)를 서버로
  → 서버(web-push + VAPID 개인키)가 푸시 서비스(FCM 등)에 발송
  → 서비스 워커의 push 이벤트가 알림 표시
```

VAPID는 "이 서버가 보낸 게 맞다"는 서명 키쌍 — JWT 서명과 같은 감각.
iOS는 **홈 화면에 설치한 후에만** 푸시 가능이라는 함정도
(`console-settings.tsx`의 상태 기계 `PushStatus`가 그 현실을 다 담고 있음).

## 2. Supabase — 클라이언트를 믿지 않는 설계

이 프로젝트 백엔드 연동의 3원칙 (`supabase/README.md`, devlog 4):

**① 게임 규칙은 Postgres 함수 안에.**
오프라인 정산(`joop_01_settle_offline`), 스냅샷 저장(`joop_01_sync_pet`),
진화·강화 구매가 전부 **security definer** DB 함수. 클라이언트는 "정산해
주세요"를 요청할 뿐, 규칙(얼마나 벌었는지)은 서버가 계산합니다.
`joop_01_pets` 테이블에 **update grant 자체가 없어** 직접 수정 치트가
원천 차단 — 스토어드 프로시저로만 쓰기가 가능한 DB 설계, 백엔드
엔지니어에게 익숙한 바로 그 패턴입니다.

**② 시간은 서버 시계만.**
방치형 게임의 최대 적은 "폰 시계를 3일 뒤로 돌리기"(time-cheat).
오프라인 보상은 전부 DB `now()` 기준 (개발 원칙 4). 클라이언트 시계는
장식(관제 화면의 궤도 시각화)에만 씁니다.

**③ RLS(Row Level Security)로 자기 행만.**
익명 인증으로 받은 uid가 자기 `pets` 행만 읽게 하는 행 단위 방화벽.
`WHERE user_id = auth.uid()`가 모든 쿼리에 강제로 붙는다고 생각하면 됩니다.

## 3. Server Actions — Flask 라우트가 함수 호출이 된 것

```ts
// app/actions/pet.ts
"use server";
export async function syncPet(snapshot: PetSnapshot) { /* 서버에서 실행 */ }
```

클라이언트에서 `await syncPet(data)`라고 부르면 Next.js가 알아서 HTTP
요청으로 바꿔 서버에서 실행합니다. **엔드포인트 URL도, fetch 코드도, 직렬화
코드도 안 씁니다.** Flask로 치면 `@app.route`를 선언하는 대신 함수에
데코레이터 하나 붙이고 클라이언트에서 그냥 import해 부르는 것.
비밀키(Supabase service 접근, VAPID 개인키)는 이 파일 안에서만 삽니다 —
번들로 새지 않음.

## 4. 동기화 아키텍처 — "새 서버 코드 0줄"의 비밀

`components/pet-link.tsx`(화면 없는 통신 컴포넌트)가 전부 담당:

```
부팅: 익명 세션 확보 → bootPet()(서버 정산) → hydrateFromServer(스토어 덮어쓰기)
플레이 중: 스토어 subscribe → dirty 표시 → 30초마다 syncPet(스냅샷)
```

이 구조의 힘: 미니게임을 통째로 리메이크했을 때(devlog 9) **서버 코드를
한 줄도 안 바꿨습니다**. 게임은 `finishSortie({debris, exp, durabilityLoss})`
계약만 지키면 되고, 서버 반영은 기존 30초 동기화가 나릅니다.
**"인터페이스를 좁게 유지하면 구현은 마음껏 갈아치울 수 있다"** — 이
프로젝트에서 가장 많이 증명된 문장.

환경변수가 없으면? 게임은 localStorage만 쓰는 **로컬 모드로 폴백**
(graceful degradation). 데모·개발·프로덕션이 같은 코드로 돕니다.

## 5. OG와 공유 — 서버가 그려주는 명함 (Day 4 보너스)

카톡/페북 미리보기 카드는 **상대방이 아니라 플랫폼 서버가** 우리 페이지의
`<head>`를 긁어 만듭니다. 크롤러는 JS를 안 돌리므로 OG 태그는 Server
Component(`app/layout.tsx`)가 HTML에 박아줘야 하고, `og:image`는 절대
URL이어야 합니다(`metadataBase`). 공유 버튼은 표준 Web Share API 우선 +
기능 감지 폴백 (`components/home/share-panel.tsx`, devlog 12).

## 6. 오늘의 코드 리딩

1. `supabase/migrations/` 아무 파일 + `supabase/README.md` — RLS·RPC의 실물
2. `app/actions/pet.ts` — Server Actions 4개
3. `components/pet-link.tsx` — 부팅 정산·30초 동기화·dirty 추적
4. `app/manifest.ts` + `components/pwa/` — PWA 3종 세트
5. `stores/pet-store.ts`의 `hydrateFromServer` — 서버→스토어 번역 지점

## 7. 손 실습

1. **[로컬 모드 체험]** `.env.local` 없이 `npm run dev` → 게임이 어떻게
   조용히 로컬 모드로 동작하는지 확인. 그리고 `pet-link.tsx`에서 그 분기를
   찾아보기.
2. **[Server Action 추가]** `app/actions/pet.ts`에 `pingServer()`라는
   장난감 액션(서버 시각을 문자열로 반환)을 만들고, 설정 시트 버튼으로
   호출해 alert로 표시. "엔드포인트 없는 API"의 감각을 손으로.
3. **[치트 시도]** 브라우저 콘솔에서
   `JSON.parse(localStorage.getItem("joops.pet.v1"))`의 debris를 9999로
   조작해 보세요. 로컬 모드에선 통하지만, 서버 연동 시 어느 지점에서
   서버 값으로 덮어써질지 코드에서 찾아내기 (`hydrateFromServer` 경로).

## 8. 셀프 체크

- 서비스 워커 갱신이 왜 `?v=` 쿼리와 버전 업 규칙을 필요로 하는가?
- security definer 함수 + update grant 제거가 어떤 치트를 막는가?
- Server Action과 Route Handler(API 라우트)의 차이를 설명할 수 있는가?
- 미니게임 리메이크에 서버 코드가 0줄이었던 구조적 이유는?

## 심화

- devlog: `03-PWA-설치형-앱과-웹-푸시.md`, `04-Supabase와-방치형-루프.md`(필독), `12-소셜-공유와-OG-프리뷰.md`
- 공식 문서: web.dev "Progressive Web Apps", supabase.com "Row Level Security"
