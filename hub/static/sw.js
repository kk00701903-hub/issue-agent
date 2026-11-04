/* Agent Hub 서비스 워커: 앱 화면 파일만 저장해 두고, 데이터(/api)는 항상 서버에서 받는다.
   서버가 꺼져 있으면 안내 화면(offline.html)을 보여 준다. */
const VERSION = "ah-1.0.0-rc1h";
const SHELL = ["/", "/static/flow.js", "/static/app.js", "/static/app.css", "/static/office.js", "/static/office2.js", "/static/three.module.min.js", "/static/three-gltf.js", "/static/three-bgu.js", "/static/office-room-v5.png", "/static/office-worker.glb", "/static/offline.html", "/manifest.webmanifest",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // 데이터는 저장하지 않는다(항상 최신)
  if (e.request.mode === "navigate") {
    // 화면: 서버 먼저, 안 되면 안내 화면
    e.respondWith(fetch(e.request).catch(() => caches.match("/static/offline.html")));
    return;
  }
  // 그 밖의 파일: 서버 먼저 받아 저장, 안 되면 저장본
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
