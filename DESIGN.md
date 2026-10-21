# Form design direction

This records the existing user requirements and the design corrections approved by “please fix all the findings” on 16 October 2026. It is not a new, independently supplied brand brief.

- Product: a lightweight, offline personal training log used repeatedly during workouts.
- Priorities: starting/resuming a routine, entering sets, reviewing performance, and protecting records through explicit backups.
- Character: calm, practical, readable, with a restrained training-journal feel rather than a marketing landing page.
- ENERGY 1 / RHYTHM 2 / MOTION 1: low visual noise, predictable data layouts with task-specific settings sections, and functional hover/focus feedback only.
- Typography: local system sans for labels and prose to avoid downloads; tabular numbers for sets and measurements to support comparisons. Functional text is at least 12px; numeric entry is at least 16px on phones.
- Palette: neutral brand mark, theme-aware surfaces and text, one user-controlled foreground/accent hue. Category labels, status/error fills, navigation highlights, borders, overlays and shadows follow that hue when customized. The page and card surfaces follow the background hue. Default and custom palettes must both meet text contrast requirements.
- Hierarchy: one page title and primary action. Routines and the active session take precedence over motivational copy. Settings puts backup and recovery before customization and help.
- Phone set entry: place the set number and previous performance above a wider input row, keeping numeric fields readable beside 44px completion/removal controls. Recommendation details remain in their explanation dialog so they do not displace logging.
- Spacing: 8px-based grouping separates tasks; compact summaries preserve space for records. All controls have an actual minimum 44 × 44px hit area.
- Cards: repeated routines, exercises and measurements use consistent containers because their records are comparable. Settings uses a linear, task-labelled layout rather than equal feature cards.
- Decoration: no home growth illustration, background grid, filler slogans, colored heading punctuation, or decorative internal-action arrows. The existing logo remains unchanged. Navigation symbols identify destinations; the hue spectrum explains the hue slider; external-source arrows indicate a separate website.
- States: preserve real empty/loading/error feedback, offline status, visible save results, keyboard focus and native dialog behavior.
- Process: edit application source directly with the patch editor; do not run replacement scripts over source/CSS. Historical edits cannot be undone as a workflow event. Future compliance is enforced by the editing approach and documented checks, not a gratuitous rewrite of working data logic.

No workout, measurement, recommendation, backup schema, or authorization behavior changes are part of this visual refinement.
