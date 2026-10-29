# Kitchen Mode — final Codex implementation handoff

## Mission and definition of done
Build a complete, polished, local-first, installable recipe PWA for a **6th-generation iPad (2018), iPadOS 17, Safari/WebKit, landscape 1024 × 768 CSS pixels, limited memory**. It must also fit iPhone portrait. This is a free, private family cookbook, not a commercial product. Implement **all V1 requirements below**, test, fix problems, and deliver instructions for testing on the physical iPad. Do **not** stop after scaffolding or an intermediate milestone. Do not ask for routine permission between phases. Work autonomously through implementation, tests, debugging, and production-build verification; report only genuine blockers and external-device limitations at the end. No paid services or subscriptions.

**Source of truth:** The supplied six recipe JSON files and `recipe.schema.json` in the attached recipe bank ZIP. All six MUST be in the initial library. Do not replace them with dummy recipes or silently rewrite tested recipes. `README.txt` explains known source caveats. The recipes contain authored steps; **do not algorithmically generate/redivide cooking steps**. Preserve their ordering and preparation organization. Some instructions still contain literal quantities; render faithfully and do not advertise functioning dynamic serving-size scaling (V2).

## V1 product scope

### A. Recipe library (first primary screen)
- Two-column, scrollable, photograph-led library on iPad landscape; adapt to narrower portrait phones.
- Cards show photo, recipe name, brief summary, base servings and approximate total time. All six genuine recipes visible. Tap to open recipe intro.
- Intro shows hero image, title, subtitle, summary, servings, approximate duration and a prominent **Start Preparing** CTA.
- Treat absent recipe-image assets gracefully. Recipe JSON currently references images marked `asset-required`, not real files. Source suitable reuse-permitted food photos from Unsplash/Pexels if feasible, save optimized local WebP assets plus license/creator/source metadata, and cache for offline use. Never copy random copyrighted images or assume attribution alone authorizes use. If photos can't be sourced reliably, provide beautiful nonbroken illustrated/color-gradient placeholders; do not block core functionality. Do not pretend placeholders are genuine dish photographs.

### B. Preparation and guided cooking (second primary screen)
- **Start Preparing** initializes/resumes a cooking session and records `startedAt` only on an intentional start. Never start timing merely from opening the intro.
- Render the ordered authored `preparation` groups as clear cards with checkable items. Checkboxes help organization but never gate navigation. Persist checked IDs.
- Then render exactly one meaningful **authored** cooking stage at a time: large readable heading, self-contained full instructions, referenced ingredient quantities shown clearly, optional learning tip, tappable timer chips, large Prev / Next controls, progress bar or step counter, unobtrusive **Next up** stage-title preview.
- iPad landscape must not require routine scrolling between stages; design for the 1024×768 viewport using judicious typography and concise layout, while allowing accessible overflow for unusually long content. On phone portrait, scroll within stage as needed.
- Use ingredient/component references from supplied recipes, not invented measurements; preserve ranges, optionality and source caveats. A recipe with curry + rice + naan remains one coordinated ordered cooking experience. Include practical oven/naan long-lead prep at authored positions.
- Auto-save the session's recipe ID, **recipe revision snapshot**, phase, current step ID, checklist state, timer end timestamps and startedAt. Restore after reload. Active session must not switch to a newer recipe revision while cooking.
- Timer chips use real end timestamps and support start/pause/cancel where reasonable, display countdown while app is active. Avoid promising reliable audible alerts when iPadOS suspends or closes the PWA; be honest in UI. The iPad is already configured never to sleep; **do not implement a wake-lock feature**.
- On the final cooking stage, the primary forward control is **Finish Cooking**, not Next. Do not auto-complete on arrival at that stage or after starting a simmer timer.
- Finish Cooking records `completedAt`, stops the overall elapsed timer, and opens a deliberately designed final screen: warm ivory background, large soft-sage circle containing deep-green checkmark, **“Ready to serve!”**, smaller **“Enjoy your meal.”**, attractive dish image if available, subtle oatmeal panel with actual total elapsed time, and **Back to recipes** button. Add **Undo Finish** safeguard that reopens the session and resumes timing if accidental. Do not erase history when returning to library.
- V1 only tracks whole-session elapsed duration using actual timestamps; no adaptive duration prompts. Future V2 should track per-stage elapsed times, round step estimates up to 1 minute, round approved total estimates up to 5 minutes, and offer updates after meaningful differences. Keep V1 session timestamps sufficient for future analysis. No extra V1 UI for V2.

### C. Clipboard recipe import (mandatory V1)
- Add an obvious but unobtrusive **Import Recipe** entry point in the library/settings.
- Provide a large editable paste field plus a Paste button when supported; iOS clipboard permissions/user gestures differ, so **manual long-press Paste must always work as fallback**. No local file editing, laptop, Git, or redeployment required to add/update recipes.
- Parse JSON, validate with the supplied schema plus cross-reference checks (IDs unique, referenced ingredient/component/timer IDs exist as relevant). Give actionable errors, never overwrite valid data on a failed import.
- New ID → add; existing ID with higher `revision` → offer a one-tap update confirmation; identical content → no-op; same revision with differing content → warn and permit explicit replacement; lower revision → warn, explicit restore/replace only. A recipe's `id` is stable across edits; `revision` advances for intentional versions.
- Keep a bounded recovery history for previous saved versions, including bundled-original recovery; deleting/updating a recipe must never silently erase all prior revisions.
- Imported override in IndexedDB takes precedence over read-only bundled JSON without modifying application files. Preserve currently active cooking revision even after import.
- Add simple **Export Cookbook** action that downloads or shares a portable JSON backup containing all current recipes and sufficient revision history. A manual safeguard for V1 only; do not pretend it runs off-device automatically.

