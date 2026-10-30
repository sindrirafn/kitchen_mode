import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { workerServer } from "./worker-server";
const recipe = JSON.parse(
  readFileSync("recipes/smoky-tomato-bean-skillet.json", "utf8"),
);
async function controlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("kitchen-mode-v1");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = await Promise.all(
      Array.from(db.objectStoreNames).map(async (name) => {
        const tx = db.transaction(name, "readonly");
        const read = (req: IDBRequest) =>
          new Promise<any>((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        const [keys, values] = await Promise.all([
          read(tx.objectStore(name).getAllKeys()),
          read(tx.objectStore(name).getAll()),
        ]);
        return [name, { keys, values }];
      }),
    );
    db.close();
    return {
      database: Object.fromEntries(stores),
      local: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((k) => [k, localStorage.getItem(k)]),
      ),
    };
  });
}
async function workerStatus(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ version: string; navigationRepair: number }>(
        (resolve, reject) => {
          const channel = new MessageChannel(),
            timeout = setTimeout(() => {
              channel.port1.close();
              reject(new Error("Worker did not report repair status"));
            }, 1500);
          channel.port1.onmessage = (e) => {
            clearTimeout(timeout);
            channel.port1.close();
            resolve(e.data);
          };
          navigator.serviceWorker.controller?.postMessage(
            { type: "KITCHEN_MODE_STATUS" },
            [channel.port2],
          );
        },
      ),
  );
}
async function cacheKey(page: Page) {
  const { version } = await workerStatus(page);
  const base = await page.evaluate(
    () => new URL("./", navigator.serviceWorker.controller!.scriptURL).pathname,
  );
  return `kitchen-mode-shell-${encodeURIComponent(base)}-${version}`;
}
async function seed(page: Page) {
  await expect(page.locator(".recipe-card")).toHaveCount(6);
  await controlled(page);
  await page
    .getByRole("button", { name: "Import Recipe", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Recipe or cookbook JSON", exact: true })
    .fill(
      JSON.stringify({
        ...recipe,
        revision: 2,
        identity: { title: "Our saved skillet" },
      }),
    );
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await page
    .locator(".recipe-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Our saved skillet",
        exact: true,
      }),
    })
    .click();
  await page
    .getByRole("button", { name: "Start Preparing", exact: true })
    .click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await page
    .getByRole("button", { name: /Start .* timer/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).length))
    .toBe(0);
}
async function assertResumed(page: Page) {
  await expect(page.locator(".stage-panel h1")).toHaveText(
    recipe.cooking[1].title,
  );
  await expect(page.locator(".cooking-heading")).toContainText(
    "Our saved skillet",
  );
}

test("canonical redirects produce clean cached HTML and open offline", async ({
  page,
}) => {
  const origin = await workerServer();
  origin.redirectRoot();
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page);
    const key = await cacheKey(page);
    const cached = await page.evaluate(async (key) => {
      const r = await (
        await caches.open(key)
      ).match(new URL("index.html", location.origin).href);
      return { redirected: r?.redirected, url: r?.url, status: r?.status };
    }, key);
    expect(cached).toEqual({ redirected: false, url: "", status: 200 });
    expect(origin.requests.filter((p) => p === "/index.html")).toHaveLength(0);
    origin.disconnect();
    await page.reload();
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
  } finally {
    await page.close();
    await origin.close();
  }
});

test("an existing legacy installation with redirect-bearing HTML upgrades without a reload or local-data loss", async ({
  page,
  context,
}) => {
  const origin = await workerServer();
  origin.version("legacy");
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page);
    expect(
      await page.evaluate(async () => {
        const r = await (
          await caches.open("kitchen-mode-shell-%2F-legacy")
        ).match(new URL("/index.html", location.origin).href);
        return r?.redirected;
      }),
    ).toBe(true);
    await page.evaluate(async () => {
      const cache = await caches.open("unrelated-application-cache");
      await cache.put("/unrelated-sentinel", new Response("keep me"));
    });
    // This navigation uses the actual faulty legacy response. Older Safari rejects
    // it; newer engines may accept it. Either way the installation stays intact.
    const blocked = await context.newPage();
    await blocked.goto(origin.url).catch(() => {});
    origin.version("current");
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r!.update();
    });
    await expect
      .poll(
        async () => {
          try {
            return (await workerStatus(page)).navigationRepair;
          } catch {
            return 0;
          }
        },
        { timeout: 15000 },
      )
      .toBe(2);
    // skipWaiting + claim replaced the legacy worker while this cooking client
    // remained open. Neither activation nor cache cleanup reloads the page.
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
    expect(
      await page.evaluate(async () => {
        const r = await (
          await caches.open("unrelated-application-cache")
        ).match("/unrelated-sentinel");
        return r?.text();
      }),
    ).toBe("keep me");
    await blocked.goto(origin.url);
    await assertResumed(blocked);
    expect(await snapshot(blocked)).toEqual(saved);
    origin.disconnect();
    await blocked.reload();
    await assertResumed(blocked);
    expect(await snapshot(blocked)).toEqual(saved);
    await blocked.close();
  } finally {
    await page.close();
    await origin.close();
  }
});

