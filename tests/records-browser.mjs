import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const action = name => page.locator(`[data-action="${name}"]`);
const nav = async view => { await page.locator(`nav [data-view="${view}"]`).click(); await page.waitForFunction(view => document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current') === 'page', view); };
const data = () => page.evaluate(async () => (await import('./js/db.js')).readData());
const closed = () => page.waitForFunction(() => !document.querySelector('#modal').open);
const card = name => page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
const workout = name => page.locator('.workout-exercise').filter({ has: page.getByRole('heading', { name, exact: true }) });
async function record(name, index, weight, reps) {
  const row = workout(name).locator('.set-row').nth(index);
  await row.locator('[data-field="weight"]').fill(String(weight));
  await row.locator('[data-field="reps"]').fill(String(reps));
  await row.locator('[data-field="completed"]').check();
}
async function start(name) {
  await nav('routines');
  await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).locator('[data-action="start"]').click();
  await page.locator('#workout-fields').waitFor();
}
try {
  await page.goto(origin); await page.locator('main h1').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await action('new-routine').first().click(); await page.locator('#routine-name').fill('Strength A');
  for (const id of ['seed-bench-press', 'seed-pull-up']) { await page.locator('#routine-exercise').selectOption(id); await action('editor-add').click(); }
  await page.getByRole('button', { name: 'Save routine', exact: false }).click(); await closed();
  await action('duplicate-routine').click(); await page.getByRole('heading', { name: 'Strength A (copy)', exact: true }).waitFor();
  await start('Strength A'); await record('Bench press', 0, 20, 8); await record('Pull-up', 0, 0, 8);
  await action('finish-workout').click(); await page.locator('.history-card').waitFor();
  assert.equal(await page.locator('.history-card .pr-badge').count(), 0);
  await nav('exercises'); assert.match(await card('Bench press').locator('.personal-best').textContent(), /20 kg × 8 reps/);
  console.log('PASS existing completed history establishes PR baselines for weighted and bodyweight exercises');

  await context.setOffline(true); await start('Strength A (copy)');
  assert.match(await workout('Bench press').locator('.personal-best').textContent(), /20 kg × 8 reps/);
  await record('Bench press', 0, 22.5, 6); await record('Bench press', 1, 20, 10); await record('Pull-up', 0, 0, 10);
  await workout('Bench press').locator('.set-row').last().locator('[data-field="weight"]').fill('999');
  await nav('exercises'); assert.match(await card('Bench press').locator('.personal-best').textContent(), /20 kg × 8 reps/);
  await action('resume').click(); await action('finish-workout').click(); await page.locator('.history-card .pr-badge').waitFor();
  await page.getByText('Session saved. 3 new personal records!', { exact: true }).waitFor();
  assert.match(await page.locator('.history-card').first().textContent(), /3 personal records/);
  // Imported backups may reuse set IDs in different exercise entries. Badges
  // must match the exercise as well as the set, not leak between exercises.
  await page.evaluate(async () => {
    const db = await import('./js/db.js'), data = await db.readData();
    const latest = data.sessions.filter(item => item.status === 'completed').sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))[0];
    latest.entries[1].sets[0].id = latest.entries[0].sets[0].id;
    await db.put('sessions', latest);
  });
  await page.reload(); await page.locator('.history-card').first().waitFor();
  await action('session-details').first().click();
  assert.equal(await page.locator('.detail-performance .pr-badge').count(), 3);
  await page.getByText('Weight PR', { exact: false }).waitFor();
  await action('close-modal').click(); await nav('exercises');
  assert.match(await card('Bench press').locator('.personal-best').textContent(), /22.5 kg × 6 reps/);
  assert.match(await card('Pull-up').locator('.personal-best').textContent(), /0 kg × 10 reps/);
  console.log('PASS offline logging earns weight and same-weight rep PRs across routines; drafts and skipped sets never count');

  await card('Bench press').locator('[data-action="exercise-records"]').click();
  assert.equal(await page.locator('.pr-table>div').count(), 3);
  assert.match(await page.locator('.pr-table').textContent(), /22.5 kg6/);
  assert.match(await page.locator('.pr-table').textContent(), /20 kg10/);
  await mkdir('test-results', { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.evaluate(() => { const modal = document.querySelector('dialog'); return modal.scrollWidth <= modal.clientWidth; }), true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/personal-records-mobile.png', fullPage: false });
  await page.locator('dialog [data-action="exercise-history"]').click(); await closed();
  assert.match(await page.locator('.history-card').first().textContent(), /2 personal records/);
  console.log('PASS PR detail table, achievement dates, responsive dialog and exercise-specific history badges');

  await context.setOffline(false); await nav('settings');
  const download = page.waitForEvent('download'); await action('export').click();
  await page.getByText('Backup file prepared for download.', { exact: true }).waitFor();
  const path = await (await download).path();
  await nav('history'); await page.locator('#history-exercise').selectOption('');
  await action('session-details').first().click(); await action('edit-session').click();
  await record('Bench press', 0, 18, 6); await action('finish-workout').click();
  await page.getByText('Corrections saved. Personal records recalculated.', { exact: true }).waitFor();
  assert.match(await page.locator('.history-card').first().textContent(), /2 personal records/);
  await nav('exercises'); assert.match(await card('Bench press').locator('.personal-best').textContent(), /20 kg × 10 reps/);
  await nav('history'); await action('session-details').first().click(); await action('delete-session').click(); await closed();
  await nav('exercises'); assert.match(await card('Bench press').locator('.personal-best').textContent(), /20 kg × 8 reps/);
  assert.match(await card('Pull-up').locator('.personal-best').textContent(), /0 kg × 8 reps/);
  await nav('settings'); await page.locator('#import-file').setInputFiles(path); await action('confirm-restore').click(); await closed();
  await nav('exercises'); assert.match(await card('Bench press').locator('.personal-best').textContent(), /22.5 kg × 6 reps/);
  await card('Bench press').locator('[data-action="edit-exercise"]').click();
  await page.getByLabel('Exercise name', { exact: true }).fill('Barbell bench');
  await page.getByRole('button', { name: 'Save exercise', exact: false }).click(); await closed();
  await card('Barbell bench').locator('[data-action="archive-exercise"]').click();
  await action('exercise-filter').filter({ hasText: 'Archived' }).click();
  assert.match(await card('Barbell bench').locator('.personal-best').textContent(), /22.5 kg × 6 reps/);
  await page.reload(); await page.locator('.exercise-card').first().waitFor();
  await action('exercise-filter').filter({ hasText: 'Archived' }).click();
  assert.match(await card('Barbell bench').locator('.personal-best').textContent(), /22.5 kg × 6 reps/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/personal-records-desktop.png', fullPage: true });
  assert.equal((await data()).sessions.length, 2); assert.deepEqual(errors, []);
  console.log('PASS corrections, deletion, backup restore, rename, archive and reload recalculate records automatically');
} finally { await context.close(); await browser.close(); }
