import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { offlineServer } from "./offline-server";
import type { Recipe, Session } from "../../src/model";
import { quantity, gatheringGroups } from "../../src/model";
const recipes: Recipe[] = readdirSync("recipes")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`recipes/${f}`, "utf8")));
const skillet = recipes.find((r) => r.id === "smoky-tomato-bean-skillet")!;
async function ready(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.locator(".recipe-card")).toHaveCount(6);
}
async function openRecipe(page: Page, r = skillet) {
  await page
    .locator(".recipe-card")
    .filter({
      has: page.getByRole("heading", { name: r.identity.title, exact: true }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: r.identity.title, exact: true }),
  ).toBeVisible();
}
async function start(page: Page, r = skillet, gatherOnly = false) {
  await openRecipe(page, r);
  await page
    .getByRole("button", { name: "Gather ingredients", exact: true })
    .click();
  await expect(page.locator(".gathering h1")).toHaveText(
    "Everything in its place.",
  );
  if (gatherOnly) return;
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "First, a little preparation." }),
  ).toBeVisible();
}
async function store<T>(page: Page, name: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open("kitchen-mode-v1");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(name, "readonly"),
            get = tx.objectStore(name).getAll();
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
          get.onerror = () => reject(get.error);
        };
      }),
    name,
  );
}
async function importReview(page: Page, value: unknown) {
  await page
    .getByRole("button", { name: "Import Recipe", exact: true })
    .click();
  await page
    .getByLabel("Recipe or cookbook JSON", { exact: true })
    .fill(typeof value === "string" ? value : JSON.stringify(value));
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
}
async function leave(page: Page) {
  await page.getByRole("button", { name: "Exit recipe", exact: true }).click();
  await page.getByRole("button", { name: "Save & Exit", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "The recipe collection" }),
  ).toBeVisible();
}
test("gathering resumes ingredient and equipment checks independently of preparation, without gating navigation", async ({
  page,
}) => {
  await ready(page);
  await start(page, skillet, true);
  const ingredientId = `ingredient:${skillet.ingredients[0].id}`;
  const equipmentId = gatheringGroups(skillet).at(-1)!.items[0].id;
  const total = gatheringGroups(skillet).flatMap((g) => g.items).length;
  await page.locator(`input[id="${ingredientId}"]`).check();
  await page.locator(`input[id="${equipmentId}"]`).check();
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    `2 of ${total} items gathered`,
  );
  await expect(page.locator(`input[id="${equipmentId}"]`)).toBeChecked();
  await leave(page);
  await page.reload();
  await expect(page.locator(".resume-banner")).toContainText("Gathering");
  await openRecipe(page);
  await page
    .getByRole("button", { name: "Resume gathering", exact: true })
    .click();
  await expect(page.locator(`input[id="${ingredientId}"]`)).toBeChecked();
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Ingredients", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".ingredient-list"),
  ).toContainText(skillet.ingredients[0].name);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await page
    .getByRole("button", { name: /Start .* timer/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Preparation", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Back to gathering", exact: true })
    .click();
  await expect(page.locator(`input[id="${ingredientId}"]`)).toBeChecked();
  await expect(page.locator(`input[id="${equipmentId}"]`)).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Pause .* timer/ }).first(),
  ).toBeVisible();
  await page.locator(`input[id="${ingredientId}"]`).uncheck();
  await page.reload();
  await expect(page.locator(`input[id="${ingredientId}"]`)).not.toBeChecked();
  await expect(page.getByRole("status")).toContainText(
    `1 of ${total} items gathered`,
  );
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
});

