import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_EXERCISES, createDraft, finishSession, lastPerformance, previousSet, sessionTotals, validateSet, validateRoutine, id } from '../js/model.js';
import { validateBackup, DriveBackup } from '../js/backup.js';
import { GoogleSignIn, verifyGoogleCredential } from '../js/google.js';
import { generateKeyPairSync, sign } from 'node:crypto';

const timestamp = '2026-10-10T01:00:00.000Z';
test('LAN HTTP previews generate UUIDs with cryptographic randomness when randomUUID is unavailable',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');
  try {
    Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined});
    const ids=Array.from({length:100},()=>id());
    assert.equal(new Set(ids).size,100);
    for(const value of ids)assert.match(value,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    assert.doesNotThrow(()=>new GoogleSignIn('test',()=>{},()=>{}));
  } finally {
    if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID;
  }
});
function routine(id = 'routine-a') {
  return { id, name: 'Upper body', updatedAt: timestamp, entries: [{ exerciseId: 'seed-bench-press', setCount: 3, repMin: 8, repMax: 12 }] };
}
function session(completedPositions = [1, 3], routineId = 'routine-a') {
  const draft = createDraft(routine(routineId), SEED_EXERCISES);
  for (const set of draft.entries[0].sets) {
    if (completedPositions.includes(set.position)) Object.assign(set, { weight: '42.5', reps: '10', completed: true });
  }
  return finishSession(draft);
}
function backup() {
  return { schemaVersion: 2, bodyMeasurements: [], exportedAt: timestamp, exercises: structuredClone(SEED_EXERCISES), routines: [routine()], sessions: [session()], workoutPreferences: { unit: 'kg' } };
}

