# Kitchen Mode

A local-first family cookbook for a sixth-generation iPad (2018), iPadOS 17, and portrait iPhones. Built with React, TypeScript and Vite. No server, accounts, cloud database, analytics, remote phone controls, wake lock or external font requests.

The six files in `recipes/` and `recipe.schema.json` remain the authoritative, unchanged recipe content. The app renders the supplied preparation groups and cooking stages in their authored order. It does not scale servings or apply untested proposed changes.

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

Hosting is managed in your Cloudflare account. This repair task has **not** published an updated deployment; use the existing production project if the app is already installed. No credentials are needed for local development.

1. Run `npm run build`.
2. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Workers & Pages**, choose to create a **Pages** application, and select the **Direct Upload / drag-and-drop** option. Dashboard wording can change.
3. Name the project, for example `our-kitchen-mode`, and upload the **`dist` folder**, which contains `index.html`, `sw.js`, the manifest, app assets and photographs. Do not upload the repository or `node_modules`.
4. Deploy. Cloudflare supplies a free HTTPS URL such as `https://our-kitchen-mode.pages.dev`. Keep this **same production URL** for future deployments: local storage belongs to its origin. A preview URL, different domain or different browser has a separate cookbook.
5. On the **iPad**, open that HTTPS URL in **Safari**. On iPadOS 17, tap **Share → Add to Home Screen → Add**. Keep the name **Kitchen Mode**. The supplied manifest opens it as a standalone app.
6. Open **Kitchen Mode from its new Home Screen icon while online**. Wait for **Ready for offline cooking** at the bottom of the library. Scroll through all six recipes once to inspect them.
7. Turn on Airplane Mode (and disable Wi-Fi if it remains enabled), close the app and reopen the icon. Confirm the recipes and photographs still open. Start a recipe, tick preparation items, move to a stage, start a timer, then close and reopen to check recovery.

This app fits within the [Cloudflare Pages Free plan limits](https://developers.cloudflare.com/pages/platform/limits/). See the provider's [Direct Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/) and [Apple's Home Screen web app guidance](https://webkit.org/blog/13878/) for details. No custom domain or paid plan is needed. Direct Upload projects cannot later be converted to Git integration; create a new project if you need that workflow.

Hosting publishes the app and its six bundled recipes. Imported recipes, recovery versions and cooking sessions stay on the device and are never sent to the host. V1 has no authentication; a public static hosting URL does not make the bundled files access-controlled.

For an app-code update, build again and upload `dist` as a new **production deployment of the same project**. The service worker fully caches a new version, then activates without forcing open cooking pages to reload. It keeps one previous build’s immutable assets for open clients, removes stale navigation entries and never clears IndexedDB or localStorage. Reload or reopen when convenient to use the new interface. The repaired navigation fallback reconstructs HTML responses so a redirected cached fetch cannot cause Safari’s redirection error. See [RECOVERY.md](RECOVERY.md) for existing-installation recovery and verification. Recipe updates normally use **Import Recipe**, without redeployment.

### Optional subdirectory hosting

Root hosting (Cloudflare's default) needs no configuration. For a host that serves the app under `/kitchen-mode/`:

```sh
VITE_BASE_PATH=/kitchen-mode/ npm run build
```

Upload the contents of `dist` at that path. App assets, icons, manifest, service worker and packaged photos use that base path. Keep a trailing slash. The service worker limits requests and shell-cache cleanup to its own path.

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

IndexedDB database `kitchen-mode-v1` separates recipe overrides, recipe revisions, cooking sessions and schema/active-session metadata. The repository is in `src/repository.ts`. A tiny synchronous localStorage recovery journal protects the latest session change if the page is reloaded before its IndexedDB transaction commits; it is removed after a successful save. A session includes its recipe snapshot, phase, stage ID, checked IDs, timer end timestamps, `startedAt`, `completedAt` and `updatedAt`.

Opening a recipe introduction does not start timing. **Start Preparing** deliberately records the start. Navigation and checklists never force cooking completion. Only **Finish Cooking** records completion. **Undo Finish** reopens the final stage and resumes whole-session timing from the original start, including the intervening time. The cooking journal retains completed and set-aside sessions.

While preparing or cooking, choose **Exit recipe** (or the cookbook logo) to open the exit options. **Save & Exit** preserves the session's recipe snapshot, preparation checks, current stage, start time and timers for later resumption. **Discard Session → Confirm Discard** removes that session and its timers, clears its resumable progress and returns to the library. **Keep cooking** cancels the confirmation. Discarding never finishes the meal or creates a completed history entry; existing completed meals and other saved sessions remain. Starting the same recipe again creates a fresh session.

Timers start, pause, resume, cancel and restart using timestamps. They remain visible across stages; on phone, timers from other stages are available in the Ingredients dialog. Countdown and elapsed time recompute when the app becomes visible. No background audible notification is promised: iPadOS can suspend or terminate any web app. Use the iPad's Clock app for a critical alarm. Device-clock changes affect timestamp-based timers and elapsed durations.

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
- `src/validation.ts`: supplied JSON Schema validation, reference checks and import decisions.
- `src/repository.ts`: local recipes, atomic updates, bounded recovery, portable backups and sessions.
- `src/styles.css`: warm ivory/olive editorial design and iPad/phone layouts; system serif and sans fonts work offline.
- `scripts/sw-template.js`, `vite.config.ts`: worker-source-versioned, redirect-safe, path-scoped offline cache and staged app-file repairs; no data-wiping migrations.
- `public/recover.html`, `RECOVERY.md`: standalone app-file repair page and existing-installation recovery instructions.
- `tests/service-worker.test.ts`, `tests/e2e/service-worker.spec.ts`: redirected-response, legacy-upgrade, safe repair and data-preservation regressions.
- `public/photography.json`: verified Pexels creators, sources, license and local transformations.
- `tests/core.test.ts`, `tests/e2e/kitchen.spec.ts`: data/timing tests and production browser acceptance tests.
