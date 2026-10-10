// Steroids island service worker: fresh shell, offline-tolerant, API always live.
// Shell (navigations, /, /index.html) is NETWORK-FIRST: a stale shell can never
// stick again, and installs can't be poisoned by the previous worker's cache.
// Hashed /assets/* are immutable filenames, safe to serve cache-first.
// Bump CACHE on every shell-affecting change; old caches self-delete on activate.
const CACHE = "steroids-island-v8";
// Every live JSON poll rides the network, never the cache: a cached
// /health froze installs at Installing… (and stale /turn + /sessions +
// /shots froze live views the same way). Images under /shots-file/ keep
// the browser HTTP cache — this list only bypasses the worker cache.
const LIVE = ["/relay/", "/chat", "/health", "/turn", "/sessions", "/skills", "/trending", "/gigs", "/profile", "/verify", "/pending", "/usage", "/quota", "/energy", "/echo", "/display", "/fleet", "/battery", "/shots", "/soundpacks", "/hand", "/upload", "/install", "/decide", "/focus", "/agent-sessions", "/nowplaying", "/np-art", "/playercmd"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  // Home data (last-good work/usage/shots + session progress): network-first
  // with cache fallback, so home loads offline. Checked BEFORE LIVE because
  // exact /shots is otherwise network-only. localStorage mirrors this in Daily.
  if (u.pathname === "/shots" || u.pathname === "/session" || u.pathname.startsWith("/api/daily/")) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(e.request)),
    );
    return;
  }
  if (LIVE.some((p) => u.pathname === p || u.pathname.startsWith(p))) return;
  if (e.request.mode === "navigate" || u.pathname === "/" || u.pathname === "/index.html") {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        }),
    ),
  );
});
