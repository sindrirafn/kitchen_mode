import {
  quantity,
  type GatherCategory,
  type Ingredient,
  type Quantity,
  type Recipe,
} from "./model";

const categories: [GatherCategory, string][] = [
  ["produce", "Produce"],
  ["fridge", "Fridge & dairy"],
  ["oils", "Oils"],
  ["dry-goods", "Dry goods & spices"],
  ["other", "Other ingredients"],
];
// Only known products get a default kitchen location. Ambiguous imports have
// an honest fallback and can specify their own category and product identity.
const defaults: Record<string, GatherCategory> = {};
for (const [category, foods] of [
  [
    "produce",
    "onion carrot carrots celery garlic potato fresh-tomatoes palermo bell-pepper lemon lime lime-juice lime-zest acid",
  ],
  ["fridge", "chicken beef eggs milk yogurt butter parmesan wok-vegetables"],
  ["oils", "oil bread-oil sesame-oil"],
  [
    "dry-goods",
    "rice lentils flour yeast sugar sauce-sugar salt baking-powder garlic-powder onion-powder cumin paprika pepper black-pepper pepper-black chili oregano thyme rosemary ginger bay curry-powder garam-masala mustard-seeds farfalle chickpeas kidney-beans black-beans corn tomatoes canned-tomatoes chopped-tomatoes tomato-paste stock-cube soy oyster rice-vinegar worcestershire coconut-milk nachos",
  ],
] as [GatherCategory, string][])
  for (const food of foods.split(" ")) defaults[food] = category;

