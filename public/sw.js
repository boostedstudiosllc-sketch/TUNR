// Deliberately minimal: network-first, with the cache used only as an offline
// fallback for navigations. A precaching service worker on a Vercel app is a
// good way to serve a stale bundle for days after a deploy, and the point here
// is installability, not offline support.

const CACHE = "tunr-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep the latest good shell around for the offline case only.
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put("/", copy));
        return response;
      })
      .catch(() => caches.match("/").then((cached) => cached || Response.error()))
  );
});
