# Feature verification

Checked in isolated Chromium/Edge browser contexts with disposable datasets. The user's workout records were not used or modified during testing.

## Food and warteg meals — 26 October 2026

Cache version `form-shell-v2.0.1`; IndexedDB and backup format version 3. Added 19 foods, empty-plate assembly, fractional servings and known conversions, independent saved meal drafts, atomic meal commits, food editing/archiving, effective-dated targets, complete-day states and Nutrition in Progress. Missing macros retain null values and partial coverage. Researched estimates are limited to suitable cooked rice, boiled egg and whole milk references, with assumptions/source links. Existing workout/body data survives migration.

Verified **76 unit tests**, **eight nutrition browser scenarios**, **ten core workout scenarios**, **five body-measurement scenarios**, **five mocked Google/Drive scenarios**, **five strength scenarios with 32 design states**, **208 rendered design states**, and **222 palette-token/72 rendered-color checks**. Nutrition browser checks include v2 migration, reference totals (2,169 kcal/103 g and 980 kcal/56 g), offline draft resume, corrections, archive snapshots, historical targets, old-file previews, schema-3 round trips, legacy recovery, atomic aborts, simulated disk failure/retry, keyboard portions/focus, app updates with both drafts, bounded 90-day history, and eight mobile/desktop custom-theme states. The packaged offline-app check covers nutrition logging too. Actual Google account consent/Drive access and physical Android installation remain external checks.

## Netlify production package — 21 October 2026

Added a dependency-free copy build and `netlify.toml` for GitHub continuous deployment: Node 24 runs the unit tests, builds, and publishes only `dist/`. The build validates service-worker asset coverage and retains both license notices. Stable asset filenames revalidate through HTTP while the existing worker retains offline caching and explicit updates.

Verified **68 unit tests** and the isolated **production-artifact browser workflow**: development/private-file exclusion, offline reopening, workout logging, draft reload/resume, completion, exercise-library browsing, all main views and next-session set references. Repeated builds passed. `test-results/deployment-mobile.png` records the offline comparison screen. This does not verify a live Netlify deployment, real Google authorization or physical Android installation; those require the hosted origin/account/device checks in [NETLIFY_SETUP.md](NETLIFY_SETUP.md).

## Strength progress — 18 October 2026

