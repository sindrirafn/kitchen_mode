import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const base = "https://cookbook.test/kitchen/";
const html =
  '<meta name="kitchen-mode-shell" content="1"><script src="/kitchen/assets/index-testhash.js"></script>';
const recovery = '<meta name="kitchen-mode-recovery" content="1">';
const files = ["index.html", "recover.html", "assets/index-testhash.js"];
function documentResponse(body = html) {
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
function harness() {
  const listeners = new Map<string, (event: any) => void>(),
    data = new Map<string, Map<string, Response>>();
  const caches = {
    async open(name: string) {
      if (!data.has(name)) data.set(name, new Map());
      const entries = data.get(name)!;
      return {
        async match(key: string | Request) {
          return entries.get(typeof key === "string" ? key : key.url)?.clone();
        },
        async put(key: string | Request, response: Response) {
          entries.set(
            typeof key === "string" ? key : key.url,
            response.clone(),
          );
        },
        async delete(key: string) {
          return entries.delete(key);
        },
      };
    },
    async keys() {
      return [...data.keys()];
    },
    async delete(name: string) {
      return data.delete(name);
    },
  };
  const fetch = vi.fn(async (input: string | Request) => {
    const url = typeof input === "string" ? input : input.url;
    return url.endsWith("recover.html")
      ? documentResponse(recovery)
      : url === base
        ? documentResponse()
        : new Response("export {};");
  });
  const worker: any = {
    URL,
    Request,
    Response,
    Headers,
    fetch,
    caches,
    Set,
    console,
    self: {
      location: { href: base + "sw.js" },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
      addEventListener: (type: string, handler: (event: any) => void) =>
        listeners.set(type, handler),
    },
  };
  runInNewContext(
    readFileSync("scripts/sw-template.js", "utf8")
      .replace("__VERSION__", "unit-repair")
      .replace("__PRECACHE__", JSON.stringify(files)),
    worker,
  );
  return {
    worker,
    caches,
    fetch,
    listeners,
    key: "kitchen-mode-shell-%2Fkitchen%2F-unit-repair",
  };
}
describe("redirect-safe service worker documents", () => {
  it("reconstructs redirect-bearing HTML without redirect metadata or decoded-body headers", async () => {
    const { worker } = harness();
    const response = documentResponse();
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: base + "landing/" },
    });
    response.headers.set("Content-Encoding", "gzip");
    response.headers.set("Content-Length", "9999");
    response.headers.set("Location", "/elsewhere");
    const clean = await worker.cleanResponse(response, "shell");
    expect(clean.redirected).toBe(false);
    expect(clean.url).toBe("");
    expect(clean.status).toBe(200);
    expect(await clean.text()).toBe(html);
    for (const header of ["Content-Encoding", "Content-Length", "Location"])
      expect(clean.headers.has(header)).toBe(false);
  });
  it("rejects foreign, opaque, non-HTML and mismatched app documents instead of caching them", async () => {
    const { worker } = harness();
    const foreign = documentResponse();
    Object.defineProperty(foreign, "url", {
      value: "https://another-origin.test/login",
    });
    for (const response of [
      foreign,
      Response.error(),
      Response.redirect(base, 302),
      new Response("{}", { headers: { "Content-Type": "application/json" } }),
      documentResponse("<h1>Sign in</h1>"),
      documentResponse(
        '<meta name="kitchen-mode-shell"><script src="/other-build.js"></script>',
      ),
    ])
      await expect(worker.cleanResponse(response, "shell")).rejects.toThrow();
  });
  it("serves and rewrites a redirected cached shell without requiring a network request", async () => {
    const { worker, caches, fetch, key } = harness(),
      cached = documentResponse();
    // Preserve metadata on this mock cache match, as a real Cache API does.
    Object.defineProperties(cached, {
      redirected: { value: true },
      url: { value: base + "landing/" },
    });
    const cache = await caches.open(key);
    await cache.put(base + "index.html", cached);
    const open = vi
      .spyOn(caches, "open")
      .mockResolvedValue({ ...cache, match: async () => cached });
    const result = await worker.documentResponse(false);
    expect(await result.text()).toBe(html);
    expect(result.redirected).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    open.mockRestore();
    expect((await cache.match(base + "index.html"))?.url).toBe("");
  });
  it("falls back to a safe local retry document when both cache and network are unusable", async () => {
    const { worker, caches, fetch, key } = harness();
    await (
      await caches.open(key)
    ).put(base + "index.html", documentResponse("<h1>A stale login page</h1>"));
    fetch.mockRejectedValue(new Error("Offline"));
    const result = await worker.documentResponse(false);
    expect(result.status).toBe(503);
    expect(result.redirected).toBe(false);
    expect(await result.text()).toContain(
      "Your saved recipes and cooking sessions have not been cleared.",
    );
    expect(
      await (await caches.open(key)).match(base + "index.html"),
    ).toBeUndefined();
  });
  it("keeps the prior working shell when a staged repair cannot download a required file", async () => {
    const { worker, caches, fetch, key } = harness();
    await (await caches.open(key)).put(base + "index.html", documentResponse());
    fetch.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.endsWith(".js")) throw new Error("Offline");
      return documentResponse(url.endsWith("recover.html") ? recovery : html);
    });
    await expect(worker.repairAppFiles()).rejects.toThrow();
    expect(
      await (await (await caches.open(key)).match(base + "index.html"))!.text(),
    ).toBe(html);
    expect(await caches.keys()).not.toContain(key + "-repair");
  });
  it("can serve assets online when Cache Storage is unavailable", async () => {
    const { worker, caches, fetch } = harness();
    vi.spyOn(caches, "open").mockRejectedValue(
      new Error("Storage unavailable"),
    );
    const request = new Request(base + "assets/index-testhash.js");
    const response = await worker.assetResponse(request);
    expect(fetch).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
  });
});
