import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { RecipeRepository, bundledRecipes } from "../src/repository";
import {
  gatheringGroups,
  isLongLeadPreparation,
  startSession,
  type Session,
} from "../src/model";
import { normalizeRecipe, normalizeRecipeText } from "../src/recipe-text";
import { importDecision, parseImport, validateRecipe } from "../src/validation";
import { preparationSections } from "../src/Preparation";

const opened: RecipeRepository[] = [];
async function repository(name = `cooking-ux-${Math.random()}`) {
  const repo = await new RecipeRepository().open(name);
  opened.push(repo);
  return repo;
}
afterEach(() => {
  opened.splice(0).forEach((repo) => repo.close());
  vi.unstubAllGlobals();
});

describe("gathering and preparation", () => {
  it("starts with independent gathering progress and accounts for every authored ingredient and equipment item", () => {
    for (const recipe of bundledRecipes) {
      const session = startSession(recipe);
      expect(session.phase).toBe("gathering");
      expect(session.gatheredIds).toEqual([]);
      expect(session.checkedIds).toEqual([]);
      const groups = gatheringGroups(recipe);
      const ingredients = groups
        .flatMap((g) => g.items)
        .filter((i) => i.id.startsWith("ingredient:"));
      expect(ingredients.flatMap((item) => item.sourceIds).sort()).toEqual(
        recipe.ingredients.map((i) => `ingredient:${i.id}`).sort(),
      );
      for (const ingredient of recipe.ingredients) {
        expect(
          ingredients
            .flatMap((i) => i.allocations)
            .find((i) => i.name === ingredient.name),
        ).toMatchObject({
          name: ingredient.name,
          optional: ingredient.optional,
        });
      }
      expect(groups.at(-1)!.items.map((item) => item.name)).toEqual(
        recipe.equipment!.map((e) => e.name),
      );
    }
  });
  it("keeps equipment without IDs stable and disjoint from ingredient IDs and explicit equipment IDs", () => {
    const recipe = structuredClone(bundledRecipes[0]);
    recipe.equipment = [
      { id: recipe.ingredients[0].id, name: "Tray" },
      { name: "Spoon" },
      { id: "1", name: "Pan" },
    ];
    const ids = gatheringGroups(recipe).flatMap((g) =>
      g.items.map((i) => i.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      gatheringGroups(structuredClone(recipe)).flatMap((g) =>
        g.items.map((i) => i.id),
      ),
    ).toEqual(ids);
  });
  it("persists gathering independently across reopening and restores an interrupted recovery journal", async () => {
    const name = `gathering-${Math.random()}`;
    const repo = await repository(name);
    const session = startSession(bundledRecipes[0]);
    session.gatheredIds = [
      gatheringGroups(session.recipeSnapshot)[0].items[0].id,
    ];
    await repo.saveSession(session);
    repo.close();
    const reopened = await repository(name);
    expect(await reopened.activeSession()).toEqual(session);
    const newer = {
      ...session,
      updatedAt: session.updatedAt + 100,
      gatheredIds: [...session.gatheredIds, "equipment:index:0"],
    };
    const memory = new Map<string, string>([
      [`${name}:pending-session:/`, JSON.stringify(newer)],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, text: string) => memory.set(key, text),
      removeItem: (key: string) => memory.delete(key),
    });
    expect(await reopened.activeSession()).toEqual(newer);
    expect(memory.size).toBe(0);
  });
  it.each(["preparation", "cooking", "completed"] as const)(
    "loads an older %s session without resetting phase, checks, snapshot or timers",
    async (phase) => {
      const name = `legacy-${Math.random()}`;
      const repo = await repository(name);
      const legacy: Partial<Session> = startSession(bundledRecipes[0]);
      delete legacy.gatheredIds;
      legacy.phase = phase;
      legacy.checkedIds = ["old-progress"];
      const db = await openDB(name);
      await db.put("sessions", legacy);
      await db.put("meta", legacy.id, "activeSessionId");
      db.close();
      expect(await repo.activeSession()).toEqual({
        ...legacy,
        gatheredIds: [],
      });
      expect(await repo.listSessions()).toEqual([
        { ...legacy, gatheredIds: [] },
      ]);
    },
  );
  it("highlights authored advance work without promoting a do-not-preheat instruction", () => {
    const roast = bundledRecipes.find(
      (r) => r.id === "crispy-roasted-chicken",
    )!;
    const curry = bundledRecipes.find((r) => r.id.includes("coconut"))!;
    expect(
      preparationSections(roast).early.flatMap((g) => g.items.map((i) => i.id)),
    ).toEqual(["prep-oven-1"]);
    expect(isLongLeadPreparation(curry.preparation[0])).toBe(true);
    expect(isLongLeadPreparation(curry.preparation.at(-1)!)).toBe(false);
  });
});

