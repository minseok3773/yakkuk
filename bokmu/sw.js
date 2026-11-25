/* 복무상황부 앱 설치용 서비스 워커.
   엣지·크롬이 '설치할 수 있는 앱'으로 알아보려면 fetch 처리기가 있어야 함.
   아무것도 저장(캐시)하지 않고 그대로 인터넷에서 받아 오므로, 고친 내용이 바로 반영됨. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => new Response("인터넷 연결을 확인해 주세요.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}})));
});
