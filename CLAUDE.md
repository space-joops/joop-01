# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**줍스(JOOPS)** — 우주 쓰레기 청소 위성 펫 게임. 다마고치 스타일의 가상 펫 육성 + 방치형(Idle) + 액션 아케이드가 결합된 **하이브리드 캐주얼 모바일 웹 게임**입니다. 유저는 벤처 스타트업 '클리어 스카이(Clear Sky)'의 재택근무 오퍼레이터가 되어, 로우폴리(Low-Poly) 스타일의 인공위성 펫과 교감하며 우주 쓰레기를 청소하고 잃어버린 밤하늘의 별빛을 되찾습니다.

현재 코드베이스는 create-next-app 초기 스캐폴드 상태이며, 게임 본체는 아직 구현 전입니다. **모든 기획은 `plan/` 디렉토리에 있으므로, 게임 기능을 구현하기 전에 반드시 관련 문서를 먼저 읽으세요.**

## plan/ 디렉토리 문서 가이드

| 문서 | 내용 |
| --- | --- |
| `줍스 프로젝트 개발 가이드.md` | **AI 에이전트용 핵심 스펙.** 기술 스택, 3대 상태 지표, 방치형 루프, 제스처 매핑, DB 스키마, 개발 원칙. 이 문서의 지시가 최우선입니다. |
| `우주 쓰레기 청소 위성 펫 게임 기획서 V3.md` | 게임 디자인 문서. 펫 상태 관리, 진화 트리(1~3단계), 하이브리드 게임 루프, 궤도 구역화(LEO/MEO/GEO), 조우 확률 공식(`E_r = ρ(h) × v_rel × A_capture`), 도감, 소셜(Orbital Ping/포아송 조우 모델), 수익화(BM). |
| `줍스(JOOPS) 배경 스토리 및 오프닝 컷신 시나리오.md` | 세계관(케슬러 신드롬으로 인한 '대폐색' 사건), 플레이어 정체성, 오프닝 컷신 3장면 연출 시나리오. 인게임 텍스트·연출 작업 시 참조. |
| `게임 시장 분석 및 대안 제시.md` | 시장성 평가 보고서. 주요 시사점: 온보딩에서 물리 용어 숨기기(점진적 개방), SGP4/TLE 실데이터 연동은 서버 연산 + 30~50개 파편만 클라이언트 스트리밍(LOD), 타이틀 상표권 리스크, 그린 게이밍/ESG 포지셔닝. |
| `독립 개발자 시장 조사 및 마케팅 전략.md` | 인디 개발자 마케팅 전략. 제로 예산 마케팅 5단계, ASO, 인플루언서 아웃리치. 개발 일지(Devlog) 작성이 마케팅 자산이라는 관점 — `docs/` 문서 작성과 연결됨. |

## 명령어

```bash
npm run dev      # 개발 서버 (Turbopack, http://localhost:3000)
npm run build    # 프로덕션 빌드 (Turbopack)
npm start        # 프로덕션 서버 실행
npm run lint     # ESLint (flat config, eslint-config-next)

npx supabase start     # 로컬 Supabase 스택 기동 (Docker 필요)
npx supabase db reset  # supabase/migrations/*.sql 재적용 (스키마 변경 시)
npx supabase stop      # 로컬 스택 종료
```

테스트 환경은 아직 설정되어 있지 않습니다. 테스트를 도입할 때는 도입 이유와 사용법을 `docs/`에 함께 기록하세요.

## 기술 스택: 현재 vs 계획

**현재 설치됨:** Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Framer Motion, Zustand, web-push, @supabase/supabase-js + @supabase/ssr. 경로 별칭 `@/*` → 저장소 루트. Tailwind v4는 `tailwind.config` 파일 없이 `app/globals.css`의 `@theme inline`으로 테마를 정의합니다.

