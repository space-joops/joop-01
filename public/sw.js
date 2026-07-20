/*
 * 줍스(JOOPS) 서비스 워커 — 브라우저와 네트워크 사이에 상주하는 프록시.
 *
 * 파이썬으로 비유하면 "요청을 가로채는 미들웨어 데몬"이다.
 * 페이지와 별개의 스레드에서 살아 있으면서 fetch(네트워크 요청)를 가로채
 * 캐시로 응답하거나, 백그라운드에서 푸시 알림을 받는다.
 *
 * ── 배포 반영 전략 ──────────────────────────────
 * 이 파일은 /sw.js?v=<버전>-<빌드스탬프> 형태로 등록된다.
 * 배포(빌드)할 때마다 쿼리가 달라지므로 브라우저는 "다른 파일"로 보고
 * 반드시 새 워커를 설치한다. 캐시 이름에도 이 버전을 넣어,
 * 새 워커가 활성화되는 순간 이전 배포의 캐시를 전부 청소한다.
 */

// 등록 URL의 ?v= 값이 곧 이 워커의 버전이다 (예: "0.1.0-abc123")
const VERSION =
  new URL(self.location.href).searchParams.get("v") ?? "dev";
const CACHE_NAME = `joops-${VERSION}`;

/** 설치 직후 미리 캐시해 둘 파일들 — 오프라인에서도 게임이 열리는 최소 세트 */
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ── 설치: 앱 셸 미리 캐시 ────────────────────── */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // 미리 캐시가 일부 실패해도 설치 자체는 막지 않는다 (런타임 캐시가 보완)
      .catch(() => undefined),
  );
});

/* ── 활성화: 이전 배포의 캐시 청소 ─────────────── */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("joops-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      // 새로 활성화된 워커가 이미 열려 있는 탭들도 즉시 관리하게 한다
      await self.clients.claim();
    })(),
  );
});

/* ── 페이지가 보내는 메시지 처리 ─────────────────
 * "SKIP_WAITING": 업데이트 토스트에서 유저가 [업데이트]를 눌렀을 때.
 * 대기 중(waiting)인 새 워커를 즉시 활성화시킨다.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ── fetch 가로채기: 캐시 전략 ──────────────────
 * 1. 페이지 이동(HTML): 네트워크 우선 → 실패 시 캐시 → 그래도 없으면 오프라인 페이지.
 *    항상 최신 배포를 보여주기 위해 HTML은 절대 캐시를 먼저 쓰지 않는다.
 * 2. /_next/static/: 캐시 우선. 파일 이름에 내용 해시가 박혀 있어
 *    내용이 바뀌면 이름도 바뀌므로, 한 번 캐시하면 영원히 안전하다.
 * 3. 그 외 같은 출처 GET(아이콘 등): stale-while-revalidate —
 *    캐시로 즉시 응답하고, 뒤에서 새 버전을 받아 다음을 위해 갱신.
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. 페이지 이동 요청 (주소창 이동, 새로고침)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // 성공한 페이지는 복사본을 캐시에 넣어 오프라인 대비
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const home = await caches.match("/");
          if (home) return home;
          return (
            (await caches.match("/offline.html")) ??
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // 2. 해시 붙은 빌드 산출물 — 캐시 우선
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
    return;
  }

  // 3. 그 외 정적 자원 — stale-while-revalidate
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);
      return cached ?? (await refresh) ?? Response.error();
    })(),
  );
});

/* ── 푸시 알림 수신 ─────────────────────────────
 * 서버(web-push)가 보낸 페이로드는 JSON 문자열:
 * { title, body, tag, url }
 * tag가 같은 알림은 서로 교체된다 — "배터리 부족" 알림이 쌓여서
 * 유저를 괴롭히는 일을 막는다.
 */
self.addEventListener("push", (event) => {
  let payload = {
    title: "줍스 (JOOPS)",
    body: "줍이가 관제 콘솔에서 기다리고 있어요!",
    tag: "joops-general",
    url: "/",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // JSON이 아니면 기본 문구 사용
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

/* ── 알림 클릭: 이미 열린 탭이 있으면 포커스, 없으면 새로 연다 ── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
