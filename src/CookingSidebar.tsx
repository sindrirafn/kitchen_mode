import { useEffect, useRef, useState } from "react";
import { Icon, TimerChip } from "./components";
import {
  clockTime,
  timerRemaining,
  type Recipe,
  type Session,
  type TimerState,
} from "./model";

export function CookingSidebar({
  recipe,
  session,
  now,
  onNavigate,
  onTimer,
}: {
  recipe: Recipe;
  session: Session;
  now: number;
  onNavigate: (id: string) => void;
  onTimer: (timer: TimerState) => void;
}) {
  const current = useRef<HTMLButtonElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const activeTimerCount = Object.values(session.timers).filter(
    (t) => t.status !== "cancelled",
  ).length;
  const hasExpiredTimer = Object.values(session.timers).some(
    (t) => t.status === "running" && t.endAt !== null && t.endAt <= now,
  );
  useEffect(() => {
    // Scroll only the timeline region; scrollIntoView can move the entire page
    // on Safari, taking active timers and the instruction heading out of view.
    const row = current.current,
      parent = timeline.current;
    if (!row || !parent) return;
    const rect = row.getBoundingClientRect(),
      bounds = parent.getBoundingClientRect();
    if (rect.top < bounds.top) parent.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom)
      parent.scrollTop += rect.bottom - bounds.bottom;
  }, [session.currentStepId, expanded, activeTimerCount, hasExpiredTimer]);
  const timers = Object.values(session.timers)
    .filter((t) => t.status !== "cancelled")
    .sort(
      (a, b) =>
        Number(b.status === "running" && timerRemaining(b, now) === 0) -
        Number(a.status === "running" && timerRemaining(a, now) === 0),
    );
  return (
    <aside className="cooking-aside" aria-label="Cooking timeline and timers">
      <div className="timeline-region">
        <div className="timeline-heading">
          <h3>Cooking timeline</h3>
          <button
            className="text-button timeline-toggle"
            aria-expanded={expanded}
            aria-controls="cooking-timeline"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide steps" : "Show steps"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div
          className={`timeline-scroll ${expanded ? "mobile-expanded" : ""}`}
          id="cooking-timeline"
          ref={timeline}
        >
          <ol className="timeline-list">
            {recipe.cooking.map((stage) => {
              const isCurrent = stage.id === session.currentStepId;
              const completed = !!session.completedStepIds?.includes(stage.id);
              const visited = !!session.visitedStepIds?.includes(stage.id);
              const status = completed
                ? "Completed"
                : visited
                  ? "Visited · not completed"
                  : "Upcoming";
              const active = stage.timers
                .map((def) => session.timers[def.id])
                .filter((t) => t && t.status !== "cancelled");
              return (
                <li
                  key={stage.id}
                  className={`${isCurrent ? "current" : ""} ${completed ? "completed" : ""}`}
                >
                  <button
                    ref={isCurrent ? current : undefined}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => onNavigate(stage.id)}
                  >
                    <span className="timeline-marker" aria-hidden="true">
                      {completed ? (
                        <Icon name="check" size={17} />
                      ) : isCurrent ? (
                        "●"
                      ) : (
                        "○"
                      )}
                    </span>
                    <span className="timeline-copy">
                      <span className="timeline-title">{stage.title}</span>
                      <small>
                        {isCurrent
                          ? `Current${completed ? " · completed" : ""}`
                          : status}
                      </small>
                      {active.map((timer) => (
                        <span
                          className={`timeline-timer ${timer.status === "running" && timerRemaining(timer, now) === 0 ? "expired" : ""}`}
                          key={timer.id}
                        >
                          <Icon name="clock" size={13} /> {timer.label} ·{" "}
                          {timer.status === "running" &&
                          timerRemaining(timer, now) === 0
                            ? "Time is up"
                            : `${clockTime(timerRemaining(timer, now))}${timer.status === "paused" ? " · paused" : ""}`}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {!!timers.length && (
        <section className="active-timer-panel" aria-label="Active timers">
          <h3>
            Timers <span>{timers.length}</span>
          </h3>
          <div className="active-timers-scroll">
            <div className="timer-list">
              {timers.map((timer) => (
                <TimerChip
                  key={timer.id}
                  def={timer}
                  state={timer}
                  now={now}
                  onChange={onTimer}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </aside>
  );
}
