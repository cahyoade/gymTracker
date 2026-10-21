# Muscle-gain recommendations

Form calculates optional suggestions locally from completed exercise history. There is no server, model API, or additional dependency. Inputs stay blank; suggested targets never become logged performances. Recommendations are derived again after corrections, deletions, imports, and restores.

Open **Next session** on an exercise, or **Targets & explanation** while logging. A workout uses its snapshot of the set plan. The Exercises shortcut uses the first current routine containing that exercise (named in the dialog), falling back to its latest session if it has no routine. Start the intended routine when multiple routines have different targets. History corrections do not display prospective recommendations.

## Research and interpretation

- [ACSM position stand, 2026](https://pubmed.ncbi.nlm.nih.gov/41843416/): supports progressive resistance training; higher weekly volume can improve hypertrophy, while failure is not consistently necessary. The app cannot infer meaningful muscle-group volume or effort from exercise categories and weight/reps alone, so it does not prescribe extra sets or diagnose undertraining.
- [Plotkin et al., 2022](https://pubmed.ncbi.nlm.nih.gov/36199287/): eight-week trial of 43 trained adults comparing increased load with increased repetitions; both approaches supported muscular adaptations. This supports offering rep progression rather than requiring weight increases every workout. It does not establish the best algorithm for every exercise or lifter.
- [ACSM progression stand, 2009](https://pubmed.ncbi.nlm.nih.gov/19204579/), superseded by the 2026 overview: suggested 2–10% load increases after exceeding desired repetitions by 1–2. Form uses this as historical context for modest increases, rather than treating its own rep-ceiling rule as the original guideline.
- [Refalo et al., 2024](https://pubmed.ncbi.nlm.nih.gov/38393985/): similar quadriceps hypertrophy with 1–2 reps in reserve versus failure over eight weeks, with greater acute fatigue at failure. The UI offers leaving some reps in reserve as an option. Effort is not measured; no readiness is inferred from a PR or volume-load score.

Reviewed 15 October 2026. Source summaries and rules are bundled for offline access. Links to original papers require a connection. The app is aimed at general resistance training in healthy adults, not rehabilitation or individualized medical programming.

## Product rules (heuristics, not validated predictions)

1. Use the latest two completed exposures containing this exercise, across routines, excluding the active draft and future dates. Skipped exercises do not replace earlier performance. Partial exposure does block progression; do not search past it to find more favorable sessions.
2. Require exactly the planned set count, matching set positions, and identical rep ranges. Changed or incomplete plans need a new comparable session. All logged completed sets count, since the app has no warm-up/working-set distinction.
3. If any set misses the lower rep bound, hold and review. Two comparable misses at the same loads suggest reviewing recovery, technique, rest, and load. This does not diagnose a plateau or prescribe an automatic reduction.
4. Below the upper bound, aim for **one additional rep across the exercise**, on the first set below the ceiling. Keep other set targets and loads. Do not add a rep on every set at once.
5. At the ceiling, confirm it in another comparable session. Only after all planned sets reach the ceiling in two consecutive exposures at the same uniform positive load is a weight increase considered. Confirmations must have distinct completion timestamps and be within four weeks of one another.
6. Use the user's available load increment, default 2.5 kg, in the same basis as the log (per dumbbell or total bar weight). Reject nonpositive/unusable increments and increases over 10%. Smaller microloads are allowed; there is no claimed biological minimum of 2%. Return rep targets to the lower bound after a suggested increase.
7. For mixed loads and 0 kg, do not calculate heavier targets. Zero does not reveal body mass, assistance, or the load of a progression. Bodyweight reps can still progress within the range.
8. A latest exposure older than four weeks prompts a fresh baseline. The four-week cutoff, two-session confirmation, all-sets ceiling, and one-rep step are conservative product choices rather than evidence-established thresholds. Consistent range of motion, equipment, rest, and effort must be judged by the user.

Suggestions do not automatically change routines, add sets, estimate 1RM, identify deload needs, or promise muscle growth. A user can always log a different performance.

The per-exercise equipment increment is a small device preference in localStorage (`form.loadIncrement.<exerciseId>`). It survives offline reloads; storage denial keeps it for the current visit and displays feedback. It is excluded from workout backups, like appearance preferences. No dataset/schema migration is required. Keep different equipment, variations, and assistance schemes as separate exercises.

## Verification

`npm test` includes the pure decision engine. `npm run test:progression` runs isolated browser checks against a local test server, including offline loading, blank inputs, draft preservation, increment changes, history correction/deletion, backup restore, and mobile/desktop layout. Test data never touches the user's browser profile.
