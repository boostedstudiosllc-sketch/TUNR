// TUNR's service worker: offline play, and alerts.
//
// The page (index.html) is always fetched from the network first, so a new
// deploy shows up straight away; the last good copy is kept only for when
// the phone is offline. Everything else a build makes has a new name each
// deploy (/assets/index-AbC123.js), so it's safe to keep: the page asks us
// to keep every file listed in /precache.json (written by vite.config.js),
// and files from older builds are deleted. That's what lets the single-
// player games, the parked-car card and saved meets work with no signal.

const SHELL = "tunr-shell-v3";
const ASSETS = "tunr-assets-v1";
const FONTS = "tunr-fonts-v1";
const KEEP = [SHELL, ASSETS, FONTS];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => syncAssets())
  );
});

// Keep this build's files; drop older builds' files.
let syncing = null;
function syncAssets() {
  syncing ||= (async () => {
    try {
      const res = await fetch("/precache.json", { cache: "no-store" });
      if (!res.ok) return;
      // The page too: on a first visit it loaded before we were running.
      try {
        const page = await fetch("/", { cache: "no-store" });
        if (page.ok) await (await caches.open(SHELL)).put("/", page);
      } catch (e) {
        // Offline: keep the copy we have.
      }
      const { files = [] } = await res.json();
      const cache = await caches.open(ASSETS);
      const want = new Set(files.map((f) => new URL(f, self.location.origin).href));
      for (const req of await cache.keys()) if (!want.has(req.url)) await cache.delete(req);
      const have = new Set((await cache.keys()).map((r) => r.url));
      for (const url of want) {
        if (have.has(url)) continue;
        try {
          const r = await fetch(url, { cache: "no-cache" });
          if (r.ok) await cache.put(url, r);
        } catch (e) {
          // Offline or a blip: the next visit tries again.
        }
      }
    } catch (e) {
      // No list (local dev, or offline): nothing to do.
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "precache") event.waitUntil?.(syncAssets());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // The page: network first, the last good copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/", { cacheName: SHELL, ignoreVary: true }).then((cached) => cached || Response.error()))
    );
    return;
  }

  // This build's files: from the phone if we have them, else the network.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/game/") || /\.(png|webp|webmanifest)$/.test(url.pathname))) {
    event.respondWith(
      caches.open(ASSETS).then((cache) =>
        // By address only: the server's Vary header would otherwise make a
        // page's request miss the copy we fetched ourselves.
        cache.match(request.url, { ignoreVary: true }).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
        )
      )
    );
    return;
  }

  // Google Fonts: the saved copy straight away, refreshed in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONTS).then((cache) =>
        cache.match(request, { ignoreVary: true }).then((hit) => {
          const fresh = fetch(request)
            .then((response) => {
              if (response.ok || response.type === "opaque") cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit || Response.error());
          return hit || fresh;
        })
      )
    );
  }
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