Cache version: `form-shell-v1.9.1`. Progress now includes a derived Strength trend section above the existing body measurements. Each exercise can show its heaviest completed set per session (with that same set's reps) or its best single-set reps at a selected logged weight. Bodyweight-only history defaults to reps at 0 kg. Charts and their expandable exact-set table show up to 30 matching sessions across routines, including archived exercises. All values are logged performances; no strength score, one-rep-max estimate or new stored summary is introduced.

- 68 unit tests passed, including nine new strength tests for drafts/unperformed/invalid set exclusion, actual weight/reps pairing, heaviest-set ties, same-load rep comparisons, fractional loads, bodyweight zero, timestamp ordering, rename/archive identity, corrections/deletes/round trips, missing selections and bounded/safe chart output.
- Five strength browser scenarios passed: completed-history and fixed-weight views with untouched body/draft data; offline reload and filtering; real History corrections/deletion and exercise rename/archive; empty-history fallback and backup restore; 32 strength design states across default/custom light/dark palettes and 320/390/768/1440px widths.
- The five body-measurement scenarios passed, including migration, partial records, charts, edits, failed writes, recovery and backup/restore. The ten core workout scenarios and 208 existing rendered design states passed. The palette audit passed 222 token and 72 rendered-color checks.
- New chart controls keep keyboard focus; exact records are available through a native details/table. Mobile selects use the full available width. Text contrast, 12px minimum type, 44px controls and horizontal overflow were checked for both chart modes with the records table open.
- No IndexedDB version or backup format change. Viewing or changing the strength chart does not write records or change backup revisions. The two new native modules are in the offline asset cache.

The actual preview was updated at `http://localhost:4180/#progress` without inserting sample sessions into the user's dataset. With no completed sets there, the section shows its empty state and retains the existing body readings. Evidence: `test-results/strength-preview.jpg`; populated isolated examples: `test-results/strength-progress-mobile.png` and `test-results/strength-progress-desktop.png`.

## Offline exercise library — 16 October 2026

Cache version: `form-shell-v1.8.0`. Bundled 1,324 English exercise records from the pinned hasaneyldrm dataset (859,246 bytes before the trailing newline), including equipment, muscles and instruction steps. The MIT notice ships with the app; separately licensed images/GIFs are excluded. Existing datasets are preserved; selected exercises are added transactionally with stable IDs and optional backup-safe library references.

- 58 unit tests passed, including complete catalog validation, search/filter behavior, stable IDs, same-name source variants, duplicate matching and library-reference backup validation.
- Six catalog browser scenarios passed: bounded result lists and combined filters; add/rename/instructions; archived re-add and simultaneous tabs; storage/network failure with retries; offline routine/workout/resume/completion plus backup/restore; responsive library/detail dialogs and keyboard use.
- 16 new library/detail design states passed at 320, 390, 768 and 1440px in both custom themes, including computed text contrast, 44px controls and overflow checks. All 208 existing rendered design states and ten core workout/browser scenarios passed.
- The palette audit passed 216 token and 72 rendered-color checks, with no new component color literals.
- Existing routine/history/measurement data and Google configuration are unchanged. No runtime GitHub dependency, media downloads or automatic imports were added. Include `data/` and its license when deploying.

Reproduce with `node --test tests/catalog.test.js` and `node tests/catalog-browser.mjs` against the test server. Preview evidence: `test-results/catalog-preview.jpg`; isolated browser evidence: `test-results/catalog-mobile.png`.

## Design refinement — 16 October 2026

Cache version: `form-shell-v1.7.0`. All seven design-audit findings were addressed. [DESIGN.md](DESIGN.md) records the direction and rationale; [DESIGN-REVIEW.md](DESIGN-REVIEW.md) records the finding-by-finding fixes and rule-gate evidence.

- 54 unit tests and 53 existing browser scenarios passed. Data formats, workout/measurement storage, recommendation rules and Google permissions are unchanged.
- 108 general layout checks passed, including populated views, dialogs and long/unbroken names across nine widths.
- The new design suite passed 208 rendered states across default/custom light/dark at 320, 390, 768 and 1440px, including forms and record/recovery dialogs. It performed 8,293 text comparisons with zero measured contrast, sub-12px text, enabled app-owned target-size, overflow or page-exception failures. Minimum sampled default-light contrast: 5.44:1; default-dark: 5.72:1.
- Keyboard checks cover opening the color disclosure with Enter, visible focus and closing dialogs with Escape. The color suite still passes 9,504 independent hue/brightness comparisons, minimum 4.62:1.
- The actual preview was refreshed and the backup-first Settings layout and Customize colors disclosure inspected. Existing user color values remained intact. Provider-controlled Google iframe internals and real account consent are outside the rendered target-size audit; Google workflows were tested with mocks.

## Body progress — 16 October 2026

Cache version: `form-shell-v1.6.0`. IndexedDB and backup schemas are now version 2. Legacy version 1 backups are validated and migrated with empty body history; current-format backups include body measurements in the same transactional restore/recovery flow as workouts.

- 54 unit tests passed, including measurement value/date validation, missing readings, per-metric chronological comparisons, body-fat percentage-point changes, backup migration/validation, flat charts and bounded chart history.
- 5 measurement browser scenarios passed: non-destructive v1 database upgrade; partial/decimal records and offline reload; correction, duplicate-date enforcement and failed-save retry; v2 and legacy backup restore/recovery plus transaction abort; mobile/tablet/desktop Progress and editor in light and dark themes.
- The migration fixture included a renamed/archived exercise, routine, active draft with input and notes, preferences, backup revision, and a legacy recovery snapshot. All survived the upgrade without reseeding.
- Existing core (10), feature audit (10), Google with mocks (5), PR (4), progression (5), theme (6), and colors/brightness (8) browser scenarios passed: 53 total including the new measurement scenarios. A PR check initially missed a transient export notification under concurrent load; the separate rerun passed.
- 108 existing layout checks reported zero flagged issues. Progress and its editor were additionally checked at 320, 390, 640, 768 and 1440 pixels in both themes; five-item navigation retained touch targets at least 44px wide. Palette checks still pass at a minimum 4.62:1 across 9,504 comparisons.

The actual local preview was updated and opened to Progress. No sample body readings were entered in the user's browser. Google/Drive regression checks used mocks; no real authorization, upload, or physical Android install was performed.

## Muscle-gain recommendations — 15 October 2026

Cache version: `form-shell-v1.5.0`. Research and decision rules: [PROGRESSION.md](PROGRESSION.md). Optional recommendations supersede the original v1 exclusion of suggested next weights; actual set inputs remain blank.

- 48 unit tests passed, including 12 progression-engine cases covering missing/skipped/partial records, changed plans, shared history, chronological ordering, numeric imports, rep targets, bodyweight/mixed-load guards, equipment increments, long gaps, corrections and deletion.
- 5 progression browser scenarios passed: baseline and no-plan states; equipment/load and bodyweight guards; offline module/research loading, increment persistence, blank inputs and draft preservation; correction/deletion/backup restore; denied localStorage and mobile/desktop dialogs in both themes.
- Existing core (10), PR (4), theme (6), and color/brightness (8) browser scenarios passed.
- 108 general layout checks passed with zero flagged issues. New target dialogs were also checked at 320, 390, 768 and 1440 pixels in light/dark, with research dialogs at all four widths.
- Color regression suite passed 9,504 computed contrast comparisons, minimum 4.62:1. These exercise the palette, not a promise that every possible user context has been manually inspected.

No real Google authorization, Drive upload, or physical Android installation was performed in this feature pass. The initial audit below retains its original scope and results.

## Original feature audit — 10 October 2026

## Feature results

| Feature | Result | What was verified |
| --- | --- | --- |
| Exercise collection | Pass | Twelve seeded exercises, custom exercises/categories, search, renaming, archiving/unarchiving, shared history, and preservation of historical names. |
| Routines | Pass | Create, edit, duplicate, reorder/remove exercises, set counts/rep ranges, reject duplicate exercises, delete/cancel deletion, preserve session snapshots, and retain form inputs after failed writes. |
| Workout logging | Pass | Blank new inputs, previous weight/reps by set position, zero/fractional weights, positive whole reps, completion validation, adding/removing sets, skipped sets/exercises, and notes. Optional progression guidance was subsequently added; see the 15 October verification above. |
| Autosave and resuming | Pass | Offline logging, reload/resume, navigation away and back, manual save, failed storage writes, retry, and completion saving only performed sets. |
| History | Pass | Dates, exercise filters including archived exercises, session details, corrections, cancelling corrections, deletion, recalculated previous performance, and timestamps with different UTC offsets. |
| File backup and recovery | Pass | Completed-session and active-draft export/import, preview/cancel, invalid/unsupported imports, transactional replacement, transaction abort, local recovery restore/export, and offline downloads. |
| Google sign-in | Pass with mocks | Official-library loading/retry, signed credential validation, separate Drive permission, denied consent, closed popup, account mismatch, expired authorization, and memory-only account/token state. Unconfigured tracking works without Google requests. |
| Drive backup | Pass with mocks | Manual upload, read-back verification, newest-five retention, listing, restore preview/replacement, recovery snapshot, network interruption, and retention failure warnings. No automatic uploads. |
| Offline loading and updates | Pass | Cached core assets, reopening offline, all four views offline, save-before-update with an active draft, and reopening the updated app offline. |
| Installation and storage | Partial device verification | Manifest/icons and service-worker readiness checked; persistent-storage button and install-prompt flow exercised. Actual Android installation still needs a phone and HTTPS deployment. |
| Responsive layout and keyboard | Pass | 99 layout checks across eleven views/dialogs at widths 320, 360, 390, 447, 640, 768, 850, 1024, and 1440; no measured clipping, overlap, or overflow. Long names included. Keyboard form submission, skip-link focus, dropdown labels, and cancellation checked. |

## Issues fixed

1. **Invisible errors after closing an editor.** Error handling could target an old error element inside a closed dialog. Errors now appear in the current dialog or the visible toast.
2. **Stale rows after a failed set change.** If saving a removed set failed, the visible rows could still reference the old array positions. The workout now redraws to match the draft even when persistence fails, keeps the unsaved status, and supports retry.
3. **Skip link interrupted a workout.** `#main` was treated as a route. The keyboard skip link now focuses the main content without changing the current view.
4. **Clicking the selected tab did not leave a resumed workout.** The URL did not change, so the route handler did not run. Selected-tab and home navigation now save the draft and show the requested view.
5. **Timezone-dependent history ordering.** String sorting could select an older imported session as the latest performance. Session ordering now compares actual completion timestamps.
6. **Blank imported weights could become zero.** Whitespace is now rejected for completed sets; valid numeric strings are normalized to numbers without changing the source file.
7. **Ambiguous dropdown labels.** Explicit accessible labels now identify the exercise picker, exercise category, and history filter.

## Reproducible checks

- `node --test tests/unit.test.js`: **28 passing tests**.
- `node tests/browser.mjs`: **10 passing browser scenarios**.
- `node tests/feature-audit.mjs`: **10 passing additional feature scenarios**.
- `node tests/google-browser.mjs`: **5 passing mocked Google/Drive scenarios**.
- `node tests/layout.mjs`: **99 checks, zero layout issues flagged**.

Run browser suites against `node tests/server.mjs`. See README for Playwright/executable environment options. Screenshots and measurements are generated under the ignored `test-results/` folder.

## Remaining external checks

The supplied public Web OAuth client ID is now configured. Real Google consent and actual Drive uploads still need account testing with the Google Cloud settings described in [GOOGLE_SETUP.md](./GOOGLE_SETUP.md). These were not tested against a real account. Actual Android installation and standalone launch remain device checks after HTTPS hosting; the browser tests use desktop mobile viewports and a mocked installation prompt.

## Google configuration follow-up — 10 October 2026

Configured the supplied public Web OAuth client and applied cache update `form-shell-v1.0.5` to the open app. Google's real sign-in button rendered successfully. The 28 unit tests and five mocked Google/Drive browser scenarios were rerun and passed. Account sign-in, consent, and real Drive uploads are awaiting the user's own test.

## Personal records — 13 October 2026

Added derived personal records for heaviest completed sets and most reps at each logged weight, including 0 kg bodyweight sets. Exercise cards and workout screens show personal bests; a records dialog shows dates and rep records by weight. History and session details mark improvements, and successful workout saves announce new records. The first performance establishes a baseline; ties do not earn repeat badges. Corrections, deletion, rename/archive and backup restores recalculate records without changing the backup schema.

Verified **36 unit tests** (including eight new PR tests), **four PR browser scenarios**, the **ten original workout scenarios**, and **108 layout checks with zero flagged issues**. PR browser checks include offline logging/reopening, draft/skipped-set exclusion, shared routines, bodyweight, corrections, deletion, backup restore, rename/archive, and imported set IDs reused across exercises. Tests used isolated datasets. Cache version is `form-shell-v1.1.0`; redeploy the updated static assets to update an existing Netlify site.

## Theme switcher — 15 October 2026

Added Light, Dark, and System choices in Settings → Appearance. System is the default. Preferences use localStorage, apply in the page head before styles render, persist offline, and propagate to other tabs. Device-theme changes preserve live workout fields. Native controls, dialogs, PR surfaces, notices, selected buttons, and Google sign-in button styling follow the theme. Workout data, backup format and backup status are unchanged; failed preference writes keep the theme usable for the current visit and show feedback.

Verified **36 unit tests**, **six theme browser scenarios**, **ten original workout scenarios**, **five mocked Google/Drive scenarios**, and **216 layout checks** (108 per theme, zero flagged issues). Theme checks include keyboard selection, explicit overrides, pre-paint startup, offline reloads, cross-tab updates, blocked storage, draft preservation, text contrast, and mobile/desktop dialogs. Tests used disposable datasets. Cache version is `form-shell-v1.2.0`; redeploy static assets and accept Save & update on an existing installation.

## Custom hues — 15 October 2026

Added independent background/foreground hue sliders, numeric degree inputs, a live preview, and Reset colors in Appearance. Custom palettes retain light/dark/system behavior, apply before startup, persist per browser offline, and update other tabs. Foreground shades tint text, buttons, and highlights; background shades tint surfaces. Theme-controlled lightness keeps colors readable. Color changes do not rebuild Google's sign-in button or modify workout data or backup status.

Verified **seven color browser scenarios**, **six theme scenarios**, **ten original workout scenarios**, and **36 unit tests**. The color suite measured **3,168 computed text-contrast pairs** across sampled foreground/background hues in both modes (minimum **4.88:1**), and checked reset, invalid values, denied storage, startup, offline reload, and cross-tab updates. **216 custom-palette layout checks** passed at mobile/tablet/desktop sizes. Cache version is `form-shell-v1.3.0`; existing hosted apps need the updated static assets and Save & update.
