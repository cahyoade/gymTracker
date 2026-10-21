# Palette audit — 16 October 2026

Reviewed color declarations in application CSS, HTML, JavaScript, SVG assets and the PWA manifest. The custom palette now separates page/card surfaces from foreground tints throughout the app.

## Findings corrected

- Category labels, selected desktop navigation and restore summaries used `--soft`, which followed the background hue. It now follows the foreground hue, as do the related hover fills.
- Dropdown arrows embedded fixed light/dark SVG stroke colors. CSS gradients now draw the chevron with `--ink`.
- Custom form-error backgrounds inherited the default orange palette. They now use a foreground-derived fill with readable foreground text.
- Error toasts had fixed brown/white colors. Their background and text now use theme tokens; custom colors follow the foreground hue.
- Dialog backdrops, modal shadows and toast shadows had fixed green-tinted colors. They now use palette tokens with foreground-derived tint and the same opacity/depth.
- Native accent controls, scrollbar thumbs and text selection now use foreground tokens. Scrollbar tracks remain a page surface.
- Soft highlight lightness was adjusted at brightness extremes so muted text retains at least 4.5:1 contrast across the sampled hue combinations.

## Intentional fixed values

- Default light/dark palette tokens remain fixed until custom colors are enabled. Every foreground color token is overridden or derives from an overridden token in the custom palette.
- The logo and installed app icons remain neutral, as requested previously.
- Hue sliders show the full color spectrum; brightness sliders show a dark-to-light scale. Recoloring these scales would misrepresent their controls.
- The manifest and initial HTML/JavaScript fallback retain the default launch color. Saved preferences update the in-page browser theme color before app startup; a static manifest cannot vary per browser preference.
- Google's sign-in button and browser/OS-controlled UI follow their own branding or platform theme. The app does not override third-party iframe styling.

## Verification

- All 36 resolved palette colors checked in both themes at brightness 0, 50 and 100: 216 token checks. Foreground tints change with foreground hue and remain independent of background hue. Page/card/empty-state surfaces follow the background hue; the brand stays neutral.
- 72 resolved component color checks cover category badges, restore summaries, error fills/toasts, dropdown arrows, shadows, modal backdrops, selection, native accents and scrollbars.
- CSS declarations outside palette tokens have no color literals except the functional hue/brightness scales.
- 13,824 sampled text-contrast comparisons, including category, hover and error fills: minimum 4.55:1.
- 208 rendered page/editor states across default/custom palettes and phone/desktop sizes passed layout, contrast, control-size and keyboard checks.
- 72 actual navigation/button/icon hover states passed in both themes and at brightness limits. Color changes preserve workout records; the color suite also verifies offline persistence and reset.

Automated evidence: `test-results/palette-audit.json`, `test-results/design-verification.json`. Browser suites use isolated datasets; the preview retains the user's settings and records.
