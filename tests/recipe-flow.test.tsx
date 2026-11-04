import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  gatheringGroups,
  isGathered,
  toggleGathered,
  gatherAmount,
} from "../src/gathering";
import {
  quantity,
  type Ingredient,
  type Quantity,
  type Recipe,
} from "../src/model";
import { bundledRecipes } from "../src/repository";
import { validateRecipe, parseImport } from "../src/validation";
import { preparationSections } from "../src/Preparation";
import { StructuredContent } from "../src/recipe-content";

const roast = bundledRecipes.find((r) => r.id === "crispy-roasted-chicken")!;
function ingredient(
  id: string,
  amount: Quantity,
  extra: Partial<Ingredient> = {},
): Ingredient {
  return {
    id,
    foodId: "garlic",
    name: `Garlic for ${id}`,
    componentId: "main",
    quantity: amount,
    optional: false,
    scaling: "linear",
    ...extra,
  };
}
function recipe(ingredients: Ingredient[]): Recipe {
  return {
    ...structuredClone(roast),
    ingredients,
    equipment: [],
    components: [{ id: "main", name: "Main" }],
    preparation: [
      {
        id: "prep",
        title: "Prepare",
        items: [
          {
            id: "check",
            text: "Keep all prose; do not split. Even at punctuation!",
            checkable: true,
          },
        ],
      },
    ],
    cooking: [
      {
        id: "cook",
        title: "Cook",
        instructions: [
          { type: "text", text: "Authored prose. Still intact; as written." },
        ],
        checklist: [],
        timers: [],
      },
    ],
  };
}
describe("gathering products and quantities", () => {
  it("deduplicates garlic across uses without changing source quantities or component references", () => {
    const source = recipe([
      ingredient("sauce", { value: 2, unit: "clove" }),
      ingredient("roasting", { value: 3, unit: "clove" }),
    ]);
    const before = structuredClone(source);
    const rows = gatheringGroups(source).flatMap((g) => g.items);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Garlic",
      amount: "5 clove",
      sourceIds: ["ingredient:sauce", "ingredient:roasting"],
    });
    expect(rows[0].allocations.map((a) => a.amount)).toEqual([
      "2 clove",
      "3 clove",
    ]);
    expect(source).toEqual(before);
  });
  it("consolidates the actual roasting recipe's garlic powder, oil and salt", () => {
    const rows = gatheringGroups(roast).flatMap((g) => g.items);
    expect(rows.find((r) => r.name === "Garlic powder")!.amount).toBe(
      "3 tsp + a pinch",
    );
    expect(rows.find((r) => r.name === "Cooking oil")!.amount).toBe(
      "3–3½ tbsp",
    );
    expect(rows.find((r) => r.name === "Salt")!.amount).toBe("1¾–2 tsp");
    expect(rows.filter((r) => r.name === "Garlic powder")).toHaveLength(1);
  });
  it.each([
    [
      [
        { value: 0.1, unit: "g" },
        { value: 0.2, unit: "g" },
      ],
      "0.3 g",
    ],
    [
      [
        { min: 1, max: 2, unit: "tsp" },
        { value: 0.25, unit: "tsp" },
      ],
      "1¼–2¼ tsp",
    ],
    [
      [
        { value: 100, unit: "g" },
        { value: 2, unit: "tbsp" },
      ],
      "100 g + 2 tbsp",
    ],
    [
      [
        { value: 1, unit: "kg" },
        { value: 200, unit: "g" },
      ],
      "1 kg + 200 g",
    ],
    [
      [
        { value: 1, unit: "T" },
        { value: 1, unit: "t" },
      ],
      "1 T + 1 t",
    ],
    [[{ value: 0.5, unit: "tsp" }, { text: "a pinch" }], "½ tsp + a pinch"],
    [[{ text: "to taste" }, { text: "to taste" }], "to taste"],
    [
      [
        { value: 2, unit: "can", package: { value: 400, unit: "g" } },
        { value: 1, unit: "can", package: { value: 400, unit: "g" } },
      ],
      "3 can (400 g each)",
    ],
    [
      [
        { value: 2, unit: "can", package: { value: 400, unit: "g" } },
        { value: 1, unit: "can", package: { value: 800, unit: "g" } },
      ],
      "2 can (400 g each) + 1 can (800 g each)",
    ],
    [
      [
        { value: 1e-7, unit: "g" },
        { value: 2e-7, unit: "g" },
      ],
      "3e-7 g",
    ],
  ] as [Quantity[], string][])(
    "formats safe totals or split quantities: %s",
    (quantities, expected) => {
      expect(
        gatherAmount(
          quantities.map((q, index) => ingredient(String(index), q)),
        ),
      ).toBe(expected);
    },
  );
  it("keeps optional allocations out of the required total", () => {
    const rows = gatheringGroups(
      recipe([
        ingredient("sauce", { value: 1, unit: "tsp" }),
        ingredient("finish", { value: 0.5, unit: "tsp" }, { optional: true }),
      ]),
    ).flatMap((g) => g.items);
    expect(rows[0]).toMatchObject({
      optional: false,
      amount: "1 tsp + ½ tsp optional",
    });
    expect(
      gatheringGroups(
        recipe([
          ingredient("only", { value: 0.5, unit: "tsp" }, { optional: true }),
        ]),
      )[0].items[0].optional,
    ).toBe(true);
  });
  it("separates different forms even when authors share a product key", () => {
    const rows = gatheringGroups(
      recipe([
        ingredient(
          "fresh",
          { value: 1, unit: "g" },
          { name: "Fresh garlic", gathering: { key: "garlic" } },
        ),
        ingredient(
          "powder",
          { value: 1, unit: "g" },
          { name: "Garlic powder", gathering: { key: "garlic" } },
        ),
      ]),
    ).flatMap((g) => g.items);
    expect(rows).toHaveLength(2);
    expect(
      gatheringGroups(
        recipe([
          ingredient(
            "a",
            { value: 1, unit: "g" },
            { gathering: { key: "same", form: "raw" } },
          ),
          ingredient(
            "b",
            { value: 1, unit: "g" },
            { gathering: { key: "same", form: "cooked" } },
          ),
        ]),
      ).flatMap((g) => g.items),
    ).toHaveLength(2);
  });
  it("uses explicit identities, labels and categories for ambiguous names and retains unknown products", () => {
    const r = recipe([
      ingredient(
        "a",
        { value: 1, unit: "g" },
        {
          foodId: "unknown-a",
          name: "Local variety",
          gathering: {
            key: "same-product",
            name: "Þorskur",
            category: "fridge",
            form: "fresh",
          },
        },
      ),
      ingredient(
        "b",
        { value: 2, unit: "g" },
        {
          foodId: "unknown-b",
          name: "Another label",
          gathering: { key: "same-product", category: "fridge", form: "fresh" },
        },
      ),
      ingredient("c", { text: "as needed" }, { foodId: "unknown-c" }),
    ]);
    const groups = gatheringGroups(r);
    expect(groups[0]).toMatchObject({
      id: "fridge",
      items: [{ name: "Þorskur", amount: "3 g" }],
    });
    expect(groups[1].id).toBe("other");
  });
  it("retains existing partial gathering progress and toggles all source IDs without touching unrelated checks", () => {
    const row = gatheringGroups(
      recipe([
        ingredient("a", { value: 1, unit: "g" }),
        ingredient("b", { value: 2, unit: "g" }),
      ]),
    )[0].items[0];
    const old = ["ingredient:a", "equipment:id:pan"];
    expect(isGathered(row, old)).toBe(false);
    const checked = toggleGathered(row, old);
    expect(checked).toEqual([
      "ingredient:a",
      "equipment:id:pan",
      "ingredient:b",
    ]);
    expect(isGathered(row, checked)).toBe(true);
    expect(toggleGathered(row, checked)).toEqual(["equipment:id:pan"]);
    expect(old).toEqual(["ingredient:a", "equipment:id:pan"]);
  });
  it("does not aggregate different unknown product names using foodId alone", () => {
    expect(
      gatheringGroups(
        recipe([
          ingredient("a", { value: 1, unit: "g" }, { name: "Garlic cloves" }),
          ingredient("b", { value: 1, unit: "g" }, { name: "Garlic granules" }),
        ]),
      ).flatMap((g) => g.items),
    ).toHaveLength(2);
  });
});
describe("structured and legacy recipe content", () => {
  it("preserves legacy prose and groups, and separates only explicitly marked advance work", () => {
    const r = recipe([ingredient("a", { value: 1, unit: "g" })]);
    expect(validateRecipe(r)).toEqual(r);
    expect(preparationSections(r).ordinary[0].items).toEqual(
      r.preparation[0].items,
    );
    const markup = renderToStaticMarkup(
      <StructuredContent
        recipe={r}
        blocks={[{ type: "action", text: r.preparation[0].items[0].text }]}
      />,
    );
    expect(markup.match(/class="recipe-action"/g)).toHaveLength(1);
    expect(markup).toContain("do not split. Even at punctuation!");
    const sections = preparationSections(roast);
    expect(sections.early.flatMap((g) => g.items.map((i) => i.id))).toEqual([
      "prep-oven-1",
    ]);
    expect(
      [...sections.early, ...sections.ordinary]
        .flatMap((g) => g.items.map((i) => i.id))
        .sort(),
    ).toEqual(
      roast.preparation.flatMap((g) => g.items.map((i) => i.id)).sort(),
    );
  });
  it("renders explicitly allocated partial amounts instead of an ingredient's whole-recipe total", () => {
    const r = recipe([ingredient("a", { value: 3, unit: "tsp" })]);
    r.quantityUsages = [
      {
        id: "sauce-share",
        ingredientId: "a",
        quantity: { value: 0.5, unit: "tsp" },
      },
    ];
    r.cooking[0].content = [
      {
        type: "ingredients",
        title: "Keep separate",
        items: [
          { ingredientId: "a", usageId: "sauce-share", note: "Sauce only" },
        ],
      },
    ];
    const fixed = validateRecipe(r);
    const markup = renderToStaticMarkup(
      <StructuredContent recipe={fixed} blocks={fixed.cooking[0].content!} />,
    );
    expect(markup).toContain("½ tsp");
    expect(markup).not.toContain("3 tsp");
    expect(markup).toContain('role="listitem"');
    expect(markup).toContain("Sauce only");
  });
  it.each([
    (r: Recipe) =>
      (r.ingredients[0].gathering = { category: "not-a-category" as any }),
    (r: Recipe) =>
      (r.cooking[0].content = [
        {
          type: "ingredients",
          title: "List",
          items: [{ ingredientId: "missing" }],
        },
      ]),
    (r: Recipe) =>
      (r.preparation[0].items[0].content = [
        {
          type: "ingredients",
          title: "List",
          items: [{ ingredientId: "a", usageId: "missing" }],
        },
      ]),
    (r: Recipe) => (r.cooking[0].content = [{ type: "action", text: "" }]),
  ])(
    "rejects malformed metadata and structured references before importing",
    (mutate) => {
      const r = recipe([ingredient("a", { value: 3, unit: "tsp" })]);
      mutate(r);
      expect(() => parseImport(JSON.stringify(r))).toThrow();
    },
  );
  it("rejects a split allocation belonging to a different ingredient", () => {
    const r = recipe([
      ingredient("a", { value: 3, unit: "tsp" }),
      ingredient("b", { value: 2, unit: "tsp" }),
    ]);
    r.quantityUsages = [
      { id: "other", ingredientId: "b", quantity: { value: 1, unit: "tsp" } },
    ];
    r.cooking[0].content = [
      {
        type: "ingredients",
        title: "List",
        items: [{ ingredientId: "a", usageId: "other" }],
      },
    ];
    expect(() => validateRecipe(r)).toThrow("different ingredient");
  });
  it("normalizes new display fields while preserving grouping identities, forms and valid Icelandic", () => {
    const r = recipe([
      ingredient(
        "a",
        { value: 0.5, unit: "tsp" },
        {
          gathering: {
            key: "identity-Â½",
            name: "Þorskur Â¼",
            form: "form-Â¼",
          },
        },
      ),
    ]);
    r.preparation[0].items[0].content = [
      { type: "action", text: "220Â°C, Â½ tsp" },
      {
        type: "ingredients",
        title: "Â¼ tsp",
        items: [{ ingredientId: "a", note: "Með smjöri Â½" }],
        note: "Separate Â¼",
      },
    ];
    const fixed = validateRecipe(r);
    expect(fixed.ingredients[0].gathering).toEqual({
      key: "identity-Â½",
      name: "Þorskur ¼",
      form: "form-Â¼",
    });
    expect(fixed.preparation[0].items[0].content).toEqual([
      { type: "action", text: "220°C, ½ tsp" },
      {
        type: "ingredients",
        title: "¼ tsp",
        items: [{ ingredientId: "a", note: "Með smjöri ½" }],
        note: "Separate ¼",
      },
    ]);
    expect(quantity({ value: 1.5, unit: "tsp" })).toBe("1½ tsp");
  });
});
