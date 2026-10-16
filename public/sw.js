// Deliberately minimal: network-first, with the cache used only as an offline
// fallback for navigations. A precaching service worker on a Vercel app is a
// good way to serve a stale bundle for days after a deploy, and the point here
// is installability, not offline support.

const CACHE = "tunr-shell-v2";

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

// ---------- alerts ----------
// The server sends { title, body, link }; tapping opens the app on that
// linkup, meet or profile (App.jsx reads ?open=).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "TUNR", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "TUNR";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.link || undefined,
      renotify: Boolean(data.link),
      data: { link: data.link || null },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;
  const url = link ? `/?open=${encodeURIComponent(link)}` : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin) {
          w.postMessage({ type: "open", link });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
