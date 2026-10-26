# Food and nutrition integration plan

Status: implemented 26 October 2026, cache version `form-shell-v2.0.1`. This document retains the original food reference and records the implementation decisions. The user chose fresh meal assembly, quick servings and researched estimates; reusable plates and whole-day copying are excluded.

## Scope

Add a lightweight Food view to Form and a Nutrition section in Progress. Keep native JavaScript modules, IndexedDB, the existing themes, offline service-worker shell, manual JSON/Google Drive backups and Netlify deployment. No runtime nutrition API or additional account is required.

The starting library is the user's 19 everyday foods below. Calories and protein are supplied estimates, preserved as entered rather than represented as independently verified values. Initial editable targets are approximately 2,500 kcal and a protein range of 120–135 g/day. These are the user's chosen targets, not a newly calculated prescription. Carbohydrate/fat targets remain unset unless entered.

## Food view

- Date picker, previous/next day and Today. Use local calendar dates, matching body measurements.
- Daily calories, protein, carbohydrate and fat totals, with target comparisons where targets exist. Show the protein target as a range. Reaching its lower bound does not imply that the upper bound is a safety limit.
- Searchable saved-food collection, All foods/Selected filters, portion inputs and accessible plus/minus controls. Support fractional quantities such as 0.5 servings and 1.5 portions.
- Default to the listed serving basis: 100 g rice, 250 ml milk, one egg, one chicken leg quarter, etc. Show grams/ml entry only when the base quantity or conversion is known. Do not invent a gram weight for an unspecified fish/vegetable serving.
- Add, edit, duplicate and archive food definitions. Archive retains past entries. Log entries snapshot the food name, portion basis, nutrient amounts, source and estimate status; later library edits affect future entries only.
- Build each meal fresh from an empty plate, grouped into Nasi & mi, Lauk, Sayur and Extras. Tapping adds one serving; half-serving controls and direct quantity entry adjust it. Save one unfinished meal draft separately; logging atomically replaces that draft with a meal. No reusable plates, whole-day copying or prefilled consumption records are created.
- Persist edits locally across navigation, reload and offline reopening. A new date starts empty. Show Saved only after the transaction commits; preserve visible inputs and a retry path on storage failure. Serialize writes so rapid taps or switching dates cannot overwrite newer entries or save into the wrong day.
- Mark a day complete explicitly; otherwise label it In progress. Editing a completed day returns it to In progress until reconfirmed. Do not automatically mark a day complete at midnight. Clear day requires confirmation and preserves the saved food library.
- Keep numeric inputs at least 16 px and controls at least 44 px. Recheck six-item navigation at phone widths; do not shrink labels or targets to squeeze in Food. Reuse theme variables for charts, statuses, borders and hover states.

## Nutrient data and portions

Store calories in kcal and protein/carbohydrate/fat in grams per declared base portion. Optional gram/ml weights must state whether food is cooked, raw or a prepared serving. Fractions multiply the same base portion. Reject negative/non-finite amounts and invalid quantities; round only when displaying totals.

The pasted library provides no carbohydrate or fat data. A calorie and protein value alone cannot determine both missing macros. Add those only from an appropriate label, matched composition record or documented recipe estimate. Record the source and preparation/portion assumptions. Mixed dishes such as balado, tempe orek and fried fish retain an Estimated label and editable values; do not attach generic raw-food macros as if they describe the prepared dish.

Use null for unknown nutrients and zero only for a known zero. If a day's entries lack a nutrient, show a known subtotal labelled Partial and how many entries lack values. A complete food log may still have incomplete nutrient data. Do not show a complete macro percentage breakdown or misleading full total in that case. Keep supplied calories independent of macro-derived energy rather than forcing equality through fabricated fat/carbohydrate values.