test('new drafts snapshot routine details and leave every set blank', () => {
  const source = routine();
  const draft = createDraft(source, SEED_EXERCISES);
  source.name = 'Renamed'; source.entries[0].setCount = 5;
  assert.equal(draft.routineName, 'Upper body');
  assert.equal(draft.entries[0].exerciseName, 'Bench press');
  assert.equal(draft.entries[0].sets.length, 3);
  assert.ok(draft.entries[0].sets.every(set => set.weight === '' && set.reps === '' && !set.completed));
});
test('completed sets accept zero and fractional kilograms', () => {
  assert.equal(validateSet({ weight: '0', reps: '1' }).weight, 0);
  assert.equal(validateSet({ weight: '12.75', reps: '12' }).weight, 12.75);
});
test('blank, negative, infinite weights and invalid reps are rejected', () => {
  for (const weight of ['', null, '-1', 'Infinity', 'not-a-number']) assert.throws(() => validateSet({ weight, reps: 10 }));
  for (const reps of ['', null, 0, -1, 2.5, Infinity, 'abc']) assert.throws(() => validateSet({ weight: 20, reps }));
});
test('finishing filters unperformed sets without collapsing positions', () => {
  const completed = session();
  assert.deepEqual(completed.entries[0].sets.map(set => set.position), [1, 3]);
  assert.equal(completed.entries[0].sets[0].weight, 42.5);
  assert.equal(completed.status, 'completed');
  assert.deepEqual(sessionTotals(completed), { sets: 2, reps: 20, volume: 850 });
});
test('an empty workout cannot be finished', () => {
  assert.throws(() => finishSession(createDraft(routine(), SEED_EXERCISES)), /at least one/);
});
test('last performance is shared across routines and ignores drafts', () => {
  const older = session([1], 'routine-a'); older.finishedAt = '2026-10-08T01:00:00.000Z';
  const latest = session([1, 3], 'routine-b'); latest.finishedAt = timestamp;
  const draft = createDraft(routine(), SEED_EXERCISES);
  const performance = lastPerformance([older, latest, draft], 'seed-bench-press');
  assert.equal(performance.session.routineId, 'routine-b');
  assert.equal(previousSet(performance, 3).weight, 42.5);
  assert.equal(previousSet(performance, 2), null);
  assert.equal(lastPerformance([older, latest], 'seed-bench-press', latest.id).session.id, older.id);
});
test('skipped exercises do not replace their previous performance', () => {
  const original = session([1]); original.finishedAt = '2026-10-08T01:00:00.000Z';
  const newer = session([1]); newer.finishedAt = timestamp; newer.entries[0].exerciseId = 'seed-squat';
  assert.equal(lastPerformance([original, newer], 'seed-bench-press').session.id, original.id);
});
test('deleting or correcting history changes the derived previous record', () => {
  const original = session([1]), newer = session([1]);
  original.finishedAt = '2026-10-08T01:00:00.000Z'; newer.finishedAt = timestamp;
  newer.entries[0].sets[0].weight = 50;
  assert.equal(previousSet(lastPerformance([original, newer], 'seed-bench-press'), 1).weight, 50);
  assert.equal(previousSet(lastPerformance([original], 'seed-bench-press'), 1).weight, 42.5);
});
test('routine targets and uniqueness are validated', () => {
  assert.doesNotThrow(() => validateRoutine(routine(), SEED_EXERCISES));
  for (const entry of [{ setCount: 0 }, { setCount: 51 }, { repMin: 20, repMax: 10 }, { repMin: 0 }, { setCount: 2.5 }]) {
    const value = routine(); Object.assign(value.entries[0], entry);
    assert.throws(() => validateRoutine(value, SEED_EXERCISES));
  }
  const repeated = routine(); repeated.entries.push({ ...repeated.entries[0] });
  assert.throws(() => validateRoutine(repeated, SEED_EXERCISES), /once/);
});
test('backup JSON round trip preserves completed sessions and draft input', () => {
  const value = backup();
  const draft = createDraft(routine(), SEED_EXERCISES); draft.entries[0].sets[0].weight = '15.25';
  value.sessions.push(draft);
  assert.deepEqual(validateBackup(JSON.stringify(value)), value);
});
test('history survives archived and renamed exercises and deleted routines', () => {
  const value = backup(); value.routines = [];
  const exercise = value.exercises.find(item => item.id === 'seed-bench-press');
  exercise.archived = true; exercise.name = 'Renamed bench';
  const restored = validateBackup(value);
  assert.equal(restored.sessions[0].entries[0].exerciseName, 'Bench press');
});
test('backup validation rejects incompatible formats and malformed records', () => {
  for (const mutate of [
    value => { value.schemaVersion = 999; },
    value => { value.exportedAt = 'wrong'; },
    value => { value.exercises.push(value.exercises[0]); },
    value => { value.exercises = []; },
    value => { value.sessions[0].entries[0].sets[0].weight = -1; },
    value => { value.sessions[0].entries[0].sets[0].reps = 0; },
    value => { value.sessions[0].entries[0].sets[0].completed = false; },
    value => { value.sessions[0].entries[0].sets.push({ ...value.sessions[0].entries[0].sets[0], id: 'other' }); },
    value => { value.workoutPreferences.unit = 'lb'; },
    value => { value.sessions.push(createDraft(routine(), SEED_EXERCISES), createDraft(routine(), SEED_EXERCISES)); }
  ]) {
    const value = backup(); mutate(value); assert.throws(() => validateBackup(value));
  }
  assert.throws(() => validateBackup('{broken-json'));
  assert.throws(() => validateBackup(null));
});
test('backup validation does not mutate input', () => {
  const value = backup(); const before = structuredClone(value);
  validateBackup(value); assert.deepEqual(value, before);
});

