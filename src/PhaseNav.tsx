import type { Session } from "./model";
export function PhaseNav({
  phase,
  onNavigate,
}: {
  phase: Session["phase"];
  onNavigate: (phase: "gathering" | "preparation" | "cooking") => void;
}) {
  return (
    <nav className="phase-nav" aria-label="Recipe phases">
      {(
        [
          ["gathering", "Gather"],
          ["preparation", "Prep"],
          ["cooking", "Cook"],
        ] as const
      ).map(([key, label], index) => (
        <span key={key}>
          {index > 0 && (
            <span aria-hidden="true" className="phase-divider">
              ›
            </span>
          )}
          <button
            aria-current={phase === key ? "step" : undefined}
            onClick={() => onNavigate(key)}
          >
            {label}
          </button>
        </span>
      ))}
    </nav>
  );
}