### D. Storage and installation
- All active V1 features work fully **offline**, including the bundled six recipes, saved imports, session restoration, and available locally packaged imagery. Implement as an installable HTTPS PWA with app manifest and a carefully scoped service worker; ensure updates don't wipe data.
- Use IndexedDB for local persistence, with a clean small `RecipeRepository` abstraction. Schema, recipe revisions, and cooking sessions must be distinct. Handle IndexedDB errors/storage limitations gracefully. Avoid huge dependencies and image assets because the target has a low-memory A10/2GB system.
- Installed Home Screen PWA may have separate storage from Safari; test persistence in standalone mode as far as automation allows. iPad and iPhone do **not** synchronize their IndexedDB automatically.
- **Do NOT implement Firebase, Supabase, authentication, cloud backup, backend sync or phone remote in this first build.** Future phase plans to use Firebase Firestore on the free Spark plan for off-device versioned backups, cookbook sync, and a separately joined real-time phone cooking companion. Prepare a clean local repository boundary and stable IDs only; do not build placeholder backends, speculative sync code, or empty remote UI. No cloud credentials required for V1.

## Visual art direction — non-negotiable
Aim for a **warm, premium editorial cookbook**, not a default SaaS dashboard. Treat this section as highly specific design direction, not loose inspiration.
- Core palette: ivory **#F7F3EB** canvas; deep olive **#344B3C** headings/buttons; oatmeal **#E8DDCA** warm panels; charcoal **#292A24** body text; muted sage **#66715F** accents. Soft sage checkmark background **#E3EBDD**. Avoid bright saturated primaries, hard enterprise blue, or busy gradients.
- Editorial food photography is prominent on library cards and intros, with generous breathing room, restrained borders, soft corner radius, subtle layering. Use legible serif display headings and highly readable sans-serif instructions. Fonts must load efficiently/offline with adequate fallback; don't bundle proprietary font files.
- Large tap targets, high contrast, readable at arm's length from an iPad standing on a kitchen island; keep controls predictable and simple. Limit unnecessary menus and interactions.
- Finished screen should resemble a beautifully composed cookbook completion page, not an achievement popup: centered green check, refined title, warm photo, understated elapsed-time panel, and one primary action.
- Prioritize useful screen occupancy over ornament. Accessibility: keyboard navigation, semantic buttons, labels, reduced-motion respect, alt text, visible focus, sufficient contrast.

## Implementation and verification strategy
Choose a lightweight established frontend stack (e.g. Vite + React + TypeScript) and small styling solution. No backend. Organize the code cleanly, but avoid overengineering. Complete **one working vertical slice** first, test it, then finish all remaining V1 features **within the same autonomous run**. Internal milestones are checks, not points to stop and request permission.

Required verification before declaring done:
1. All six JSON recipes load and pass schema/cross-ID checks; there are exactly six bundled originals.
2. Library → intro → Start Preparing → checklist → all authored cooking stages → Finish Cooking → completion screen → Back to library.
3. Elapsed timer starts only at Start Preparing, survives reload via timestamps, stops at Finish Cooking, and Undo Finish resumes correctly.
4. Checkmarks, current stage and timer end timestamps survive reload.
5. Clipboard paste/import adds a new recipe and higher-revision import replaces library version after confirmation while preserving recovery history and an active cooking snapshot. Same-revision conflicts, older revisions, malformed JSON and missing references are handled safely.
6. Export Cookbook produces valid, portable JSON and can be used to recover the collection in a documented way (either offer explicit import-backup or make export compatible with documented restoration flow).
7. Offline cached build opens without a network connection after first successful installation; no broken image assets.
8. Inspect and test **1024×768 iPad landscape** and an iPhone portrait viewport. Use WebKit automation if available; otherwise report the limits honestly. Test small-screen overflow for long recipe steps.
9. Typecheck/lint/test where configured, automated UI tests for critical flows, and production build succeed. Fix test failures before final report.
10. No fake Firebase/auth UI, misleading off-device backup status, incomplete placeholder features, or unlicensed image copying.

## Final delivery expectations
Give commands to run and build, deployment instructions for a **free HTTPS hosting option** (so the iPad can Add to Home Screen), installation and data-storage caveats, verified test results, and any honest limitations of tests not performed on physical hardware. If a hosting provider needs the user's login, explain what setup they must do; do not claim deployment already happened. Do not require credentials to complete local coding.

**Definition of done:** A beautiful, usable, stable, locally persistent, offline-capable V1 Kitchen Mode on the target iPad, with six real recipes and clipboard importing/updating, tested end to end. Continue implementation through this objective rather than stopping at scaffolding or milestones.
