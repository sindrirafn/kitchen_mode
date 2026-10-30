# Recover an existing Kitchen Mode installation

This repair addresses Safari’s **“Response served by service worker has redirections”** error without clearing website data, uninstalling the Home Screen app, changing its URL, or resetting its cookbook.

## What was wrong

The old worker cached `/index.html` with `cache.addAll()` and returned that fetched Response directly for every navigation. HTML hosts can redirect that path to the canonical app URL. A cached Response retains its fetch redirect history even if its final status is 200. Safari can reject that Response when the worker uses it to answer a navigation. A private window starts with a different browser storage context, which explains why a clean context can work while an existing installation fails.

The source contains this failure path, and the new regression fixture reproduces it with the actual previous worker and an `/index.html` → `/` redirect. This supports the diagnosis; the affected physical iPad and its deployed responses have not been inspected directly. Cloudflare documents its [HTML canonical redirects](https://developers.cloudflare.com/pages/configuration/serving-pages/); WebKit has documented [this class of service-worker redirect errors](https://bugs.webkit.org/show_bug.cgi?id=190041).

## Deploy the repair first

1. Run `npm ci` if dependencies are not installed, then `npm run build`.
2. Deploy **all of `dist/` to the existing production project and the same HTTPS origin/path**. With Git integration, commit and push the source changes to the production branch and wait for that deployment to succeed. This local coding task has not published a deployment.
3. Keep the existing `/sw.js` script URL, manifest ID and Home Screen icon. Do not move to a preview URL or a different hostname; that would use different local storage.
4. The deployment must include `sw.js`, `recover.html`, the generated app assets, images and `_headers`. The host must serve `sw.js` as JavaScript at that URL, not redirect it to a sign-in page or return the app’s HTML. Do not apply a “cache everything” rule to `sw.js` or the recovery page. `_headers` provides revalidation rules on compatible Cloudflare static hosting.

The build now includes the worker source itself in its version hash, so a worker-only fix creates a new shell cache. `_headers` is intentionally excluded from the precache: it is hosting configuration, not a downloadable app asset.

## Normal recovery on the affected iPad

1. Connect the iPad to the internet.
2. Open **the existing Kitchen Mode Home Screen icon**. If the error appears, leave the app open for about 15–30 seconds to allow the browser’s worker update check and app-file download to finish.
3. Close Kitchen Mode from the App Switcher. This means dismissing its running window, **not deleting its Home Screen icon**. Close other Kitchen Mode windows if present.
4. Open the same existing icon again while online. A second online launch/retry may be needed while the worker installs. The repaired worker activates after a complete download, even if the old worker is still controlling a failed page. It does not force any open cooking page to reload.
5. Confirm that your imported recipes and cooking journal are still present and that a saved cooking session resumes with its previous checks, stage and timers.

Browsers check the same worker URL for changes independently of running the app’s JavaScript. Close/reopen recovery is covered by the WebKit and Chromium regression tests. The exact update scheduling and OS suspension behavior on the physical iPad still need confirmation. See the [service worker lifecycle explanation](https://github.com/w3c/ServiceWorker/blob/main/explainer.md#updating-a-service-worker).

Opening the URL in Safari Private Browsing does **not** repair the Home Screen app’s storage container. Keep recovery and verification in the affected installed app.

## App-file repair page

Once the fixed worker has taken over, open **Your cookbook & backups → Repair offline app files** from the installed app. The repair document is also at **`recover.html` beneath the app’s existing base URL** (some hosts display it as `/recover`). For example, an app hosted at `https://example.com/kitchen/` has `https://example.com/kitchen/recover.html`.

Choose **Repair app files** while online, wait for **“App files repaired”**, then choose **Back to Kitchen Mode**. The page displays the installed repair version to help distinguish deployments.

This checks the existing registration for an update and stages a full set of clean app files before replacing the shell. An interrupted or failed download leaves the previously working cached build available. Only the app’s path-scoped Cache Storage entries are rebuilt. It never opens or deletes IndexedDB, changes localStorage, unregisters the service worker, or restores a cookbook backup over current data.

The repair page is a small standalone HTML document with its own inline script/styles; it does not depend on the React bundle loading. However, **a repair link cannot bypass a still-active, root-scoped legacy worker that intercepts every navigation**. That worker must first receive the deployment update through the online recovery steps above. Opening the page in a separate Safari container only repairs that container.

## If iPadOS still will not check for the new worker

Do not clear website data or remove the app. First confirm the deployment completed on the exact installed origin and that its `sw.js` response is current, is JavaScript, and does not redirect. Also check whether a custom CDN rule is serving the previous worker.

As a data-preserving diagnostic fallback, use Safari Web Inspector on a connected Mac to inspect **the installed Kitchen Mode app’s own context**, rather than a Safari Private window. Enable Web Inspector on the iPad and the Develop menu on the Mac if needed, connect the devices, then select the iPad’s Kitchen Mode target. In that app page’s Console:

```js
(async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('Select the existing installed Kitchen Mode context.');
  await registration.update();
  console.log('Repair update requested for', registration.scope);
})();
```

If the failed document does not expose an inspectable same-origin page context but its **service worker target** is available, run this in that worker’s Console instead:

```js
self.registration.update();
```

Wait for the new worker to install, then reopen the same installed app. These commands only ask the browser to fetch the deployed worker update; neither deletes local data nor unregisters the existing installation. Web Inspector availability on the affected physical device has not been tested here. If the update request fails, record that network/console error so the hosting or device-specific issue can be diagnosed without destructive recovery steps.

## Verify the repaired installation

1. Verify your own imported recipes, recipe revisions/recovery history and cooking journal are unchanged.
2. Resume a saved session and check its preparation marks, stage, original recipe revision and timer end times. An already-running timer should reflect elapsed real time, not restart from its original duration.
3. Return to the library and wait for **Ready for offline cooking**.
4. Disable Wi-Fi/mobile connectivity, close the app’s running window and reopen its existing icon. Confirm the library, photographs, imported recipes and saved session still work without the redirection error.
5. Reconnect. Run the repair page once from inside the installed app, return to cooking and repeat the offline launch. Current data must remain intact.
6. If using Web Inspector, a shell cache response for `index.html` should report **`redirected: false`**. The repair worker constructs a fresh HTML Response instead of merely cloning the original redirected fetch Response.

The automated suite also verifies in-place upgrades while a cooking page remains open, repair of redirected/missing/invalid cached HTML, safe offline retry HTML when no shell can be loaded, failed-repair rollback, preservation of unrelated caches, and subdirectory deployments. These are desktop WebKit/Chromium tests, not a claim of testing the physical iPadOS 17 standalone container.
