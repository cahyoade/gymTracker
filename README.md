# Form: lightweight offline gym tracker

A mobile-first, vanilla JavaScript PWA. No runtime packages, application server, tracking, or account required for workout logging. It runs directly from static files; the optional deployment build copies public assets without bundling. All core assets ship with the app; Google code loads only when opening Settings online in a configured deployment.

## Run locally

Install Node.js, then run:

```sh
node scripts/serve.mjs
```

Open **http://localhost:4173**. You can also use `npm run dev` if npm is installed. The server is for local development only and listens on loopback. Use localhost rather than opening `index.html` as a file: JavaScript modules and service workers require HTTP/HTTPS.

### Try a phone on the same Wi-Fi

Run `node scripts/serve.mjs --lan` (or `npm run dev:lan`). Open the printed Wi-Fi network address on your phone, usually `http://192.168.x.x:4173`. Keep the computer running and use the same Wi-Fi network. `PORT` changes the port; `HOST` can bind a specific interface instead of all IPv4 interfaces. If Windows asks, allow Node on your private network. LAN mode serves only the public app assets, not tests, project documents or backups.

This plain-HTTP preview supports logging and file backups. PWA installation/offline caching and Google sign-in require HTTPS or localhost. The phone has its own browser dataset; use file export/import to move records explicitly.

For full Android PWA testing without deployment, connect an authorized USB-debugging device, keep the local server running, and run `adb reverse tcp:4173 tcp:4173`. Open `http://localhost:4173` in Android Chrome. Use the same port on both sides if you changed `PORT`; the app's Google OAuth client must authorize that localhost origin. This uses localhost's secure-context allowance without changing browser security flags or installing a certificate.

## Use it

1. Create a routine from the exercise collection. Set the exercise order, number of sets, and rep ranges.
2. Start your routine. Enter this session's weight and reps in the blank fields. Previous records appear alongside them, shared across routines.
3. Mark performed sets complete. Changing weight or reps requires confirming that set again. Zero kilograms supports bodyweight exercises; use the same weight convention for an exercise each time.
4. Finish the workout to save only completed sets. Missing sets retain their original set positions, so an unperformed set 2 never inherits set 3's record. An unfinished workout autosaves and can be resumed after reopening.
5. Review History or filter it by exercise. Correct saved records or delete sessions; previous performance updates automatically. Corrections require an explicit save.

Archiving hides exercises from the active collection and new routine selections. Existing routines can still use them, and history remains available. Renaming exercises or changing/deleting routines does not rewrite session snapshots.

## Exercise library

