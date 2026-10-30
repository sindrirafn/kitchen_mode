/* Generated at build time. This worker only caches this cookbook's own app files. */
const base = new URL("./", self.location.href);
const PREFIX = "kitchen-mode-shell-" + encodeURIComponent(base.pathname) + "-";
const CACHE = PREFIX + "__VERSION__";
const FILES = __PRECACHE__;
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new URL(f, base).href))),
  );
  // A new version waits for the old app to close. Never reload an active cooking session.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(new URL("index.html", base).href))
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }
  if (!FILES.some((f) => new URL(f, base).href === url.href)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(event.request))
      .then((cached) => cached || fetch(event.request)),
  );
});
