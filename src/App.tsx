import { useEffect, useRef, useState } from "react";
import { RecipeRepository } from "./repository";
import { canonical } from "./validation";
import {
  clockTime,
  elapsed,
  finishSession,
  quantity,
  startSession,
  undoFinish,
  type Backup,
  type Recipe,
  type Revision,
  type Session,
  type TimerState,
} from "./model";
import {
  AllTimers,
  CheckRow,
  Icon,
  IngredientList,
  InlineIngredient,
  Modal,
  Photo,
  RecipeMeta,
  TimerChip,
} from "./components";
import { ImportRecipe } from "./ImportRecipe";
import { photographs } from "./photography";
type View = "library" | "intro" | "session" | "journal";
type Dialog =
  | "import"
  | "cookbook"
  | "ingredients"
  | "recovery"
  | "exit-session"
  | "discard-session"
  | null;
export function App() {
  const [repo, setRepo] = useState<RecipeRepository | null>(null),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("library"),
    [selected, setSelected] = useState<Recipe | null>(null),
    [dialog, setDialog] = useState<Dialog>(null),
    [query, setQuery] = useState(""),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [offlineReady, setOfflineReady] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [recovery, setRecovery] = useState<Revision[]>([]),
    [recoveryCandidate, setRecoveryCandidate] = useState<Revision | null>(null),
    [archiveCandidate, setArchiveCandidate] = useState(false),
    [exiting, setExiting] = useState(false),
    [exitError, setExitError] = useState("");
  const sessionRef = useRef<Session | null>(null),
    saveQueue = useRef(Promise.resolve()),
    pending = useRef<Session | null>(null),
    headingRef = useRef<HTMLHeadingElement>(null),
    contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const repository = new RecipeRepository();
    (async () => {
      try {
        await repository.open();
        const active = await repository.activeSession();
        const [all, history] = await Promise.all([
          repository.list(),
          repository.listSessions(),
        ]);
        if (cancelled) {
          repository.close();
          return;
        }
        setRepo(repository);
        setRecipes(all);
        setSessions(history);
        if (repository.recoveryWarning) setError(repository.recoveryWarning);
        if (active) {
          setSession(active);
          sessionRef.current = active;
          setSelected(active.recipeSnapshot);
          setView("session");
        }
      } catch {
        setError(
          "Your cookbook could not be opened. Reload to retry; saved data has not been deleted.",
        );
      }
    })();
    return () => {
      cancelled = true;
      repository.close();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const visible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let live = true;
    let currentRegistration: ServiceWorkerRegistration | undefined;
    let lastCheck = 0;
    let hadController = !!navigator.serviceWorker.controller;
    const checkForRepair = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        Date.now() - lastCheck < 60_000
      )
        return;
      lastCheck = Date.now();
      void currentRegistration?.update().catch(() => {});
    };
    const controllerChanged = () => {
      if (!live) return;
      setOfflineReady(true);
      if (hadController)
        setToast(
          "App files updated. Reload when ready; your saved cookbook and cooking progress are kept.",
        );
      hadController = true;
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    document.addEventListener("visibilitychange", checkForRepair);
    window.addEventListener("online", checkForRepair);
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then(async (registration) => {
        currentRegistration = registration;
        await navigator.serviceWorker.ready;
        if (live) setOfflineReady(true);
        if (registration.waiting && live)
          setToast(
            "An app-file update is being installed. Your saved cookbook and cooking progress are kept.",
          );
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller &&
              live
            )
              setToast(
                "App files updated. Reload when ready; your saved cookbook and cooking progress are kept.",
              );
          });
        });
        checkForRepair();
      })
      .catch(() => {
        if (live)
          setToast(
            "Offline installation did not finish. Reconnect and reopen the app before relying on it offline.",
          );
      });
    return () => {
      live = false;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      document.removeEventListener("visibilitychange", checkForRepair);
      window.removeEventListener("online", checkForRepair);
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
    contentRef.current?.scrollTo(0, 0);
  }, [view, session?.phase, session?.currentStepId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 9000);
    return () => clearTimeout(t);
  }, [toast]);
  function report(e: unknown) {
    setError(
      e instanceof Error
        ? e.message
        : "Something could not be saved. Please try again.",
    );
  }
  function updateSession(next: Session) {
    const saved = { ...next, updatedAt: Date.now() };
    setNow(saved.updatedAt);
    sessionRef.current = saved;
    setSession(saved);
    setSessions((old) => [saved, ...old.filter((s) => s.id !== saved.id)]);
    pending.current = saved;
    if (!repo) return;
    // Starting each transaction immediately also writes the recovery journal
    // synchronously. IndexedDB serializes transactions over these same stores.
    saveQueue.current = repo
      .saveSession(saved)
      .then(() => {
        if (pending.current === saved) {
          pending.current = null;
          setError("");
        }
      })
      .catch(report);
  }
  async function retrySave() {
    if (!pending.current) return;
    try {
      await repo?.saveSession(pending.current);
      pending.current = null;
      setError("");
    } catch (e) {
      report(e);
    }
  }
  function editSession(edit: (s: Session) => Session) {
    if (sessionRef.current) updateSession(edit(sessionRef.current));
  }
  function check(id: string) {
    editSession((s) => ({
      ...s,
      checkedIds: s.checkedIds.includes(id)
        ? s.checkedIds.filter((k) => k !== id)
        : [...s.checkedIds, id],
    }));
  }
  function changeTimer(timer: TimerState) {
    editSession((s) => ({ ...s, timers: { ...s.timers, [timer.id]: timer } }));
  }
  function openRecipe(r: Recipe) {
    setSelected(r);
    setView("intro");
  }
  function resume(s: Session) {
    sessionRef.current = s;
    setSession(s);
    setSelected(s.recipeSnapshot);
    setView("session");
    updateSession(s);
  }
  function start() {
    if (!selected) return;
    const existing = sessions.find(
      (s) => s.recipeId === selected.id && s.phase !== "completed",
    );
    if (existing) resume(existing);
    else {
      const next = startSession(selected);
      updateSession(next);
      setView("session");
    }
  }
  async function library() {
    await saveQueue.current;
    try {
      if (!pending.current) await repo?.clearActive();
      setView("library");
    } catch (e) {
      report(e);
    }
  }
  function requestExit() {
    if (view === "session" && sessionRef.current?.phase !== "completed") {
      setExitError("");
      setDialog("exit-session");
    } else void library();
  }
  async function exitSession(discard: boolean) {
    const current = sessionRef.current;
    if (!repo || !current || exiting) return;
    setExiting(true);
    setExitError("");
    try {
      await saveQueue.current;
      if (discard) {
        await repo.discardSession(current.id);
        pending.current = null;
        sessionRef.current = null;
        setSession(null);
        setSessions((old) => old.filter((s) => s.id !== current.id));
      } else {
        // Retry any interrupted save before promising that the session is kept.
        if (pending.current) await repo.saveSession(pending.current);
        await repo.clearActive();
        pending.current = null;
      }
      setError("");
      setDialog(null);
      setView("library");
    } catch (e) {
      setExitError((e as Error).message);
    } finally {
      setExiting(false);
    }
  }
  async function refresh() {
    if (repo) setRecipes(await repo.list());
  }
  async function importValue(value: Recipe | Backup) {
    if (!repo) return;
    if ("format" in value) await repo.restoreBackup(value);
    else await repo.saveRecipe(value);
    await refresh();
    setToast(
      "format" in value
        ? "Cookbook restored on this device."
        : "Recipe saved to your cookbook.",
    );
  }
  async function exportCookbook() {
    if (!repo) return;
    try {
      await saveQueue.current;
      const backup = await repo.exportCookbook();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const filename = `kitchen-mode-cookbook-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setToast(
        "Cookbook exported. Save the JSON file somewhere safe, such as Files or iCloud Drive.",
      );
    } catch (e) {
      report(e);
    }
  }
  async function openRecovery() {
    if (!repo || !selected) return;
    try {
      setRecovery(await repo.history(selected.id));
      setRecoveryCandidate(null);
      setArchiveCandidate(false);
      setDialog("recovery");
    } catch (e) {
      report(e);
    }
  }
  async function restoreRevision() {
    if (!repo || !recoveryCandidate) return;
    try {
      await repo.saveRecipe(recoveryCandidate.recipe, "recovery");
      await refresh();
      setSelected(recoveryCandidate.recipe);
      setRecovery(await repo.history(recoveryCandidate.recipeId));
      setRecoveryCandidate(null);
      setToast("Recipe restored. Cooking sessions keep their original recipe.");
    } catch (e) {
      report(e);
    }
  }
  async function archiveRecipe() {
    if (!repo || !selected) return;
    try {
      await repo.archive(selected.id);
      await refresh();
      setDialog(null);
      setView("library");
      setToast(
        "Recipe archived. Its saved versions remain in cookbook recovery.",
      );
    } catch (e) {
      report(e);
    }
  }
  const r = view === "session" && session ? session.recipeSnapshot : selected;
  const stage =
    r && session
      ? (r.cooking.find((s) => s.id === session.currentStepId) ?? r.cooking[0])
      : null;
  const index = r && stage ? r.cooking.findIndex((s) => s.id === stage.id) : 0;
  const cooking = view === "session" && session?.phase === "cooking";
  const preparing = view === "session" && session?.phase === "preparation";
  const complete = view === "session" && session?.phase === "completed";
  const unfinished = sessions.filter((s) => s.phase !== "completed");
  const expired =
    view === "session" && session?.phase !== "completed"
      ? Object.values(session?.timers ?? {}).filter(
          (t) => t.status === "running" && t.endAt !== null && t.endAt <= now,
        )
      : [];
  const filtered = recipes.filter((r) =>
    `${r.identity.title} ${r.identity.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className={`app ${cooking ? "cooking-app" : ""}`}>
      <header className="site-header">
        <button
          className="brand"
          onClick={requestExit}
          aria-label="Kitchen Mode, back to recipes"
        >
          <span className="brand-symbol">
            <Icon name="book" size={25} />
          </span>
          <span>
            Kitchen Mode<small>THE FAMILY COOKBOOK</small>
          </span>
        </button>
        {view === "library" || view === "journal" ? (
          <>
            <nav aria-label="Cookbook">
              <button
                className={
                  view === "library" ? "nav-link selected" : "nav-link"
                }
                onClick={() => setView("library")}
              >
                Recipes
              </button>
              <button
                className={
                  view === "journal" ? "nav-link selected" : "nav-link"
                }
                onClick={() => setView("journal")}
              >
                Cooking journal
              </button>
            </nav>
            <button
              className="header-action secondary"
              onClick={() => setDialog("import")}
              disabled={!repo}
            >
              <Icon name="plus" />
              Import Recipe
            </button>
          </>
        ) : (
          <div className="header-session">
            <span className="device-status">
              <i />
              {session && view === "session"
                ? `In the kitchen · ${clockTime(elapsed(session, now))}`
                : "Made for your kitchen"}
            </span>
            <button className="text-button" onClick={requestExit}>
              Exit recipe
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
      </header>
      {error && (
        <div className="error storage-error" role="alert">
          {error}
          {pending.current && (
            <button className="secondary" onClick={retrySave}>
              Retry saving
            </button>
          )}
          <button className="text-button" onClick={exportCookbook}>
            Export Cookbook
          </button>
        </div>
      )}
      {repo && !repo.persistent && (
        <div className="error storage-error" role="alert">
          Device storage is unavailable. Changes last only while this page is
          open. Export your cookbook before leaving.
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            aria-label="Dismiss message"
            className="icon-button"
            onClick={() => setToast("")}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {!repo && !error && (
        <main className="loading">
          <Icon name="book" size={40} />
          <p>Opening your cookbook…</p>
        </main>
      )}
      {view === "library" && repo && (
        <main className="library page-width">
          <section className="library-intro">
            <div>
              <p className="eyebrow">
                <span className="tiny-rule" />
                FROM OUR KITCHEN TO YOUR TABLE
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                Everyday food.
                <br />
                <em>Made with a little love.</em>
              </h1>
              <p className="intro-copy">
                Well-loved recipes. A calmer way to cook.
                <br className="phone-break" /> Let’s make something good.
              </p>
            </div>
            <div className="intro-mark" aria-hidden="true">
              <Icon name="leaf" size={45} />
              <span>
                Good things
                <br />
                take a little thyme.
              </span>
            </div>
          </section>
          {unfinished.length > 0 && (
            <button
              className="resume-banner"
              onClick={() => resume(unfinished[0])}
            >
              <Icon name="clock" />
              <span>
                <small>RIGHT WHERE YOU LEFT OFF</small>
                <b>{unfinished[0].recipeSnapshot.identity.title}</b>
                <em>
                  {unfinished[0].phase === "preparation"
                    ? "Preparation"
                    : unfinished[0].recipeSnapshot.cooking.find(
                        (s) => s.id === unfinished[0].currentStepId,
                      )?.title}{" "}
                  · revision {unfinished[0].recipeSnapshot.revision}
                </em>
              </span>
              <span className="resume-label">
                Resume
                <Icon name="arrow" />
              </span>
            </button>
          )}
          <div className="library-toolbar">
            <div>
              <h2>The recipe collection</h2>
              <span>{recipes.length} recipes, ready when you are</span>
            </div>
            <label className="search">
              <Icon name="search" size={18} />
              <input
                aria-label="Find a recipe"
                placeholder="Find a recipe…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="recipe-grid">
            {filtered.map((recipe, i) => (
              <button
                className="recipe-card"
                key={recipe.id}
                onClick={() => openRecipe(recipe)}
              >
                <div className="card-image">
                  <Photo recipe={recipe} />
                  <span className="recipe-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {recipe.classification?.dietary?.vegetarian && (
                    <span className="vegetarian">
                      <Icon name="leaf" size={14} />
                      Vegetarian
                    </span>
                  )}
                </div>
                <div className="card-copy">
                  <h3>{recipe.identity.title}</h3>
                  <p>
                    {recipe.identity.description ?? recipe.identity.subtitle}
                  </p>
                  <div className="card-bottom">
                    <RecipeMeta recipe={recipe} />
                    <span className="card-arrow">
                      <Icon name="arrow" size={18} />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="empty-state">
              No recipes found. Try another word, or import a family favourite.
            </p>
          )}
          <footer className="library-footer">
            <span>
              <Icon name="leaf" size={17} />A cookbook to come back to.
            </span>
            <button
              className="text-button"
              onClick={() => setDialog("cookbook")}
            >
              Your cookbook & backups
              <Icon name="arrow" size={16} />
            </button>
            <span className="offline-status">
              <i />
              {offlineReady
                ? "Ready for offline cooking"
                : !online
                  ? "You’re offline"
                  : "Saved on this device"}
            </span>
          </footer>
        </main>
      )}
      {view === "intro" && r && (
        <main className="recipe-intro page-width">
          <button className="back-link" onClick={() => void library()}>
            <Icon name="back" size={17} />
            The recipe collection
          </button>
          <div className="intro-layout">
            <figure>
              <Photo recipe={r} large />
              <figcaption>
                Serving inspiration ·{" "}
                <a
                  href={photographs[r.id]?.source ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {photographs[r.id]?.creator ?? "Recipe illustration"}
                </a>
                {photographs[r.id] ? " / Pexels" : ""}
              </figcaption>
            </figure>
            <section className="intro-description">
              <p className="eyebrow">A PAGE FROM THE FAMILY COOKBOOK</p>
              <h1 ref={headingRef} tabIndex={-1}>
                {r.identity.title}
              </h1>
              {r.identity.subtitle && (
                <p className="subtitle">{r.identity.subtitle}</p>
              )}
              {r.identity.description &&
                r.identity.description !== r.identity.subtitle && (
                  <p>{r.identity.description}</p>
                )}
              <RecipeMeta recipe={r} />
              <div className="intro-note">
                <Icon name="leaf" />
                <p>
                  A little preparation, then one step at a time.
                  <br />
                  We’ll keep your place along the way.
                </p>
              </div>
              <button className="primary start-button" onClick={start}>
                {unfinished.some((s) => s.recipeId === r.id)
                  ? unfinished.find((s) => s.recipeId === r.id)?.phase ===
                    "preparation"
                    ? "Resume preparing"
                    : "Resume cooking"
                  : "Start Preparing"}
                <Icon name="arrow" />
              </button>
              <p className="small muted">
                Base recipe · revision {r.revision} · quantities as authored
              </p>
            </section>
          </div>
          <div className="intro-details">
            <section>
              <p className="eyebrow">BEFORE YOU BEGIN</p>
              <h2>Everything in its place.</h2>
              <p>
                Gather your ingredients and equipment. Check things off as you
                prepare; you can always move at your own pace.
              </p>
              {r.equipment && (
                <p className="equipment">
                  {r.equipment
                    .map((e) => e.name)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {r.notes
                ?.filter((n) => n.text)
                .map((n, i) => (
                  <p className="source-note" key={n.id ?? i}>
                    {n.text}
                  </p>
                ))}
              <button className="text-button" onClick={openRecovery}>
                Recipe versions & recovery
                <Icon name="arrow" size={16} />
              </button>
            </section>
            <IngredientList recipe={r} />
          </div>
        </main>
      )}
      {preparing && r && session && (
        <main className="preparation page-width">
          <div className="phase-heading">
            <div>
              <p className="eyebrow">01 / PREPARE</p>
              <h1 ref={headingRef} tabIndex={-1}>
                First, a little preparation.
              </h1>
              <p>{r.identity.title}</p>
            </div>
            <button
              className="secondary"
              onClick={() => setDialog("ingredients")}
            >
              Ingredients
              <Icon name="book" />
            </button>
          </div>
          <div className="prep-grid">
            {r.preparation.map((group, i) => (
              <section className="prep-card" key={group.id}>
                <div className="prep-card-title">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <h2>{group.title}</h2>
                </div>
                {group.items.map((item) => (
                  <CheckRow
                    key={item.id}
                    id={item.id}
                    text={item.text}
                    checkable={item.checkable}
                    checked={session.checkedIds.includes(item.id)}
                    onChange={() => check(item.id)}
                  />
                ))}
                {group.tip && (
                  <p className="prep-tip">
                    <Icon name="leaf" size={17} />
                    {group.tip}
                  </p>
                )}
              </section>
            ))}
          </div>
          <AllTimers session={session} now={now} onChange={changeTimer} />
          <div className="prep-footer">
            <p className="muted">
              Checklists are here to help. Nothing needs to be ticked to
              continue.
            </p>
            <button
              className="primary"
              onClick={() => editSession((s) => ({ ...s, phase: "cooking" }))}
            >
              Let’s start cooking
              <Icon name="arrow" />
            </button>
          </div>
        </main>
      )}
      {cooking && r && session && stage && (
        <>
          <div className="cooking-heading">
            <div>
              <p className="eyebrow">02 / COOK · REVISION {r.revision}</p>
              <h2>{r.identity.title}</h2>
            </div>
            <span className="stage-count">
              Step {index + 1}
              <span> / {r.cooking.length}</span>
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Cooking progress"
            aria-valuenow={index + 1}
            aria-valuemin={0}
            aria-valuemax={r.cooking.length}
          >
            <div
              style={{ width: `${((index + 1) / r.cooking.length) * 100}%` }}
            />
          </div>
          {expired.length > 0 && (
            <div className="timer-alert" role="status">
              <Icon name="clock" size={17} />
              Time is up: {expired.map((t) => t.label).join(", ")}. Check your
              food; timers don’t confirm doneness.
            </div>
          )}
          <div className="cooking-layout">
            <main className="stage-panel" ref={contentRef} key={stage.id}>
              <p className="eyebrow">
                STEP {String(index + 1).padStart(2, "0")}
                {stage.componentId
                  ? ` · ${r.components.find((c) => c.id === stage.componentId)?.name}`
                  : ""}
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {stage.title}
              </h1>
              <div className="instructions">
                {stage.instructions.map((instruction, i) =>
                  instruction.type === "text" ? (
                    <span key={i}>{instruction.text}</span>
                  ) : (
                    <span key={i}>
                      <InlineIngredient
                        ingredient={r.ingredients.find(
                          (g) => g.id === instruction.ingredientId,
                        )!}
                        amount={
                          instruction.usageId
                            ? r.quantityUsages?.find(
                                (u) => u.id === instruction.usageId,
                              )?.quantity
                              ? quantity(
                                  r.quantityUsages.find(
                                    (u) => u.id === instruction.usageId,
                                  )!.quantity!,
                                )
                              : undefined
                            : undefined
                        }
                      />
                    </span>
                  ),
                )}
              </div>
              {stage.checklist.map((item) => (
                <CheckRow
                  key={item.id}
                  id={item.id}
                  text={item.text}
                  checkable={item.checkable !== false}
                  checked={session.checkedIds.includes(item.id)}
                  onChange={() => check(item.id)}
                />
              ))}
              {stage.tip && (
                <div className="learning-tip">
                  <Icon name="leaf" />
                  <p>
                    <span>A LITTLE KITCHEN WISDOM</span>
                    {stage.tip}
                  </p>
                </div>
              )}
              {stage.timers.length > 0 && (
                <div className="stage-timers">
                  <div className="timer-list">
                    {stage.timers.map((def) => (
                      <TimerChip
                        key={def.id}
                        def={def}
                        state={session.timers[def.id]}
                        now={now}
                        onChange={changeTimer}
                      />
                    ))}
                  </div>
                  <p className="small muted">
                    Timers update while open. iPadOS may pause the app in the
                    background; no background sound is guaranteed.
                  </p>
                </div>
              )}
              <button
                className="secondary mobile-ingredients"
                onClick={() => setDialog("ingredients")}
              >
                Ingredients
                <Icon name="book" />
              </button>
            </main>
            <aside className="cooking-aside">
              <div className="aside-heading">
                <h3>At your fingertips</h3>
                <span>{r.yield.baseServings} servings · base quantities</span>
              </div>
              <div className="aside-scroll">
                <IngredientList recipe={r} />
                <AllTimers
                  session={session}
                  now={now}
                  onChange={changeTimer}
                  exclude={stage.timers.map((t) => t.id)}
                />
              </div>
              <p className="aside-note">Your place is saved as you go.</p>
            </aside>
          </div>
          <footer className="cooking-controls">
            <button
              className="secondary"
              onClick={() =>
                editSession((s) => ({
                  ...s,
                  phase: index === 0 ? "preparation" : "cooking",
                  currentStepId: r.cooking[Math.max(0, index - 1)].id,
                }))
              }
            >
              <Icon name="back" /> {index === 0 ? "Preparation" : "Previous"}
            </button>
            <div className="next-preview">
              <span className="eyebrow">
                {index === r.cooking.length - 1 ? "ONE LAST THING" : "NEXT UP"}
              </span>
              <p>
                {r.cooking[index + 1]?.title ??
                  "Plate up, take a breath, enjoy."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                editSession((s) =>
                  index === r.cooking.length - 1
                    ? finishSession(s)
                    : { ...s, currentStepId: r.cooking[index + 1].id },
                )
              }
            >
              {index === r.cooking.length - 1 ? "Finish Cooking" : "Next step"}
              <Icon name={index === r.cooking.length - 1 ? "check" : "arrow"} />
            </button>
          </footer>
        </>
      )}
      {complete && r && session && (
        <main className="completion">
          <div className="completion-check">
            <Icon name="check" size={54} />
          </div>
          <p className="eyebrow">A LITTLE EFFORT. SOMETHING LOVELY.</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Ready to serve!
          </h1>
          <p className="enjoy">Enjoy your meal.</p>
          <Photo recipe={r} className="completion-photo" large />
          <h2>{r.identity.title}</h2>
          <div className="elapsed-panel">
            <Icon name="clock" />
            <span>Total time in the kitchen</span>
            <b>{clockTime(elapsed(session, now))}</b>
          </div>
          {Object.values(session.timers).some(
            (t) => t.status === "running",
          ) && (
            <p className="small muted">
              Cooking is finished. Kitchen timers are no longer monitored.
            </p>
          )}
          <button className="primary" onClick={() => void library()}>
            Back to recipes
            <Icon name="arrow" />
          </button>
          <button
            className="text-button undo-finish"
            onClick={() => editSession((s) => undoFinish(s))}
          >
            Undo Finish
          </button>
        </main>
      )}
      {view === "journal" && (
        <main className="journal page-width">
          <p className="eyebrow">GOOD MEALS, REMEMBERED</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Your time in the kitchen.
          </h1>
          <p className="muted">
            Saved on this device. Each cooking session keeps the recipe you
            started with.
          </p>
          {sessions.length === 0 ? (
            <div className="empty-state">
              <Icon name="book" size={40} />
              <h2>The first page is yours.</h2>
              <p>Start a recipe and your cooking sessions will appear here.</p>
              <button className="primary" onClick={() => setView("library")}>
                Explore the recipes
                <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <div className="journal-list">
              {sessions.map((s) => (
                <button
                  className="journal-item"
                  key={s.id}
                  onClick={() => resume(s)}
                >
                  <Photo recipe={s.recipeSnapshot} />
                  <span>
                    <small>
                      {s.completedAt ? "COOKED" : "IN PROGRESS"} ·{" "}
                      {new Date(s.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </small>
                    <h2>{s.recipeSnapshot.identity.title}</h2>
                    <p>
                      {s.completedAt
                        ? `${clockTime(elapsed(s, now))} in the kitchen`
                        : s.phase === "preparation"
                          ? "Preparation"
                          : s.recipeSnapshot.cooking.find(
                              (c) => c.id === s.currentStepId,
                            )?.title}{" "}
                      · revision {s.recipeSnapshot.revision}
                    </p>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))}
            </div>
          )}
        </main>
      )}
      {dialog === "import" && (
        <ImportRecipe
          recipes={recipes}
          onClose={() => setDialog(null)}
          onSave={importValue}
        />
      )}
      {(dialog === "exit-session" || dialog === "discard-session") &&
        session && (
          <Modal
            title={
              dialog === "discard-session"
                ? "Discard this session?"
                : "Leave this session?"
            }
            onClose={() => {
              if (!exiting) setDialog(null);
            }}
          >
            <p className="muted">{session.recipeSnapshot.identity.title}</p>
            <p>
              {dialog === "discard-session"
                ? "Your preparation checks, cooking progress and timers will be cleared. This cannot be undone. This meal won’t be marked as finished or added to completed cooking history."
                : "Save your place to pick up later, or discard this cooking session and its timers."}
            </p>
            {exitError && (
              <p className="error" role="alert">
                {exitError}
              </p>
            )}
            <div className="modal-actions">
              {dialog === "discard-session" ? (
                <>
                  <button
                    className="secondary"
                    disabled={exiting}
                    onClick={() => setDialog(null)}
                  >
                    Keep cooking
                  </button>
                  <button
                    className="primary"
                    disabled={exiting}
                    onClick={() => void exitSession(true)}
                  >
                    {exiting ? "Discarding…" : "Confirm Discard"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="secondary"
                    onClick={() => setDialog("discard-session")}
                    disabled={exiting}
                  >
                    Discard Session
                  </button>
                  <button
                    className="primary"
                    disabled={exiting}
                    onClick={() => void exitSession(false)}
                  >
                    {exiting ? "Saving…" : "Save & Exit"}
                  </button>
                </>
              )}
            </div>
          </Modal>
        )}
      {dialog === "ingredients" && r && (
        <Modal title="Everything you’ll need" onClose={() => setDialog(null)}>
          <RecipeMeta recipe={r} />
          <p className="small muted">
            Base quantities as authored. Optional ingredients and approximate
            amounts are preserved.
          </p>
          <IngredientList recipe={r} />
          {session && (
            <AllTimers session={session} now={now} onChange={changeTimer} />
          )}
        </Modal>
      )}
      {dialog === "recovery" && selected && (
        <Modal
          title="Recipe versions & recovery"
          onClose={() => setDialog(null)}
        >
          <p className="muted">{selected.identity.title}</p>
          <p className="small">
            Up to 10 saved versions per recipe, plus its bundled original.
            Restoring keeps any active cooking snapshot.
          </p>
          <div className="revision-list">
            {recovery.map((h) => (
              <div className="revision" key={h.key}>
                <span>
                  <b>Revision {h.recipe.revision}</b>
                  <small>
                    {h.source === "bundled"
                      ? "Bundled original"
                      : new Date(h.savedAt).toLocaleString()}
                  </small>
                </span>
                <button
                  className="secondary"
                  disabled={canonical(h.recipe) === canonical(selected)}
                  onClick={() => {
                    setRecoveryCandidate(h);
                    setArchiveCandidate(false);
                  }}
                >
                  {canonical(h.recipe) === canonical(selected)
                    ? "Current"
                    : "Review restore"}
                </button>
              </div>
            ))}
          </div>
          {recoveryCandidate && (
            <div className="import-review">
              <h3>Restore revision {recoveryCandidate.recipe.revision}?</h3>
              <p>
                This replaces the library’s version. The previous recipe remains
                recoverable.
              </p>
              <details>
                <summary>Preview recipe JSON</summary>
                <pre>{JSON.stringify(recoveryCandidate.recipe, null, 2)}</pre>
              </details>
              <button className="primary" onClick={restoreRevision}>
                Confirm restore
              </button>
            </div>
          )}
          <div className="archive-area">
            <button
              className="text-button"
              onClick={() => {
                setArchiveCandidate(true);
                setRecoveryCandidate(null);
              }}
            >
              Archive this recipe
            </button>
            {archiveCandidate && (
              <div className="import-review">
                <p>
                  Remove this recipe from the library? Saved versions and
                  cooking sessions stay. Recover it in Your cookbook & backups.
                </p>
                <button className="secondary" onClick={archiveRecipe}>
                  Confirm archive
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {dialog === "cookbook" && (
        <Modal
          title="Your cookbook, kept close."
          onClose={() => setDialog(null)}
        >
          <p>
            Recipes, versions and cooking sessions are kept in this browser’s
            storage on this device.
          </p>
          <div className="settings-panel">
            <h3>A copy for safekeeping</h3>
            <p>
              Export your current recipes and recovery history as a portable
              JSON file. Save it in Files, iCloud Drive or another safe place.
              This is a manual backup; nothing is sent automatically.
            </p>
            <button className="primary" onClick={exportCookbook}>
              <Icon name="download" />
              Export Cookbook
            </button>
            <button className="text-button" onClick={() => setDialog("import")}>
              Import a recipe or restore a backup
              <Icon name="arrow" size={16} />
            </button>
          </div>
          <div className="settings-panel">
            <h3>Put the cookbook on your Home Screen</h3>
            <p>
              Open the HTTPS app in Safari. Tap Share, then Add to Home Screen.
              Open it from that icon while online once; wait for “Ready for
              offline cooking.”
            </p>
            <p className="small muted">
              Safari and the installed app may keep separate storage. Your iPad
              and phone do not sync. Clearing site data or removing the app can
              erase your saved cookbook. Export regularly.
            </p>
            <p className="small">
              {offlineReady
                ? "✓ App files and packaged photographs are cached for offline use."
                : "Offline caching is available in the production build over HTTPS or localhost."}
            </p>
          </div>
          <div className="settings-panel">
            <h3>Having trouble opening the cookbook?</h3>
            <p>
              Repair the offline app files while keeping your recipes, revision
              history and cooking sessions.
            </p>
            <a
              className="text-button"
              href={`${import.meta.env.BASE_URL}recover.html`}
            >
              Repair offline app files
              <Icon name="arrow" size={16} />
            </a>
          </div>
          <RecoveryLibrary
            repo={repo}
            recipes={recipes}
            onRestore={async (recipe) => {
              if (!repo) return;
              await repo.saveRecipe(recipe, "recovery");
              await refresh();
              setToast("Recipe recovered to your library.");
            }}
          />
          <details className="photo-credits">
            <summary>Photography & recipe sources</summary>
            <p className="small">
              All six original recipes come from the supplied family recipe
              bank, unchanged. Photographs are serving inspiration, not the
              exact tested dishes; pictured garnishes or ingredients can differ.
              Imported recipes without packaged photography use an illustration.
            </p>
            <p className="small">
              Photos are packaged under the{" "}
              <a
                href="https://www.pexels.com/license/"
                target="_blank"
                rel="noreferrer"
              >
                Pexels License
              </a>
              , verified October 29, 2026.
            </p>
            {Object.entries(photographs).map(([id, p]) => (
              <p className="small" key={id}>
                <a href={p.source} target="_blank" rel="noreferrer">
                  {p.creator} · {p.alt}
                </a>
              </p>
            ))}
          </details>
        </Modal>
      )}
    </div>
  );
}
function RecoveryLibrary({
  repo,
  recipes,
  onRestore,
}: {
  repo: RecipeRepository | null;
  recipes: Recipe[];
  onRestore: (r: Recipe) => Promise<void>;
}) {
  const [history, setHistory] = useState<Revision[]>([]),
    [candidate, setCandidate] = useState<Revision | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    repo
      ?.history()
      .then(setHistory)
      .catch(() => setError("Recovery could not be opened. Please try again."));
  }, [repo, recipes]);
  const archived = [...new Set(history.map((h) => h.recipeId))].filter(
    (id) => !recipes.some((r) => r.id === id),
  );
  return archived.length ? (
    <div className="settings-panel">
      <h3>Archived recipes</h3>
      {archived.map((id) => {
        const h = history.find((h) => h.recipeId === id)!;
        return (
          <div className="revision" key={id}>
            <span>
              {h.recipe.identity.title}
              <small>Revision {h.recipe.revision}</small>
            </span>
            <button className="secondary" onClick={() => setCandidate(h)}>
              Recover
            </button>
          </div>
        );
      })}
      {candidate && (
        <div className="import-review">
          <p>
            Recover {candidate.recipe.identity.title}, revision{" "}
            {candidate.recipe.revision}?
          </p>
          <button
            className="primary"
            onClick={async () => {
              try {
                await onRestore(candidate.recipe);
                setCandidate(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Confirm recovery
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  ) : null;
}
