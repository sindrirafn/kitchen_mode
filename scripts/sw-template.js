/* Only app files are cached here. IndexedDB and localStorage are never touched. */
const base = new URL("./", self.location.href);
const PREFIX = "kitchen-mode-shell-" + encodeURIComponent(base.pathname) + "-";
const VERSION = "__VERSION__";
const CACHE = PREFIX + VERSION;
const FILES = __PRECACHE__;
const SHELL = new URL("index.html", base).href;
const RECOVERY = new URL("recover.html", base).href;
const fileURLs = new Set(FILES.map((file) => new URL(file, base).href));
const criticalFiles = FILES.filter((file) =>
  /^assets\/.*\.(js|css)$/.test(file),
);

function ownResponse(response) {
  if (
    !response ||
    response.status !== 200 ||
    ["opaque", "opaqueredirect", "error"].includes(response.type)
  )
    return false;
  if (!response.url) return true; // A previously sanitized Response has no URL list.
  const url = new URL(response.url);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname);
}
async function cleanResponse(response, documentType) {
  if (!ownResponse(response))
    throw new Error(
      "App file was unavailable or redirected outside this cookbook.",
    );
  const headers = new Headers(response.headers);
  // Fetch has already decoded the body. These headers must not describe the
  // decoded bytes as compressed, or retain a redirect Location or stale length.
  for (const name of ["content-encoding", "content-length", "location"])
    headers.delete(name);
  let body;
  if (documentType) {
    if (!/\btext\/html\b/i.test(headers.get("content-type") || ""))
      throw new Error("Expected an HTML app document.");
    body = await response.text();
    const marker =
      documentType === "shell"
        ? 'name="kitchen-mode-shell"'
        : 'name="kitchen-mode-recovery"';
    if (!body.includes(marker))
      throw new Error(
        "The host returned a different page instead of Kitchen Mode.",
      );
    if (
      documentType === "shell" &&
      !criticalFiles.every((file) =>
        body.includes(new URL(file, base).pathname),
      )
    )
      throw new Error("The app document and cached build do not match.");
  } else body = await response.arrayBuffer();
  // clone() retains the fetch URL/redirect list. Constructing a new Response
  // intentionally removes it before respondWith(), including on Safari 17.
  return new Response(body, { status: 200, statusText: "OK", headers });
}
async function fetchFile(file) {
  const key = new URL(file, base).href;
  // Cloudflare-style hosts commonly redirect /index.html to /. Fetch the
  // canonical start URL, but use a stable internal cache key for the shell.
  const response = await fetch(file === "index.html" ? base.href : key, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "follow",
  });
  return cleanResponse(
    response,
    file === "index.html"
      ? "shell"
      : file === "recover.html"
        ? "recovery"
        : undefined,
  );
}
async function fillCache(cacheName) {
  const cache = await caches.open(cacheName);
  for (const file of FILES)
    await cache.put(new URL(file, base).href, await fetchFile(file));
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await fillCache(CACHE);
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // A broken old shell cannot run page JS to approve an update. This repair
      // worker takes over after a complete precache, without navigating/reloading
      // any open client or changing its saved cooking revision.
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const previous = (await caches.keys())
          .filter(
            (key) =>
              key.startsWith(PREFIX) &&
              key !== CACHE &&
              !key.endsWith("-repair"),
          )
          .pop();
        for (const key of await caches.keys()) {
          if (!key.startsWith(PREFIX) || key === CACHE) continue;
          if (key === previous) {
            // Retain one prior build's immutable assets for already-open clients,
            // but remove its potentially faulty navigation response.
            const old = await caches.open(key);
            await old.delete(SHELL);
            await old.delete(base.href);
          } else await caches.delete(key);
        }
      } catch {
        /* Cache cleanup must not prevent the repair taking control. */
      }
      await self.clients.claim();
    })(),
  );
});
function unavailable() {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kitchen Mode needs a connection</title><body style="background:#F7F3EB;color:#344B3C;font:18px/1.6 system-ui;padding:40px;max-width:600px;margin:auto"><h1>Let’s reopen your cookbook.</h1><p>Kitchen Mode couldn’t load its app files. Your saved recipes and cooking sessions have not been cleared.</p><p>Connect to the internet, then try opening the app again. If this continues, open the app’s <a href="${RECOVERY}">repair page</a>.</p><form action="${base.href}"><button style="font:inherit;padding:12px 20px">Try again</button></form></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
async function documentResponse(recovery) {
  const key = recovery ? RECOVERY : SHELL;
  const type = recovery ? "recovery" : "shell";
  let cache;
  try {
    cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached) {
      try {
        const clean = await cleanResponse(cached, type);
        // Repair any redirect-bearing response written by an earlier worker or
        // an interrupted installation before using it again.
        if (cached.redirected || cached.url)
          await cache.put(key, clean.clone());
        return clean;
      } catch {
        await cache.delete(key);
      }
    }
  } catch {
    /* Cache storage can be unavailable; still try the network. */
  }
  try {
    const response = await fetchFile(recovery ? "recover.html" : "index.html");
    if (cache)
      try {
        await cache.put(key, response.clone());
      } catch {
        /* Still usable online. */
      }
    return response;
  } catch {
    return unavailable();
  }
}
async function assetResponse(request) {
  try {
    const own = await caches.open(CACHE);
    const cached = await own.match(request);
    if (cached && ownResponse(cached)) return cached;
    // A just-activated worker may serve a still-open client's older JS/CSS.
    if (
      /\/assets\/[^/]+-[\w-]{8,}\.(js|css)$/.test(new URL(request.url).pathname)
    ) {
      for (const key of (await caches.keys())
        .filter(
          (key) =>
            key.startsWith(PREFIX) && key !== CACHE && !key.endsWith("-repair"),
        )
        .reverse()) {
        const older = await (await caches.open(key)).match(request);
        if (older && ownResponse(older)) return older;
      }
    }
  } catch {
    /* Still serve online when Cache Storage is unavailable. */
  }
  return fetch(request);
}
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  if (event.request.mode === "navigate") {
    // Never directly return fetch(event.request): navigation redirect modes can
    // reject a response whose underlying fetch already followed a redirect.
    event.respondWith(
      documentResponse(
        url.pathname === new URL(RECOVERY).pathname ||
          url.pathname === new URL(RECOVERY).pathname.replace(/\.html$/, ""),
      ),
    );
    return;
  }
  if (
    fileURLs.has(url.href) ||
    /\/assets\/[^/]+-[\w-]{8,}\.(js|css)$/.test(url.pathname)
  )
    event.respondWith(assetResponse(event.request));
});
let repairPromise;
async function repairAppFiles() {
  const staging = CACHE + "-repair";
  try {
    await fillCache(staging);
    const staged = await caches.open(staging),
      current = await caches.open(CACHE);
    for (const file of FILES.filter((file) => file !== "index.html")) {
      const key = new URL(file, base).href;
      await current.put(key, await staged.match(key));
    }
    // Commit the shell last, after its matching scripts and photos are ready.
    await current.put(SHELL, await staged.match(SHELL));
  } finally {
    await caches.delete(staging);
  }
}
self.addEventListener("message", (event) => {
  // Only an app-origin client can request a repair. No storage/database reset
  // command exists. Concurrent repair requests share the same staged operation.
  if (!event.source?.url || new URL(event.source.url).origin !== base.origin)
    return;
  if (event.data?.type === "KITCHEN_MODE_STATUS") {
    event.ports[0]?.postMessage({
      ok: true,
      version: VERSION,
      navigationRepair: 2,
    });
  } else if (event.data?.type === "KITCHEN_MODE_REPAIR") {
    if (!repairPromise)
      repairPromise = repairAppFiles().finally(() => {
        repairPromise = undefined;
      });
    event.waitUntil(
      repairPromise
        .then(() => {
          event.ports[0]?.postMessage({
            ok: true,
            version: VERSION,
            navigationRepair: 2,
          });
        })
        .catch(() => {
          event.ports[0]?.postMessage({
            ok: false,
            error:
              "App files could not be downloaded. Keep this page open, check your connection and try again. Your local cookbook has not been cleared.",
          });
        }),
    );
  }
});
