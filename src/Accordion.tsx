import { useId, type ReactNode } from "react";
import { Icon } from "./components";

export function Accordion({
  title,
  completed,
  total,
  collapsed,
  onToggle,
  children,
  className = "",
}: {
  title: string;
  completed: number;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const done = total > 0 && completed === total;
  return (
    <section
      className={`workflow-section ${className} ${done ? "is-complete" : ""}`}
      aria-label={title}
    >
      <h2>
        <button
          className="section-toggle"
          aria-expanded={!collapsed}
          aria-controls={id}
          onClick={onToggle}
        >
          <span className="section-title">{title}</span>
          <span className="section-count">
            {completed}/{total}
          </span>
          <span
            className="section-complete"
            role={done ? "img" : undefined}
            aria-label={done ? "Complete" : undefined}
          >
            {done && <Icon name="check" />}
          </span>
          <span className={`section-chevron ${collapsed ? "" : "expanded"}`}>
            <Icon name="arrow" size={18} />
          </span>
        </button>
      </h2>
      <div id={id} hidden={collapsed} className="section-body">
        {children}
      </div>
    </section>
  );
}
