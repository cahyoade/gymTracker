import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { validateBackup } from '../js/backup.js';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(10000);
let acceptDialog = true;
page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
const errors = []; page.on('pageerror', error => errors.push(error.message));
const action = name => page.locator(`[data-action="${name}"]`);
const nav = async name => {
  await page.locator(`nav [data-view="${name}"]`).click();
  if (acceptDialog) await page.waitForFunction(name => document.querySelector(`nav [data-view="${name}"]`).getAttribute('aria-current') === 'page', name);
  else await page.waitForFunction(name => location.hash !== `#${name}`, name);
};
const data = () => page.evaluate(async () => (await import('./js/db.js')).readData());
const saved = () => page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
const closed = () => page.waitForFunction(() => !document.querySelector('#modal').open);
const set = position => page.locator(`.set-row`).filter({ has: page.getByRole('spinbutton', { name: `Audit exercise set ${position} weight in kg`, exact: true }) });
async function record(position, weight, reps) {
  await set(position).locator('[data-field="weight"]').fill(weight);
  await set(position).locator('[data-field="reps"]').fill(reps);
  await set(position).locator('[data-field="completed"]').check();
}
async function storageFailure(enabled) {
  await page.evaluate(enabled => {
    if (enabled) {
      window.auditTransaction ||= IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') throw new DOMException('Audit storage full', 'QuotaExceededError');
        return window.auditTransaction.apply(this, args);
      };
    } else IDBDatabase.prototype.transaction = window.auditTransaction;
  }, enabled);
}
const failures = [];
async function check(name, operation) {
  try { await operation(); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
}
try {
  await page.goto(`${origin}/#exercises`);
  await page.getByRole('heading', { name: 'Exercise collection', exact:true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await check('custom exercise, category, search and keyboard form submission', async () => {
    await action('new-exercise').click();
    await page.getByLabel('Exercise name', { exact: true }).fill('Audit exercise');
    await page.getByLabel('Category', { exact: true }).selectOption('Core');
    await page.getByLabel('Exercise name', { exact: true }).press('Enter'); await closed();
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('aUdIt');
    assert.equal(await page.locator('.exercise-card').count(), 1);
    assert.match(await page.locator('.exercise-card .category').textContent(), /Core/);
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('no-such-exercise');
    await page.getByRole('heading', { name: 'Nothing here yet.' }).waitFor();
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('');
  });
  await check('routine validation, targets, duplicate exclusion and persistence failure', async () => {
    await nav('routines'); await action('new-routine').first().click();
    await page.locator('#routine-name').fill('Audit routine');
    await page.getByRole('button', { name: 'Save routine', exact: false }).click();
    await page.getByText('Add at least one exercise.', { exact: true }).waitFor();
    const custom = (await data()).exercises.find(item => item.name === 'Audit exercise');
    await page.locator('#routine-exercise').selectOption(custom.id); await action('editor-add').click();
    assert.equal(await page.locator(`#routine-exercise option[value="${custom.id}"]`).count(), 0);
    await page.locator('[data-editor-field="repMin"]').fill('12');
    await page.locator('[data-editor-field="repMax"]').fill('8');
    await page.getByRole('button', { name: 'Save routine', exact: false }).click();
    await page.getByText('Use a valid rep range between 1 and 999.', { exact: true }).waitFor();
    await page.locator('[data-editor-field="repMax"]').fill('15');
    await storageFailure(true);
    await page.getByRole('button', { name: 'Save routine', exact: false }).click();
    await page.locator('#form-error:not([hidden])').waitFor();
    assert.equal(await page.locator('#routine-name').inputValue(), 'Audit routine');
    assert.equal((await data()).routines.length, 0);
    await storageFailure(false);
    await page.getByRole('button', { name: 'Save routine', exact: false }).click(); await closed();
    assert.equal((await data()).routines[0].entries[0].repMax, 15);
  });
  await check('zero-weight logging, invalid reps, empty finish, draft navigation and skip link', async () => {
    await action('start').click(); await page.locator('#workout-fields').waitFor();
    await action('finish-workout').click(); await page.getByText('Complete at least one set before saving this workout.', { exact: true }).waitFor();
    await set(1).locator('[data-field="weight"]').fill('0');
    await set(1).locator('[data-field="reps"]').fill('2.5');
    await set(1).locator('[data-field="completed"]').click();
    assert.equal(await set(1).locator('[data-field="completed"]').isChecked(), false);
    await record(1, '0', '12'); await record(2, '20.25', '10'); await record(3, '30.5', '8');
    await saved(); await nav('settings'); await action('resume').click();
    assert.equal(await set(2).locator('[data-field="weight"]').inputValue(), '20.25');
    await page.locator('.skip-link').focus(); await page.locator('.skip-link').press('Enter');
    assert.equal(await page.locator('#workout-fields').count(), 1, 'Skip to content must keep the active workout visible');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  });
  // Recover workout visibility if the skip-link regression was encountered.
  if (!await page.locator('#workout-fields').count()) await action('resume').click();
  await check('failed set removal keeps displayed rows aligned with draft data', async () => {
    await storageFailure(true);
    await set(2).locator('[data-action="remove-set"]').click();
    await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Not saved'));
    assert.equal(await page.getByRole('spinbutton', { name: 'Audit exercise set 2 weight in kg', exact: true }).count(), 0, 'Removed set must not remain as a stale input');
    await storageFailure(false);
    await set(3).locator('[data-field="weight"]').fill('32.75');
    await set(3).locator('[data-field="completed"]').check();
    await action('retry-save').click(); await saved();
    const sets = (await data()).sessions.find(item => item.status === 'draft').entries[0].sets;
    assert.deepEqual(sets.map(item => item.position), [1, 3]); assert.equal(sets[1].weight, 32.75);
  });
  await storageFailure(false);
  // Reload from confirmed storage after an intentional fault to continue independent checks.
  await page.reload(); await action('resume').click();
  await check('active-draft file round trip, resume and recovery export', async () => {
    const expected = (await data()).sessions.find(item => item.status === 'draft');
    await nav('settings');
    await action('export').waitFor();
    const download = page.waitForEvent('download'); await action('export').click();
    const path = await (await download).path();
    await page.locator('#import-file').setInputFiles(path);
    await page.getByText('Includes an active workout draft.', { exact: true }).waitFor();
    await action('confirm-restore').click(); await closed();
    const restored = await data(); assert.deepEqual(restored.sessions[0].entries, expected.entries);
    const recovery = page.waitForEvent('download'); await action('export-recovery').click();
    const snapshot = validateBackup(await readFile(await (await recovery).path(), 'utf8'));
    assert.equal(snapshot.sessions[0].status, 'draft');
    assert.deepEqual(snapshot.sessions[0].entries, expected.entries);
    await action('resume').click();
    assert.equal(await set(3).locator('[data-field="weight"]').inputValue(), '32.75');
  });
  await check('adding/removing sets, skipped positions, notes, finish failure and retry', async () => {
    await action('add-set').click();
    const rows = page.locator('.set-row');
    await rows.last().locator('[data-field="weight"]').fill('999');
    await page.locator('#session-notes').fill('Bodyweight and fractional sets.'); await saved();
    await storageFailure(true); await action('finish-workout').click();
    assert.equal(await page.locator('#workout-fields').count(), 1);
    assert.equal((await data()).sessions[0].status, 'draft');
    await storageFailure(false); await action('finish-workout').click();
    await page.locator('.history-card').waitFor();
    const session = (await data()).sessions[0];
    assert.equal(session.status, 'completed');
    assert.ok(session.entries[0].sets.every(item => item.weight !== 999));
    assert.equal(session.notes, 'Bodyweight and fractional sets.');
  });
  await check('routine deletion cancellation, preserved history and archived exercise history filter', async () => {
    await nav('routines'); acceptDialog = false; await action('delete-routine').click();
    assert.equal((await data()).routines.length, 1);
    acceptDialog = true; await action('delete-routine').click();
    assert.equal((await data()).routines.length, 0); assert.equal((await data()).sessions.length, 1);
    await nav('exercises'); const card = page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: 'Audit exercise', exact: true }) });
    await card.locator('[data-action="archive-exercise"]').click();
    await action('exercise-filter').filter({ hasText: 'Archived' }).click();
    await page.locator('.exercise-card').filter({ has: page.getByRole('heading', { name: 'Audit exercise', exact: true }) }).locator('[data-action="exercise-history"]').click();
    await page.locator('#history-exercise').waitFor();
    assert.match(await page.locator('.history-card').textContent(), /Set 1: 0 kg/);
    await action('session-details').click();
    await page.getByText('Bodyweight and fractional sets.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close dialog' }).click();
  });
  await check('correction cancel and navigation confirmation preserve saved history', async () => {
    await action('session-details').click(); await action('edit-session').click();
    await set(1).locator('[data-field="weight"]').fill('123');
    acceptDialog = false; await nav('exercises');
    assert.equal(await page.locator('#workout-fields').count(), 1);
    acceptDialog = true; await action('cancel-history-edit').click();
    assert.equal((await data()).sessions[0].entries[0].sets[0].weight, 0);
  });
  await check('offline reopening and each core view', async () => {
    await context.setOffline(true); await page.reload();
    for (const name of ['routines', 'exercises', 'history', 'settings']) {
      await nav(name); assert.equal(await page.locator('main h1').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    const download = page.waitForEvent('download'); await action('export').click();
    assert.match((await download).suggestedFilename(), /^form-backup-/);
    await context.setOffline(false);
  });
  await check('storage protection, install prompt and cancelled restore leave data intact', async () => {
    await action('persistent-storage').click();
    await page.waitForFunction(() => document.querySelector('#storage-status').textContent.length > 0);
    assert.ok((await page.locator('#storage-status').textContent()).length);
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.auditInstallPrompt = true; };
      event.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(event);
    });
    await action('install').click();
    assert.equal(await page.evaluate(() => window.auditInstallPrompt), true);
    const snapshot = await page.evaluate(async () => { const db = await import('./js/db.js'); return db.snapshotFromData(await db.readData()); });
    const before = await data();
    await page.locator('#import-file').setInputFiles({ name: 'audit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(snapshot)) });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await closed();
    assert.deepEqual(await data(), before);
  });
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/feature-audit-settings.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, [], 'Feature audit failures');
} finally { await context.close(); await browser.close(); }