describe("conservative recipe text repair", () => {
  it.each([
    ["220Â°C; Â½ tsp; Â¼ tsp", "220°C; ½ tsp; ¼ tsp"],
    ["220Ã‚Â°C; Ã‚Â½ tsp", "220°C; ½ tsp"],
    [
      "6â€“8 minutes â€” cookâ€™s choice â€œwarmâ€\u009d",
      "6–8 minutes — cook’s choice “warm”",
    ],
    [
      "Ãžorskur meÃ° smjÃ¶ri og Ã¦tiÃ¾istlum",
      "Þorskur með smjöri og ætiþistlum",
    ],
    [
      "Áá Éé Íí Óó Úú Ýý Ðð Þþ Ææ Öö: 220°C, ½–¾ tsp. Café, 日本語, 🥘",
      "Áá Éé Íí Óó Úú Ýý Ðð Þþ Ææ Öö: 220°C, ½–¾ tsp. Café, 日本語, 🥘",
    ],
    [
      "Â is a letter; Ã is a letter. A\u0301 remains decomposed.",
      "Â is a letter; Ã is a letter. A\u0301 remains decomposed.",
    ],
    [
      "Unknown corruption � and âxyz stays intact",
      "Unknown corruption � and âxyz stays intact",
    ],
  ])("repairs only known byte sequences: %s", (input, expected) => {
    expect(normalizeRecipeText(input)).toBe(expected);
    expect(normalizeRecipeText(expected)).toBe(expected);
  });
  it("normalizes imports without mutating input, identifiers, references, revisions or numeric quantities", () => {
    const recipe = structuredClone(bundledRecipes[0]);
    recipe.ingredients[0].id = "id-Â½";
    recipe.ingredients[0].foodId = "food-Â¼";
    recipe.cooking[0].instructions = [
      { type: "quantity", ingredientId: "id-Â½" },
    ];
    recipe.preparation[0].items[0].text = "Preheat to 220Â°C. Use Â½ tsp salt.";
    recipe.ingredients[1].quantity = { text: "Â¼ tsp" };
    recipe.quantityUsages = [
      {
        id: "usage-Â¼",
        ingredientId: "id-Â½",
        quantity: { value: 2, unit: "tsp", package: { value: 400, unit: "g" } },
        text: "Extension text Â½",
      },
    ];
    recipe.history = { text: "Unrendered extension Â½", name: "Â¼" };
    const before = structuredClone(recipe);
    const fixed = validateRecipe(recipe);
    expect(recipe).toEqual(before);
    expect(fixed.preparation[0].items[0].text).toBe(
      "Preheat to 220°C. Use ½ tsp salt.",
    );
    expect(fixed.ingredients[1].quantity).toEqual({ text: "¼ tsp" });
    expect(fixed.ingredients[0]).toEqual(before.ingredients[0]);
    expect(fixed.cooking).toEqual(before.cooking);
    expect(fixed.id).toBe(before.id);
    expect(fixed.revision).toBe(before.revision);
    expect(fixed.quantityUsages).toEqual(before.quantityUsages);
    expect(fixed.history).toEqual(before.history);
    expect(parseImport(JSON.stringify(recipe))).toEqual(fixed);
    expect(
      importDecision(
        fixed,
        parseImport(JSON.stringify(recipe)) as typeof recipe,
      ),
    ).toBe("identical");
    for (const original of bundledRecipes)
      expect(normalizeRecipe(original)).toEqual(original);
  });
  it("repairs stored recipes, revisions and session snapshots on read and in exports, without destructive migration", async () => {
    const name = `encoding-${Math.random()}`;
    const repo = await repository(name);
    const recipe = structuredClone(bundledRecipes[0]);
    recipe.identity.title = "Þorskur Â½";
    recipe.preparation[0].items[0].text = "220Â°C";
    const legacy: Partial<Session> = startSession(recipe);
    delete legacy.gatheredIds;
    legacy.phase = "preparation";
    const db = await openDB(name);
    await db.put("recipes", { id: recipe.id, recipe, updatedAt: 123 });
    await db.put("revisions", {
      key: "old",
      recipeId: recipe.id,
      recipe,
      savedAt: 123,
      source: "import",
    });
    await db.put("sessions", legacy);
    await db.put("meta", legacy.id, "activeSessionId");
    expect((await repo.list()).find((r) => r.id === recipe.id)).toEqual(
      normalizeRecipe(recipe),
    );
    expect((await repo.history(recipe.id))[0].recipe).toEqual(
      normalizeRecipe(recipe),
    );
    expect((await repo.activeSession())!.recipeSnapshot).toEqual(
      normalizeRecipe(recipe),
    );
    const backup = repo.exportCookbook();
    const restored = await repository();
    await restored.restoreBackup(
      parseImport(JSON.stringify(await backup)) as Awaited<typeof backup>,
    );
    expect(await restored.list()).toEqual(await repo.list());
    expect((await db.get("recipes", recipe.id)).recipe).toEqual(recipe);
    expect((await db.get("sessions", legacy.id!)).recipeSnapshot).toEqual(
      recipe,
    );
    await repo.saveRecipe(normalizeRecipe(recipe));
    expect(
      (await repo.history(recipe.id)).filter(
        (h) => h.recipe.identity.title === "Þorskur ½",
      ),
    ).toHaveLength(1);
    db.close();
  });
  it("normalizes all recipe sources in an imported backup while keeping amounts and revision metadata", async () => {
    const repo = await repository();
    const backup = await repo.exportCookbook();
    const recipe = structuredClone(backup.recipes[0]);
    recipe.preparation[0].items[0].text = "220Â°C, Â¼ tsp";
    backup.recipes[0] = recipe;
    backup.bundledOriginals[0] = recipe;
    backup.history = [
      {
        key: "legacy-key",
        recipeId: recipe.id,
        recipe,
        savedAt: 1234,
        source: "recovery",
      },
    ];
    const parsed = parseImport(JSON.stringify(backup)) as typeof backup;
    for (const fixed of [
      parsed.recipes[0],
      parsed.bundledOriginals[0],
      parsed.history[0].recipe,
    ]) {
      expect(fixed.preparation[0].items[0].text).toBe("220°C, ¼ tsp");
      expect(fixed.ingredients).toEqual(recipe.ingredients);
      expect(fixed.id).toBe(recipe.id);
      expect(fixed.revision).toBe(recipe.revision);
    }
    expect(parsed.history[0].key).toBe("legacy-key");
    expect(parsed.history[0].savedAt).toBe(1234);
  });
});
