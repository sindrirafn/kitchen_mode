import { useEffect, useRef, useState, type ReactNode } from "react";
import { photographs } from "./photography";
import {
  clockTime,
  quantity,
  timerAction,
  type Ingredient,
  type Recipe,
  type Session,
  type TimerDefinition,
  type TimerState,
} from "./model";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    book: (
      <>
        <path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z" />
        <path d="M12 6v15" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    back: <path d="m15 5-7 7 7 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: (
      <>
        <path d="M20 4C8 2 2 9 6 16s16 1 14-12Z" />
        <path d="M4 21 16 9" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m2 5a5 5 0 0 1 2 4v2" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.leaf}
    </svg>
  );
}
export function Photo({
  recipe,
  className = "",
  large = false,
}: {
  recipe: Recipe;
  className?: string;
  large?: boolean;
}) {
  const photo = photographs[recipe.id];
  const [failed, setFailed] = useState(false);
  return photo && !failed ? (
    <img
      className={`dish-photo ${className}`}
      src={`${import.meta.env.BASE_URL}images/${photo.file}${large ? "" : "-thumb"}.webp`}
      alt={`${photo.alt}. Serving inspiration; not the exact tested recipe.`}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`photo-placeholder ${className}`}
      role="img"
      aria-label="Illustrated recipe placeholder"
    >
      <Icon name="leaf" size={70} />
      <span>A little kitchen inspiration</span>
      <small>Recipe illustration</small>
    </div>
  );
}
export function RecipeMeta({ recipe }: { recipe: Recipe }) {
  return (
    <div className="recipe-meta">
      <span>
        <Icon name="people" size={17} />
        {recipe.yield.baseServings} servings
      </span>
      <span>
        <Icon name="clock" size={17} />
        {recipe.timing?.totalMinutes
          ? `About ${recipe.timing.totalMinutes} min`
          : "Time not specified"}
      </span>
    </div>
  );
}
export function IngredientList({ recipe }: { recipe: Recipe }) {
  return (
    <div className="ingredient-list">
      {recipe.components.map((c) => (
        <section key={c.id}>
          <h3>{c.name}</h3>
          <ul>
            {recipe.ingredients
              .filter((i) => i.componentId === c.id)
              .map((i) => (
                <li key={i.id}>
                  <span>
                    <b>{quantity(i.quantity)}</b> {i.name}
                    {i.optional && <em> · optional</em>}
                  </span>
                  {(i.preparation || i.notes) && (
                    <small>
                      {[i.preparation, i.notes].filter(Boolean).join(" · ")}
                    </small>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
export function InlineIngredient({
  ingredient,
  amount,
}: {
  ingredient: Ingredient;
  amount?: string;
}) {
  return (
    <strong className="quantity-ref">
      {amount ?? quantity(ingredient.quantity)} {ingredient.name}
      {ingredient.optional ? " (optional)" : ""}
    </strong>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      opener.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-header">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function TimerChip({
  def,
  state,
  now,
  onChange,
}: {
  def: TimerDefinition;
  state?: TimerState;
  now: number;
  onChange: (t: TimerState) => void;
}) {
  const running = state?.status === "running";
  const paused = state?.status === "paused";
  const done = running && state.endAt !== null && state.endAt <= now;
  const remaining = running
    ? Math.max(0, (state.endAt ?? now) - now)
    : paused
      ? state.remainingMs
      : def.durationSeconds * 1000;
  return (
    <div
      className={`timer-chip ${running ? "running" : ""} ${done ? "done" : ""}`}
    >
      <button
        onClick={() =>
          onChange(
            timerAction(state, def, running && !done ? "pause" : "start"),
          )
        }
        aria-label={`${running && !done ? "Pause" : paused ? "Resume" : done ? "Restart" : "Start"} ${def.label} timer`}
      >
        <Icon name="clock" />
        <span>
          {def.label}
          <b>
            {done ? "Time is up" : clockTime(remaining)}{" "}
            {running && !done
              ? "· Pause"
              : paused
                ? "· Resume"
                : done
                  ? "· Restart"
                  : "· Start"}
          </b>
        </span>
      </button>
      {state && state.status !== "cancelled" && (
        <button
          className="timer-cancel"
          aria-label={`Cancel ${def.label} timer`}
          onClick={() => onChange(timerAction(state, def, "cancel"))}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
export function CheckRow({
  id,
  text,
  checked,
  onChange,
  checkable = true,
}: {
  id: string;
  text: string;
  checked: boolean;
  onChange: () => void;
  checkable?: boolean;
}) {
  return checkable ? (
    <label className={`check-row ${checked ? "checked" : ""}`}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span>{text}</span>
    </label>
  ) : (
    <p className="check-row">{text}</p>
  );
}
export function AllTimers({
  session,
  now,
  onChange,
  exclude = [],
}: {
  session: Session;
  now: number;
  onChange: (t: TimerState) => void;
  exclude?: string[];
}) {
  const timers = Object.values(session.timers).filter(
    (t) => t.status !== "cancelled" && !exclude.includes(t.id),
  );
  return timers.length ? (
    <aside className="all-timers" aria-label="Other kitchen timers">
      <div className="eyebrow">On the go</div>
      <div className="timer-list">
        {timers.map((t) => (
          <TimerChip
            key={t.id}
            def={t}
            state={t}
            now={now}
            onChange={onChange}
          />
        ))}
      </div>
    </aside>
  ) : null;
}
