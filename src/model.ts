export type Quantity =
  | { value: number; unit: string; package?: { value?: number; unit?: string } }
  | { min: number; max: number; unit: string }
  | { text: string };
export interface Ingredient {
  id: string;
  foodId: string;
  name: string;
  quantity: Quantity;
  componentId: string;
  optional: boolean;
  scaling: "linear" | "fixed" | "manual";
  preparation?: string;
  notes?: string;
}
export interface CheckItem {
  id: string;
  text: string;
  checkable?: boolean;
}
export interface TimerDefinition {
  id: string;
  label: string;
  durationSeconds: number;
}
export interface Stage {
  id: string;
  title: string;
  tip?: string;
  componentId?: string;
  instructions: (
    | { type: "text"; text: string }
    | { type: "quantity"; ingredientId: string; usageId?: string }
  )[];
  checklist: CheckItem[];
  timers: TimerDefinition[];
}
export interface Recipe {
  schemaVersion: 1;
  id: string;
  revision: number;
  identity: { title: string; subtitle?: string; description?: string };
  yield: { baseServings: number; servingDescription?: string };
  timing?: { totalMinutes?: number };
  components: { id: string; name: string }[];
  ingredients: Ingredient[];
  quantityUsages?: {
    id: string;
    ingredientId?: string;
    quantity?: Quantity;
    [key: string]: unknown;
  }[];
  preparation: {
    id: string;
    title: string;
    items: CheckItem[];
    tip?: string;
  }[];
  cooking: Stage[];
  media?: { id: string; path: string; alt?: string; [key: string]: unknown }[];
  equipment?: { id?: string; name?: string }[];
  notes?: { id?: string; text?: string; type?: string }[];
  serving?: { instructions?: string };
  storage?: Record<string, unknown>;
  history?: Record<string, unknown>;
  classification?: {
    dietary?: { vegetarian?: boolean };
    [key: string]: unknown;
  };
}
export interface TimerState {
  id: string;
  label: string;
  durationSeconds: number;
  endAt: number | null;
  remainingMs: number;
  status: "running" | "paused" | "cancelled";
}
export interface Session {
  id: string;
  recipeId: string;
  recipeSnapshot: Recipe;
  phase: "preparation" | "cooking" | "completed";
  currentStepId: string;
  checkedIds: string[];
  timers: Record<string, TimerState>;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
}
export interface Revision {
  key: string;
  recipeId: string;
  recipe: Recipe;
  savedAt: number;
  source: "bundled" | "import" | "recovery";
}
export interface RecipeRecord {
  id: string;
  recipe: Recipe | null;
  updatedAt: number;
}
export interface Backup {
  format: "kitchen-mode-cookbook";
  version: 1;
  exportedAt: string;
  recipes: Recipe[];
  history: Revision[];
  bundledOriginals: Recipe[];
  deletedRecipeIds: string[];
}
export function quantity(q: Quantity): string {
  if ("text" in q) return q.text;
  const amount = "value" in q ? String(q.value) : `${q.min}–${q.max}`;
  const pack =
    "package" in q && q.package
      ? ` (${q.package.value ?? ""} ${q.package.unit ?? ""} each)`
      : "";
  return `${amount} ${q.unit}${pack}`;
}
export function clockTime(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    s = secs % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
export function elapsed(session: Session, now = Date.now()): number {
  return Math.max(0, (session.completedAt ?? now) - session.startedAt);
}
export function startSession(recipe: Recipe): Session {
  const now = Date.now();
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `session-${now}-${Math.random().toString(36).slice(2)}`,
    recipeId: recipe.id,
    recipeSnapshot: structuredClone(recipe),
    phase: "preparation",
    currentStepId: recipe.cooking[0].id,
    checkedIds: [],
    timers: {},
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  };
}
export function finishSession(session: Session, now = Date.now()): Session {
  return { ...session, phase: "completed", completedAt: now, updatedAt: now };
}
export function undoFinish(session: Session, now = Date.now()): Session {
  return { ...session, phase: "cooking", completedAt: null, updatedAt: now };
}
export function timerAction(
  timer: TimerState | undefined,
  def: TimerDefinition,
  action: "start" | "pause" | "cancel",
  now = Date.now(),
): TimerState {
  if (action === "cancel")
    return {
      ...def,
      endAt: null,
      remainingMs: def.durationSeconds * 1000,
      status: "cancelled",
    };
  if (action === "pause")
    return {
      ...def,
      endAt: null,
      remainingMs: Math.max(0, (timer?.endAt ?? now) - now),
      status: "paused",
    };
  const ms =
    timer?.status === "paused" && timer.remainingMs > 0
      ? timer.remainingMs
      : def.durationSeconds * 1000;
  return { ...def, endAt: now + ms, remainingMs: ms, status: "running" };
}
