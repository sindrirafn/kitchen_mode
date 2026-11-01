import type { Recipe } from "./model";

// These are known UTF-8 sequences misread as Latin-1 or Windows-1252, not a
// general Unicode re-decoder. In particular, ordinary Icelandic stays intact.
const windows1252: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};
const repairs = new Map<string, string>();
function misread(text: string, windows: boolean): string {
  return Array.from(new TextEncoder().encode(text), (byte) =>
    windows
      ? (windows1252[byte] ?? String.fromCharCode(byte))
      : String.fromCharCode(byte),
  ).join("");
}
for (const character of "°¼½¾⅓⅔⅛⅜⅝⅞–—‘’“”…· ÁáÉéÍíÓóÚúÝýÐðÞþÆæÖö") {
  for (const windows of [false, true]) {
    const broken = misread(character, windows);
    repairs.set(broken, character);
    for (const twiceWindows of [false, true])
      repairs.set(misread(broken, twiceWindows), character);
  }
}
const replacements = [...repairs].sort(([a], [b]) => b.length - a.length);
const brokenText = new RegExp(
  replacements
    .map(([broken]) => broken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);
export function normalizeRecipeText(text: string): string {
  if (!/[ÂÃâ]/.test(text)) return text;
  // Two passes also repair the common double-encoded Â°C / fractions case.
  for (let pass = 0; pass < 2; pass++) {
    const before = text;
    text = text.replace(brokenText, (broken) => repairs.get(broken)!);
    if (text === before) break;
  }
  return text;
}
export function normalizeRecipe(recipe: Recipe): Recipe {
  // Clone at the data boundary. Never modify IDs, references, paths, numeric
  // amounts or unknown extension fields, and never mutate the stored original.
  const normalized = structuredClone(recipe);
  function fields(value: object | undefined, keys: string[]) {
    if (!value) return;
    const record = value as Record<string, unknown>;
    for (const key of keys)
      if (typeof record[key] === "string")
        record[key] = normalizeRecipeText(record[key]);
  }
  function amount(value: import("./model").Quantity | undefined) {
    fields(value, ["text", "unit"]);
    if (value && "package" in value) fields(value.package, ["unit"]);
  }
  fields(normalized.identity, ["title", "subtitle", "description"]);
  fields(normalized.yield, ["servingDescription"]);
  normalized.components.forEach((c) => fields(c, ["name"]));
  normalized.ingredients.forEach((ingredient) => {
    fields(ingredient, ["name", "preparation", "notes"]);
    amount(ingredient.quantity);
  });
  normalized.quantityUsages?.forEach((usage) => amount(usage.quantity));
  normalized.preparation.forEach((group) => {
    fields(group, ["title", "tip"]);
    group.items.forEach((item) => fields(item, ["text"]));
  });
  normalized.cooking.forEach((stage) => {
    fields(stage, ["title", "tip"]);
    stage.instructions.forEach((instruction) => {
      if (instruction.type === "text") fields(instruction, ["text"]);
    });
    stage.checklist.forEach((item) => fields(item, ["text"]));
    stage.timers.forEach((timer) => fields(timer, ["label"]));
  });
  normalized.equipment?.forEach((equipment) => fields(equipment, ["name"]));
  normalized.notes?.forEach((note) => fields(note, ["text"]));
  normalized.media?.forEach((media) => fields(media, ["alt"]));
  fields(normalized.serving, ["instructions"]);
  return normalized;
}
