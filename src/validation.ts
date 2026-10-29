import Ajv2020 from "ajv/dist/2020";
import schema from "../recipe.schema.json";
import type { Recipe, Backup } from "./model";
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(
  schema,
);
const validateQuantity = new Ajv2020({ strict: false }).compile({
  $schema: schema.$schema,
  $defs: schema.$defs,
  $ref: "#/$defs/quantity",
});
export class RecipeError extends Error {}
export function validateRecipe(value: unknown): Recipe {
  if (!validateSchema(value))
    throw new RecipeError(
      validateSchema.errors
        ?.slice(0, 8)
        .map(
          (e) =>
            `${e.instancePath || "Recipe"} ${e.message}${e.params.missingProperty ? `: ${e.params.missingProperty}` : ""}`,
        )
        .join("\n") || "Invalid recipe.",
    );
  const r = value as unknown as Recipe;
  const errors: string[] = [];
  // The source schema intentionally leaves metadata extensible. Guard fields
  // consumed by the UI so a schema-valid extension cannot break the cookbook.
  const optionalText = (v: unknown, path: string) => {
    if (v !== undefined && typeof v !== "string")
      errors.push(`${path} must be text.`);
  };
  optionalText(r.identity.subtitle, "identity.subtitle");
  optionalText(r.identity.description, "identity.description");
  if (
    r.timing?.totalMinutes !== undefined &&
    (typeof r.timing.totalMinutes !== "number" ||
      !Number.isFinite(r.timing.totalMinutes) ||
      r.timing.totalMinutes <= 0)
  )
    errors.push("timing.totalMinutes must be a positive number.");
  if (
    r.classification?.dietary !== undefined &&
    (!r.classification.dietary || typeof r.classification.dietary !== "object")
  )
    errors.push("classification.dietary must be an object.");
  for (const note of r.notes ?? []) optionalText(note.text, "notes.text");
  for (const e of r.equipment ?? []) optionalText(e.name, "equipment.name");
  const ids = (items: { id?: string }[], label: string, required = true) => {
    const set = new Set<string>();
    for (const item of items) {
      if (typeof item.id !== "string" || !item.id.trim()) {
        if (required) errors.push(`${label}: each item needs a nonempty id.`);
        continue;
      }
      if (set.has(item.id)) errors.push(`${label}: duplicate id “${item.id}”.`);
      set.add(item.id);
    }
    return set;
  };
  const components = ids(r.components, "Components"),
    ingredients = ids(r.ingredients, "Ingredients");
  ids([...r.preparation, ...r.cooking], "Stages");
  ids(
    [
      ...r.preparation.flatMap((p) => p.items),
      ...r.cooking.flatMap((s) => s.checklist),
    ],
    "Checklist",
  );
  ids(
    r.cooking.flatMap((s) => s.timers),
    "Timers",
  );
  ids(r.media ?? [], "Media");
  ids(r.equipment ?? [], "Equipment", false);
  ids(r.notes ?? [], "Notes", false);
  const usages = ids(r.quantityUsages ?? [], "Quantity usages");
  for (const i of r.ingredients) {
    optionalText(i.preparation, `Ingredient “${i.id}” preparation`);
    optionalText(i.notes, `Ingredient “${i.id}” notes`);
    if (!components.has(i.componentId))
      errors.push(
        `Ingredient “${i.id}”: unknown componentId “${i.componentId}”.`,
      );
    if ("min" in i.quantity && i.quantity.min > i.quantity.max)
      errors.push(`Ingredient “${i.id}”: quantity min must not exceed max.`);
  }
  for (const u of r.quantityUsages ?? []) {
    if (u.ingredientId && !ingredients.has(u.ingredientId))
      errors.push(`Usage “${u.id}”: unknown ingredientId “${u.ingredientId}”.`);
    if (u.quantity) {
      if (!validateQuantity(u.quantity))
        errors.push(`Usage “${u.id}”: invalid quantity.`);
    }
  }
  for (const s of r.cooking) {
    if (s.componentId && !components.has(s.componentId))
      errors.push(`Stage “${s.id}”: unknown componentId “${s.componentId}”.`);
    for (const i of s.instructions)
      if (i.type === "quantity") {
        if (!ingredients.has(i.ingredientId))
          errors.push(
            `Stage “${s.id}”: unknown ingredientId “${i.ingredientId}”.`,
          );
        if (i.usageId) {
          if (!usages.has(i.usageId))
            errors.push(`Stage “${s.id}”: unknown usageId “${i.usageId}”.`);
          const u = r.quantityUsages?.find((u) => u.id === i.usageId);
          if (u?.ingredientId && u.ingredientId !== i.ingredientId)
            errors.push(
              `Stage “${s.id}”: usage belongs to a different ingredient.`,
            );
        }
      }
    for (const c of s.checklist)
      if (
        typeof c.text !== "string" ||
        (c.checkable !== undefined && typeof c.checkable !== "boolean")
      )
        errors.push(`Stage “${s.id}”: checklist items need text.`);
  }
  // Validate explicit reference keys even in extensible schema fields.
  const timerIds = new Set(r.cooking.flatMap((s) => s.timers.map((t) => t.id)));
  function refs(v: unknown, path: string) {
    if (!v || typeof v !== "object") return;
    for (const [key, val] of Object.entries(v)) {
      const target =
        key === "ingredientId"
          ? ingredients
          : key === "componentId"
            ? components
            : key === "timerId"
              ? timerIds
              : key === "usageId"
                ? usages
                : null;
      if (target && (typeof val !== "string" || !target.has(val)))
        errors.push(`${path}: unknown ${key} “${String(val)}”.`);
      if (typeof val === "object") refs(val, `${path}/${key}`);
    }
  }
  refs(r, "Recipe");
  if (errors.length)
    throw new RecipeError([...new Set(errors)].slice(0, 12).join("\n"));
  return r;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function parseImport(text: string): Recipe | Backup {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new RecipeError(
      "This is not valid JSON. Paste the complete recipe object or Kitchen Mode cookbook backup, including its opening and closing braces.",
    );
  }
  if (v && typeof v === "object" && "format" in v) {
    const b = v as Backup;
    if (
      b.format !== "kitchen-mode-cookbook" ||
      b.version !== 1 ||
      !Array.isArray(b.recipes) ||
      !Array.isArray(b.history) ||
      !Array.isArray(b.bundledOriginals) ||
      !Array.isArray(b.deletedRecipeIds)
    )
      throw new RecipeError(
        "Unsupported backup. Expected a Kitchen Mode version 1 cookbook export.",
      );
    b.recipes.forEach(validateRecipe);
    b.bundledOriginals.forEach(validateRecipe);
    const seen = new Set<string>();
    for (const r of b.recipes) {
      if (seen.has(r.id))
        throw new RecipeError(`Backup contains duplicate recipe “${r.id}”.`);
      seen.add(r.id);
    }
    for (const h of b.history) {
      if (
        !h ||
        typeof h !== "object" ||
        typeof h.savedAt !== "number" ||
        !Number.isFinite(h.savedAt)
      )
        throw new RecipeError("Backup history needs valid savedAt timestamps.");
      validateRecipe(h.recipe);
      if (h.recipeId !== h.recipe.id)
        throw new RecipeError(
          "Backup history recipeId does not match its recipe.",
        );
    }
    if (b.deletedRecipeIds.some((id) => typeof id !== "string" || seen.has(id)))
      throw new RecipeError(
        "Backup deletedRecipeIds must be strings and must not include current recipes.",
      );
    return b;
  }
  return validateRecipe(v);
}
export type ImportDecision =
  "new" | "identical" | "update" | "conflict" | "older";
export function importDecision(
  current: Recipe | undefined,
  incoming: Recipe,
): ImportDecision {
  if (!current) return "new";
  if (canonical(current) === canonical(incoming)) return "identical";
  return incoming.revision > current.revision
    ? "update"
    : incoming.revision < current.revision
      ? "older"
      : "conflict";
}
