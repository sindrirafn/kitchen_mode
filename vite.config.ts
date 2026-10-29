import { type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
function offline(): Plugin {
  return {
    name: "kitchen-mode-offline",
    closeBundle() {
      const root = resolve("dist");
      const files: string[] = [];
      function walk(dir: string) {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = resolve(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name !== "sw.js") files.push(p.slice(root.length + 1));
        }
      }
      walk(root);
      const version = createHash("sha256")
        .update(files.map((f) => f + readFileSync(resolve(root, f))).join(""))
        .digest("hex")
        .slice(0, 12);
      const template = readFileSync("scripts/sw-template.js", "utf8")
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
