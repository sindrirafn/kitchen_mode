# Kitchen Mode V1 verification

Verified locally on **October 30, 2026**, using Node 22.18.0 on macOS 14.5. The service-worker repair has not been deployed by this task, and no physical iPad testing was performed.

## Results

| Check | Result |
| --- | --- |
| TypeScript: `npm run typecheck` | Passed |
| Data/timer/repository tests: `npm test` | **27 passed** |
| Production build: `npm run build` | Passed; static `dist/` generated with manifest, icons and scoped service worker |
| Full production browser suite: `npm run test:e2e` | **54 passed**, no skipped tests or retries |
| Additional introduction/completion visual captures | **2 passed**, WebKit iPad and iPhone |
| Production dependency audit: `npm audit --omit=dev` | **0 vulnerabilities** |
| `git diff --check` | Passed |

The full browser suite runs eighteen scenarios in each of these three projects:

- **WebKit 26.0**, iPad landscape, **1024×768** CSS pixels, touch/mobile emulation.
- **Chromium 141**, **1024×768** CSS pixels.
- **WebKit 26.0**, iPhone 13 portrait preset, **390×664** CSS pixels.

Playwright 1.56.1 and its matching browser binaries are locked in `package-lock.json`. Desktop WebKit emulation is not iPadOS 17 and does not model the iPad's A10 processor or 2 GB memory.

## Acceptance coverage

1. Exactly **six bundled originals** validate against the supplied Draft 2020-12 schema and cross-reference checks. The supplied JSON files and schema were not edited. Their **14 preparation groups and 40 cooking stages** render in source order. The naan dough and oven long-lead preparation stay at their authored positions.
2. Every recipe was taken through library → introduction → intentional start → preparation → every authored stage → explicit finish → completion → library. Final forward controls say **Finish Cooking**. Entering the final stage does not complete a session.
3. Opening the introduction creates no session. Browser-clock tests confirm deliberate start, timestamp-based elapsed duration, frozen elapsed time after completion, and resumed timing after Undo Finish. Completed sessions remain in the cooking journal after returning to the library and reloading.
4. Preparation checks, phase, stage and timer deadlines survive reload. Tests deliberately reload immediately after input, covering the recovery journal as well as IndexedDB. Timer start/pause/resume/cancel survive reload without restarting their duration.
5. Imports cover new IDs, identical content, higher revisions, conflicting same revisions, older revisions, malformed JSON and missing ingredient references. Validation failures preserve existing recipes. Updates require explicit confirmation, save recovery versions and leave an active session's original revision unchanged.
6. Export downloads valid cookbook JSON with current recipes, recovery history, bundled originals and archived IDs. A fresh browser context restores it. Recipe archival and explicit recovery retain the recipe. JSON file selection and denied-clipboard/manual-paste fallback are tested.
7. The build's actual service worker caches the shell and photographs. Each browser project uses a dedicated production-file origin, then that origin is made unable to return network responses. The page reloads, restores the checked cooking session, returns to the library and displays all six photos. This avoids WebKit Inspector's offline emulation interfering with service workers; it does not claim to simulate the physical iPad's Airplane Mode or standalone container.
8. **All 40 supplied cooking stages fit without main-stage scrolling at 1024×768** in both WebKit and Chromium. All recipes run without horizontal page overflow in phone portrait. An imported recipe with an intentionally very long full instruction remains readable, allows accessible overflow and keeps its Finish control available.
9. Library, cooking, introduction and completion screens were visually inspected from browser screenshots. The finished screen uses the specified ivory canvas, soft sage check circle, deep green check, serif “Ready to serve!”, “Enjoy your meal.”, local photo, oatmeal actual-elapsed-time panel, Back to recipes and Undo Finish.
10. Packaged Pexels WebP images have creator/source/license metadata in `public/photography.json`. They are explicitly serving inspiration, not images of the exact tested meals. Fonts are system fonts. There are no external image/font requests, backend credentials, authentication, Firebase, phone-remote UI, cloud backup, sync code or wake-lock requests.

11. **Save & Exit** preserves stage, preparation checks, recipe snapshot, start time and running timer deadlines across reload and resumption. **Discard Session** requires a separate confirmation; cancelling keeps the session. Confirmed discards from both preparation and cooking clear the stored session, timers and recovery journal, never show completion or create a completed history entry, and stay discarded after reload. A fresh start has no previous checks or timers. Repository tests also verify stale recovery journals and late writes cannot revive discarded IDs, and completed meals and other saved sessions remain intact. Finish Cooking and Undo Finish continue to pass their existing end-to-end tests.

12. **Service-worker recovery:** unit tests reject foreign/opaque/non-HTML/mismatched documents and verify that a freshly constructed response strips redirect metadata and decoded-body encoding/length headers. Browser tests reproduce Cloudflare-style `/index.html` redirects with the actual previous worker, verify online close/reopen recovery and in-place activation without reloading an active cooking client, and compare all cookbook IndexedDB stores plus localStorage before and after. They also cover redirected/missing/invalid shell entries, safe retry HTML when offline files are absent, staged repair success/failure, preservation of unrelated caches, and a separate `/kitchen-mode/` production build with a working scoped repair page and offline session restoration.

The current full suite passes without skips or retries. `playwright-report/` and `test-results/` contain the most recent run and are regenerated by tests. The existing stylesheet was not changed for the session-exit correction.

## What still needs the physical sixth-generation iPad

Use the HTTPS installation steps in `README.md`, then check:

- **Home Screen installation on iPadOS 17**: icon, standalone launch, landscape screen occupancy, actual touch targets, text at kitchen-island distance and OS Share Sheet behavior.
- **Standalone persistence**: add a recipe and checklist changes inside the installed app, quit it, relaunch it, and reboot the iPad. Safari's browser data is separate; installation does not promise migration of previously imported recipes.
- **Airplane Mode cold launch** after “Ready for offline cooking”: verify all six photos, a previously imported recipe, recovery versions and a saved session. Desktop offline-origin tests passed, but iOS manages its own cache/storage lifecycle.
- **Clipboard and Files**: actual iOS permissions, long-press Paste, the JSON file picker, Safari download/Save to Files and restoring an exported cookbook inside the installed app.
- **Background suspension**: leave a short timer running, switch apps or lock the device, then return. Deadlines should reconcile on return. V1 deliberately does not promise background sound or reliable alarms while iPadOS suspends/closes the PWA. Use the system Clock app for a critical alarm.
- **A10/2 GB performance and storage pressure**: actual cold-start latency, long-session responsiveness, low-storage error messages and OS storage eviction are not reproduced by desktop emulation. Device-clock changes affect timestamp-based durations.
- **Recovery of the affected installation**: deploy the repair to the same existing production origin, leave the installed app open online for the worker check/download, close its running window and reopen. Verify imported recipes, revisions, journal, preparation checks, active revision and timer deadlines before testing an offline cold launch. Local browser tests cover legacy-worker replacement and close/reopen recovery, but not iPadOS 17’s exact update timing or the affected device’s installed storage container. Follow `RECOVERY.md`; do not delete website data or reinstall. If Safari refuses to check the deployed worker, the guide includes a data-preserving Web Inspector update request.

Exports back up recipes and recipe versions, **not** cooking sessions/journal history. Backups are manual. iPad and iPhone do not sync. Clearing website data or deleting the installed app can erase local data, so export regularly and keep a copy outside the app.
