import { Icon } from "./components";
import { clockTime, elapsed, type Recipe, type Session } from "./model";
import { PhaseNav } from "./PhaseNav";

export function RecipeToolbar({
  recipe,
  session,
  now,
  step,
  onPhase,
  onIngredients,
  onExit,
}: {
  recipe: Recipe;
  session: Session;
  now: number;
  step?: number;
  onPhase: (phase: "gathering" | "preparation" | "cooking") => void;
  onIngredients: () => void;
  onExit: () => void;
}) {
  return (
    <header className="recipe-toolbar" aria-label="Recipe toolbar">
      <p className="recipe-toolbar-title">{recipe.identity.title}</p>
      <PhaseNav phase={session.phase} onNavigate={onPhase} />
      <span
        className="session-elapsed"
        role="timer"
        aria-label="Session elapsed time"
      >
        <Icon name="clock" size={16} />
        <span>{clockTime(elapsed(session, now))}</span>
      </span>
      {step !== undefined && (
        <span
          className="toolbar-step"
          aria-label={`Cooking step ${step} of ${recipe.cooking.length}`}
        >
          {step}/{recipe.cooking.length}
        </span>
      )}
      <button
        className="secondary toolbar-ingredients"
        onClick={onIngredients}
        aria-label="Ingredients"
      >
        <Icon name="book" size={19} />
        <span>Ingredients</span>
      </button>
      <button
        className="icon-button toolbar-exit"
        onClick={onExit}
        aria-label="Exit recipe"
      >
        <Icon name="close" />
      </button>
    </header>
  );
}
