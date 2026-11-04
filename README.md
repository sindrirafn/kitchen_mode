# Kitchen Mode

A local-first family cookbook for a sixth-generation iPad (2018), iPadOS 17, and portrait iPhones. Built with React, TypeScript and Vite. No server, accounts, cloud database, analytics, remote phone controls, wake lock or external font requests.

The six files in `recipes/` remain the authoritative recipe content. Their original amounts, IDs, revisions and fallback instructions are retained, with optional gathering and structured layout metadata added. The schema remains backward compatible. It does not scale servings or apply untested proposed changes.

## Run on your Mac

Use Node.js **22.18 or later** and npm. From this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). For a production build with offline support:

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173`. Offline caching runs in the production build, not the development server. Use a different port when switching unrelated development apps. For an existing Kitchen Mode installation with a navigation/service-worker error, follow the data-preserving steps in [RECOVERY.md](RECOVERY.md).

The server can also be reached from your iPad using the Mac's LAN IP on the same Wi-Fi network. This is useful for a quick layout check, but plain `http://192.168…` is **not** a secure context: it is not a valid installation/offline test. Use HTTPS for actual iPad installation.

## Free HTTPS hosting and iPad installation

Hosting is managed in your Cloudflare account. This feature branch has **not** been manually deployed; use the existing production project if the app is already installed. No credentials are needed for local development.

1. Run `npm run build`.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages**, choose to create a **Pages** application, and select the **Direct Upload / drag-and-drop** option. Dashboard wording can change.
3. Name the project, for example `our-kitchen-mode`, and upload the **`dist` folder**, which contains `index.html`, `sw.js`, the manifest, app assets and photographs. Do not upload the repository or `node_modules`.
4. Deploy. Cloudflare supplies a free HTTPS URL such as `https://our-kitchen-mode.pages.dev`. Keep this **same production URL** for future deployments: local storage belongs to its origin. A preview URL, different domain or different browser has a separate cookbook.
5. On the **iPad**, open that HTTPS URL in **Safari**. On iPadOS 17, tap **Share → Add to Home Screen → Add**. Keep the name **Kitchen Mode**. The supplied manifest opens it as a standalone app.
6. Open **Kitchen Mode from its new Home Screen icon while online**. Wait for **Ready for offline cooking** at the bottom of the library. Scroll through all six recipes once to inspect them.
7. Turn on Airplane Mode (and disable Wi-Fi if it remains enabled), close the app and reopen the icon. Confirm the recipes and photographs still open. Start a recipe, tick gathering items, choose **Start preparation**, tick tasks, move to a cooking stage, start a timer, then close and reopen to check recovery.