export interface GatherItem {
  id: string;
  sourceIds: string[];
  name: string;
  amount: string;
  optional: boolean;
  detail: string;
  allocations: {
    name: string;
    amount: string;
    component: string;
    optional: boolean;
    detail: string;
  }[];
}
function productName(name: string) {
  return name.replace(/\s+(?:for|to finish)\b.*$/i, "").trim();
}
function category(ingredient: Ingredient): GatherCategory {
  if (ingredient.gathering?.category) return ingredient.gathering.category;
  if (ingredient.foodId === "pepper") {
    if (/\b(black|white|ground|powder)\b/i.test(ingredient.name))
      return "dry-goods";
    if (/\b(bell|palermo|sweet)\b/i.test(ingredient.name)) return "produce";
    return "other";
  }
  return defaults[ingredient.foodId] ?? "other";
}
function form(ingredient: Ingredient) {
  return (
    ingredient.gathering?.form ??
    (
      productName(ingredient.name)
        .toLowerCase()
        .match(
          /\b(powder|paste|dried|fresh|frozen|boneless|bone-in|ground|canned|cooked|dry)\b/g,
        ) ?? []
    )
      .sort()
      .join(" ")
  );
}
function identity(ingredient: Ingredient) {
  const key =
    ingredient.gathering?.key ??
    `${ingredient.foodId}:${productName(ingredient.name).toLowerCase()}`;
  // Even a shared explicit key cannot silently erase an authored form or category.
  return JSON.stringify([key, form(ingredient), category(ingredient)]);
}
function packageKey(q: Quantity) {
  return "package" in q && q.package
    ? JSON.stringify(
        Object.entries(q.package).sort(([a], [b]) => a.localeCompare(b)),
      )
    : "";
}
function decimalSum(values: number[]): number {
  const terms = values.map((value) => {
    const [mantissa, exponent = "0"] = String(value).split("e");
    const scale = (mantissa.split(".")[1]?.length ?? 0) - Number(exponent);
    return { value: BigInt(mantissa.replace(".", "")), scale };
  });
  const scale = Math.max(0, ...terms.map((term) => term.scale));
  const total = terms.reduce(
    (sum, term) => sum + term.value * 10n ** BigInt(scale - term.scale),
    0n,
  );
  return Number(`${total}e-${scale}`);
}
export function gatherAmount(ingredients: Ingredient[]): string {
  const buckets: { quantity: Quantity; optional: boolean }[] = [];
  for (const ingredient of ingredients) {
    const q = ingredient.quantity;
    const existing = buckets.find(
      (bucket) =>
        bucket.optional === ingredient.optional &&
        ("text" in q
          ? "text" in bucket.quantity && bucket.quantity.text === q.text
          : !("text" in bucket.quantity) &&
            bucket.quantity.unit === q.unit &&
            packageKey(bucket.quantity) === packageKey(q)),
    );
    if (!existing) {
      buckets.push({
        quantity: structuredClone(q),
        optional: ingredient.optional,
      });
      continue;
    }
    if ("text" in q || "text" in existing.quantity) continue; // Never parse prose as a number.
    const a = existing.quantity;
    const min = decimalSum([
      "value" in a ? a.value : a.min,
      "value" in q ? q.value : q.min,
    ]);
    const max = decimalSum([
      "value" in a ? a.value : a.max,
      "value" in q ? q.value : q.max,
    ]);
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      Math.max(Math.abs(min), Math.abs(max)) > Number.MAX_SAFE_INTEGER
    ) {
      buckets.push({
        quantity: structuredClone(q),
        optional: ingredient.optional,
      });
      continue;
    }
    existing.quantity =
      min === max
        ? {
            value: min,
            unit: a.unit,
            ...("package" in a ? { package: a.package } : {}),
          }
        : { min, max, unit: a.unit };
  }
  const mixedOptional =
    ingredients.some((i) => i.optional) && ingredients.some((i) => !i.optional);
  return buckets
    .map(
      (bucket) =>
        `${quantity(bucket.quantity)}${mixedOptional && bucket.optional ? " optional" : ""}`,
    )
    .join(" + ");
}
export function gatheringGroups(
  recipe: Recipe,
): { id: string; title: string; items: GatherItem[] }[] {
  const products = new Map<string, Ingredient[]>();
  for (const ingredient of recipe.ingredients) {
    const key = identity(ingredient);
    products.set(key, [...(products.get(key) ?? []), ingredient]);
  }
  const groups = categories.map(([categoryId, title]) => ({
    id: categoryId,
    title,
    items: [...products.values()]
      .filter(([i]) => category(i) === categoryId)
      .map((ingredients): GatherItem => {
        const first = ingredients[0];
        const sourceIds = ingredients.map((i) => `ingredient:${i.id}`);
        return {
          id: sourceIds[0],
          sourceIds,
          name: first.gathering?.name ?? productName(first.name),
          amount: gatherAmount(ingredients),
          optional: ingredients.every((i) => i.optional),
          detail:
            ingredients.length === 1
              ? [first.preparation, first.notes].filter(Boolean).join(" · ")
              : "",
          allocations: ingredients.map((i) => ({
            name: i.name,
            amount: quantity(i.quantity),
            optional: i.optional,
            component: recipe.components.find((c) => c.id === i.componentId)!
              .name,
            detail: [i.preparation, i.notes].filter(Boolean).join(" · "),
          })),
        };
      }),
  }));
  return [
    ...groups,
    {
      id: "equipment",
      title: "Tools & equipment",
      items: (recipe.equipment ?? []).flatMap((e, index): GatherItem[] => {
        const id =
          e.id === undefined
            ? `equipment:index:${index}`
            : `equipment:id:${e.id}`;
        return e.name
          ? [
              {
                id,
                sourceIds: [id],
                name: e.name,
                amount: "",
                optional: false,
                detail: "",
                allocations: [],
              },
            ]
          : [];
      }),
    },
  ].filter((group) => group.items.length);
}
export function isGathered(
  item: Pick<GatherItem, "sourceIds">,
  checked: string[],
): boolean {
  return item.sourceIds.every((id) => checked.includes(id));
}
export function toggleGathered(
  item: Pick<GatherItem, "sourceIds">,
  checked: string[],
): string[] {
  return isGathered(item, checked)
    ? checked.filter((id) => !item.sourceIds.includes(id))
    : [...new Set([...checked, ...item.sourceIds])];
}