For matched foods, portion scaling can use the per-100-g values and known portion weights documented by [USDA FoodData Central](https://fdc.nal.usda.gov/docs/Foundation_Foods_Documentation_Apr2024.pdf); its [data documentation](https://fdc.nal.usda.gov/data-documentation/) distinguishes analytical, survey and label sources. [FAO's energy-factor reference](https://www.fao.org/4/y5022e/y5022e04.htm) explains general 4/4/9 factors and food-specific variation. These references guide handling; they do not verify the user's 19 estimates. Source matching and any redistribution/license requirements are checked before bundling additional nutrient values.

## Progress integration

Keep existing strength and body-measurement history. Add a Nutrition section containing:

- Range controls: 7, 30 or 90 days; nutrient selector: Calories, Protein, Carbohydrate or Fat.
- Today's totals and progress against the selected day's targets, including the protein range.
- A daily chart with units, target guides and gaps for unlogged dates. Mark today's/in-progress values as provisional. No logged day is silently converted to a zero-intake day.
- Average daily intake over completed days in the selected calendar range, explicitly labelled with coverage, e.g. 5 of 7 days complete. For each macro, exclude days with missing values from that macro's full average and report the smaller coverage. Show no average when there are no qualifying days. No rolling-average curve is added.
- Per-food nutrient contributions for a selected date and a bounded daily history, initially 20 dates with Show more. Open a date in Food to correct it.
- Body weight and training remain visible for the same period where comparisons are useful, using separate charts/units. Do not infer that changes were caused by food intake, estimate exercise calories or subtract training from the intake target.

Target changes carry an effective local date so old dates retain the goals they had. Targets are optional, editable values; tracking still works without them. Chart percentages, when supported by complete macro data, are explicitly approximate energy contributions rather than percentages of macro grams.

## Storage, backups and updates

- Upgrade IndexedDB from version 2 to 3 without reseeding or rewriting workouts/body measurements. Add `foods`, date-indexed `foodMeals`, and `foodDays` for daily completion state. Store effective-dated nutrition targets and one unfinished meal draft in metadata and include them in backups. Meals have stable IDs and contain food snapshots; totals sum each item exactly once.
- Keep food-definition seeding separate from logged days. Seed once during migration, never on every startup; retain user edits and archived seeds on subsequent releases.
- Add pure calculations/validation in `js/nutrition.js`, interface functions in `js/nutrition-ui.js`, orchestration in `js/nutrition-controller.js`, and the small starter library in `js/food-seeds.js`. Extend routing/navigation, database operations and Progress rendering. Read consistent snapshots transactionally, restrict the displayed chart range to 7/30/90 days and page history 20 dates at a time.
- Upgrade backup schema to 3. Include food definitions, meal snapshots, day states, targets and the meal draft in file/Drive snapshots, previews and recovery copies. Versions 1/2 migrate to empty meal history, the starter food collection and default targets. Previews explain the replacement, retaining the original file version for both file and Drive restores. Current nutrition data is preserved in the recovery copy.
- Validate all versions before any replacement. Validate IDs, references, portion definitions, dates, quantities, finite nutrients, null handling, target ranges and snapshots. Food changes count toward the existing unbacked-up revision indicator. Recovery and replacement must still commit together or abort together. Historical snapshots remain usable after a food is archived.
- Cache all new modules and the starter library. Bump the worker cache and retain Save & update after saving active workout/food changes. The copy build already packages public JS modules; update its asset coverage checks and verify the resulting dist build.
- No cloud synchronization or automatic uploads are added. Use the existing manual backup/restore model across devices.

## Starter food reference

`Template quantity` reproduces the selection pasted in chat solely as a calculation fixture. It is not an app template or dated consumption record. Unspecified serving weights remain unspecified, except the boiled egg uses an explicitly labelled 50 g large-egg reference for its researched macros.

| Food | Base portion | kcal | Protein (g) | Template quantity |
| --- | --- | ---: | ---: | ---: |
| Nasi putih | 100 g | 130 | 2.5 | 5 |
| Ayam goreng | 1 leg quarter | 470 | 40 | 1 |
| Tongkol balado | 100 g | 220 | 25 | 0 |
| Ikan kembung goreng | 1 serving, weight unspecified | 250 | 25 | 0 |
| Ikan bawal goreng | 1 serving, weight unspecified | 300 | 28 | 0 |
| Ikan nila goreng | 1 serving, weight unspecified | 270 | 31 | 0 |
| Cumi tumis | 100 g | 170 | 18 | 0 |
| Ati ampela balado | 100 g | 220 | 23 | 0 |
| Telur balado | 1 egg | 130 | 6.5 | 0 |
| Telur rebus | 1 egg | 78 | 6.3 | 3 |
| Tempe orek | 50 g | 160 | 8 | 1 |
| Terong balado | 100 g | 170 | 2 | 0 |
| Sayur kacang panjang | 1 serving, weight unspecified | 90 | 3 | 1 |
| Sayur bayam / asem | 1 serving, weight unspecified | 45 | 2 | 1 |
| Susu full cream | 250 ml | 155 | 8 | 2 |
| Pisang | 1 banana, size unspecified | 105 | 1.3 | 2 |
| Nasi goreng | 1 plate | 650 | 15 | 0 |
| Mie ayam | 1 bowl | 500 | 20 | 0 |
| Sate ayam | 10 skewers with sauce | 550 | 35 | 0 |

This fixture totals **2,169 kcal and 103 g protein**. Against the supplied targets, the differences are **331 kcal** and **17–32 g protein**. These are arithmetic comparisons, not food or intake recommendations.

### Researched macro estimates

- Cooked rice: USDA SR28 NDB 20045, 28.17 g carbohydrate and 0.28 g fat per 100 g. [Official report, page 325](https://www.ars.usda.gov/ARSUserFiles/80400535/Data/SR/SR28/reports/sr28fg20.pdf#page=325). TKPI AP001 was reviewed (180 kcal/100 g) but represents drier cooked rice; the USDA preparation is closer to the supplied 130-kcal estimate. Calories/protein retain the supplied numbers.
- Boiled egg: USDA SR28 NDB 01129, 1.12 g carbohydrate and 10.61 g fat per 100 g; scale to a 50 g large edible egg (0.56 g carbohydrate, 5.305 g fat). [Official report, page 384](https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR/SR28/reports/sr28fg01.pdf#page=384). The large-egg assumption is visible and editable.
- Whole milk: TKPI 2017 JR006, 4.3 g carbohydrate and 3.5 g fat per 100 g; approximate the supplied 250 ml serving as 250 g (10.75 g carbohydrate, 8.75 g fat). [Kemenkes TKPI, page 65](https://lib.poltekkespalembang.ac.id/index.php?bid=15003&fid=94&p=fstream-pdf#page=65). This density/brand approximation is shown explicitly; a package label is preferable when available.
- For other dishes, a sufficiently matched preparation and serving was not established. Their carbohydrate/fat values remain unknown and editable. No raw ingredient macros are substituted for balado, orek or fried-food recipes. Only a handful of numeric facts and short source descriptions are bundled, not the underlying publications.

## Implementation order and acceptance checks

1. Food validation/calculation modules and schema migration. Test the template totals, fractional servings, grams/ml conversions, unknown vs zero nutrients, archived foods and immutable historical snapshots.
2. Diary and saved foods. Verify offline entry, rapid taps, decimal keyboards, date changes, midnight/time-zone boundaries, reload/resume, storage failures, copying a day and completion/edit behaviour.
3. Nutrition Progress. Verify date-range boundaries, gaps, incomplete logs, partial macro coverage, historical targets, corrections/deletions and bounded histories with years of entries.
4. Backup/recovery integration. Round-trip schema 3 through file/Drive, restore versions 1/2 with clear previews, reject malformed nutrition data without mutations, and simulate a failed recovery transaction. Preserve existing sessions, routines, body records and active workout drafts through migration.
5. Release checks. Run existing tests plus new nutrition unit/browser tests, built-artifact offline checks, phone/desktop layouts, keyboard controls, theme/hue coverage and an app update with an active workout and food edits. Actual Android checks follow on the deployed HTTPS origin.

No barcode scanning, photo recognition, calorie-burn estimates, automatic dietary prescriptions, full recipe builder or comprehensive micronutrient database is planned for this first version. Fiber/sodium can be optional sourced fields later; unavailable nutrients are never fabricated.