**PWA 구현됨** (개발 일지 3편 참조): 매니페스트(`app/manifest.ts`), 서비스 워커(`public/sw.js` — `?v=버전-빌드스탬프` 쿼리로 배포마다 강제 갱신), 설치 넛지, 웹 푸시(VAPID — 환경변수 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` 필요, `scripts/generate-vapid-keys.mjs`로 생성), 동적 파비콘. 서비스 워커는 프로덕션 빌드(`npm run build && npm start`)에서만 등록됩니다. 앱 버전은 `package.json` version을 `next.config.ts`가 빌드 시 구워 넣습니다.

**Supabase 구현됨** (개발 일지 4편, `supabase/README.md` 참조): 익명 인증(쿠키 세션, `@supabase/ssr`), 스키마·RLS·정산 함수는 `supabase/migrations/`가 단일 진실. 환경변수 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` — **없으면 게임은 localStorage만 쓰는 로컬 모드로 폴백**합니다. 핵심 설계: 게임 규칙(오프라인 정산 `settle_offline()`, 스냅샷 저장 `sync_pet()`)은 Postgres 함수(security definer) 안에 있고, `pets` 테이블엔 update grant가 없어 직접 수정 치트가 차단됩니다. 시간 계산은 전부 DB `now()` 기준. 클라이언트 통합은 `components/pet-link.tsx`(부팅 정산·30초 동기화)와 `app/actions/pet.ts`. 익명 로그인은 클라우드 프로젝트에서 Anonymous sign-ins를 켜야 동작합니다.

**기획상 필요하지만 아직 미설치** — 해당 기능을 구현하는 시점에 추가하세요:

- **React Three Fiber (R3F) + Drei** — 로우폴리 3D 위성/우주 배경 렌더링
- **Supabase Edge Functions + cron** — 푸시 구독 DB 저장, 펫 상태 기반 알림 자동 발송
- 배포 대상: **Vercel**

## 핵심 게임 시스템 (기획 요약)

- **3대 상태 지표:** 배터리(포만감 — 오프라인 소모, 고갈 시 절전 모드, 사망 없음, 태양광 패널 스와이프로 충전), 내구도(건강 — 파편 충돌로 감소, 드래그(쓰다듬기)로 수리, 하한선 30%), 데이터 용량(스트레스/배변 — 청소 시 증가, 꽉 차면 수집 효율 50% 감소, 기지국 전송으로 비움).
- **방치형 루프:** 오프라인에도 위성이 궤도를 돌며 자동 수집. 접속 시 `last_login_at`과 현재 시간 차이로 보상 일괄 지급. 장기 방치 시 '시무룩 → 절전 모드 → 동면' 단계 (사망 없음).
- **액션 모드:** 세로 화면(Portrait), 엄지 하나로 플레이. 제스처 3종 — Tap(냠냠/레이저), Hold & Release(기지개/로봇 팔 조준·발사), Drag(쓰다듬기 수리/끌어오기·회피).
- **Supabase 스키마 기본:** `users`(프로필, `last_login_at`), `pets`(level 1~3, battery, durability, data_capacity, exp, status), `inventory`, `offline_logs`.

## 개발 원칙 (기획서 준수 사항 — 필수)

1. **모든 UI 텍스트와 코드 주석은 한국어로 작성.**
2. **Mobile-First, 세로 화면 전용 UX.** 터치 이벤트 우선. 가로 스크롤·양손 조작 유도 UI 금지.
3. **3D는 로우폴리만.** 모바일 발열/배터리 소모 방지를 위해 기하구조 최소화.
4. **클라이언트 시간을 절대 신뢰하지 않기.** 오프라인 보상 등 중요한 계산은 반드시 Supabase DB Timestamp 기준. 서버/Edge Function 측 검증 권장 (방치형 게임은 Time-cheat에 취약).
5. **Supabase RLS 엄격 적용.** 유저는 자신의 `pets`/`inventory`만 읽고 수정 가능.
6. **Server Actions vs Supabase Client 분리.** 서버 로직은 Server Actions, 클라이언트 컴포넌트는 Supabase Client로 적절히 구분.
7. **복잡한 로직(오프라인 보상 정산식, 3D 렌더링 등)은 구현 전에 아키텍처를 먼저 간략히 설명.**
8. **온보딩:** 첫 접속 90초 이내에 텍스트 설명 없이 터치 상호작용(부화, 쓰다듬기)만으로 펫과 감정적 교감이 이루어지도록 애니메이션·이펙트에 집중.
9. 시장 분석 문서의 권고: UI/UX 레벨에서 물리학 용어(LEO, MEO, E_r 등)를 유저에게 직접 노출하지 말 것. 친숙한 이름(예: '먼지 덤불 구역')으로 치환하고 시스템은 점진적으로 개방.

## 개발자 성장 멘토링 (중요)

이 프로젝트의 오너는 **파이썬 개발자이며, 이 프로젝트를 통해 능력 있는 프론트엔드 개발자로 성장하는 것이 목표**입니다. 프로젝트의 성공과 개발자의 성장이 함께 가는 프로젝트입니다. Claude는 단순 코드 생성기가 아니라 **함께 일하는 시니어 프론트엔드 멘토**로서 행동하세요:

1. **웹 기술을 적극적으로 가르치기.** 새로운 개념(React 렌더링, Server/Client Component, 상태 관리, CSS 레이아웃, 3D 렌더링 등)이 등장할 때마다 파이썬 개발자의 눈높이에서 설명하세요. 파이썬과의 비유(예: "Server Action은 Flask 라우트 핸들러와 비슷하지만...")를 활용하면 좋습니다.
2. **`docs/` 아래에 학습·개발 문서를 작성하기.** 의미 있는 기능을 구현하거나 중요한 기술 결정을 내릴 때마다 `docs/` 디렉토리에 문서를 남기세요. 문서는 **아주 친절하고, 꼼꼼하고, 재미있게** 작성합니다 — 딱딱한 API 레퍼런스가 아니라, 왜 이렇게 만들었는지, 어떤 개념이 쓰였는지, 파이썬 개발자가 이해할 수 있는 설명과 예시를 담은 개발 일지 스타일로. (이 문서들은 마케팅 전략 문서에서 권장하는 Devlog 자산도 겸합니다.)
3. **커밋을 학습 단위로 나누기.** 중간중간 의미 있는 단위로 커밋하고, 커밋 메시지는 한국어로 "무엇을, 왜" 했는지 알 수 있게 작성하세요. 커밋 히스토리 자체가 학습 기록이 되도록 합니다.
4. **코드 리뷰 관점 공유하기.** 코드를 작성한 뒤 "여기서 배울 포인트"를 짚어주고, 더 나은 패턴이나 흔한 실수를 함께 설명하세요.
