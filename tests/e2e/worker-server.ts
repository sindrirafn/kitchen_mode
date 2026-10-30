import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
export async function workerServer(
  options: { directory?: string; base?: string } = {},
) {
  const base = options.base ?? "/";
  const root = resolve(options.directory ?? "dist"),
    current = readFileSync(resolve(root, "sw.js"), "utf8");
  const files = JSON.parse(
    current.match(/const FILES = (\[[\s\S]*?\]);/)![1],
  ) as string[];
  const legacy = readFileSync("tests/fixtures/legacy-sw.js", "utf8")
    .replace("__VERSION__", "legacy")
    .replace("__PRECACHE__", JSON.stringify(files));
  let version: "legacy" | "current" = "current",
    offline = false,
    rootRedirect = false,
    brokenFile = "";
  const requests: string[] = [];
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer((req, res) => {
    const requested = new URL(req.url!, "http://localhost").pathname;
    if (!requested.startsWith(base)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const pathname = "/" + requested.slice(base.length);
    requests.push(pathname);
    if (offline) {
      res.destroy();
      return;
    }
    if (pathname === "/sw.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      });
      res.end(version === "legacy" ? legacy : current);
      return;
    }
    if (pathname === "/index.html") {
      res.writeHead(302, { Location: base });
      res.end();
      return;
    }
    if (pathname === "/" && rootRedirect) {
      res.writeHead(302, { Location: base + "shell/" });
      res.end();
      return;
    }
    if (pathname === "/redirect-shell") {
      res.writeHead(302, { Location: base + "shell/" });
      res.end();
      return;
    }
    if (pathname === "/invalid.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>A different site page</h1>");
      return;
    }
    try {
      let path = resolve(root, "." + decodeURIComponent(pathname));
      if (!path.startsWith(root + "/") && path !== root) throw new Error();
      if (pathname === "/shell/") path = resolve(root, "index.html");
      if (statSync(path).isDirectory()) path = resolve(path, "index.html");
      if (brokenFile && path.endsWith(brokenFile)) {
        res.writeHead(503);
        res.end("Temporarily unavailable");
        return;
      }
      res.writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(path));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No test origin");
  return {
    url: `http://127.0.0.1:${address.port}${base}`,
    files,
    requests,
    version(value: typeof version) {
      version = value;
    },
    redirectRoot() {
      rootRedirect = true;
    },
    disconnect() {
      offline = true;
    },
    connect() {
      offline = false;
    },
    failFile(file: string) {
      brokenFile = file;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
