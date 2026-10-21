import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href) : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
await mkdir('test-results', { recursive: true });
const check = (name, operation) => operation().then(() => console.log(`PASS ${name}`));
const readData = () => page.evaluate(async () => (await import('./js/db.js')).readData());
const waitSaved = () => page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
const action = name => page.locator(`[data-action="${name}"]`);
const firstSet = () => page.locator('.set-row').first();
async function buildRoutine(name, exercise = 'seed-bench-press') {
  await action('new-routine').first().click();
  await page.locator('#routine-name').fill(name);
  await page.locator('#routine-exercise').selectOption(exercise);
  await action('editor-add').click();
  await page.getByRole('button', { name: 'Save routine', exact: false }).click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
}
async function navigate(view) {
  await page.locator(`nav [data-view="${view}"]`).click();
  await page.waitForFunction(view => document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current') === 'page', view);
}

try {
  await check('initial exercise seed, manifest, desktop and mobile shell', async () => {
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Routines', exact:true }).waitFor();
    assert.equal((await readData()).exercises.length, 12);
    const manifest = await (await context.request.get(`${origin}/manifest.webmanifest`)).json();
    for (const icon of manifest.icons) assert.equal((await context.request.get(`${origin}/${icon.src.replace('./', '')}`)).status(), 200);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.screenshot({ path: 'test-results/desktop-empty.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'test-results/mobile-empty.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
  });
  await check('routine creation, duplication, exercise ordering and targets', async () => {
    await buildRoutine('Upper A');
    await action('duplicate-routine').click();
    await page.getByRole('heading', { name: 'Upper A (copy)', exact: true }).waitFor();
    let stored = await readData(); assert.equal(stored.routines.length, 2);
    assert.equal(stored.routines[0].entries[0].setCount, 3);
    assert.equal(stored.routines[0].entries[0].repMin, 8);
    await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Upper A (copy)', exact: true }) }).locator('[data-action="edit-routine"]').click();
    await page.locator('#routine-exercise').selectOption('seed-squat'); await action('editor-add').click();
    await action('editor-up').last().click();
    await page.locator('[data-editor-field="setCount"]').first().fill('2');
    await page.getByRole('button', { name: 'Save routine', exact: false }).click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    stored = await readData();
    const copy = stored.routines.find(item => item.name.endsWith('(copy)'));
    assert.equal(copy.entries[0].exerciseId, 'seed-squat'); assert.equal(copy.entries[0].setCount, 2);
  });
  await check('offline draft autosave, blank inputs, completion validation and reload resume', async () => {
    await context.setOffline(true);
    await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Upper A', exact: true }) }).locator('[data-action="start"]').click();
    await page.locator('#workout-fields').waitFor();
    assert.equal(await firstSet().locator('[data-field="weight"]').inputValue(), '');
    await firstSet().locator('[data-field="completed"]').click();
    assert.equal(await firstSet().locator('[data-field="completed"]').isChecked(), false);
    await firstSet().locator('[data-field="weight"]').fill('42.5');
    await firstSet().locator('[data-field="reps"]').fill('10');
    await firstSet().locator('[data-field="completed"]').check();
    await page.locator('.set-row').nth(1).locator('[data-field="weight"]').fill('999');
    await page.locator('#session-notes').fill('Offline workout');
    await waitSaved();
    await page.reload(); await action('resume').click();
    assert.equal(await firstSet().locator('[data-field="weight"]').inputValue(), '42.5');
    assert.equal(await firstSet().locator('[data-field="completed"]').isChecked(), true);
    assert.equal(await page.locator('#session-notes').inputValue(), 'Offline workout');
    await action('finish-workout').click();
    await page.locator('.history-card').waitFor();
    const stored = await readData();
    const completed = stored.sessions.find(item => item.status === 'completed');
    assert.equal(completed.entries[0].sets.length, 1); assert.equal(completed.entries[0].sets[0].weight, 42.5);
    assert.equal(stored.sessions.some(item => item.status === 'draft'), false);
  });
  await check('shared previous performance, missing sets and mobile workout layout', async () => {
    await navigate('routines');
    await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Upper A (copy)', exact: true }) }).locator('[data-action="start"]').click();
    await page.locator('#workout-fields').waitFor();
    const bench = page.locator('.workout-exercise').filter({ has: page.getByRole('heading', { name: 'Bench press', exact: true }) });
    assert.match(await bench.locator('.previous-record').first().textContent(), /42.5.*10/);
    assert.equal((await bench.locator('.previous-record').nth(1).textContent()).trim(), 'None');
    assert.equal(await bench.locator('[data-field="weight"]').first().inputValue(), '');
    await action('add-set').last().click();
    await waitSaved();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'test-results/mobile-workout.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1440, height: 1050 });
    await action('discard-workout').click();
    await page.waitForFunction(() => !document.querySelector('#workout-fields'));
  });
  await check('history correction and exercise rename/archive preserve snapshots', async () => {
    await navigate('history'); await action('session-details').click(); await action('edit-session').click();
    await firstSet().locator('[data-field="weight"]').fill('45');
    assert.equal(await firstSet().locator('[data-field="completed"]').isChecked(), false);
    await firstSet().locator('[data-field="completed"]').check();
    await action('finish-workout').click(); await page.locator('.history-card').waitFor();
    await navigate('exercises');
    let card = page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: 'Bench press', exact: true }) });
    assert.match(await card.locator('.exercise-record').textContent(), /45/);
    await card.locator('[data-action="edit-exercise"]').click();
    await page.locator('#exercise-form input[name="name"]').fill('Barbell bench');
    await page.getByRole('button', { name: 'Save exercise', exact: false }).click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    card = page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: 'Barbell bench', exact: true }) });
    await card.locator('[data-action="archive-exercise"]').click();
    await page.waitForFunction(() => ![...document.querySelectorAll('.exercise-card h2')].some(node => node.textContent === 'Barbell bench'));
    const stored = await readData();
    assert.equal(stored.exercises.find(item => item.id === 'seed-bench-press').archived, true);
    assert.equal(stored.sessions[0].entries[0].exerciseName, 'Bench press');
    await action('exercise-filter').filter({ hasText: 'Archived' }).click();
    await page.getByRole('heading', { name: 'Barbell bench', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Unarchive', exact: true }).click();
  });
  await check('file export, invalid import rejection, restore and recovery transaction', async () => {
    await navigate('settings');
    const downloadPromise = page.waitForEvent('download'); await action('export').click();
    const download = await downloadPromise; const path = await download.path();
    const before = await readData();
    await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('unsupported'));
    assert.equal(await page.locator('#modal').isVisible(), false);
    assert.deepEqual((await readData()).sessions, before.sessions);
    await context.setOffline(false);
    await navigate('exercises'); await action('new-exercise').click();
    await page.locator('#exercise-form input[name="name"]').fill('Custom exercise');
    await page.getByRole('button', { name: 'Save exercise', exact: false }).click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    await navigate('settings'); await page.locator('#import-file').setInputFiles(path);
    await action('confirm-restore').click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    let stored = await readData();
    assert.equal(stored.exercises.length, 12); assert.equal(stored.recovery.snapshot.exercises.length, 13);
    await action('restore-recovery').click(); await action('confirm-restore').click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    stored = await readData(); assert.equal(stored.exercises.length, 13); assert.equal(stored.recovery.snapshot.exercises.length, 12);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'test-results/mobile-settings.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
  });
  await check('storage failures preserve visible input and successful retry saves it', async () => {
    await navigate('routines');
    await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Upper A', exact: true }) }).locator('[data-action="start"]').click();
    await page.locator('#workout-fields').waitFor();
    await page.evaluate(() => {
      window.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') throw new DOMException('Test storage full', 'QuotaExceededError');
        return window.originalTransaction.apply(this, args);
      };
    });
    await firstSet().locator('[data-field="weight"]').fill('47.5');
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent.includes('Not saved'));
    assert.equal(await firstSet().locator('[data-field="weight"]').inputValue(), '47.5');
    await page.evaluate(() => { IDBDatabase.prototype.transaction = window.originalTransaction; });
    await action('retry-save').click(); await waitSaved();
    assert.equal((await readData()).sessions.find(item => item.status === 'draft').entries[0].sets[0].weight, '47.5');
    await action('discard-workout').click();
    await page.waitForFunction(() => !document.querySelector('#workout-fields'));
  });
  await check('restore abort keeps original data and original recovery snapshot', async () => {
    const before = await readData();
    const result = await page.evaluate(async () => {
      const db = await import('./js/db.js');
      const data = await db.readData(), snapshot = db.snapshotFromData(data);
      snapshot.exercises = [];
      const original = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function (...args) { const result = original.apply(this, args); this.transaction.abort(); return result; };
      try { await db.replaceData(snapshot); return 'unexpected success'; }
      catch { return 'aborted'; }
      finally { IDBObjectStore.prototype.clear = original; }
    });
    assert.equal(result, 'aborted');
    const after = await readData();
    assert.deepEqual(after.exercises, before.exercises); assert.deepEqual(after.sessions, before.sessions); assert.deepEqual(after.recovery, before.recovery);
  });
  const releaseEndpoint = await context.request.get(`${origin}/__test__/release`);
  if (releaseEndpoint.ok()) {
    await check('app update saves the latest active draft before activation and reload', async () => {
      await navigate('routines');
      await page.locator('.routine-card').filter({ has: page.getByRole('heading', { name: 'Upper A', exact: true }) }).locator('[data-action="start"]').click();
      await page.locator('#workout-fields').waitFor();
      await context.request.post(`${origin}/__test__/release`);
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
      await page.locator('#update-banner').waitFor();
      await firstSet().locator('[data-field="weight"]').fill('52.75');
      const reloaded = page.waitForEvent('load');
      await page.locator('#apply-update').click();
      await reloaded;
      await action('resume').click();
      assert.equal(await firstSet().locator('[data-field="weight"]').inputValue(), '52.75');
      await waitSaved();
      await context.setOffline(true); await page.reload(); await action('resume').click();
      assert.equal(await firstSet().locator('[data-field="weight"]').inputValue(), '52.75');
      await context.setOffline(false);
      await action('discard-workout').click();
      await page.waitForFunction(() => !document.querySelector('#workout-fields'));
    });
  } else console.log('SKIP update simulation: use node tests/server.mjs to enable it.');
  await check('session deletion recalculates performance and populated desktop layout', async () => {
    await navigate('routines');
    await page.screenshot({ path: 'test-results/desktop-routines.png', fullPage: true });
    await navigate('history'); await action('session-details').click(); await action('delete-session').click();
    await page.waitForFunction(() => !document.querySelector('#modal').open);
    assert.equal((await readData()).sessions.length, 0);
    await navigate('exercises');
    await action('exercise-filter').filter({ hasText: 'Active' }).click();
    const card = page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: 'Barbell bench', exact: true }) });
    assert.match(await card.textContent(), /No sessions recorded/);
  });
  assert.deepEqual(errors, []);
  console.log('All browser scenarios passed. Screenshots: test-results/');
} finally { await context.close(); await browser.close(); }