test("redirect-bearing, missing and invalid cached navigation responses self-heal safely", async ({
  page,
}) => {
  const origin = await workerServer();
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page),
      key = await cacheKey(page);
    await page.evaluate(async (key) => {
      const response = await fetch("/redirect-shell");
      if (!response.redirected) throw new Error("Fixture did not redirect");
      await (await caches.open(key)).put("/index.html", response);
    }, key);
    origin.disconnect();
    await page.reload();
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
    expect(
      await page.evaluate(
        async (key) =>
          (await (await caches.open(key)).match("/index.html"))?.redirected,
        key,
      ),
    ).toBe(false);
    origin.connect();
    await page.evaluate(
      async (key) => (await caches.open(key)).delete("/index.html"),
      key,
    );
    await page.reload();
    await assertResumed(page);
    await page.evaluate(async (key) => {
      const bad = await fetch("/invalid.html");
      await (await caches.open(key)).put("/index.html", bad);
    }, key);
    await page.reload();
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
  } finally {
    await page.close();
    await origin.close();
  }
});

test("the repair page rebuilds only app caches and preserves all local cookbook data", async ({
  page,
}) => {
  const origin = await workerServer();
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page);
    await page.goto(new URL("recover.html", origin.url).href);
    await expect(
      page.getByRole("heading", { name: "Let’s reopen your cookbook." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Repair app files", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "App files repaired.",
      { timeout: 20000 },
    );
    expect(await snapshot(page)).toEqual(saved);
    await page
      .getByRole("link", { name: "Back to Kitchen Mode", exact: true })
      .click();
    await assertResumed(page);
    origin.disconnect();
    await page.reload();
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
  } finally {
    await page.close();
    await origin.close();
  }
});

test("a failed repair keeps the working offline build; absent app files show a safe retry page", async ({
  page,
}) => {
  const origin = await workerServer();
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page),
      key = await cacheKey(page);
    await page.goto(new URL("recover.html", origin.url).href);
    origin.failFile(origin.files.find((file) => file.endsWith(".webp"))!);
    await page
      .getByRole("button", { name: "Repair app files", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "App files could not be downloaded.",
      { timeout: 20000 },
    );
    expect(await snapshot(page)).toEqual(saved);
    origin.disconnect();
    await page
      .getByRole("link", { name: "Back to Kitchen Mode", exact: true })
      .click();
    await assertResumed(page);
    await page.evaluate(
      async (key) => (await caches.open(key)).delete("/index.html"),
      key,
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Let’s reopen your cookbook." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    expect(await snapshot(page)).toEqual(saved);
  } finally {
    await page.close();
    await origin.close();
  }
});

test("closing and reopening a legacy installation picks up the repair without clearing data", async ({
  page,
  context,
}) => {
  const origin = await workerServer();
  origin.version("legacy");
  try {
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page);
    await page.close();
    origin.version("current");
    const reopened = await context.newPage();
    await expect
      .poll(
        async () => {
          try {
            await reopened.goto(origin.url, { timeout: 2500 });
            await controlled(reopened);
            return (await workerStatus(reopened)).navigationRepair;
          } catch {
            return 0;
          }
        },
        { timeout: 20000, intervals: [500, 1000, 1500] },
      )
      .toBe(2);
    await reopened.reload();
    await assertResumed(reopened);
    expect(await snapshot(reopened)).toEqual(saved);
    await reopened.close();
  } finally {
    await page.close();
    await origin.close();
  }
});

test("subdirectory builds retain their worker scope and recovery link offline", async ({
  page,
}) => {
  const directory = mkdtempSync(join(tmpdir(), "kitchen-worker-subpath-"));
  let origin: Awaited<ReturnType<typeof workerServer>> | undefined;
  try {
    execFileSync(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--base",
        "/kitchen-mode/",
        "--outDir",
        directory,
      ],
      { stdio: "pipe" },
    );
    origin = await workerServer({ directory, base: "/kitchen-mode/" });
    await page.goto(origin.url);
    await seed(page);
    const saved = await snapshot(page);
    expect(
      await page.evaluate(
        async () =>
          new URL((await navigator.serviceWorker.ready).scope).pathname,
      ),
    ).toBe("/kitchen-mode/");
    const key = await cacheKey(page);
    expect(key).toContain("%2Fkitchen-mode%2F");
    await page.goto(new URL("recover.html", origin.url).href);
    expect(
      await page
        .getByRole("link", { name: "Back to Kitchen Mode", exact: true })
        .getAttribute("href"),
    ).toBe(origin.url);
    await page
      .getByRole("button", { name: "Repair app files", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "App files repaired.",
      { timeout: 20000 },
    );
    origin.disconnect();
    await page
      .getByRole("link", { name: "Back to Kitchen Mode", exact: true })
      .click();
    await assertResumed(page);
    expect(await snapshot(page)).toEqual(saved);
  } finally {
    await page.close();
    await origin?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
