# Recipe layout and gathering metadata

These optional fields extend `schemaVersion: 1`. Older recipes remain valid. Keep existing IDs, quantities, `text`, `instructions`, checklists and timers: they are the complete fallback for older apps and saved sessions. `content` changes presentation only; it does not create cooking stages, timers or automatic tasks.

## Gathering

An ingredient may specify:

```json
"gathering": {
  "key": "fresh-garlic",
  "name": "Garlic",
  "category": "produce",
  "form": "fresh cloves"
}
```

- `key`: product identity shared across component uses. Different `foodId` values may use the same explicit key when they really describe the same product. Use distinct keys for alternatives or products that must be gathered separately.
- `name`: the consolidated row's display name. Use a consistent label on ingredients sharing a key; the first authored occurrence supplies the label.
- `category`: `produce`, `fridge`, `oils`, `dry-goods`, or `other`. The UI labels these Produce, Fridge & dairy, Oils, Dry goods & spices, and Other ingredients. Named equipment is listed under Tools & equipment.
- `detail`: optional identifying condition that must be visible while gathering (for example, “day-old and refrigerated”). The normal `preparation` field is not shown in Gather; existing `notes` remain visible. Do not duplicate washing/chopping actions here.
- `form`: an explicit product form, such as fresh cloves, powder, frozen, or cooked. Different forms remain distinct even with a shared key. Give all uses of the same product the same form and category.

Without metadata, identity uses both `foodId` and the product name with component-use suffixes (`for …`, `to finish …`) removed. Thus “Garlic for sauce” and “Garlic for roasting” can share one row. Recognized form words protect fresh/frozen, powder/paste, dry/cooked, and similar distinctions. Unknown product names are kept separate; `foodId` alone is not enough to merge them. Known foods receive default kitchen categories. Ambiguous pepper names are handled conservatively, and unknown products appear in Other ingredients. Explicit JSON resolves cases the defaults cannot know, including local or Icelandic product names.

Totals use **exactly matching units and package descriptions**, with fixed/range bounds added separately. Decimal addition avoids artifacts such as `0.30000000000000004`. Common halves, quarters and eighths render as fractions without changing stored numbers. Different units are kept as separate amounts on the same row: `1 kg + 200 g`, not an assumed conversion. No mass/volume, spoon-size, drained-weight or package-size conversion is performed. Different can sizes stay separate. Text amounts are never parsed as numbers: `3 tsp + a pinch` stays that way. Identical text amounts such as “to taste” appear once in the summary; every authored allocation remains in the full **Ingredients** list. Gather omits component allocations to keep collection rows compact.

Required and optional portions are totaled separately (`1 tsp + ½ tsp optional`). A row is wholly optional only if all of its uses are optional. A shared checkbox marks all original ingredient IDs. Older partially gathered uses show a mixed checkbox; checking or unchecking updates every use. No browser-data migration is needed.

## Structured preparation and cooking

Add `content` to a preparation item or cooking stage. Keep the existing preparation item's `text` or the stage's legacy `instructions` as a complete fallback. When `content` exists, the renderer displays its ordered blocks instead of that fallback.

```json
"content": [
  { "type": "action", "text": "Measure the mustard seeds separately." },
  {
    "type": "ingredients",
    "title": "Keep separate",
    "items": [{ "ingredientId": "mustard-seeds" }]
  },
  { "type": "action", "text": "Combine the curry spices." },
  {
    "type": "ingredients",
    "title": "Curry spice mix",
    "items": [
      { "ingredientId": "curry-powder" },
      { "ingredientId": "cumin" },
      { "ingredientId": "garlic-powder" },
      { "ingredientId": "ginger" }
    ],
    "note": "Keep the mustard seeds out of this mix."
  }
]
```

An action is one authored line. Punctuation inside it stays intact; the app never splits prose on periods, commas or semicolons. Ingredient collections are vertical lists using original ingredient quantities and optional flags. The existing component-use suffix cleanup (`for …`, `to finish …`) supplies contextual names without changing ingredient records; the full Ingredients list keeps the original usage names. A collection is a visual grouping; its title and surrounding actions must accurately describe whether to measure, combine, reserve or keep ingredients separate. Include every original instruction and safety caveat. Do not infer combinations from shared components or products. Individual references may also have a `note`.

For a **partial amount**, use an existing `quantityUsages` allocation:

```json
"quantityUsages": [
  {
    "id": "sauce-garlic-share",
    "ingredientId": "garlic-powder",
    "quantity": { "value": 0.5, "unit": "tsp" }
  }
]
```

Then reference `{ "ingredientId": "garlic-powder", "usageId": "sauce-garlic-share" }` in the collection. This displays only ½ tsp, independently of the ingredient's whole-recipe total. Gathering continues to use ingredient quantities, not additional usage quantities. Usage references must exist and belong to the same ingredient. Supply a quantity on partial usages; without one, legacy semantics fall back to the ingredient's full quantity. Do not add usage amounts again to the ingredient total.

## Long-lead preparation

Set `longLead: true` on a preparation group to put its tasks in **Start these first**, or on an individual preparation item to separate just that task (for example preheating). Set `longLead: false` to keep a group/item in ordinary preparation. Explicit item flags override group flags. Older recipes without flags retain conservative detection of explicit preheating/early dough work; “do not preheat” is not promoted. Source order is preserved within each section. A split group's tip appears once with its ordinary remainder; all task IDs and check progress remain unchanged.

## Storage, revisions and text encoding

The six bundled recipes add presentation metadata only: all original fields, IDs, revisions, amounts, preparation fallback text and cooking instructions are retained. Imported overrides continue to take precedence. Old sessions keep their own snapshots and do not acquire newer layout content mid-cook. Intentional authored recipe changes should advance `revision`; same-revision content differences, including layout metadata, continue to require explicit import replacement confirmation.

Imports and backup restores validate these fields before writing. Backups, version recovery and session snapshots retain them. Known mojibake repair also covers structured actions, collection titles/notes and gathering labels, while leaving keys, forms, IDs, references and numbers untouched. Valid Unicode and Icelandic letters remain intact. Unknown encoding damage remains unchanged. See `src/recipe-text.ts` and the encoding tests for the bounded repair list.

## Compact workflow metadata

Preparation groups may provide `earlyTitle` and `continuationTitle` for the existing split between long-lead and ordinary items. These are presentation labels only, useful when a group contains both oven preheating and equipment setup. They do not add/reorder actions, change checkbox IDs, or update imported/local revisions. Leave them out to retain the original group title.

Equipment may provide `gathering: {"key": "receiving-bowl", "name": "Receiving bowl"}`. Exact names ignoring case and whitespace share one collection row by default. Explicit shared keys identify differently named aliases; distinct keys keep genuinely separate tools apart, even with identical names. No synonyms are guessed. All original equipment check IDs remain associated with the row, including mixed older progress.

The session model stores optional `collapsedSectionIds`, `completedStepIds` and `visitedStepIds`. Old sessions read with empty defaults, without deriving completion from current position or changing the saved recipe snapshot. `Next step` explicitly completes its current stage; timeline navigation never completes skipped stages. This is stage navigation, not a clock-based schedule. Only existing authored timer durations/countdowns are displayed; none are inferred as stage duration.

Gather display formatting does not modify recipe quantities: identical gram units are summed first, then totals of at least 1000 g may display in kg. Incompatible units remain split even when their display units match. Text is not parsed for arithmetic. `whole` is omitted for whole counts; the exact phrase `a little, to taste` is abbreviated to `to taste`. Optional and approximate source information is retained.