function connectedDrive() {
  const drive = new DriveBackup('test.apps.googleusercontent.com');
  drive.accessToken = 'test-token'; drive.expiresAt = Date.now() + 60000;
  return drive;
}
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('Drive never sends a request with an expired token', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => jsonResponse({}));
  const drive = connectedDrive(); drive.expiresAt = Date.now() - 1;
  await assert.rejects(() => drive.list(), /Reconnect/);
  assert.equal(fetch.mock.callCount(), 0); assert.equal(drive.accessToken, null);
});
test('Drive rejects unauthorized requests and clears memory-only tokens', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 401 }));
  const drive = connectedDrive();
  await assert.rejects(() => drive.list(), /authorization expired/);
  assert.equal(drive.accessToken, null);
});
test('Drive handles interrupted requests without declaring success', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network failed'); });
  await assert.rejects(() => connectedDrive().upload(backup()), /could not be reached/);
});
test('Drive verifies uploaded content before retaining five newest backups', async t => {
  const value = backup(), operations = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    operations.push({ url, method: options.method || 'GET' });
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    if (options.method === 'POST') return jsonResponse({ id: 'new-file', name: 'form-backup-new.json' });
    if (url.includes('alt=media')) return jsonResponse(value);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    return jsonResponse({ files: Array.from({ length: 7 }, (_, index) => ({ id: `file-${index}`, name: `form-backup-${index}.json`, createdTime: timestamp })) });
  });
  const result = await connectedDrive().upload(value);
  assert.equal(result.id, 'new-file'); assert.equal(result.cleanupWarning, false);
  assert.ok(operations[1].url.includes('alt=media'));
  assert.deepEqual(operations.filter(item => item.method === 'DELETE').map(item => item.url.split('/').at(-1)), ['file-5', 'file-6']);
});
test('failed Drive verification keeps all old backups', async t => {
  const value = backup(), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method || 'GET');
    if (options.method === 'POST') return jsonResponse({ id: 'new-file' });
    return jsonResponse({ ...value, exportedAt: '2026-10-09T01:00:00.000Z' });
  });
  await assert.rejects(() => connectedDrive().upload(value), /could not be verified/);
  assert.deepEqual(calls, ['POST', 'GET']);
});
test('retention failure reports a warning after a successful backup', async t => {
  const value = backup();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (options.method === 'POST') return jsonResponse({ id: 'new-file' });
    if (url.includes('alt=media')) return jsonResponse(value);
    return new Response('', { status: 503 });
  });
  assert.equal((await connectedDrive().upload(value)).cleanupWarning, true);
});
test('Drive lists paginated app-owned backups only', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    count++;
    assert.ok(url.includes('appDataFolder'));
    if (count === 1) return jsonResponse({ files: [{ id: '1', name: 'form-backup-1.json' }, { id: 'x', name: 'unrelated.json' }], nextPageToken: 'page2' });
    assert.ok(url.includes('pageToken=page2'));
    return jsonResponse({ files: [{ id: '2', name: 'form-backup-2.json' }] });
  });
  assert.deepEqual((await connectedDrive().list()).map(file => file.id), ['1', '2']);
});
test('denied consent and closed popups leave Drive disconnected', async t => {
  const previous = globalThis.google;
  t.after(() => { if (previous === undefined) delete globalThis.google; else globalThis.google = previous; });
  let client;
  globalThis.google = { accounts: { oauth2: {
    hasGrantedAllScopes: () => false,
    initTokenClient: options => { client = options; return { ...options, requestAccessToken() { this.callback({ error: 'access_denied' }); } }; }
  } } };
  const drive = new DriveBackup('test.apps.googleusercontent.com');
  await drive.prepare();
  await assert.rejects(() => drive.connect(), /not granted/);
  assert.equal(drive.connected, false);
  drive.client.requestAccessToken = function () { this.error_callback({ type: 'popup_closed' }); };
  await assert.rejects(() => drive.connect(), /cancelled/);
  assert.ok(client.scope.endsWith('drive.appdata'));
});

