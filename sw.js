/* Fastline service worker.
   Offline-first: once installed, the app always opens from the copy stored on the phone,
   so it keeps working even if the website it came from is password-protected, offline or gone.
   If the site is still online, newer files are fetched quietly in the background.
   When you change any app file, bump VERSION so phones pick up the new copy. */
const VERSION = "fastline-v2";
const APP_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./i18n.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const FONT_CACHE = "fastline-fonts";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Only keep genuine app files: never a login page, error page or redirect. */
async function isGenuine(res, isPage) {
  if (!res || !res.ok || res.redirected || res.type !== "basic") return false;
  const type = res.headers.get("content-type") || "";
  if (isPage) {
    if (!type.includes("text/html")) return false;
    const text = await res.clone().text();
    return text.includes('id="clock"') && text.includes("app.js");
  }
  return !type.includes("text/html");
}

function refresh(req, cacheKey, isPage) {
  return fetch(req, { cache: "no-store" })
    .then(async res => {
      if (await isGenuine(res, isPage)) {
        const cache = await caches.open(VERSION);
        await cache.put(cacheKey, res.clone());
      }
      return res;
    })
    .catch(() => null);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: keep a copy after the first load so the app looks right offline.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Opening the app: always show the stored copy; check for a newer one in the background.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then(hit => {
        const update = refresh(req, "./index.html", true);
        if (hit) { event.waitUntil(update); return hit; }
        return update.then(res => res || new Response("Fastline is offline and not yet stored on this device.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }));
      })
    );
    return;
  }

  // App files (scripts, icons): stored copy first, refreshed in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const update = refresh(req, req, false);
      if (hit) { event.waitUntil(update); return hit; }
      return update.then(res => res || Response.error());
    })
  );
});
