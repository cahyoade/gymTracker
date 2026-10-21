// Isolated Google fixtures: no real account, OAuth client, or Drive upload is used.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const clientId = 'fixture.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'browser-fixture', alg: 'RS256', use: 'sig' };
function credential(nonce, valid = true) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const body = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({
    iss: 'https://accounts.google.com', aud: valid ? clientId : 'wrong-client', nonce,
    exp: Math.floor(Date.now() / 1000) + 3600, sub: 'fixture-account', name: 'Training Person', email: 'training@example.com'
  })}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
const library = `(() => {
  let config; window.fixtureInitializations = 0;
  window.google = { accounts: {
    id: {
      initialize(options) { config = options; window.fixtureInitializations++; },
      renderButton(element, options) {
        const button = document.createElement('button'); button.textContent = 'Sign in with Google';
        button.style.width = options.width + 'px'; button.style.minHeight = '44px';
        button.onclick = async () => {
          const response = await fetch('https://accounts.google.com/__fixture__/credential?nonce=' + config.nonce);
          config.callback(await response.json());
        }; element.replaceChildren(button);
      }, disableAutoSelect() {}
    },
    oauth2: {
      hasGrantedAllScopes(response, ...scopes) { return scopes.every(scope => response.scope?.split(' ').includes(scope)); },
      initTokenClient(options) { return { ...options, async requestAccessToken(request) {
        const response = await fetch('https://accounts.google.com/__fixture__/consent?hint=' + request.hint);
        const value = await response.json();
        if (value.popupClosed) this.error_callback({ type: 'popup_closed' }); else this.callback(value);
      } }; }
    }
  } };
})();`;
const json = value => ({ contentType: 'application/json', body: JSON.stringify(value), headers: { 'Access-Control-Allow-Origin': '*' } });
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const errors = [];
try {
  const plain = await browser.newContext({ serviceWorkers: 'block' });
  await plain.route(`${origin}/js/config.js`, route => route.fulfill({ contentType: 'text/javascript', body: "export const GOOGLE_CLIENT_ID = '';" }));
  const page = await plain.newPage(); page.on('pageerror', error => errors.push(error.message));
  let googleRequests = 0;
  page.on('request', request => { if (request.url().includes('accounts.google.com')) googleRequests++; });
  await page.goto(`${origin}/#settings`);
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Sign in with Google', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('#google-client-id').count(), 0);
  assert.equal(googleRequests, 0);
  await plain.setOffline(true); await action(page, 'export').click();
  await page.getByText('Backup file prepared for download.', { exact: true }).waitFor();
  console.log('PASS unconfigured sign-in has no client-ID form or Google requests; offline file export works');
  await plain.close();

  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  let mode = 'granted', wrongAccount = false, validCredential = true, failScript = true, driveRequests = 0, expireDrive = true;
  const remoteBackups = new Map(); let fileSequence = 0;
  const driveOperations = [];
  await context.route(`${origin}/js/config.js`, route => route.fulfill({ contentType: 'text/javascript', body: `export const GOOGLE_CLIENT_ID = '${clientId}';` }));
  await context.route('https://accounts.google.com/gsi/client', route => failScript ? route.abort('failed') : route.fulfill({ contentType: 'text/javascript', body: library }));
  await context.route('https://accounts.google.com/__fixture__/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('credential')) return route.fulfill(json({ credential: credential(url.searchParams.get('nonce'), validCredential) }));
    assert.equal(url.searchParams.get('hint'), 'fixture-account');
    return route.fulfill(json(mode === 'denied' ? { error: 'access_denied' } : mode === 'closed' ? { popupClosed: true } : {
      access_token: 'fixture-access', expires_in: 3600, scope: 'openid https://www.googleapis.com/auth/drive.appdata'
    }));
  });
  await context.route('https://www.googleapis.com/oauth2/v3/certs', route => route.fulfill(json({ keys: [jwk] })));
  await context.route('https://openidconnect.googleapis.com/v1/userinfo', route => route.fulfill(json({ sub: wrongAccount ? 'different-account' : 'fixture-account' })));
  await context.route(/^https:\/\/www\.googleapis\.com\/(?:upload\/)?drive\/v3\//, route => {
    driveRequests++;
    if (expireDrive) return route.fulfill({ ...json({ error: 'expired' }), status: 401 });
    const request = route.request(), url = new URL(request.url());
    driveOperations.push({ method: request.method(), url: url.pathname + url.search, files: remoteBackups.size });
    assert.equal(request.headers().authorization, 'Bearer fixture-access');
    if (request.method() === 'POST') {
      const snapshot = JSON.parse(request.postData().split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0]);
      const id = `fixture-file-${++fileSequence}`;
      const file = { id, name: `form-backup-${snapshot.exportedAt}.json`, createdTime: snapshot.exportedAt, size: JSON.stringify(snapshot).length };
      remoteBackups.set(id, { file, snapshot }); return route.fulfill(json(file));
    }
    const id = url.pathname.split('/').at(-1);
    if (request.method() === 'DELETE') { remoteBackups.delete(id); return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }); }
    if (url.searchParams.get('alt') === 'media') return route.fulfill(json(remoteBackups.get(id).snapshot));
    return route.fulfill(json({ files: [...remoteBackups.values()].map(item => item.file).sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime)) }));
  });
  const configured = await context.newPage(); configured.on('pageerror', error => errors.push(error.message));
  await configured.goto(`${origin}/#routines`);
  const before = await configured.evaluate(async () => (await import('./js/db.js')).readData());
  await configured.locator('nav [data-view="settings"]').click();
  await action(configured, 'google-retry').waitFor(); failScript = false;
  await action(configured, 'google-retry').click();
  await configured.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
  validCredential = false;
  await configured.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  await configured.getByText('Google sign-in could not be verified. Try again.', { exact: true }).waitFor();
  assert.equal(await action(configured, 'drive-connect').count(), 0);
  validCredential = true;
  await configured.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  await configured.getByText('training@example.com', { exact: true }).waitFor();
  assert.equal(driveRequests, 0);
  console.log('PASS failed library retries; only a verified sign-in displays an account, without requesting Drive access');

  mode = 'denied'; await action(configured, 'drive-connect').click();
  await configured.getByText('Drive access was not granted. Your local workouts are safe.', { exact: true }).waitFor();
  mode = 'closed'; await action(configured, 'drive-connect').click();
  await configured.getByText('Google connection was cancelled or the popup was blocked.', { exact: true }).waitFor();
  mode = 'granted'; wrongAccount = true; await action(configured, 'drive-connect').click();
  await configured.getByText('Choose the same Google account you used to sign in.', { exact: true }).waitFor();
  assert.equal(await action(configured, 'drive-backup').count(), 0);
  wrongAccount = false; await action(configured, 'drive-connect').click();
  await action(configured, 'drive-list').waitFor(); await action(configured, 'drive-list').click();
  await configured.getByText('Google authorization expired. Reconnect to continue.', { exact: true }).waitFor();
  await action(configured, 'drive-connect').waitFor();
  console.log('PASS denied consent, cancelled popups, account mismatch, and expired Drive access allow retry');

  expireDrive = false; await action(configured, 'drive-connect').click();
  await action(configured, 'drive-backup').waitFor();
  for (let index = 0; index < 6; index++) {
    const previous = await configured.evaluate(async () => (await (await import('./js/db.js')).readData()).state.lastDriveBackupAt);
    await action(configured, 'drive-backup').click();
    await configured.waitForFunction(async previous => (await (await import('./js/db.js')).readData()).state.lastDriveBackupAt !== previous, previous);
    await configured.waitForFunction(() => document.querySelector('[data-action="drive-backup"]')?.disabled === false);
    await configured.getByText('Google Drive backup saved and verified.', { exact: true }).waitFor();
  }
  assert.equal(remoteBackups.size, 5, JSON.stringify(driveOperations));
  await action(configured, 'drive-list').click();
  await configured.locator('.backup-list').waitFor();
  assert.equal(await action(configured, 'drive-restore').count(), 5);
  await configured.locator('nav [data-view="exercises"]').click();
  await action(configured, 'new-exercise').click();
  await configured.getByLabel('Exercise name', { exact: true }).fill('After backup');
  await configured.getByRole('button', { name: 'Save exercise', exact: false }).click();
  await configured.waitForFunction(() => !document.querySelector('#modal').open);
  await configured.locator('nav [data-view="settings"]').click();
  await action(configured, 'drive-list').click(); await action(configured, 'drive-restore').first().waitFor();
  await action(configured, 'drive-restore').first().click();
  await configured.getByRole('heading', { name: 'Bring your progress back.' }).waitFor();
  await action(configured, 'confirm-restore').click();
  await configured.waitForFunction(() => !document.querySelector('#modal').open);
  const restored = await configured.evaluate(async () => (await import('./js/db.js')).readData());
  assert.equal(restored.exercises.length, 12); assert.equal(restored.recovery.snapshot.exercises.length, 13);
  assert.equal(remoteBackups.size, 5);
  console.log('PASS manual Drive upload, verification, five-backup retention, listing, restore and local recovery');
  const beforeSignOut = await configured.evaluate(async () => (await import('./js/db.js')).readData());

  await context.setOffline(true);
  await configured.getByText('Go online to sign in, back up, or restore with Google Drive.', { exact: true }).waitFor();
  await action(configured, 'google-signout').click();
  assert.equal(await configured.getByText('training@example.com', { exact: true }).count(), 0);
  const after = await configured.evaluate(async () => (await import('./js/db.js')).readData());
  assert.deepEqual(after, beforeSignOut);
  assert.deepEqual(after.exercises, before.exercises);
  assert.equal(await configured.evaluate(() => JSON.stringify(localStorage).includes('fixture-access') || JSON.stringify(localStorage).includes('training@example.com')), false);
  await context.setOffline(false);
  await configured.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
  assert.equal(await configured.evaluate(() => window.fixtureInitializations), 1);
  for (const width of [320, 390, 768, 1440]) {
    await configured.setViewportSize({ width, height: 950 });
    await configured.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  }
  await mkdir('test-results', { recursive: true });
  await configured.screenshot({ path: 'test-results/google-settings-fixture.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS sign-out preserves all local records; profiles/tokens are not persisted; responsive Settings fits');
  await context.close();
} finally { await browser.close(); }
