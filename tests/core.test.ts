import { describe, it, expect, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  RecipeRepository,
  bundledRecipes,
  HISTORY_LIMIT,
} from "../src/repository";
import {
  canonical,
  validateRecipe,
  parseImport,
  importDecision,
} from "../src/validation";
import {
  startSession,
  finishSession,
  undoFinish,
  elapsed,
  timerAction,
  quantity,
} from "../src/model";
const opened: RecipeRepository[] = [];
async function repository() {
  const r = await new RecipeRepository().open(`test-${Math.random()}`);
  opened.push(r);
  return r;
}
afterEach(() => {
  opened.splice(0).forEach((r) => r.close());
  vi.restoreAllMocks();
});
describe("authoritative recipes and imports", () => {
  it("has exactly six genuine schema-valid originals", () => {
    expect(bundledRecipes).toHaveLength(6);
    for (const r of bundledRecipes) {
      expect(validateRecipe(r)).toEqual(r);
      expect(r.cooking.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("preserves long-lead naan and oven prep", () => {
    expect(
      bundledRecipes.find((r) => r.id.includes("coconut"))!.preparation[0].id,
    ).toBe("prep-naan");
    expect(
      bundledRecipes.find((r) => r.id === "crispy-roasted-chicken")!
        .preparation[0].id,
    ).toBe("prep-oven");
  });
  it("rejects malformed JSON and invalid schema", () => {
    expect(() => parseImport("{")).toThrow("not valid JSON");
    expect(() => validateRecipe({})).toThrow("required property");
    const r = structuredClone(bundledRecipes[0]);
    r.revision = 0;
    expect(() => validateRecipe(r)).toThrow(">= 1");
  });
  it("rejects duplicates and missing ingredient/component/timer/usage references", () => {
    for (const mutate of [
      (r: any) => r.ingredients.push(r.ingredients[0]),
      (r: any) => (r.ingredients[0].componentId = "missing"),
      (r: any) =>
        r.cooking[0].instructions.push({
          type: "quantity",
          ingredientId: "missing",
        }),
      (r: any) =>
        r.cooking[0].instructions.push({
          type: "quantity",
          ingredientId: r.ingredients[0].id,
          usageId: "missing",
        }),
      (r: any) => (r.cooking[0].timerId = "missing"),
    ]) {
      const r = structuredClone(bundledRecipes[0]);
      mutate(r);
      expect(() => validateRecipe(r)).toThrow();
    }
  });
  it("formats ranges, package sizes and textual quantities faithfully", () => {
    expect(quantity({ min: 100, max: 150, unit: "g" })).toBe("100–150 g");
    expect(
      quantity({ value: 3, unit: "can", package: { value: 400, unit: "g" } }),
    ).toBe("3 can (400 g each)");
    expect(quantity({ text: "to taste" })).toBe("to taste");
  });
  it("distinguishes new, identical, higher, conflict, and older versions", () => {
    const r = bundledRecipes[0];
    expect(importDecision(undefined, r)).toBe("new");
    expect(importDecision(r, { ...r })).toBe("identical");
    expect(importDecision(r, { ...r, revision: 2 })).toBe("update");
    expect(importDecision(r, { ...r, identity: { title: "Changed" } })).toBe(
      "conflict",
    );
    expect(importDecision({ ...r, revision: 2 }, r)).toBe("older");
    expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  });
  it("rejects reversed quantity ranges", () => {
    const r = structuredClone(bundledRecipes[0]);
    r.ingredients[0].quantity = { min: 9, max: 1, unit: "g" };
    expect(() => validateRecipe(r)).toThrow("min must not exceed");
  });
  it("validates quantity usage references and renders their amounts", () => {
    const r = structuredClone(bundledRecipes[0]);
    r.quantityUsages = [
      {
        id: "half",
        ingredientId: r.ingredients[0].id,
        quantity: { value: 10, unit: "g" },
      },
    ];
    r.cooking[0].instructions.push({
      type: "quantity",
      ingredientId: r.ingredients[0].id,
      usageId: "half",
    });
    expect(validateRecipe(r)).toEqual(r);
    r.quantityUsages[0].quantity = { text: "" };
    expect(() => validateRecipe(r)).toThrow("invalid quantity");
  });
});
describe("local repository and recovery", () => {
  it("imports overrides and preserves original plus prior revisions", async () => {
    const repo = await repository(),
      r = bundledRecipes[0];
    await repo.saveRecipe({ ...r, revision: 2 });
    await repo.saveRecipe({ ...r, revision: 3 });
    expect((await repo.list()).find((x) => x.id === r.id)?.revision).toBe(3);
    expect(
      (await repo.history(r.id)).map((h) => h.recipe.revision).sort(),
    ).toEqual([1, 2, 3]);
  });
  it("preserves conflicting same-revision content and bounds history", async () => {
    const repo = await repository(),
      r = bundledRecipes[0];
    for (let n = 0; n < 14; n++)
      await repo.saveRecipe({
        ...r,
        identity: { ...r.identity, title: `Edit ${n}` },
      });
    const history = await repo.history(r.id);
    expect(
      history.filter((h) => h.source !== "bundled").length,
    ).toBeLessThanOrEqual(HISTORY_LIMIT);
    expect(history.some((h) => canonical(h.recipe) === canonical(r))).toBe(
      true,
    );
    expect(new Set(history.map((h) => h.recipe.identity.title)).size).toBe(
      history.length,
    );
  });
  it("archives without erasing versions and recovers imported recipes", async () => {
    const repo = await repository();
    const r = { ...bundledRecipes[0], id: "new-recipe" };
    await repo.saveRecipe(r);
    await repo.archive(r.id);
    expect((await repo.list()).some((x) => x.id === r.id)).toBe(false);
    const h = (await repo.history(r.id))[0];
    expect(h.recipe).toEqual(r);
    await repo.saveRecipe(h.recipe, "recovery");
    expect((await repo.list()).find((x) => x.id === r.id)).toEqual(r);
  });
  it("round-trips a complete portable cookbook backup into fresh storage", async () => {
    const a = await repository(),
      b = await repository(),
      r = bundledRecipes[0];
    await a.saveRecipe({ ...r, revision: 2 });
    await a.archive(bundledRecipes[1].id);
    const backup = parseImport(JSON.stringify(await a.exportCookbook()));
    expect("format" in backup).toBe(true);
    await b.restoreBackup(backup as any);
    expect(await b.list()).toEqual(await a.list());
    expect(
      (await b.history(r.id)).map((h) => h.recipe.revision).sort(),
    ).toEqual([1, 2]);
  });
  it("does not write any invalid backup recipe", async () => {
    const repo = await repository(),
      backup = await repo.exportCookbook();
    backup.recipes[0].revision = -1;
    expect(() => parseImport(JSON.stringify(backup))).toThrow();
    expect((await repo.list())[0].revision).toBe(1);
  });
  it("persists session snapshot, phase, checks, timer end and active ID across reopening", async () => {
    const repo = await repository(),
      r = bundledRecipes[0];
    const session = startSession(r);
    session.phase = "cooking";
    session.currentStepId = r.cooking[2].id;
    session.checkedIds = [r.preparation[0].items[0].id];
    const def = { id: "test-timer", label: "Test", durationSeconds: 60 };
    session.timers[def.id] = timerAction(undefined, def, "start", 1000);
    await repo.saveSession(session);
    await repo.saveRecipe({ ...r, revision: 2 });
    expect(await repo.activeSession()).toEqual(session);
    expect((await repo.activeSession())?.recipeSnapshot.revision).toBe(1);
    await repo.clearActive();
    expect(await repo.activeSession()).toBeNull();
    expect(await repo.listSessions()).toHaveLength(1);
  });
  it("gracefully uses clearly flagged memory storage when IndexedDB is unavailable", async () => {
    vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
      throw new Error("denied");
    });
    const repo = await repository();
    expect(repo.persistent).toBe(false);
    await repo.saveRecipe({ ...bundledRecipes[0], id: "temporary" });
    expect(await repo.list()).toHaveLength(7);
  });
});
describe("timestamp timing", () => {
  it("only starts intentionally; completes explicitly and undo resumes without resetting start", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const s = startSession(bundledRecipes[0]);
    expect(s.startedAt).toBe(1000);
    const finished = finishSession(s, 5000);
    expect(elapsed(finished, 20000)).toBe(4000);
    const undone = undoFinish(finished, 21000);
    expect(undone.startedAt).toBe(1000);
    expect(elapsed(undone, 22000)).toBe(21000);
    expect(undone.phase).toBe("cooking");
  });
  it("pauses, resumes, cancels, and restarts timers using timestamps", () => {
    const d = { id: "timer", label: "Simmer", durationSeconds: 60 };
    const t = timerAction(undefined, d, "start", 1000);
    expect(t.endAt).toBe(61000);
    const paused = timerAction(t, d, "pause", 21000);
    expect(paused.remainingMs).toBe(40000);
    expect(timerAction(paused, d, "start", 50000).endAt).toBe(90000);
    expect(timerAction(t, d, "cancel").status).toBe("cancelled");
    expect(timerAction(t, d, "start", 70000).endAt).toBe(130000);
  });
});
