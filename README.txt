Kitchen Mode initial family recipe bank — 6 approved tested recipes
Source: Google Sheet "Family Recipe Rotation — Tested & To Try", Recipe Bank (rows 2–7), retrieved October 29, 2026.

Files:
  recipe.schema.json — structural JSON Schema (Draft 2020-12)
  recipes/*.json — one recipe per file

Notes for Codex:
1. These are the approved tested recipes. NEVER replace tested quantities with modifications listed under history.proposedChanges.
2. Six files are authoritative for seed recipe CONTENT. The preparation and cooking stages are editorial conversions from the source sheet's methods, not verbatim step-for-step copies; please review during cooking.
3. media paths are prospective local asset references; images ARE NOT bundled. They must be sourced, licensed and generated as optimized assets before displaying images. status=asset-required and license.type=pending are intentional.
4. Some source amounts are approximate or unspecified and are kept as ranges or text. Do not invent precision.
5. Recipe format supports V1. For V2 automatic scaling, ingredient quantities are structured, but some authored instruction strings contain literal quantities. They should be converted to structured quantity references (including partial usage allocations) before promising that cooking instructions scale safely. Do not naïvely multiply durations/temperatures.
6. Ingredient units like can, whole and tbsp need conversion/mapping rules for cross-recipe shopping aggregation. Canonical foodId is an initial hint, not a complete ingredient catalog.
7. Imported recipe with same id replaces the active version only after validation/confirmation; keep older revision and running session snapshot.
8. Food safety: Use thermometer guidance where present. Promptly cool and refrigerate cooked rice.
9. This is the recipe-content package, not the actual app and not a claim of verified photography assets or device testing.