test("legacy sessions and imported UTF-8 files repair known mojibake while preserving Icelandic and quantities", async ({
  page,
}) => {
  await ready(page);
  const recipe = structuredClone(skillet);
  recipe.identity.title = "Þorskur með smjöri Â½";
  recipe.preparation[0].items[0].text =
    "Preheat to 220Â°C; use Â½ tsp and Â¼ tsp. Þorskur með smjöri.";
  recipe.ingredients[0].quantity = { text: "Â½ tsp" };
  await page.evaluate(async (recipe) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = indexedDB.open("kitchen-mode-v1");
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction(["recipes", "sessions", "meta"], "readwrite");
    const now = Date.now();
    tx.objectStore("recipes").put({ id: recipe.id, recipe, updatedAt: now });
    tx.objectStore("sessions").put({
      id: "legacy-session",
      recipeId: recipe.id,
      recipeSnapshot: recipe,
      phase: "preparation",
      currentStepId: recipe.cooking[0].id,
      checkedIds: [recipe.preparation[0].items[0].id],
      timers: {},
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    });
    tx.objectStore("meta").put("legacy-session", "activeSessionId");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, recipe);
  await page.reload();
  await expect(page.locator(".preparation h1")).toHaveText(
    "First, a little preparation.",
  );
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.locator(".prep-tasks").first()).toContainText(
    "Preheat to 220°C; use ½ tsp and ¼ tsp. Þorskur með smjöri.",
  );
  await page
    .getByRole("button", { name: "Back to gathering", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("0 of");
  await expect(
    page.locator(".gather-item").filter({
      has: page.locator(`input[id="ingredient:${recipe.ingredients[0].id}"]`),
    }),
  ).toContainText("½ tsp");
  await leave(page);
  await page
    .getByRole("button", { name: "Import Recipe", exact: true })
    .click();
  const imported = {
    ...recipe,
    id: "icelandic-import",
    identity: { title: "Innfluttur þorskur Â½" },
  };
  await page
    .getByLabel("Open recipe or cookbook JSON file", { exact: true })
    .setInputFiles({
      name: "recipe.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(imported), "utf8"),
    });
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await expect(page.locator(".import-review")).toContainText(
    "Innfluttur þorskur ½",
  );
  await page
    .getByRole("button", { name: "Add to cookbook", exact: true })
    .click();
  await start(
    page,
    { ...imported, identity: { title: "Innfluttur þorskur ½" } },
    true,
  );
  await expect(
    page.locator(".gather-item").filter({
      has: page.locator(`input[id="ingredient:${recipe.ingredients[0].id}"]`),
    }),
  ).toContainText("½ tsp");
  await page.reload();
  await expect(page.locator(".gathering")).not.toContainText("Â");
  const saved = (await store<Session>(page, "sessions")).find(
    (s) => s.recipeId === imported.id,
  )!;
  expect(saved.recipeSnapshot.ingredients[0].quantity).toEqual({
    text: "½ tsp",
  });
  expect(saved.recipeSnapshot.ingredients[1].quantity).toEqual(
    skillet.ingredients[1].quantity,
  );
  expect(saved.recipeSnapshot.revision).toBe(imported.revision);
});
test("consolidated gathering totals and component allocations persist as one checkbox", async ({
  page,
}, info) => {
  const roast = recipes.find((r) => r.id === "crispy-roasted-chicken")!;
  await ready(page);
  await start(page, roast, true);
  const input = page.locator('input[id="ingredient:ch-garlic"]');
  const row = page.locator(".gather-item").filter({ has: input });
  await expect(page.locator(".gather-card h2")).toHaveText([
    "Produce",
    "Fridge & dairy",
    "Oils",
    "Dry goods & spices",
    "Tools & equipment",
  ]);
  await expect(row.locator(".check-row")).toHaveText(
    "3 tsp + a pinch Garlic powder",
  );
  await expect(
    page.locator(".check-row").filter({ hasText: "Garlic powder" }),
  ).toHaveCount(1);
  await row.getByText("Used in 3 places", { exact: true }).click();
  await expect(row.locator("li")).toHaveCount(3);
  await expect(row.locator("li").first()).toContainText("2 tsp");
  await input.check();
  await page.reload();
  await expect(input).toBeChecked();
  expect((await store<Session>(page, "sessions"))[0].gatheredIds).toEqual(
    expect.arrayContaining([
      "ingredient:ch-garlic",
      "ingredient:pot-garlic",
      "ingredient:finish-garlic",
    ]),
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-redesign-gather.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("region", { name: "Start these first", exact: true })
      .getByRole("checkbox"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Start these first", exact: true }),
  ).toContainText("220°C conventional");
  const potatoList = page.getByRole("group", {
    name: "Potato seasoning",
    exact: true,
  });
  await expect(potatoList.getByRole("listitem")).toHaveCount(5);
  await expect(potatoList.getByRole("listitem").first()).toContainText(
    "1½–2 tbsp",
  );
  await page.screenshot({
    path: `test-results/${info.project.name}-redesign-prep.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to gathering", exact: true })
    .click();
  await input.uncheck();
  await page.reload();
  expect((await store<Session>(page, "sessions"))[0].gatheredIds).not.toEqual(
    expect.arrayContaining(["ingredient:pot-garlic"]),
  );
});

test("older gathering snapshots retain partial progress and legacy preparation without migration", async ({
  page,
}) => {
  const roast = recipes.find((r) => r.id === "crispy-roasted-chicken")!;
  await ready(page);
  await start(page, roast, true);
  await expect
    .poll(async () => (await store<Session>(page, "sessions")).length)
    .toBe(1);
  const legacy = (await store<Session>(page, "sessions"))[0];
  legacy.gatheredIds = ["ingredient:ch-garlic"];
  for (const ingredient of legacy.recipeSnapshot.ingredients)
    delete ingredient.gathering;
  for (const group of legacy.recipeSnapshot.preparation) {
    delete group.longLead;
    for (const item of group.items) {
      delete item.longLead;
      delete item.content;
    }
  }
  for (const stage of legacy.recipeSnapshot.cooking) delete stage.content;
  await page.evaluate(async (session) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("kitchen-mode-v1");
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put(session);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, legacy);
  await page.reload();
  const input = page.locator('input[id="ingredient:ch-garlic"]');
  await expect
    .poll(() => input.evaluate((e: HTMLInputElement) => e.indeterminate))
    .toBe(true);
  expect((await store<Session>(page, "sessions"))[0]).toEqual(legacy);
  await input.check();
  await page.reload();
  await expect(input).toBeChecked();
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await expect(page.locator(".prep-tasks .structured-content")).toHaveCount(0);
  await expect(page.locator(".preparation")).toContainText(
    roast.preparation[1].items[0].text,
  );
});

test("structured JSON prep and cook use partial quantities and separate action lines", async ({
  page,
}, info) => {
  await ready(page);
  const id = skillet.ingredients[0].id;
  const r: Recipe = {
    ...structuredClone(skillet),
    id: "structured-flow",
    identity: { title: "Structured family supper" },
    ingredients: [
      {
        ...skillet.ingredients[0],
        name: "Garlic powder",
        quantity: { value: 3, unit: "tsp" },
      },
    ],
    quantityUsages: [
      {
        id: "sauce-share",
        ingredientId: id,
        quantity: { value: 0.5, unit: "tsp" },
      },
    ],
    preparation: [
      {
        id: "prep",
        title: "Measure the sauce",
        items: [
          {
            id: "measure",
            text: "Measure ½ tsp garlic powder for the sauce. Keep separate.",
            checkable: true,
            content: [
              {
                type: "action",
                text: "Measure the sauce. Keep it separate; do not combine yet.",
              },
              {
                type: "ingredients",
                title: "Sauce only",
                items: [{ ingredientId: id, usageId: "sauce-share" }],
                note: "Keep separate.",
              },
            ],
          },
        ],
      },
    ],
    cooking: [
      {
        ...skillet.cooking[0],
        instructions: [
          {
            type: "text",
            text: "Warm the pan. Add the measured ½ tsp sauce portion of garlic powder.",
          },
        ],
        content: [
          { type: "action", text: "Warm the pan." },
          {
            type: "ingredients",
            title: "Sauce only",
            items: [{ ingredientId: id, usageId: "sauce-share" }],
          },
          { type: "action", text: "Add the measured sauce portion." },
        ],
      },
      {
        ...skillet.cooking[1],
        content: undefined,
        instructions: [{ type: "text", text: "Serve when ready." }],
      },
    ],
  };
  await importReview(page, r);
  await page
    .getByRole("button", { name: "Add to cookbook", exact: true })
    .click();
  await start(page, r);
  await expect(page.locator(".prep-tasks .recipe-action")).toHaveCount(1);
  await expect(
    page.getByRole("group", { name: "Sauce only", exact: true }),
  ).toContainText("½ tsp Garlic powder");
  await expect(
    page.getByRole("group", { name: "Sauce only", exact: true }),
  ).not.toContainText("3 tsp");
  await page.getByRole("checkbox").first().check();
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await expect(page.locator(".instructions .recipe-action")).toHaveText([
    "Warm the pan.",
    "Add the measured sauce portion.",
  ]);
  await expect(page.locator(".instructions [role=listitem]")).toContainText(
    "½ tsp Garlic powder",
  );
  await expect(page.locator(".next-preview")).toContainText(r.cooking[1].title);
  await page
    .getByRole("button", { name: /Start .* timer/ })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Pause .* timer/ }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-redesign-cook.png`,
    fullPage: true,
  });
});
test("six originals, deliberate start, preparation, full cooking, finish, undo and journal", async ({
  page,
}, info) => {
  await ready(page);
  await openRecipe(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-intro.png`,
    fullPage: true,
  });
  expect(await store(page, "sessions")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Gather ingredients", exact: true })
    .click();
  const check = page.getByRole("checkbox").first();
  await check.check();
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await page.getByRole("checkbox").first().check();
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  for (let i = 0; i < skillet.cooking.length; i++) {
    await expect(page.locator(".stage-panel h1")).toHaveText(
      skillet.cooking[i].title,
    );
    if (i === 0) {
      await page
        .getByRole("button", { name: /Start .* timer/ })
        .first()
        .click();
      await page.reload();
      await expect(page.locator(".stage-panel h1")).toHaveText(
        skillet.cooking[i].title,
      );
      await expect(
        page.getByRole("button", { name: /Pause .* timer/ }).first(),
      ).toBeVisible();
      const s = (await store<Session>(page, "sessions"))[0];
      expect(s.timers[skillet.cooking[0].timers[0].id].endAt).toBeGreaterThan(
        Date.now(),
      );
    }
    if (i === skillet.cooking.length - 1) {
      expect(
        (await store<Session>(page, "sessions"))[0].completedAt,
      ).toBeNull();
      await expect(
        page.getByRole("button", { name: "Finish Cooking" }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/${info.project.name}-cooking.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Finish Cooking" }).click();
    } else
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
  }
  await expect(
    page.getByRole("heading", { name: "Ready to serve!" }),
  ).toBeVisible();
  await expect(
    page.getByText("Enjoy your meal.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-completion.png`,
    fullPage: true,
  });
  const elapsedText = await page.locator(".elapsed-panel b").innerText();
  await page.waitForTimeout(1200);
  expect(await page.locator(".elapsed-panel b").innerText()).toBe(elapsedText);
  await page.getByRole("button", { name: "Undo Finish", exact: true }).click();
  await expect(page.locator(".stage-panel h1")).toHaveText(
    skillet.cooking.at(-1)!.title,
  );
  await expect
    .poll(async () => (await store<Session>(page, "sessions"))[0].completedAt)
    .toBeNull();
  await page.getByRole("button", { name: "Finish Cooking" }).click();
  await page
    .getByRole("button", { name: "Back to recipes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cooking journal", exact: true })
    .click();
  await expect(page.locator(".journal-item")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".recipe-card")).toHaveCount(6);
  expect(await store(page, "sessions")).toHaveLength(1);
});
test("all authored stages stay readable on iPad and scroll safely on phone", async ({
  page,
}, info) => {
  await ready(page);
  const overflows: string[] = [];
  for (const recipe of recipes) {
    await start(page, recipe, true);
    const groups = gatheringGroups(recipe);
    await expect(page.getByRole("checkbox")).toHaveCount(
      groups.flatMap((g) => g.items).length,
    );
    for (const group of groups) {
      const region = page.getByRole("region", {
        name: group.title,
        exact: true,
      });
      for (const item of group.items) {
        const row = region
          .locator(".check-row")
          .filter({ has: page.locator(`input[id="${item.id}"]`) });
        await expect(row).toContainText(
          `${item.amount}${item.amount ? " " : ""}${item.name}`,
        );
        if (item.optional) await expect(row).toContainText("optional");
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (recipe.id === "crispy-roasted-chicken")
      await page.screenshot({
        path: `test-results/${info.project.name}-gathering.png`,
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Start preparation", exact: true })
      .first()
      .click();
    for (const group of recipe.preparation) {
      for (const item of group.items) {
        const row = page
          .locator(".prep-tasks .check-row")
          .filter({ has: page.locator(`input[id="${item.id}"]`) });
        if (item.content) {
          await expect(row.locator(".recipe-action")).toHaveText(
            item.content.filter((b) => b.type === "action").map((b) => b.text),
          );
          await expect(row.locator(".collection-title")).toHaveText(
            item.content
              .filter((b) => b.type === "ingredients")
              .map((b) => b.title),
          );
        } else await expect(row).toHaveText(item.text);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (
      ["crispy-roasted-chicken", "chicken-chickpea-coconut-curry"].includes(
        recipe.id,
      )
    ) {
      await expect(page.locator(".prep-card").first()).toHaveClass(/long-lead/);
      await page.screenshot({
        path: `test-results/${info.project.name}-${recipe.id}-preparation.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Let’s start cooking" }).click();
    for (let i = 0; i < recipe.cooking.length; i++) {
      await expect(page.locator(".stage-panel h1")).toHaveText(
        recipe.cooking[i].title,
      );
      const metrics = await page
        .locator(".stage-panel")
        .evaluate((e) => ({ scroll: e.scrollHeight, client: e.clientHeight }));
      if (
        info.project.name.includes("ipad") &&
        metrics.scroll > metrics.client + 2
      )
        overflows.push(
          `${recipe.id}/${i + 1}: ${metrics.scroll}/${metrics.client}`,
        );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const button = page.getByRole("button", {
        name: i === recipe.cooking.length - 1 ? "Finish Cooking" : "Next step",
        exact: true,
      });
      await expect(button).toBeVisible();
      await button.click();
    }
    await page
      .getByRole("button", { name: "Back to recipes", exact: true })
      .click();
  }
  expect(overflows).toEqual([]);
});
test("imports handle revision conflicts, errors and preserve active snapshot", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await leave(page);
  const updated = {
    ...skillet,
    revision: 2,
    identity: { ...skillet.identity, title: "Updated family skillet" },
  };
  await importReview(page, updated);
  await expect(
    page.getByRole("heading", { name: updated.identity.title, exact: true }),
  ).toBeVisible();
  expect(await store(page, "recipes")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm update", exact: true })
    .click();
  await expect(
    page.locator(".recipe-card").filter({ hasText: updated.identity.title }),
  ).toBeVisible();
  const active = (await store<Session>(page, "sessions"))[0];
  expect(active.recipeSnapshot.revision).toBe(1);
  await page.locator(".resume-banner").click();
  await expect(page.locator(".stage-panel h1")).toHaveText(
    skillet.cooking[1].title,
  );
  await expect(page.locator(".cooking-heading")).toContainText("REVISION 1");
  await leave(page);
  await importReview(page, updated);
  await expect(page.getByText(/Already in your cookbook/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const conflict = { ...updated, identity: { title: "Conflict skillet" } };
  await importReview(page, conflict);
  await expect(page.getByText(/Both recipes use revision 2/)).toBeVisible();
  await page
    .getByRole("button", { name: "Replace this revision", exact: true })
    .click();
  await importReview(page, skillet);
  await expect(page.getByText(/your cookbook has revision 2/)).toBeVisible();
  await page
    .getByRole("button", { name: "Restore older revision", exact: true })
    .click();
  const newcomer = {
    ...skillet,
    id: "new-family-recipe",
    identity: { title: "A new family favourite" },
  };
  await importReview(page, newcomer);
  await page
    .getByRole("button", { name: "Add to cookbook", exact: true })
    .click();
  await expect(page.locator(".recipe-card")).toHaveCount(7);
  await page.reload();
  await expect(page.locator(".recipe-card")).toHaveCount(7);
  for (const bad of [
    "{bad json",
    {
      ...skillet,
      cooking: [
        {
          ...skillet.cooking[0],
          instructions: [{ type: "quantity", ingredientId: "unknown" }],
        },
      ],
    },
  ]) {
    await importReview(page, bad);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.locator(".recipe-card")).toHaveCount(7);
  }
  expect(
    (await store<any>(page, "revisions")).filter(
      (h) => h.recipeId === skillet.id,
    ).length,
  ).toBeGreaterThanOrEqual(3);
});
test("export is portable, restore merges safely and archive is recoverable", async ({
  page,
  browser,
}) => {
  await ready(page);
  const added = {
    ...skillet,
    id: "extra-skillet",
    revision: 3,
    identity: { title: "Extra family skillet" },
  };
  await importReview(page, added);
  await page
    .getByRole("button", { name: "Add to cookbook", exact: true })
    .click();
  await page.getByRole("button", { name: /Your cookbook & backups/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Cookbook", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  const backup = JSON.parse(readFileSync(path!, "utf8"));
  expect(backup.recipes).toHaveLength(7);
  expect(backup.bundledOriginals).toHaveLength(6);
  expect(backup.history.length).toBeGreaterThanOrEqual(7);
  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await ready(p);
  await importReview(p, backup);
  await p.getByRole("button", { name: "Confirm restore", exact: true }).click();
  await expect(p.locator(".recipe-card")).toHaveCount(7);
  await openRecipe(p, added);
  await p.getByRole("button", { name: "Recipe versions & recovery" }).click();
  await p
    .getByRole("button", { name: "Archive this recipe", exact: true })
    .click();
  await p.getByRole("button", { name: "Confirm archive", exact: true }).click();
  await expect(p.locator(".recipe-card")).toHaveCount(6);
  await p.getByRole("button", { name: /Your cookbook & backups/ }).click();
  await p.getByRole("button", { name: "Recover", exact: true }).click();
  await p
    .getByRole("button", { name: "Confirm recovery", exact: true })
    .click();
  await p.getByRole("button", { name: "Close dialog" }).click();
  await expect(p.locator(".recipe-card")).toHaveCount(7);
  await fresh.close();
});
test("packaged build opens offline with images and saved session", async ({
  page,
}, info) => {
  const origin = await offlineServer();
  try {
    await ready(page, origin.url);
    await expect(page.locator(".offline-status")).toHaveText(
      "Ready for offline cooking",
      { timeout: 15000 },
    );
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
    await page.screenshot({
      path: `test-results/${info.project.name}-library.png`,
      fullPage: true,
    });
    await start(page);
    await page.getByRole("checkbox").first().check();
    await page.reload();
    await expect(page.getByRole("checkbox").first()).toBeChecked();
    origin.disconnect();
    await page.reload();
    await expect(page.getByRole("checkbox").first()).toBeChecked();
    await leave(page);
    await expect(page.locator(".recipe-card")).toHaveCount(6);
    for (const image of await page.locator(".recipe-card img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate(
            (i: HTMLImageElement) => i.complete && i.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
  } finally {
    await page.close();
    await origin.close();
  }
});
test("timer pause and resume timestamps survive reload", async ({ page }) => {
  await ready(page);
  await start(page);
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await page
    .getByRole("button", { name: /Start .* timer/ })
    .first()
    .click();
  const timerId = skillet.cooking[0].timers[0].id;
  await expect
    .poll(
      async () =>
        (await store<Session>(page, "sessions"))[0]?.timers[timerId]?.status,
    )
    .toBe("running");
  const original = (await store<Session>(page, "sessions"))[0].timers[timerId]
    .endAt;
  await page.reload();
  expect(
    (await store<Session>(page, "sessions"))[0].timers[timerId].endAt,
  ).toBe(original);
  await page
    .getByRole("button", { name: /Pause .* timer/ })
    .first()
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Resume .* timer/ }),
  ).toBeVisible();
  expect(
    (await store<Session>(page, "sessions"))[0].timers[timerId].endAt,
  ).toBeNull();
  await page.getByRole("button", { name: /Resume .* timer/ }).click();
  await page.getByRole("button", { name: /Cancel .* timer/ }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Start .* timer/ }),
  ).toBeVisible();
});

test("clipboard denial falls back to manual paste; JSON files and long stages remain usable", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: () => Promise.reject(new Error("Permission denied")) },
    });
  });
  await ready(page);
  await page
    .getByRole("button", { name: "Import Recipe", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Paste from clipboard", exact: true })
    .click();
  await expect(page.getByText(/Clipboard access is unavailable/)).toBeVisible();
  const longRecipe = {
    ...skillet,
    id: "long-family-recipe",
    identity: { title: "A leisurely family recipe" },
    cooking: [
      {
        ...skillet.cooking[0],
        instructions: [
          {
            type: "text",
            text: "Keep the full authored instruction readable, with generous space for a careful cook. ".repeat(
              50,
            ),
          },
        ],
      },
    ],
  };
  await page
    .getByLabel("Open recipe or cookbook JSON file", { exact: true })
    .setInputFiles({
      name: "family-recipe.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(longRecipe)),
    });
  await expect(
    page.getByRole("textbox", { name: "Recipe or cookbook JSON", exact: true }),
  ).toHaveValue(JSON.stringify(longRecipe));
  await page
    .getByRole("button", { name: "Review import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to cookbook", exact: true })
    .click();
  await start(page, longRecipe as Recipe);
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await expect(page.locator(".instructions")).toHaveText(
    longRecipe.cooking[0].instructions[0].text,
  );
  if (info.project.name.includes("ipad"))
    expect(
      await page
        .locator(".stage-panel")
        .evaluate((e) => e.scrollHeight > e.clientHeight),
    ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Finish Cooking", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Finish Cooking", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready to serve!", exact: true }),
  ).toBeVisible();
});

test("elapsed time begins deliberately, freezes at finish and resumes after undo", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T12:00:00Z") });
  await ready(page);
  await openRecipe(page);
  await page.clock.fastForward(120000);
  expect(await store(page, "sessions")).toHaveLength(0);
  const before = await page.evaluate(() => Date.now());
  await page
    .getByRole("button", { name: "Gather ingredients", exact: true })
    .click();
  await page.clock.fastForward(65000);
  await page
    .getByRole("button", { name: "Start preparation", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  const s = (await store<Session>(page, "sessions"))[0];
  expect(s.startedAt).toBeGreaterThanOrEqual(before);
  expect(s.startedAt - before).toBeLessThan(2000);
  for (let i = 0; i < skillet.cooking.length - 1; i++)
    await page.getByRole("button", { name: "Next step", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish Cooking", exact: true })
    .click();
  const finished = (await store<Session>(page, "sessions"))[0];
  expect(finished.completedAt! - finished.startedAt).toBeGreaterThanOrEqual(
    65000,
  );
  const displayed = await page.locator(".elapsed-panel b").innerText();
  await page.clock.fastForward(90000);
  await expect(page.locator(".elapsed-panel b")).toHaveText(displayed);
  await page.getByRole("button", { name: "Undo Finish", exact: true }).click();
  await page.clock.fastForward(1000);
  await expect
    .poll(async () => (await store<Session>(page, "sessions"))[0].completedAt)
    .toBeNull();
  expect((await store<Session>(page, "sessions"))[0].startedAt).toBe(
    s.startedAt,
  );
});

test("Save & Exit preserves progress and running timers for resumption after reload", async ({
  page,
}) => {
  await ready(page);
  await start(page);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Let’s start cooking" }).click();
  await page
    .getByRole("button", { name: /Start .* timer/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await leave(page);
  const saved = (await store<Session>(page, "sessions"))[0];
  expect(saved.phase).toBe("cooking");
  expect(saved.completedAt).toBeNull();
  expect(saved.checkedIds).toContain(skillet.preparation[0].items[0].id);
  expect(saved.timers[skillet.cooking[0].timers[0].id].status).toBe("running");
  await page.reload();
  await expect(page.locator(".resume-banner")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ready to serve!", exact: true }),
  ).toHaveCount(0);
  await page.locator(".resume-banner").click();
  await expect(page.locator(".stage-panel h1")).toHaveText(
    skillet.cooking[1].title,
  );
  expect((await store<Session>(page, "sessions"))[0]).toMatchObject({
    startedAt: saved.startedAt,
    currentStepId: saved.currentStepId,
    checkedIds: saved.checkedIds,
    timers: saved.timers,
  });
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await page.getByRole("button", { name: "Preparation", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
});

for (const phase of ["gathering", "preparation", "cooking"] as const) {
  test(`Discard Session confirms then removes ${phase} progress and timers across reload`, async ({
    page,
  }) => {
    await ready(page);
    await start(page, skillet, phase === "gathering");
    await page.getByRole("checkbox").first().check();
    if (phase === "cooking") {
      await page.getByRole("button", { name: "Let’s start cooking" }).click();
      await page
        .getByRole("button", { name: /Start .* timer/ })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Exit recipe", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard Session", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Discard this session?", exact: true }),
    ).toBeVisible();
    expect(await store(page, "sessions")).toHaveLength(1);
    await page
      .getByRole("button", { name: "Keep cooking", exact: true })
      .click();
    if (phase !== "cooking")
      await expect(page.getByRole("checkbox").first()).toBeChecked();
    else
      await expect(page.locator(".stage-panel h1")).toHaveText(
        skillet.cooking[1].title,
      );
    await page
      .getByRole("button", { name: "Exit recipe", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard Session", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm Discard", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "The recipe collection", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ready to serve!", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".resume-banner")).toHaveCount(0);
    expect(await store(page, "sessions")).toEqual([]);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).some((key) =>
          key.includes(":pending-session:"),
        ),
      ),
    ).toBe(false);
    await page.reload();
    await expect(page.locator(".recipe-card")).toHaveCount(6);
    await expect(page.locator(".resume-banner")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Cooking journal", exact: true })
      .click();
    await expect(page.locator(".journal-item")).toHaveCount(0);
    await page.getByRole("button", { name: "Recipes", exact: true }).click();
    await start(page);
    await expect(page.getByRole("checkbox").first()).not.toBeChecked();
    await page.getByRole("button", { name: "Let’s start cooking" }).click();
    await expect(page.locator(".stage-panel h1")).toHaveText(
      skillet.cooking[0].title,
    );
    await expect(
      page.getByRole("button", { name: /Start .* timer/ }).first(),
    ).toBeVisible();
    expect((await store<Session>(page, "sessions"))[0].timers).toEqual({});
    await page.reload();
    await expect(page.locator(".stage-panel h1")).toHaveText(
      skillet.cooking[0].title,
    );
    expect(await store(page, "sessions")).toHaveLength(1);
  });
}
