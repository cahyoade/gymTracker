import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
import { writeFile } from 'node:fs/promises';
const stage = process.env.AUDIT_STAGE || 'verified';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 447, height: 900 }, serviceWorkers: 'block' });
await context.addInitScript(options => {
  localStorage.setItem('form.theme', options.theme);
  if (options.colors) localStorage.setItem('form.colors', JSON.stringify(options.colors));
}, { theme: process.env.THEME || 'light', colors: process.env.CUSTOM_COLORS ? JSON.parse(process.env.CUSTOM_COLORS) : null });
// Test app layout independently of Google's network-loaded iframe. Its
// responsive button is checked separately in google-browser.mjs.
await context.route(`${process.env.APP_URL || 'http://localhost:4173'}/js/config.js`, route => route.fulfill({ contentType: 'text/javascript', body: "export const GOOGLE_CLIENT_ID = '';" }));
const page = await context.newPage();
page.on('dialog', dialog => dialog.accept());
const reports = [];
const widths = [320, 360, 390, 447, 640, 768, 850, 1024, 1440];
async function audit(screen) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const root = document.querySelector('dialog[open]') || document.querySelector('main');
      const rootRect = root.getBoundingClientRect();
      const visible = el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const tag = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).trim().replaceAll(' ', '.') : ''}`;
      const outside = [...root.querySelectorAll('input, select, textarea, button, h1, h2, h3, p, .set-row, .target-fields, .button-row, .editor-entry-title')].filter(visible).filter(el => {
        const box = el.getBoundingClientRect();
        return box.left < rootRect.left - 1 || box.right > rootRect.right + 1;
      }).map(tag);
      const overlaps = [];
      for (const row of root.querySelectorAll('.button-row, .modal-actions, .editor-entry-title, .set-row, .target-fields')) {
        const items = [...row.children].filter(visible);
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i].getBoundingClientRect(), b = items[j].getBoundingClientRect();
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps.push(`${tag(items[i])} / ${tag(items[j])}`);
        }
      }
      const clipped = [...root.querySelectorAll('h1,h2,h3,p,strong,.previous-record,.stat-value,.settings-bottom,.card-bottom')].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1).map(tag);
      const selects = [...root.querySelectorAll('select')].filter(visible).map(el => {
        const styles = getComputedStyle(el);
        return { id: el.id || el.name, width: Math.round(el.getBoundingClientRect().width), paddingRight: styles.paddingRight, appearance: styles.appearance };
      });
      return { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, outside, overlaps, clipped, selects };
    });
    reports.push({ screen, width, ...result });
    if ([320, 447, 768, 1440].includes(width)) {
      await page.evaluate(() => { document.querySelector('#toast').hidden = true; document.querySelector('dialog[open]')?.scrollTo(0, 0); window.scrollTo(0, 0); });
      await page.screenshot({ path: `test-results/layout-${stage}-${screen}-${width}.png`, fullPage: true });
    }
  }
}
async function navigate(view) {
  await page.locator(`nav [data-view="${view}"]`).click();
  await page.waitForFunction(view => document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current') === 'page', view);
}
try {
  await page.goto(process.env.APP_URL || 'http://localhost:4173');
  await page.locator('main h1').waitFor();
  await page.locator('[data-action="new-routine"]').first().click();
  await audit('empty-routine');
  await page.locator('[data-action="close-modal"]').first().click();
  await page.evaluate(async () => {
    const db = await import('./js/db.js'), model = await import('./js/model.js');
    const exercise = { id: 'long-exercise', name: 'Single-arm seated cable row with a neutral grip and controlled eccentric', category: 'Back', archived: false };
    const unbroken = { id: 'unbroken-exercise', name: 'A'.repeat(120), category: 'Other', archived: false };
    await db.put('exercises', exercise); await db.put('exercises', unbroken);
    const routine = { id: 'layout-routine', name: 'Upper body / strength and accessories', updatedAt: model.now(), entries: [exercise.id,unbroken.id,'seed-bench-press'].map(exerciseId => ({exerciseId,setCount:3,repMin:8,repMax:12})) };
    await db.put('routines', routine);
    const data = await db.readData(), draft = model.createDraft(routine, data.exercises);
    for (const entry of draft.entries) for (const set of entry.sets) Object.assign(set, {weight:123.75,reps:15,completed:true});
    await db.put('sessions',model.finishSession(draft));
  });
  await page.reload(); await page.locator('.routine-card').waitFor();
  await audit('routines');
  await page.locator('[data-action="edit-routine"]').click();
  await audit('filled-routine');
  await page.locator('[data-action="close-modal"]').first().click();
  await navigate('exercises'); await audit('exercises');
  await page.locator('[data-action="exercise-records"]').first().click(); await audit('personal-records');
  await page.locator('[data-action="close-modal"]').first().click();
  await page.locator('[data-action="new-exercise"]').click(); await audit('exercise-dialog');
  await page.locator('[data-action="close-modal"]').first().click();
  await navigate('history'); await audit('history');
  await page.locator('[data-action="session-details"]').click(); await audit('session-dialog');
  await page.locator('[data-action="close-modal"]').first().click();
  await navigate('settings'); await audit('settings');
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.replaceData(db.snapshotFromData(await db.readData()));
  });
  await page.reload(); await page.locator('[data-action="restore-recovery"]').waitFor();
  await audit('settings-recovery');
  await page.locator('[data-action="restore-recovery"]').click(); await audit('restore-dialog');
  await page.locator('[data-action="close-modal"]').first().click();
  await navigate('routines'); await page.locator('[data-action="start"]').click();
  await page.locator('#workout-fields').waitFor(); await audit('workout');
  await writeFile(`test-results/layout-${stage}.json`, JSON.stringify(reports,null,2));
  const problems = reports.filter(item => item.pageOverflow || item.outside.length || item.overlaps.length || item.clipped.length);
  console.log(JSON.stringify(problems,null,2));
  console.log(`${reports.length} layout checks; ${problems.length} flagged. Full measurements in test-results/layout-${stage}.json`);
  assert.deepEqual(problems, [], 'Layout overflow, clipping or overlapping controls');
} finally { await context.close(); await browser.close(); }
