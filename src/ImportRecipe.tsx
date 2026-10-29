import { useRef, useState } from "react";
import type { Backup, Recipe } from "./model";
import { importDecision, parseImport } from "./validation";
import { Icon, Modal } from "./components";
export function ImportRecipe({
  recipes,
  onClose,
  onSave,
}: {
  recipes: Recipe[];
  onClose: () => void;
  onSave: (value: Recipe | Backup) => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [parsed, setParsed] = useState<Recipe | Backup | null>(null),
    [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function paste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error();
      setText(await navigator.clipboard.readText());
      setParsed(null);
      setError("");
    } catch {
      setNotice(
        "Clipboard access is unavailable. Touch and hold inside the field, then choose Paste.",
      );
    }
  }
  function review() {
    setError("");
    setNotice("");
    try {
      const value = parseImport(text);
      if (
        !("format" in value) &&
        importDecision(
          recipes.find((r) => r.id === value.id),
          value,
        ) === "identical"
      ) {
        setNotice(
          "Already in your cookbook. This recipe is identical; nothing was changed.",
        );
        setParsed(null);
      } else setParsed(value);
    } catch (e) {
      setError((e as Error).message);
      setParsed(null);
    }
  }
  async function save() {
    if (!parsed) return;
    setBusy(true);
    try {
      await onSave(parsed);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const backup = parsed && "format" in parsed ? parsed : null;
  const recipe = parsed && !("format" in parsed) ? parsed : null;
  const current = recipe ? recipes.find((r) => r.id === recipe.id) : undefined;
  const decision = recipe ? importDecision(current, recipe) : null;
  return (
    <Modal title="A new page in your cookbook" onClose={onClose} wide>
      <p className="muted">
        Paste a recipe’s JSON, or a Kitchen Mode cookbook export. Everything is
        saved on this device.
      </p>
      <div className="field-label">
        <label htmlFor="recipe-json">Recipe or cookbook JSON</label>
        <button className="text-button" onClick={paste}>
          Paste from clipboard
        </button>
      </div>
      <textarea
        id="recipe-json"
        className="json-input"
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={
          '{\n  "schemaVersion": 1,\n  "id": "your-family-recipe",\n  "revision": 1,\n  ...\n}'
        }
        onChange={(e) => {
          setText(e.target.value);
          setParsed(null);
          setError("");
          setNotice("");
        }}
      />
      <p className="small muted">
        On iPad: touch and hold in the field → Paste. Your existing cookbook
        stays safe if validation fails.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        aria-label="Open recipe or cookbook JSON file"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setText(await file.text());
            setParsed(null);
            setError("");
            setNotice(
              "File opened. Choose Review import before saving anything.",
            );
          } catch {
            setError(
              "This file could not be read. Try again, or paste its JSON into the field.",
            );
          }
          e.target.value = "";
        }}
      />
      <button className="text-button" onClick={() => fileRef.current?.click()}>
        Open JSON backup file
      </button>
      {error && (
        <div role="alert" className="error pre-line">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {parsed && (
        <div className="import-review" role="status">
          <span className="eyebrow">
            {backup
              ? "Restore cookbook"
              : decision === "new"
                ? "Add recipe"
                : decision === "update"
                  ? "Recipe update"
                  : decision === "older"
                    ? "Older revision"
                    : "Revision conflict"}
          </span>
          <h3>
            {backup
              ? `${backup.recipes.length} recipes ready to restore`
              : recipe?.identity.title}
          </h3>
          <p>
            {backup
              ? "This merges the backup into this device. Matching IDs are replaced, including older or conflicting versions; recipes archived in the backup are archived here. Other recipes and all cooking sessions stay. Previous versions remain recoverable."
              : decision === "new"
                ? `Revision ${recipe?.revision}. A fresh addition to your collection.`
                : decision === "update"
                  ? `Revision ${current?.revision} → ${recipe?.revision}. The previous version stays in recovery.`
                  : decision === "older"
                    ? `This is revision ${recipe?.revision}; your cookbook has revision ${current?.revision}. Confirm only if you intend to restore this older version.`
                    : `Both recipes use revision ${recipe?.revision}, but their content differs. Confirm only if you intend to replace the saved version.`}
          </p>
          <p className="small muted">
            Any cooking session keeps its original recipe snapshot.
          </p>
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        {parsed ? (
          <button className="primary" onClick={save} disabled={busy}>
            {busy
              ? "Saving…"
              : backup
                ? "Confirm restore"
                : decision === "new"
                  ? "Add to cookbook"
                  : decision === "older"
                    ? "Restore older revision"
                    : decision === "conflict"
                      ? "Replace this revision"
                      : "Confirm update"}
            <Icon name="check" />
          </button>
        ) : (
          <button className="primary" disabled={!text.trim()} onClick={review}>
            Review import
            <Icon name="arrow" />
          </button>
        )}
      </div>
    </Modal>
  );
}