const clientId = 'test.apps.googleusercontent.com';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
function credential(overrides = {}, nonce = 'test-nonce') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: clientId,
    exp: Math.floor(Date.now() / 1000) + 3600, nonce, sub: 'account-123', email: 'person@example.com', name: 'Person', ...overrides })).toString('base64url');
  const body = `${header}.${payload}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
function mockGoogle(t, idAPI = {}) {
  const previous = globalThis.google;
  t.after(() => { if (previous === undefined) delete globalThis.google; else globalThis.google = previous; });
  globalThis.google = { accounts: { id: idAPI, oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: options => ({ ...options, requestAccessToken(request) {
      this.request = request; this.callback({ access_token: 'test-token', expires_in: 3600 });
    } })
  } } };
}
test('Google credential verification checks signed audience, issuer, nonce and expiry', async t => {
  t.mock.method(globalThis, 'fetch', async () => jsonResponse({ keys: [jwk] }));
  assert.deepEqual(await verifyGoogleCredential(credential(), clientId, 'test-nonce'), { id: 'account-123', name: 'Person', email: 'person@example.com' });
  for (const invalid of [{ aud: 'other-client' }, { iss: 'https://attacker.example' }, { exp: 1 }, { nonce: 'wrong-nonce' }, { sub: '' }]) {
    await assert.rejects(() => verifyGoogleCredential(credential(invalid), clientId, 'test-nonce'), /could not be verified/);
  }
  const parts = credential().split('.');
  parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), email: 'forged@example.com' })).toString('base64url');
  await assert.rejects(() => verifyGoogleCredential(parts.join('.'), clientId, 'test-nonce'), /could not be verified/);
  await assert.rejects(() => verifyGoogleCredential('not-a-token', clientId, 'test-nonce'), /invalid sign-in/);
});
test('Google sign-in initializes once and sign-out ignores an in-flight credential', async t => {
  let options, calls = 0, signedIn = 0, errors = [];
  mockGoogle(t, { initialize: value => { options = value; calls++; }, disableAutoSelect() {} });
  const account = new GoogleSignIn(clientId, () => signedIn++, error => errors.push(error.message));
  await account.prepare(); await account.prepare(); assert.equal(calls, 1);
  const pending = options.callback({ credential: credential({}, account.nonce) });
  account.signOut(); await pending;
  assert.equal(account.profile, null); assert.equal(signedIn, 0);
  await options.callback({ credential: credential({}, account.nonce) });
  assert.equal(account.profile.id, 'account-123'); assert.equal(signedIn, 1);
  account.signOut(); assert.equal(account.profile, null); assert.deepEqual(errors, []);
});
test('Drive verifies the selected account before enabling backup', async t => {
  mockGoogle(t);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return jsonResponse({ sub: 'account-123' });
  });
  const drive = new DriveBackup(clientId); await drive.prepare();
  await assert.rejects(() => drive.connect({ accountId: 'wrong-account' }), /same Google account/);
  assert.equal(drive.connected, false); assert.equal(drive.accessToken, null);
  await drive.connect({ accountId: 'account-123' });
  assert.equal(drive.connected, true); assert.equal(drive.client.request.hint, 'account-123');
  drive.disconnect(); assert.equal(drive.accessToken, null);
});
test('failed account verification cannot enable Drive access', async t => {
  mockGoogle(t);
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network interrupted'); });
  const drive = new DriveBackup(clientId); await drive.prepare();
  await assert.rejects(() => drive.connect({ accountId: 'account-123' }), /Check your connection/);
  assert.equal(drive.connected, false); assert.equal(drive.accessToken, null);
});
test('unconfigured Google sign-in needs no external library', async () => {
  await assert.rejects(() => new GoogleSignIn('', () => {}, () => {}).prepare(), /not configured/);
  await assert.rejects(() => new DriveBackup('').prepare(), /not configured/);
});

test('last performance orders actual completion times across timezone offsets', () => {
  const older = session([1]), newer = session([1]);
  older.finishedAt = '2026-10-10T01:00:00+07:00';
  newer.finishedAt = '2026-10-09T20:00:00Z';
  assert.equal(lastPerformance([older, newer], 'seed-bench-press').session.id, newer.id);
});

test('backup rejects blank completed weights and normalizes numeric records', () => {
  const malformed = backup(); malformed.sessions[0].entries[0].sets[0].weight = '   ';
  assert.throws(() => validateBackup(malformed));
  const value = backup(); value.sessions[0].entries[0].sets[0].weight = '42.5';
  value.sessions[0].entries[0].sets[0].reps = '10';
  const restored = validateBackup(value);
  assert.equal(restored.sessions[0].entries[0].sets[0].weight, 42.5);
  assert.equal(restored.sessions[0].entries[0].sets[0].reps, 10);
});
