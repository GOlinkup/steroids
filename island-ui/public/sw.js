// Steroids island service worker: app shell offline, API always live.
// Only same-origin dist assets are cached; every /relay /chat /sessions
// /skills /trending /gigs /profile call (and sockets) pass straight through,
// so drops and pairing never serve stale.
// bump this on every shell change or phones keep the old bundle.
const CACHE = "steroids-island-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
const LIVE = ["/relay/", "/chat", "/sessions", "/skills", "/trending", "/gigs", "/profile", "/verify"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}),
  );
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
  if (LIVE.some((p) => u.pathname === p || u.pathname.startsWith(p))) return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        }),
    ),
  );
});