This app fits within the [Cloudflare Pages Free plan limits](https://developers.cloudflare.com/pages/platform/limits/). See the provider's [Direct Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Apple's Home Screen web app guidance](https://webkit.org/blog/13878/) for details. No custom domain or paid plan is needed. Direct Upload projects cannot later be converted to Git integration; create a new project if you need that workflow.

Hosting publishes the app and its six bundled recipes. Imported recipes, recovery versions and cooking sessions stay on the device and are never sent to the host. V1 has no authentication; a public static hosting URL does not make the bundled files access-controlled.

For an app-code update, build again and upload `dist` as a new **production deployment of the same project**. The service worker fully caches a new version, then activates without forcing open cooking pages to reload. It keeps one previous build’s immutable assets for open clients, removes stale navigation entries and never clears IndexedDB or localStorage. Reload or reopen when convenient to use the new interface. The repaired navigation fallback reconstructs HTML responses so a redirected cached fetch cannot cause Safari’s redirection error. See [RECOVERY.md](RECOVERY.md) for existing-installation recovery and verification. Recipe updates normally use **Import Recipe**, without redeployment.

### Deploy from the command line or GitHub

The repository's current GitHub check is **Workers Builds: kitchen-mode**. For that existing **Worker**, set build command `npm run build` and production deploy command:

```sh
npx wrangler deploy --assets ./dist --name kitchen-mode --compatibility-date 2026-11-01
```

For a manual deployment, run `npm ci`, `npm run build` and `npx wrangler login` first, then the command above. Verify the Worker name and Cloudflare account match the current installation so its origin stays the same. See [Workers Builds deploy commands](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [deploying static assets without a configuration file](https://developers.cloudflare.com/changelog/post/2025-09-09-interactive-wrangler-assets/). The branch's remote Workers build reported failure; its public GitHub summary does not expose the cause. Check its Cloudflare build logs before relying on automatic deployment. Local production build and browser tests pass.

If your existing installation instead uses **Cloudflare Pages**, use the Pages-specific instructions below. Workers and Pages have different deploy commands.

After reviewing this branch, deploy its production build to your **existing Cloudflare Pages project**:

```sh
npm ci
npm run build
npx wrangler login
npx wrangler pages deploy dist --project-name YOUR_EXISTING_PROJECT --branch main
```

Replace `YOUR_EXISTING_PROJECT` with its actual Pages project name. The `--branch` value must match that project's configured production branch (use its actual name if it is not `main`). Using `--branch codex/cooking-sidebar-refinement` instead creates a preview for review; that preview origin has separate local data. The command uploads your current local `dist`, so rebuild after changing branches. See the [Wrangler Pages command reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

For an existing **Pages Git integration**, use build command `npm run build`, output directory `dist`, repository root as the root directory, and Node 22.18 or later. Pages handles deployment after building; it does not require a separate deploy command. Review the PR's preview first and merge only after approval. See [Cloudflare's React (Vite) build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/). Keep the existing production origin for the installed iPad's cookbook. This task prepares a PR and does not merge it or run the production deploy command.

### Optional subdirectory hosting

Root hosting (Cloudflare's default) needs no configuration. For a host that serves the app under `/kitchen-mode/`:

```sh
VITE_BASE_PATH=/kitchen-mode/ npm run build
```

Upload the contents of `dist` at that path. App assets, icons, manifest, service worker and packaged photos use that base path. Keep a trailing slash. The service worker limits requests and shell-cache cleanup to its own path.

## Recipe format

See [RECIPE_FORMAT.md](RECIPE_FORMAT.md) for optional gathering identity/category/form fields, structured actions and ingredient collections, partial quantities, long-lead flags and legacy behavior.

## Import, update, export and recover

- In the library, choose **Import Recipe**. Paste a complete JSON recipe matching `recipe.schema.json`, then **Review import**. The field always supports ordinary typing and iOS long-press Paste, even if the optional clipboard button is unavailable.
- New stable ID: **Add to cookbook**. Higher revision: **Confirm update**. Identical JSON content (regardless of object-key ordering): no changes. Different content at the same revision and older revisions require separately labelled, explicit replacements.
- Structural errors, duplicate IDs and missing ingredient/component/quantity-usage/timer references produce actionable errors before writing anything. Every recipe in a backup is validated before an atomic restore transaction starts.
- The existing library version and recovery history are retained. A running session always uses the full recipe snapshot it started with, even if the library is updated, restored or archived.
- Open a recipe's introduction → **Recipe versions & recovery** to preview and restore a saved version or archive the recipe. A bounded history holds up to **10 nonbundled saved versions per recipe**, plus its bundled original. Same-revision edits are distinct versions. Archives and updates never remove the bundled-original recovery source.
- Open **Your cookbook & backups** at the bottom of the library → **Export Cookbook**. Save the downloaded JSON somewhere safe, such as Files/iCloud Drive. Safari may open a download preview or ask where to save it. This is a **manual** backup, not automatic cloud backup.
- To restore on the iPad, choose **Import Recipe → Open JSON backup file**, select the exported JSON in Files, then **Review import → Confirm restore**. You can also copy the complete JSON from a text viewer and paste it into the import field. A backup contains the current recipes, bounded version history, bundled originals and archived recipe IDs. Restore merges into this device: matching IDs are replaced, including conflicting/older versions, and IDs archived in the backup are archived here. Other recipes and existing cooking sessions stay.
- Recover an archived recipe from **Your cookbook & backups → Archived recipes**. Its latest retained version can be restored with explicit confirmation; its other versions then remain available through the recipe's recovery screen.

Exports contain **recipe data and recovery history**, not cooking-journal/session history. Packaged photography stays in the app; imported image paths are not fetched from the network, and new recipes use an explicitly labelled illustration. Photography metadata is in `public/photography.json` and in the app's credits. All packaged stock images are serving inspiration rather than photographs of the exact tested family dishes, so pictured ingredients can differ.

## Local data and timers

IndexedDB database `kitchen-mode-v1` separates recipe overrides, recipe revisions, cooking sessions and schema/active-session metadata. The repository is in `src/repository.ts`. A tiny synchronous localStorage recovery journal protects the latest session change if the page is reloaded before its IndexedDB transaction commits; it is removed after a successful save. A session includes its recipe snapshot, phase, stage ID, preparation/cooking checked IDs, separate gathered IDs, manual accordion state, completed/visited stage IDs, timer end timestamps, `startedAt`, `completedAt` and `updatedAt`.

Opening a recipe introduction does not start timing. **Gather ingredients** deliberately starts the session and elapsed time. Gather consolidates repeated product uses under full-width collapsible categories. Their checklists use two columns on landscape iPad and one on phone; equipment uses compact rows. Headers show checked/total counts and completion checkmarks. Sections never close automatically; manual expansion and all checks survive navigation and reload. Continue with any amount of progress using **Start preparation** or the **Gather → Prep → Cook** phase navigation.

Gather is for collecting, so ingredient preparation text stays out of its rows. Identifying forms, authored condition details, notes and approximate quantities remain. Compatible amounts total; different units, package sizes, textual quantities and optional portions remain distinct. Gram totals at or above 1 kg can display in kg without changing stored numbers. Whole counts omit “whole”; “a little, to taste” displays “to taste”. Detailed component allocations remain available in the full **Ingredients** list in Prep/Cook and the recipe introduction.

Preparation uses full-width, strictly single-column accordions on iPad and phone. **Start early** identifies existing authored advance work. Ordered structured action lines and vertical ingredient lists retain quantities, optional status and keep-separate directions; internal usage suffixes are omitted in these contextual lists. No arbitrary prose is split by punctuation. Two bundled preparation groups add optional early/continuation display titles; task IDs, actions, recipe revisions and amounts remain unchanged. Imported overrides and active session snapshots are never replaced. Older sessions retain their existing phase and checks, with new metadata defaulting to empty arrays; no database migration or reset is needed.

Active Gather, Prep and Cook sessions share one compact recipe toolbar instead of the global Kitchen Mode header. It keeps the recipe title, phase navigation, elapsed time, Ingredients and the existing Exit recipe confirmation together, plus the cooking step count when applicable. It stays visible while gathering/preparing scrolls. On landscape iPad it uses one row; phone layouts use two rows with icon controls that retain accessible names and 44 px touch targets. Full long titles stay in the document and truncate visually. The cookbook, introduction, journal and completed-meal views retain the global header.

The cooking footer uses 8 px vertical padding (or a larger required bottom safe-area inset), while Previous/Next retain their existing sizes. Its preview stays on a single line with visual ellipsis for long titles. The footer remains at the bottom of the iPad flex workspace, outside the scrolling instruction panel and sidebar. Existing phone page flow is retained so it does not cover instructions or timers. Gather/Prep action spacing is tighter without reducing button targets.

Cooking has a tappable stage timeline in place of the permanent ingredient sidebar. **Next step** completes only the stage being left; a timeline jump records visits without completing skipped stages. Completed, current, visited-but-incomplete and upcoming stages are distinct. Older sessions do not gain inferred completion marks. **Finish Cooking** completes the current final stage and the session; **Undo Finish** removes that stage’s completion mark and resumes cooking. The full **Ingredients** modal remains one tap away. No clock-based schedule or inferred stage duration is created.

The iPad sidebar uses separate flex regions: a scrollable timeline above a persistent active-timer panel, capped at 40% of sidebar height. Running, paused and expired timers use the same state/deadlines as before. Small timer sets fit without scrolling; larger sets scroll independently. Expired timers sort first and keep the existing time-up banner. With no active timers the panel disappears. On phone, the timeline is collapsed by default and can be expanded; active timers remain outside that collapse, above the current instructions. Only unstarted/cancelled stage timers retain Start controls in the instruction panel. No duplicate countdown clock or timer state is created.

Navigation and checklists never force cooking completion. Only **Finish Cooking** records completion. **Undo Finish** reopens the final stage and resumes whole-session timing from the original start, including the intervening time. The cooking journal retains completed and set-aside sessions.

While gathering, preparing or cooking, choose **Exit recipe** (or the cookbook logo) to open the exit options. **Save & Exit** preserves the session's recipe snapshot, gathering and preparation checks, current stage, start time and timers for later resumption. **Discard Session → Confirm Discard** removes that session and its timers, clears its resumable progress and returns to the library. **Keep cooking** cancels the confirmation. Discarding never finishes the meal or creates a completed history entry; existing completed meals and other saved sessions remain. Starting the same recipe again creates a fresh session.

### Imported text encoding

The bundled JSON, HTML charset and file import path use UTF-8. Sequences such as `220Â°C` and `Â½` are consistent with UTF-8 bytes previously misread as Latin-1 or Windows-1252, rather than a font problem. The original affected import is not in this repository, so its upstream conversion cannot be identified here.

`src/recipe-text.ts` conservatively repairs known degree, fraction, punctuation and Icelandic mojibake sequences in known display fields. It also handles common double encoding. Valid Unicode, including Icelandic letters, remains intact; unrecognized corruption is left alone. IDs, references, revisions, paths, numeric amounts and extension metadata are preserved. Textual amounts retain their meaning with corrected symbols. Imports and backup restores normalize after validation; existing recipes, recovery versions and session snapshots normalize on read. Reading does not rewrite stored originals, increment revisions, reset sessions or clear any storage. Exports include the corrected display text. This is intentionally not a general repair for arbitrary damaged encodings or replacement characters (`�`).

Timers start, pause, resume, cancel and restart using timestamps. The sidebar panel keeps active timers visible across stages on iPad; phone timers remain accessible beside the collapsible timeline and in the Ingredients dialog. Countdown and elapsed time recompute when the app becomes visible. No background audible notification is promised: iPadOS can suspend or terminate any web app. Use the iPad's Clock app for a critical alarm. Device-clock changes affect timestamp-based timers and elapsed durations.

Safari and a Home Screen app can have **separate storage**. Install first and import into the Home Screen app you intend to use. If you already added recipes in Safari, export there and restore inside the installed app. Your iPhone and iPad **do not synchronize**. Clearing website data, removing the app, private browsing or storage eviction can remove local data. Export regularly. The [WebKit team documents the isolated storage behavior](https://developer.apple.com/videos/play/wwdc2023/10120/).

If device storage cannot open, the app clearly marks its temporary in-memory mode. If a save fails, a persistent error and retry action appear; the last committed database data is retained. Keep the app open, free storage and retry. Export preserves recipes, but not an unsaved cooking session.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Playwright starts the production preview automatically when port 4173 is free. Use `npx playwright show-report` for its report. The runner is pinned to a release compatible with this Mac's WebKit runtime. Tests cover the complete cooking flow, all six recipes' authored stage layouts, timestamp and checklist persistence, timer controls, import decisions, active-revision preservation, export/restore, recovery, and offline shell/images. Browser projects are WebKit iPad landscape at **1024×768**, Chromium at **1024×768**, and WebKit iPhone portrait at **390×664 CSS pixels** (the iPhone 13 device preset).

Detailed final verification results and remaining physical-device checks are in `VERIFICATION.md`. Automated desktop WebKit emulation is not the actual iPadOS 17 engine, A10 CPU, 2 GB RAM, iOS clipboard, Share Sheet, standalone container, or Airplane Mode behavior. Those require the physical iPad.

## Source map

- `src/App.tsx`, `src/components.tsx`, `src/ImportRecipe.tsx`: screens, cooking controls and import/recovery UI.
- `src/model.ts`: recipe/session types, quantities and timestamp timer transitions.
- `src/validation.ts`, `src/recipe-text.ts`: supplied JSON Schema validation, reference checks, import decisions and conservative display-text normalization.
- `src/repository.ts`: local recipes, atomic updates, bounded recovery, portable backups and sessions.
- `src/styles.css`: warm ivory/olive editorial design and iPad/phone layouts; system serif and sans fonts work offline.
- `scripts/sw-template.js`, `vite.config.ts`: worker-source-versioned, redirect-safe, path-scoped offline cache and staged app-file repairs; no data-wiping migrations.
- `public/recover.html`, `RECOVERY.md`: standalone app-file repair page and existing-installation recovery instructions.
- `tests/service-worker.test.ts`, `tests/e2e/service-worker.spec.ts`: redirected-response, legacy-upgrade, safe repair and data-preservation regressions.
- `public/photography.json`: verified Pexels creators, sources, license and local transformations.
- `tests/core.test.ts`, `tests/cooking-ux.test.ts`, `tests/e2e/kitchen.spec.ts`: data/timing, gathering, legacy-session, encoding and production browser acceptance tests.
- `src/gathering.ts`, `src/recipe-content.tsx`, `src/Preparation.tsx`: safe product totals, shared structured instruction rendering and preparation sections.
- `src/Accordion.tsx`, `src/Gather.tsx`, `src/PhaseNav.tsx`, `src/RecipeToolbar.tsx`, `src/CookingSidebar.tsx`: session-controlled workflow sections, phase navigation and independent timeline/timer regions.
- `tests/recipe-flow.test.tsx`, `tests/workflow-refinement.test.tsx`: deduplication, display formatting, optional amounts, equipment identity, structured references, explicit stage completion and legacy sessions.

The inspected repository has no existing dark-mode toggle or stylesheet. This refinement retains its current theme behavior and does not introduce a separate theme system.
