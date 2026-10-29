import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
// A real dedicated origin whose network can be taken down, without WebKit's
// inspector offline/route interception bypassing its service-worker pipeline.
export async function offlineServer() {
  const root = resolve("dist");
  let offline = false;
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
    if (offline) {
      res.destroy();
      return;
    }
    try {
      const url = new URL(req.url!, "http://localhost");
      let path = resolve(root, "." + decodeURIComponent(url.pathname));
      if (!path.startsWith(root)) throw new Error();
      if (statSync(path).isDirectory()) path = resolve(path, "index.html");
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
    throw new Error("No test server address");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    disconnect() {
      offline = true;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
