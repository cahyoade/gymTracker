const root = document.documentElement;
const deviceTheme = matchMedia('(prefers-color-scheme: dark)');
const normalize = value => ['light', 'dark', 'system'].includes(value) ? value : 'system';
let preference = normalize(root.dataset.themePreference);
const normalizeHue = value => Math.max(0, Math.min(359, Math.round(value)));
function parseColors(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && ['background', 'foreground'].every(key => typeof parsed[key] === 'number' && Number.isFinite(parsed[key]))) {
      return { background: normalizeHue(parsed.background), foreground: normalizeHue(parsed.foreground), ...(typeof parsed.brightness === 'number' && Number.isFinite(parsed.brightness) ? { brightness: Math.max(0, Math.min(100, Math.round(parsed.brightness))) } : {}) };
    }
  } catch { /* Ignore invalid preferences. */ }
  return null;
}
let colors = null;
try { colors = parseColors(localStorage.getItem('form.colors')); } catch { /* Keep defaults. */ }

function applyColors() {
  root.dataset.customColors = String(Boolean(colors));
  for (const key of ['background', 'foreground']) {
    if (colors) root.style.setProperty(`--${key}-hue`, colors[key]);
    else root.style.removeProperty(`--${key}-hue`);
  }
  updateBrowserColor();
  window.dispatchEvent(new Event('colorschange'));
}
function updateBrowserColor() {
  const theme = root.dataset.theme;
  const offset = (getBrightnessPreference() - 50) * (theme === 'dark' ? .18 : .08);
  root.style.setProperty('--brightness-offset', `${offset}%`);
  const color = colors ? `hsl(${colors.background}, ${theme === 'dark' ? 18 : 20}%, ${(theme === 'dark' ? 9 : 96) + offset}%)` : theme === 'dark' ? '#131a17' : '#f6f5ef';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export const getColorPreferences = () => colors ? { ...colors } : { background: root.dataset.theme === 'dark' ? 150 : 60, foreground: 25 };
export const getBrightnessPreference = () => colors?.brightness ?? 50;
export function setColorPreferences(value) {
  if (!value || !['background', 'foreground'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))) return false;
  if (value.brightness !== undefined && (typeof value.brightness !== 'number' || !Number.isFinite(value.brightness))) return false;
  colors = { background: normalizeHue(value.background), foreground: normalizeHue(value.foreground), ...(value.brightness !== undefined ? { brightness: Math.max(0, Math.min(100, Math.round(value.brightness))) } : {}) };
  let saved = true;
  try { localStorage.setItem('form.colors', JSON.stringify(colors)); } catch { saved = false; }
  applyColors(); return saved;
}
export function resetColorPreferences() {
  colors = null;
  let saved = true;
  try { localStorage.removeItem('form.colors'); } catch { saved = false; }
  applyColors(); return saved;
}

function apply() {
  const theme = preference === 'system' ? (deviceTheme.matches ? 'dark' : 'light') : preference;
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  updateBrowserColor();
  window.dispatchEvent(new Event('themechange'));
}

export const getThemePreference = () => preference;
export function setThemePreference(value) {
  preference = normalize(value);
  let saved = true;
  try { localStorage.setItem('form.theme', preference); } catch { saved = false; }
  apply();
  return saved;
}

deviceTheme.addEventListener('change', () => { if (preference === 'system') apply(); });
window.addEventListener('storage', event => {
  if (event.key === 'form.theme' || event.key === null) { preference = normalize(event.newValue); apply(); }
  if (event.key === 'form.colors' || event.key === null) { colors = parseColors(event.newValue); applyColors(); }
});
applyColors();
apply();