Open **Exercises → Browse library** to search 1,324 exercises from [Hasan Emir Yıldırım’s exercises dataset](https://github.com/hasaneyldrm/exercises-dataset). Filter by body part and equipment, or search names, equipment and target/supporting muscles. Results start with 24 records; **Show more exercises** adds another 24. Details include equipment, muscles and English step-by-step instructions.

Choose **Add to collection**, then use that exercise in a routine. Imported exercises get an **Instructions** button and support the same history, PRs, recommendations, renaming and archiving as custom exercises. Re-adding an archived exercise restores its existing record. Repeated or simultaneous adds use stable source IDs; existing custom exercises with the exact normalized name are reused. Distinct source IDs remain separate even when the source uses duplicate names.

The existing collection and history are preserved. Only exercises you choose enter your personal dataset and backups. The full text library is bundled as an approximately 860 KB JSON file and cached for offline use after the first online visit; browsing does not contact GitHub. Imported library references survive file/Drive backups and restores. Logging still uses kg and reps; cardio records in the library do not add time/distance logging.

Data and instructions are MIT licensed; the retained notice is in [data/EXERCISES-LICENSE.txt](data/EXERCISES-LICENSE.txt). Images/GIFs are excluded because their separate Gym visual license does not transfer through the repository. The source is pinned to commit `7455efae41b330c265e7cd4b78dfa848e7ce5ebd`; `node scripts/update-exercise-catalog.mjs` reproduces the English-only, media-free bundle. Updating the source requires reviewing a new pinned commit and rerunning the catalog checks.

## Personal records

Exercises show your heaviest completed set (ties use more reps), and **Personal records** lists the most reps at each logged weight with achievement dates. Log 0 kg for bodyweight rep records. Your best saved set also appears during workouts.

The first completed performance establishes a baseline. Later improvements earn weight/rep PR badges in History and session details, with a notification after a successful save. Ties do not earn new badges; different weights have separate rep records. Records are recalculated from completed history across every routine, including archived exercises. Corrections, deletions and restores recalculate them automatically. Drafts and unperformed sets never count. Existing backups already contain everything needed; the backup format is unchanged.

## Body progress

Open **Progress** to review strength trends and record body weight (kg), muscle mass (kg), and body fat (%). The **Body measurements** section retains your readings and charts. Save one dated record per day with any combination of readings; missing values remain blank. Edit or delete records as needed. The summary shows each metric’s latest available reading and change from its previous reading, with body-fat changes expressed in percentage points. Trend charts show the latest 30 readings for the selected metric; the dated list shows 20 records at a time with **Show more records** for older entries.

All measurement data is stored offline in IndexedDB and included in file and Drive backups and local recovery copies. Existing workouts, drafts and routines survive the storage upgrade. Version 1 backups remain importable; they contain no body history, so restoring one clears current body records after the replacement preview and retains them in the recovery copy. Measurement edits count as local changes needing backup. The app records readings without estimating muscle mass from body fat or treating a change as good or bad.

## Strength trends

In **Progress → Strength trend**, choose an exercise with completed sets. History is shared across routines, and archived exercises remain available. The default selection is the most recently completed exercise. There are two views:

- **Heaviest set (kg):** one point for the highest logged load in each session, with ties resolved by more reps. The latest set and its reps are shown together; a heavier set with fewer reps does not on its own demonstrate a strength increase.
- **Reps at a fixed weight:** choose a logged weight and compare the highest reps in a single completed set at that weight per session. Sessions without that weight are omitted. Bodyweight-only exercises default to this view at 0 kg; body weight is not added to the logged load.

Charts show up to the latest 30 matching sessions, using completion date/time horizontally and a labeled, scaled vertical axis. **Charted sessions** exposes the exact sets, dates and routine snapshots for every plotted point. A single recorded session shows one point; more matching sessions are needed for a trend. The summary compares the latest two matching sessions, rather than claiming an overall strength score or estimating a one-rep max.

The charts derive directly from completed workout records: drafts, unperformed sets and invalid historical inputs are excluded. Corrections, deletions and restores are reflected when Progress is opened or refreshed. Viewing or changing chart controls does not write workout data or backup state. The feature works offline; existing backup files contain all necessary records, so no database or backup format change is required. Run `node --test tests/strength.test.js` and `node tests/strength-browser.mjs` against the test server to verify the calculations and complete browser workflows.

## Muscle-gain guidance

Open **Next session** on an exercise or **Targets & explanation** in a workout. Suggestions use your routine’s rep range and completed history: aim for one more total rep, confirm the top of the range, then consider a small equipment-supported load increase. Set your available increment in the explanation dialog (default 2.5 kg). Suggestions stay separate from your actual set inputs.

## Food and warteg meals

Open **Food → Add meal** to build an empty plate from 19 everyday foods, grouped into Nasi & mi, Lauk, Sayur and Extras. Tap a dish to add one base serving, adjust by halves or enter another quantity. Gram/ml entry appears only when a conversion is known. Search or choose Selected to focus on the current plate. Every meal starts empty; there are no saved plate templates or automatic meal records.

The running totals estimate calories, protein, carbohydrate and fat. **Log meal** atomically saves the chosen items; unfinished meals autosave separately and survive offline reloads without entering daily totals. Resume from Food. Save & close keeps an unfinished draft; Discard removes only that draft. Edit or delete logged meals as needed. Manage foods supports custom foods, editing and archiving; historical meals retain their original names, portions, source notes and nutrient values.

Initial calorie/protein estimates and targets (2,500 kcal; 120–135 g protein) are user-supplied and editable. Research added carbohydrate/fat estimates for cooked rice, a large boiled egg and whole milk, with source links and portion assumptions in Estimate details. Other prepared dishes lack suitable verified serving matches and retain unknown macros. Unknown is not zero; incomplete totals say Partial. All values remain estimates and can be replaced with labels or measured portions. Sources and implementation details are in [NUTRITION_PLAN.md](NUTRITION_PLAN.md).

Mark a food day Complete when logging is finished. Subsequent meal changes reopen it. **Progress → Nutrition** offers 7-, 30- and 90-day charts, effective-dated targets, per-food breakdowns, and 20 dated records at a time with Show more. Averages use completed days with complete values for the selected nutrient and show coverage; unlogged days are gaps and unfinished days remain provisional. No exercise calories are subtracted from intake. Existing body and strength records remain available.

Skipped sets, changed plans, mixed loads, bodyweight logging, missed minimum reps and long gaps receive contextual guidance instead of a forced weight increase. History corrections, deletions and restores recalculate the advice. The entire feature works offline; no account or network service is involved. **Settings → Training guidance** explains the rules and links the research, including the 2026 ACSM position stand. The precise thresholds are app heuristics, not a validated prediction model. See [PROGRESSION.md](PROGRESSION.md) for research, limitations, and verification commands.

## Appearance

Settings → Appearance offers **Light**, **Dark**, and **System**. System is the default and follows device changes. The preference is stored in localStorage on this browser, applied before the first paint, and works offline. Other open tabs update together. Theme changes preserve active workout inputs and do not change workout data or backup status. Themes are device preferences, so importing a workout backup keeps the receiving device's theme.

Settings lists file backup, Google Drive backup and recovery first. Appearance follows those tasks, with hue/brightness controls under **Customize colors**. The main Routines view puts current training and routine actions first. See [DESIGN.md](DESIGN.md) for the approved refinement direction and [DESIGN-REVIEW.md](DESIGN-REVIEW.md) for the resolved audit findings and verification scope.

Background and foreground hue controls offer live sliders and exact degree inputs (0–359°). Background tints page and card surfaces; foreground tints text, buttons, category labels, borders, dividers, navigation highlights, error fills, dropdown arrows, overlays and shadows. A background brightness slider (0–100%) adjusts surface lightness within the selected theme’s range to keep text readable; 50% is the default. It is remembered with the hue settings and works offline. A live preview shows the combination, and **Reset colors** restores the original palette without changing the selected mode. Custom colors are remembered per browser, work offline, update other tabs, and are applied before app startup. They do not change workout backups. The logo stays neutral; the hue/brightness scales retain their functional colors. See [the palette audit](COLOR-AUDIT.md) for coverage and intentional fixed values.

## Offline and installation

Open the app online once and let its service worker finish caching. Settings shows when the offline app is ready. Install through Chrome's installation menu or the Install button in Settings when available. Every core view and workout action works offline; Google Drive requires a connection.

The app requests persistent storage when supported. Browser storage is tied to the origin and browser profile. Clearing site data, uninstall behavior, or browser eviction can remove local records; keep a backup. A different domain, port, browser, or device has a separate dataset.

## Backup and restore

- **Export backup** downloads a JSON snapshot including exercises, routines, session history, body measurements, foods, meals, food-day states, targets, both unfinished drafts, and workout preferences.
- **Import file** validates the entire snapshot and previews its date and record counts before asking to replace local data.
- Every restore atomically saves the current dataset as a **recovery copy** before replacement. Settings can restore or export that copy. There is one recovery copy; the next restore replaces it with the dataset being replaced.
- Google Drive uses explicit backups and restores, not automatic synchronization. Before switching devices, back up on the first device and restore on the second. Independent records on two devices are not merged.
- Google OAuth IDs and tokens are excluded from exports. Tokens exist only in memory. File-export timestamps describe when a download was prepared; the browser controls whether it is saved.

Backup format version 3 has `schemaVersion`, `exportedAt`, `exercises`, `routines`, `sessions`, `bodyMeasurements`, `workoutPreferences`, `foods`, `foodMeals`, `foodDays`, `nutritionTargets`, and `foodDraft`. Versions 1 and 2 remain importable: version 1 lacks body history; both lack nutrition history. Their restore preview explains that current meal records will be replaced by empty history, the starter food library and default targets. The recovery copy retains the records being replaced. Current-format imports validate all nutrition data before replacement.

IndexedDB `form-training` version 3 retains existing stores and adds `foods`, date-indexed `foodMeals` and `foodDays`. Effective-dated targets and the meal draft live in metadata. Migration seeds the food library once, preserves training/body records, and marks the added data as unbacked-up. Subsequent launches never overwrite edited or archived foods. Older app releases cannot import version 3 exports; update each receiving device first.

## Configure optional Google Drive

Follow [GOOGLE_SETUP.md](./GOOGLE_SETUP.md) for the one-time Google Cloud setup. Configure the public Web OAuth client ID in `js/config.js`, enable Drive API, and register your exact localhost/deployed origins. No client secret belongs in this static app. Google sign-in is disabled until configuration is supplied; file backups remain usable.

In Settings, press **Sign in with Google**, then **Enable Drive backup** to grant private backup access. The app verifies the sign-in credential and checks that the Drive authorization belongs to the same account. Use **Back up now** to create and verify a timestamped snapshot; only then are older backups removed to retain five. **Find backups → Restore** previews a backup before asking to replace local data.

Use the same OAuth client/project on all your devices to find the same backups. Its app data folder is hidden in Drive's file browser and accessible only to that application. Download a normal JSON export if you also want a visible file. Account details and access tokens stay in memory; reopening requires sign-in again. Sign out clears the app's account/token without deleting workouts; revoke permission separately in your Google account if desired.

Official references: [OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [browser token authorization](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive app data](https://developers.google.com/workspace/drive/api/guides/appdata).

## Static hosting

For **GitHub → Netlify automatic deployment**, follow [NETLIFY_SETUP.md](NETLIFY_SETUP.md). The included `netlify.toml` runs `npm test && npm run build` on each deployment and publishes only `dist/`. Node 24 runs the build checks on Netlify; the hosted app remains plain HTML, CSS and JavaScript. No environment variables or client secrets are needed.

Upload `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `js/`, `data/` (including its license), and `icons/` to any HTTPS static host. No build is required. Relative URLs support hosting in a subdirectory. Do not upload tests or development scripts. Workout records stay in browser storage and your Drive; the host serves only app code and the public exercise catalog.

Serve JavaScript and JSON with their correct MIME types. Serve `sw.js` with a short/no-cache policy. On every release changing core assets, bump the cache name in `sw.js` and update its asset list when adding/removing files. The new worker caches the full shell and waits; Form offers **Save & update** before activating it. Active workout drafts are flushed before reload, and unsaved history corrections must be saved or cancelled first. Keep a stable origin so local records remain accessible.

## Verification

Run dependency-free model, validation, and mocked Drive tests:

```sh
node --test tests/unit.test.js tests/records.test.js tests/progression.test.js tests/measurements.test.js
```

For browser tests, install Playwright as a development tool (not an app dependency), start `node tests/server.mjs` in a separate terminal, then run:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser.mjs
node tests/google-browser.mjs
node tests/feature-audit.mjs
node tests/records-browser.mjs
node tests/theme-browser.mjs
node tests/colors-browser.mjs
node tests/progression-browser.mjs
node tests/measurements-browser.mjs
node tests/design-browser.mjs
node tests/layout.mjs
```

Optional environment variables: `APP_URL` (default `http://localhost:4173`), `PLAYWRIGHT_MODULE` (absolute path to an existing Playwright module), and `BROWSER_PATH` (path to an existing Chromium/Edge executable). Tests use a separate, temporary browser context and write ignored screenshots to `test-results/`.

The theme suite checks device preferences, explicit overrides, pre-paint startup, offline reloads, keyboard controls, cross-tab updates, blocked localStorage, draft preservation, text contrast, and dark dialogs. Run layout checks with `THEME=dark` and `AUDIT_STAGE=dark` to generate dark-theme screenshots and measurements; light is the layout suite default.

The colors suite checks live hue controls, keyboard and numeric entry, persistence/offline use, reset, cross-tab updates, storage failure, invalid preferences, pre-paint colors, Google button stability, and computed text contrast across sampled hue combinations, including hover/category/error fills. Run `npm run test:hover` against the test server to verify actual navigation, primary/secondary button, and icon button hover states across both themes, mobile/desktop sizes, and brightness limits. Run `npm run test:palette` to audit all resolved palette color tokens, rendered category/error/dropdown/overlay colors, and component color literals. Set `CUSTOM_COLORS` to a JSON object such as `{"background":235,"foreground":195}` when running layout checks to test a custom palette.

Browser scenarios cover real IndexedDB writes, offline reopening, autosaved drafts, completed-set filtering, shared history, small screens, corrections, rename/archive snapshots, file round trips, invalid imports, recovery, simulated storage failure, restore transaction aborts, and an app update that saves the active draft before reload. The test server simulates a release in memory without editing source files. Unit tests cover Google denial/cancellation, token expiry, network failure, upload verification, pagination, and retention.

The feature audit additionally covers keyboard navigation, validation errors, failed routine saves, failed set removal and completion, active-draft backup/restore, recovery exports, cancellation, and the install prompt. The PR suite checks baseline records, offline weight/rep improvements, draft exclusion, history badges, corrections/deletion, backup restore, rename/archive, reload, and mobile/desktop layouts. The layout suite checks twelve populated views/dialogs at nine widths from 320 to 1440 pixels, including long exercise names and the personal-records dialog.

The Google browser suite mocks Google Identity Services and signed credentials in an isolated context without service workers; it does not put a test client into the production app. It covers library retries, verified sign-in, separate Drive consent, account mismatch, cancellation, expiry, offline sign-out, upload/verification/retention, restore/recovery, and preservation of local records. Real Google consent/Drive access requires your configured project and account. Physical Android installation should also be checked after HTTPS hosting; desktop mobile emulation does not replace that device check.
