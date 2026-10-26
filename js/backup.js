import { SCHEMA_VERSION, validateSet, validateRoutine, id } from './model.js';
import { loadGoogleLibrary } from './google.js';
import { validateMeasurement } from './measurements.js';
import { validateNutrition } from './nutrition.js';
import { SEED_FOODS } from './food-seeds.js';

const check = (condition, message) => { if (!condition) throw new Error(`Invalid backup: ${message}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 120) => typeof value === 'string' && value.length > 0 && value.length <= max && value.trim().length > 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
function records(value, label) {
  check(Array.isArray(value) && value.length <= 100000, `${label} must be a list.`);
  const ids = new Set();
  for (const item of value) {
    check(object(item) && text(item.id, 100) && !ids.has(item.id), `${label} has a missing or duplicate ID.`);
    ids.add(item.id);
  }
  return ids;
}

export function validateBackup(input) {
  const backup = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  check(object(backup), 'expected a JSON object.');
  check([1, 2, SCHEMA_VERSION].includes(backup.schemaVersion), 'this file uses an unsupported format version.');
  check(date(backup.exportedAt), 'missing export date.');
  const exerciseIds = records(backup.exercises, 'exercises');
  records(backup.routines, 'routines');
  records(backup.sessions, 'sessions');
  check(object(backup.workoutPreferences) && backup.workoutPreferences.unit === 'kg', 'expected kilograms as the weight unit.');
  for (const exercise of backup.exercises) {
    check(text(exercise.name) && typeof exercise.archived === 'boolean' && text(exercise.category, 60), 'an exercise has invalid details.');
    check(exercise.catalogId === undefined || (typeof exercise.catalogId==='string' && /^\d{4}$/.test(exercise.catalogId)), 'an exercise has an invalid library reference.');
  }
  for (const routine of backup.routines) {
    check(text(routine.name) && Array.isArray(routine.entries) && routine.entries.length <= 100 && date(routine.updatedAt), 'a routine has invalid details.');
    check(routine.entries.every(entry => object(entry)), 'a routine contains invalid exercises.');
    validateRoutine(routine, backup.exercises);
  }
  let drafts = 0;
  for (const session of backup.sessions) {
    check(['draft', 'completed'].includes(session.status), 'invalid session status.');
    if (session.status === 'draft') drafts++;
    check(text(session.routineName) && text(session.routineId, 100), 'a session has no routine snapshot.');
    // Deleted routines are allowed: session snapshots remain usable independently.
    check(date(session.startedAt) && date(session.updatedAt), 'a session has invalid dates.');
    check(session.status === 'completed' ? date(session.finishedAt) : session.finishedAt === null, 'invalid completion date.');
    check(typeof session.notes === 'string' && session.notes.length <= 10000, 'invalid session notes.');
    check(Array.isArray(session.entries) && session.entries.length > 0 && session.entries.length <= 100, 'invalid session exercises.');
    const usedExercises = new Set();
    let completed = 0;
    for (const entry of session.entries) {
      check(object(entry) && exerciseIds.has(entry.exerciseId) && !usedExercises.has(entry.exerciseId) && text(entry.exerciseName), 'a session references a missing or duplicate exercise.');
      usedExercises.add(entry.exerciseId);
      check(Number.isInteger(entry.plannedSets) && entry.plannedSets >= 1 && entry.plannedSets <= 50 && Number.isInteger(entry.repMin) && entry.repMin >= 1 && Number.isInteger(entry.repMax) && entry.repMax >= entry.repMin && entry.repMax <= 999, 'invalid session targets.');
      records(entry.sets, 'sets');
      check(entry.sets.length > 0 && entry.sets.length <= 200, 'invalid set count.');
      const positions = new Set();
      for (const set of entry.sets) {
        check(Number.isInteger(set.position) && set.position > 0 && set.position <= 200 && !positions.has(set.position), 'invalid or duplicate set position.');
        positions.add(set.position);
        check(typeof set.completed === 'boolean', 'invalid set completion marker.');
        if (set.completed) {
          check(typeof set.weight === 'number' || typeof set.weight === 'string', 'invalid weight.');
          check(typeof set.reps === 'number' || typeof set.reps === 'string', 'invalid reps.');
          Object.assign(set, validateSet(set));
          completed++;
        } else {
          check(session.status === 'draft', 'completed sessions cannot contain unfinished sets.');
          check([set.weight, set.reps].every(value => (typeof value === 'string' && value.length <= 30) || (typeof value === 'number' && Number.isFinite(value))), 'invalid draft inputs.');
        }
      }
    }
    check(session.status === 'draft' || completed > 0, 'a completed session has no completed sets.');
  }
  check(drafts <= 1, 'there can only be one active workout.');
  const bodyMeasurements = backup.schemaVersion === 1 ? (backup.bodyMeasurements ?? []) : backup.bodyMeasurements;
  records(bodyMeasurements, 'body measurements');
  const measurementDates = new Set();
  for (const record of bodyMeasurements) {
    check(date(record.updatedAt), 'a body measurement has an invalid update date.');
    check(['weight', 'muscleMass', 'bodyFat'].every(key => record[key] === null || typeof record[key] === 'number'), 'a body measurement has invalid values.');
    Object.assign(record, validateMeasurement(record));
    check(!measurementDates.has(record.date), 'body measurements contain duplicate dates.');
    measurementDates.add(record.date);
  }
  const nutrition=validateNutrition(backup,{legacy:backup.schemaVersion<3});
  if(backup.schemaVersion<3)nutrition.foods=structuredClone(SEED_FOODS);
  return {
    schemaVersion: SCHEMA_VERSION, exportedAt: backup.exportedAt,
    exercises: backup.exercises, routines: backup.routines, sessions: backup.sessions,
    bodyMeasurements,
    ...nutrition,
    workoutPreferences: { unit: 'kg' }
  };
}

export function downloadBackup(snapshot) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `form-backup-${snapshot.exportedAt.replaceAll(':', '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PREFIX = 'form-backup-';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export class DriveBackup {
  constructor(clientId) { this.clientId = clientId; this.accessToken = null; this.expiresAt = 0; }
  get connected() { return Boolean(this.accessToken && Date.now() < this.expiresAt); }
  disconnect() { this.accessToken = null; this.expiresAt = 0; }
  async prepare() {
    if (!this.clientId) throw new Error('Google sign-in is not configured for this app yet.');
    if (this.client) return;
    if (this.preparing) return this.preparing;
    this.preparing = (async () => {
      await loadGoogleLibrary();
      this.client = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId, scope: `openid ${SCOPE}`, callback: () => {}
      });
    })();
    try { await this.preparing; } finally { this.preparing = null; }
  }
  // Called directly from the Enable Drive backup button to preserve the user gesture.
  connect({ accountId } = {}) {
    if (!this.client) return Promise.reject(new Error('Google connection is still loading. Try again in a moment.'));
    return new Promise((resolve, reject) => {
      this.client.callback = async response => {
        if (response.error || !response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE, 'openid')) {
          this.disconnect(); reject(new Error('Drive access was not granted. Your local workouts are safe.')); return;
        }
        if (accountId) {
          try {
            const identity = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` }, signal: AbortSignal.timeout(15000)
            });
            if (!identity.ok) throw new Error('Could not confirm your Google account. Try again.');
            if ((await identity.json()).sub !== accountId) throw new Error('Choose the same Google account you used to sign in.');
          } catch (error) { this.disconnect(); reject(error instanceof TypeError ? new Error('Could not confirm your Google account. Check your connection and try again.') : error); return; }
        }
        this.accessToken = response.access_token;
        this.expiresAt = Date.now() + Math.max(0, Number(response.expires_in) - 30) * 1000;
        resolve();
      };
      this.client.error_callback = () => reject(new Error('Google connection was cancelled or the popup was blocked.'));
      this.client.requestAccessToken({ prompt: '', ...(accountId ? { hint: accountId } : {}) });
    });
  }
  async api(path, options = {}, upload = false) {
    if (!this.connected) { this.disconnect(); throw new Error('Reconnect Google Drive to continue.'); }
    const base = upload ? 'https://www.googleapis.com/upload/drive/v3/' : 'https://www.googleapis.com/drive/v3/';
    let response;
    try { response = await fetch(base + path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Drive could not be reached. Your local data is unchanged; try again when connected.'); }
    if (response.status === 401) { this.disconnect(); throw new Error('Google authorization expired. Reconnect to continue.'); }
    if (!response.ok) throw new Error(`Drive request failed (${response.status}). Your local data is unchanged.`);
    if (response.status === 204) return null;
    return response.json();
  }
  async list() {
    const params = new URLSearchParams({
      spaces: 'appDataFolder', q: `trashed = false and appProperties has { key='app' and value='form-training-v1' }`,
      fields: 'nextPageToken,files(id,name,createdTime,size)', orderBy: 'createdTime desc', pageSize: '100'
    });
    const files = [];
    let result;
    do {
      result = await this.api(`files?${params}`);
      files.push(...(result.files || []).filter(file => file.name.startsWith(PREFIX)));
      if (result.nextPageToken) params.set('pageToken', result.nextPageToken);
    } while (result.nextPageToken);
    return files;
  }
  async upload(snapshot) {
    const boundary = `form_${id()}`;
    const metadata = { name: `${PREFIX}${snapshot.exportedAt}.json`, parents: ['appDataFolder'], appProperties: { app: 'form-training-v1' } };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--`;
    const uploaded = await this.api('files?uploadType=multipart&fields=id,name,createdTime', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, true);
    // Verify the persisted content before announcing success or removing any older backup.
    const verified = await this.read(uploaded.id);
    if (JSON.stringify(verified) !== JSON.stringify(validateBackup(snapshot))) throw new Error('The uploaded backup could not be verified. Older backups were kept.');
    let cleanupWarning = false;
    try {
      const files = await this.list();
      for (const file of files.slice(5)) await this.api(`files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
    } catch { cleanupWarning = true; }
    return { ...uploaded, cleanupWarning };
  }
  async read(fileId,{raw=false}={}) {
    const source=await this.api(`files/${encodeURIComponent(fileId)}?alt=media`);
    const normalized=validateBackup(source);
    // Restore previews need the original version to explain legacy replacement.
    return raw?source:normalized;
  }
}
