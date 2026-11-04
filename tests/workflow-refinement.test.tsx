import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Accordion } from "../src/Accordion";
import { StructuredContent } from "../src/recipe-content";
import { gatheringGroups, gatherQuantity } from "../src/gathering";
import {
  completeCurrentStep,
  finishSession,
  navigateStage,
  startSession,
  timerAction,
  timerRemaining,
  toggleSection,
  undoFinish,
} from "../src/model";
import { RecipeRepository, bundledRecipes } from "../src/repository";
import { validateRecipe, parseImport } from "../src/validation";
import { normalizeRecipe } from "../src/recipe-text";
import "fake-indexeddb/auto";
const roast = bundledRecipes.find((r) => r.id === "crispy-roasted-chicken")!;

describe("compact workflow", () => {
  it("repairs new display metadata without changing its identity keys or correct Icelandic", () => {
    const recipe = structuredClone(roast);
    recipe.ingredients[0].gathering = {
      detail: "220Â°C · Þorskur",
      key: "Â½-identity",
    };
    recipe.equipment = [
      {
        id: "Â½-id",
        name: "Bowl",
        gathering: { key: "Â½-key", name: "Skál Â½" },
      },
    ];
    recipe.preparation[0].earlyTitle = "Hitið 220Â°C";
    recipe.preparation[0].continuationTitle = "Grænmeti og kjúklingur";
    const fixed = normalizeRecipe(validateRecipe(recipe));
    expect(fixed.ingredients[0].gathering).toEqual({
      detail: "220°C · Þorskur",
      key: "Â½-identity",
    });
    expect(fixed.equipment![0]).toEqual({
      id: "Â½-id",
      name: "Bowl",
      gathering: { key: "Â½-key", name: "Skál ½" },
    });
    expect(fixed.preparation[0].earlyTitle).toBe("Hitið 220°C");
    expect(fixed.preparation[0].continuationTitle).toBe(
      "Grænmeti og kjúklingur",
    );
    expect(recipe.preparation[0].earlyTitle).toBe("Hitið 220Â°C");
  });
  it("formats finding quantities without changing their mathematical meaning", () => {
    expect(gatherQuantity({ min: 1000, max: 1200, unit: "g" })).toBe(
      "1–1.2 kg",
    );
    expect(gatherQuantity({ value: 1, unit: "whole" })).toBe("1");
    expect(gatherQuantity({ text: "a little, to taste" })).toBe("to taste");
    expect(gatherQuantity({ text: "roughly a handful" })).toBe(
      "roughly a handful",
    );
    expect(gatherQuantity({ min: 500, max: 600, unit: "g" })).toBe("500–600 g");
    expect(
      gatherQuantity({
        value: 2,
        unit: "can",
        package: { value: 400, unit: "g" },
      }),
    ).toBe("2 can (400 g each)");
  });
  it("excludes ingredient preparation from Gather and retains identifying conditions and approximate notes", () => {
    const items = gatheringGroups(roast).flatMap((g) => g.items);
    expect(items.find((i) => i.name === "Onion")!.detail).toBe("");
    expect(items.find((i) => i.name.includes("Bone-in"))!.detail).toContain(
      "Approximate",
    );
    expect(items.find((i) => i.name.includes("potatoes"))!.name).toContain(
      "thin-skinned",
    );
    expect(
      items.find((i) => i.name.includes("potatoes"))!.detail,
    ).not.toContain("halved");
  });
  it("merges exact equipment aliases and explicit identities, preserving distinct tools and legacy source check IDs", () => {
    const recipe = structuredClone(roast);
    recipe.equipment = [
      { id: "a", name: "Mixing bowl" },
      { id: "b", name: " mixing   bowl " },
      {
        id: "c",
        name: "Bowl",
        gathering: { key: "receiving", name: "Receiving bowl" },
      },
      {
        id: "d",
        name: "Large receiving bowl",
        gathering: { key: "receiving" },
      },
      { id: "e", name: "Mixing bowl", gathering: { key: "second-bowl" } },
    ];
    const tools = gatheringGroups(validateRecipe(recipe)).at(-1)!.items;
    expect(tools).toHaveLength(3);
    expect(tools[0].sourceIds).toEqual(["equipment:id:a", "equipment:id:b"]);
    expect(tools[1].sourceIds).toEqual(["equipment:id:c", "equipment:id:d"]);
  });
  it("renders completed accordion counts without collapsing and keeps expansion independent of progress", () => {
    const html = renderToStaticMarkup(
      <Accordion
        title="Produce"
        completed={2}
        total={2}
        collapsed={false}
        onToggle={() => {}}
      >
        items
      </Accordion>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Complete"');
    expect(html).toContain("2/2");
    const session = startSession(roast);
    expect(
      toggleSection(toggleSection(session, "gather:produce"), "gather:produce")
        .collapsedSectionIds,
    ).toEqual([]);
  });
  it("keeps explicit ingredient amounts and optionality while removing internal usage suffixes in structured lists", () => {
    const html = renderToStaticMarkup(
      <StructuredContent
        recipe={roast}
        blocks={[
          {
            type: "ingredients",
            title: "Seasoning",
            items: [{ ingredientId: "ch-garlic" }],
          },
        ]}
      />,
    );
    expect(html).toContain("2 tsp");
    expect(html).toContain("Garlic powder");
    expect(html).not.toContain("for chicken");
  });
  it("jumps without completing skipped stages, and completes only the explicit current stage", () => {
    const session = startSession(roast);
    const jumped = navigateStage(session, roast.cooking[3].id);
    expect(jumped.completedStepIds).toEqual([]);
    expect(jumped.visitedStepIds).toEqual([
      roast.cooking[0].id,
      roast.cooking[3].id,
    ]);
    expect(completeCurrentStep(jumped).completedStepIds).toEqual([
      roast.cooking[3].id,
    ]);
    expect(navigateStage(jumped, "not-a-stage")).toBe(jumped);
    const finished = finishSession(jumped, 100);
    expect(undoFinish(finished, 200).completedStepIds).toEqual([]);
    expect(undoFinish(finished, 200).completedAt).toBeNull();
  });
  it("shares the same remaining time calculation for paused, resumed and expired timers", () => {
    const def = { id: "test", label: "Test", durationSeconds: 60 };
    const started = timerAction(undefined, def, "start", 1000);
    expect(timerRemaining(started, 2000)).toBe(59000);
    const paused = timerAction(started, def, "pause", 2000);
    expect(timerRemaining(paused, 9000)).toBe(59000);
    const resumed = timerAction(paused, def, "start", 10000);
    expect(timerRemaining(resumed, 20000)).toBe(49000);
    expect(timerRemaining(resumed, 100000)).toBe(0);
  });
  it("round-trips new session metadata and older snapshots without inferring completion or changing recipes", async () => {
    const repo = await new RecipeRepository().open(
      `refinement-${Math.random()}`,
    );
    try {
      const session = toggleSection(
        navigateStage(
          completeCurrentStep(startSession(roast)),
          roast.cooking[2].id,
        ),
        "gather:produce",
      );
      await repo.saveSession(session);
      expect(await repo.activeSession()).toMatchObject({
        collapsedSectionIds: ["gather:produce"],
        completedStepIds: [roast.cooking[0].id],
      });
      delete session.collapsedSectionIds;
      delete session.completedStepIds;
      delete session.visitedStepIds;
      await repo.saveSession(session);
      const old = await repo.activeSession();
      expect(old?.completedStepIds).toEqual([]);
      expect(old?.currentStepId).toBe(roast.cooking[2].id);
      expect(old?.recipeSnapshot).toEqual(roast);
      const backup = parseImport(JSON.stringify(await repo.exportCookbook()));
      expect(
        "format" in backup && backup.recipes.find((r) => r.id === roast.id),
      ).toEqual(roast);
    } finally {
      repo.close();
    }
  });
});
