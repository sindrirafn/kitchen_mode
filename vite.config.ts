import { type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
function offline(): Plugin {
  let root = resolve("dist");
  let base = process.env.VITE_BASE_PATH || "/";
  return {
    name: "kitchen-mode-offline",
    configResolved(config) {
      root = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    closeBundle() {
      const workerSource = readFileSync("scripts/sw-template.js", "utf8");
      const recovery = readFileSync(
        resolve(root, "recover.html"),
        "utf8",
      ).replace(/<base href="\/"\s*\/?\s*>/, `<base href="${base}">`);
      writeFileSync(resolve(root, "recover.html"), recovery);
      if (base !== "/") {
        const headers = readFileSync(resolve(root, "_headers"), "utf8").replace(
          /^\/(.*)$/gm,
          (_, path) => base + path,
        );
        writeFileSync(resolve(root, "_headers"), headers);
      }
      const files: string[] = [];
      function walk(dir: string) {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = resolve(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (!["sw.js", "_headers", "_redirects"].includes(e.name))
            files.push(p.slice(root.length + 1));
        }
      }
      walk(root);
      const hash = createHash("sha256").update(workerSource);
      for (const file of files.sort())
        hash.update(file).update(readFileSync(resolve(root, file)));
      const version = hash.digest("hex").slice(0, 12);
      const template = workerSource
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(files));
      writeFileSync(resolve(root, "sw.js"), template);
    },
  };
}
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), offline()],
  build: { target: "safari16", sourcemap: false },
  test: { include: ["tests/**/*.test.ts"] },
});
