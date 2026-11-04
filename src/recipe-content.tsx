import { InlineIngredient } from "./components";
import {
  quantity,
  type IngredientReference,
  type Recipe,
  type RecipeContent,
} from "./model";

export function ReferencedIngredient({
  recipe,
  reference,
  concise = false,
}: {
  recipe: Recipe;
  reference: IngredientReference;
  concise?: boolean;
}) {
  const ingredient = recipe.ingredients.find(
    (i) => i.id === reference.ingredientId,
  )!;
  const usage = reference.usageId
    ? recipe.quantityUsages?.find((u) => u.id === reference.usageId)
    : undefined;
  return (
    <>
      <InlineIngredient
        ingredient={ingredient}
        concise={concise}
        amount={usage?.quantity ? quantity(usage.quantity) : undefined}
      />
      {reference.note && (
        <small className="ingredient-reference-note">{reference.note}</small>
      )}
    </>
  );
}
export function LegacyInstructions({
  recipe,
  instructions,
}: {
  recipe: Recipe;
  instructions: Recipe["cooking"][number]["instructions"];
}) {
  return (
    <>
      {instructions.map((instruction, i) =>
        instruction.type === "text" ? (
          <span key={i}>{instruction.text}</span>
        ) : (
          <span key={i}>
            <ReferencedIngredient recipe={recipe} reference={instruction} />
          </span>
        ),
      )}
    </>
  );
}
// Spans with list roles remain valid phrasing content inside checkbox labels.
// Both screens share the same authored blocks; no punctuation parser is used.
export function StructuredContent({
  recipe,
  blocks,
}: {
  recipe: Recipe;
  blocks: RecipeContent[];
}) {
  return (
    <span className="structured-content">
      {blocks.map((block, index) =>
        block.type === "action" ? (
          <span className="recipe-action" key={index}>
            {block.text}
          </span>
        ) : (
          <span
            className="ingredient-collection"
            role="group"
            aria-label={block.title}
            key={index}
          >
            <strong className="collection-title">{block.title}</strong>
            <span role="list">
              {block.items.map((reference, i) => (
                <span role="listitem" key={i}>
                  <ReferencedIngredient
                    recipe={recipe}
                    reference={reference}
                    concise
                  />
                </span>
              ))}
            </span>
            {block.note && (
              <span className="collection-note">{block.note}</span>
            )}
          </span>
        ),
      )}
    </span>
  );
}
