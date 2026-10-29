import { openDB, type IDBPDatabase } from "idb";
import schema from "../recipe.schema.json";
import type { Recipe, RecipeRecord, Revision, Session, Backup } from "./model";
import { canonical, validateRecipe } from "./validation";
const modules = import.meta.glob<Recipe>("../recipes/*.json", {
  eager: true,
  import: "default",
});
export const bundledRecipes = Object.values(modules).map(validateRecipe);
if (bundledRecipes.length !== 6)
  throw new Error("Expected exactly six bundled recipes.");
export const HISTORY_LIMIT = 10;
export class StorageError extends Error {
  constructor() {
    super(
      "Kitchen Mode could not save to this device. Your last saved data is unchanged. Free some storage, keep this page open and export your cookbook before retrying.",
    );
  }
}
export class RecipeRepository {
  private db: IDBPDatabase | null = null;
  private records = new Map<string, RecipeRecord>();
  private revisions: Revision[] = [];
  private sessions = new Map<string, Session>();
  private activeId: string | null = null;
  private discardedIds = new Set<string>();
  private journalKey = "kitchen-mode-pending-session";
  recoveryWarning = "";
  persistent = true;
  async open(name = "kitchen-mode-v1") {
    this.journalKey = `${name}:pending-session:${import.meta.env.BASE_URL}`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = openDB(name, 1, {
        upgrade(db) {
          db.createObjectStore("recipes", { keyPath: "id" });
          db.createObjectStore("revisions", { keyPath: "key" });
          db.createObjectStore("sessions", { keyPath: "id" });
          db.createObjectStore("meta");
        },
        blocking: () => {
          this.db?.close();
        },
      });
      this.db = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Storage unavailable")),
            4000,
          );
        }),
      ]);
      await this.db.put("meta", schema, "recipeSchema");
    } catch {
      this.persistent = false;
      this.db = null;
    } finally {
      clearTimeout(timeout);
    }
    return this;
  }
  async list(): Promise<Recipe[]> {
    const overrides: RecipeRecord[] = this.db
      ? await this.db.getAll("recipes")
      : [...this.records.values()];
    const all = new Map(bundledRecipes.map((r) => [r.id, r]));
    for (const o of overrides) {
      if (o.recipe) all.set(o.id, o.recipe);
      else all.delete(o.id);
    }
    return structuredClone([...all.values()]);
  }
  async history(id?: string): Promise<Revision[]> {
    const saved: Revision[] = this.db
      ? await this.db.getAll("revisions")
      : this.revisions;
    const originals: Revision[] = bundledRecipes.map((r) => ({
      key: `bundled:${r.id}`,
      recipeId: r.id,
      recipe: r,
      savedAt: 0,
      source: "bundled",
    }));
    return structuredClone(
      [
        ...originals,
        ...saved.filter(
          (h) =>
            !originals.some((o) => canonical(o.recipe) === canonical(h.recipe)),
        ),
      ]
        .filter((h) => !id || h.recipeId === id)
        .sort((a, b) => b.savedAt - a.savedAt),
    );
  }
  async saveRecipe(recipe: Recipe, source: "import" | "recovery" = "import") {
    await this.apply([validateRecipe(recipe)], [], [], source);
  }
  async archive(id: string) {
    await this.apply([], [], [id]);
  }
  async restoreBackup(backup: Backup) {
    // All validation happens before starting one atomic write transaction.
    const recipes = backup.recipes.map(validateRecipe);
    const history = [
      ...backup.history,
      ...backup.bundledOriginals.map((recipe) => ({
        key: "",
        recipeId: recipe.id,
        recipe: validateRecipe(recipe),
        savedAt: 0,
        source: "bundled" as const,
      })),
    ];
    await this.apply(recipes, history, backup.deletedRecipeIds);
  }
  private async apply(
    incoming: Recipe[],
    importedHistory: Revision[],
    deleted: string[],
    source: "import" | "recovery" = "import",
  ) {
    const db = this.db;
    const tx = db?.transaction(["recipes", "revisions"], "readwrite");
    try {
      const currentRecords: RecipeRecord[] = tx
        ? await tx.objectStore("recipes").getAll()
        : [...this.records.values()];
      const records = new Map(currentRecords.map((r) => [r.id, r]));
      const oldHistory: Revision[] = tx
        ? await tx.objectStore("revisions").getAll()
        : this.revisions;
      const history = [...oldHistory];
      const now = Date.now();
      const add = (
        recipe: Recipe,
        savedAt: number,
        revisionSource: Revision["source"],
      ) => {
        if (
          !history.some(
            (h) =>
              h.recipeId === recipe.id &&
              canonical(h.recipe) === canonical(recipe),
          )
        )
          history.push({
            key: `${recipe.id}:${now}:${Math.random().toString(36).slice(2)}`,
            recipeId: recipe.id,
            recipe: structuredClone(recipe),
            savedAt,
            source: revisionSource,
          });
      };
      for (const h of importedHistory)
        add(
          h.recipe,
          h.savedAt,
          h.source === "bundled" ? "bundled" : "recovery",
        );
      for (const id of [...incoming.map((r) => r.id), ...deleted]) {
        const current = records.has(id)
          ? records.get(id)?.recipe
          : bundledRecipes.find((r) => r.id === id);
        if (current) add(current, now - 1, "recovery");
      }
      for (const recipe of incoming) {
        records.set(recipe.id, {
          id: recipe.id,
          recipe: structuredClone(recipe),
          updatedAt: now,
        });
        add(recipe, now, source);
      }
      for (const id of deleted)
        records.set(id, { id, recipe: null, updatedAt: now });
      const kept: Revision[] = [];
      for (const id of new Set(history.map((h) => h.recipeId))) {
        const entries = history
          .filter((h) => h.recipeId === id)
          .sort((a, b) => b.savedAt - a.savedAt);
        kept.push(
          ...entries.filter((h) => h.source === "bundled").slice(0, 1),
          ...entries
            .filter((h) => h.source !== "bundled")
            .slice(0, HISTORY_LIMIT),
        );
      }
      if (tx) {
        for (const record of records.values())
          await tx.objectStore("recipes").put(record);
        for (const h of oldHistory)
          if (!kept.some((k) => k.key === h.key))
            await tx.objectStore("revisions").delete(h.key);
        for (const h of kept) await tx.objectStore("revisions").put(h);
        await tx.done;
      } else {
        this.records = records;
        this.revisions = kept;
      }
    } catch {
      try {
        tx?.abort();
      } catch {
        /* transaction already aborted */
      }
      throw new StorageError();
    }
  }
  async saveSession(session: Session, active = true) {
    // IndexedDB remains the primary store. This temporary, synchronous journal
    // closes the small window between an input event and transaction commit if
    // Safari reloads or terminates the page immediately after the tap.
    const journal = JSON.stringify(session);
    if (active) {
      try {
        localStorage.setItem(this.journalKey, journal);
      } catch {
        /* IDB can still save when localStorage is denied. */
      }
    }
    try {
      if (this.db) {
        const tx = this.db.transaction(["sessions", "meta"], "readwrite");
        if (await tx.objectStore("meta").get(`discardedSession:${session.id}`))
          throw new Error("This session was discarded.");
        await tx.objectStore("sessions").put(session);
        if (active)
          await tx.objectStore("meta").put(session.id, "activeSessionId");
        await tx.done;
      } else {
        if (this.discardedIds.has(session.id))
          throw new Error("This session was discarded.");
        this.sessions.set(session.id, structuredClone(session));
        if (active) this.activeId = session.id;
      }
      try {
        if (localStorage.getItem(this.journalKey) === journal)
          localStorage.removeItem(this.journalKey);
      } catch {
        /* The primary save has committed. */
      }
    } catch {
      throw new StorageError();
    }
  }
  async listSessions(): Promise<Session[]> {
    const sessions: Session[] = this.db
      ? await this.db.getAll("sessions")
      : [...this.sessions.values()];
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async discardSession(id: string) {
    const tx = this.db?.transaction(["sessions", "meta"], "readwrite");
    try {
      const session: Session | undefined = tx
        ? await tx.objectStore("sessions").get(id)
        : this.sessions.get(id);
      if (session?.phase === "completed")
        throw new Error("Completed meals must remain in cooking history.");
      if (tx) {
        await tx.objectStore("sessions").delete(id);
        if ((await tx.objectStore("meta").get("activeSessionId")) === id)
          await tx.objectStore("meta").put(null, "activeSessionId");
        // A stale recovery journal or late save must not revive a discarded
        // session. Retain only its ID, never its recipe, progress or timers.
        await tx.objectStore("meta").put(true, `discardedSession:${id}`);
        await tx.done;
      } else {
        this.sessions.delete(id);
        if (this.activeId === id) this.activeId = null;
        this.discardedIds.add(id);
      }
      try {
        const journal = localStorage.getItem(this.journalKey);
        if (journal && JSON.parse(journal).id === id)
          localStorage.removeItem(this.journalKey);
      } catch {
        /* The durable discarded-ID guard also protects recovery. */
      }
    } catch {
      if (tx) {
        try {
          tx.abort();
        } catch {
          /* Already finished or aborted. */
        }
        await tx.done.catch(() => {});
      }
      throw new Error(
        "Kitchen Mode could not discard this session. Your saved progress has been kept. Please try again.",
      );
    }
  }
  async activeSession(): Promise<Session | null> {
    const id = this.db
      ? await this.db.get("meta", "activeSessionId")
      : this.activeId;
    const saved: Session | null = id
      ? ((this.db
          ? await this.db.get("sessions", id)
          : this.sessions.get(id)) ?? null)
      : null;
    let recovery: Session | null = null;
    try {
      const text = localStorage.getItem(this.journalKey);
      if (text) {
        const candidate = JSON.parse(text) as Session;
        validateRecipe(candidate.recipeSnapshot);
        if (
          typeof candidate.id === "string" &&
          candidate.recipeId === candidate.recipeSnapshot.id &&
          Number.isFinite(candidate.startedAt) &&
          Number.isFinite(candidate.updatedAt) &&
          ["preparation", "cooking", "completed"].includes(candidate.phase) &&
          Array.isArray(candidate.checkedIds) &&
          candidate.timers &&
          (!saved || candidate.updatedAt >= saved.updatedAt) &&
          !(this.db
            ? await this.db.get("meta", `discardedSession:${candidate.id}`)
            : this.discardedIds.has(candidate.id))
        )
          recovery = candidate;
      }
    } catch {
      /* A corrupt or unavailable journal must never hide valid IDB data. */
    }
    if (recovery) {
      try {
        await this.saveSession(recovery);
      } catch {
        this.recoveryWarning =
          "Your latest cooking session was recovered, but device storage could not save it. Keep this page open and free some storage.";
      }
      return recovery;
    }
    return saved;
  }
  async clearActive() {
    try {
      if (this.db) await this.db.put("meta", null, "activeSessionId");
      else this.activeId = null;
      try {
        localStorage.removeItem(this.journalKey);
      } catch {
        /* May be unavailable. */
      }
    } catch {
      throw new StorageError();
    }
  }
  async exportCookbook(): Promise<Backup> {
    const overrides: RecipeRecord[] = this.db
      ? await this.db.getAll("recipes")
      : [...this.records.values()];
    return structuredClone({
      format: "kitchen-mode-cookbook",
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: await this.list(),
      history: await this.history(),
      bundledOriginals: bundledRecipes,
      deletedRecipeIds: overrides.filter((r) => !r.recipe).map((r) => r.id),
    });
  }
  close() {
    this.db?.close();
  }
}
