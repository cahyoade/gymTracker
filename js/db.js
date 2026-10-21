import { SEED_EXERCISES, SCHEMA_VERSION, now } from './model.js';
import { catalogExercise, findCatalogExercise } from './catalog.js';

const STORES = ['exercises', 'routines', 'sessions', 'metadata', 'bodyMeasurements'];
let opening;
let writeQueue = Promise.resolve();
const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error || new Error('Storage could not be written.'));
  tx.onabort = () => reject(tx.error || new Error('Storage transaction was cancelled.'));
});

export function openDB() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open('form-training', 2);
    req.onupgradeneeded = event => {
      const database = req.result;
      for (const name of STORES) if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
      const tx = req.transaction;
      const bodyStore = tx.objectStore('bodyMeasurements');
      if (!bodyStore.indexNames.contains('date')) bodyStore.createIndex('date', 'date', { unique:true });
      if (event.oldVersion === 0) {
        for (const exercise of SEED_EXERCISES) tx.objectStore('exercises').put(exercise);
        tx.objectStore('metadata').put({ id: 'preferences', unit: 'kg' });
        tx.objectStore('metadata').put({ id: 'state', revision: 0, backedUpRevision: null, lastDriveBackupAt: null, lastExportAt: null });
      }
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); opening = null; };
      resolve(req.result);
    };
    req.onerror = () => { opening = null; reject(req.error); };
    req.onblocked = () => { opening = null; reject(new Error('Close other Form tabs and reload to update the database.')); };
  });
  return opening;
}

export async function readData() {
  const database = await openDB();
  const tx = database.transaction(STORES, 'readonly');
  const completed = done(tx);
  const reads = STORES.map(store => request(tx.objectStore(store).getAll()));
  const [exercises, routines, sessions, metadata, bodyMeasurements] = await Promise.all(reads);
  await completed;
  return {
    exercises, routines, sessions, bodyMeasurements,
    preferences: metadata.find(item => item.id === 'preferences') || { id: 'preferences', unit: 'kg' },
    state: metadata.find(item => item.id === 'state'),
    recovery: metadata.find(item => item.id === 'recovery') || null
  };
}

function enqueue(operation) {
  const next = writeQueue.catch(() => {}).then(operation);
  writeQueue = next;
  return next;
}

export function mutate({ puts = [], deletes = [], countChange = true }) {
  const captured = structuredClone({ puts, deletes });
  return enqueue(async () => {
    const database = await openDB();
    const stores = [...new Set(['metadata', ...captured.puts.map(item => item.store), ...captured.deletes.map(item => item.store)])];
    const tx = database.transaction(stores, 'readwrite');
    const completed = done(tx);
    const metadata = tx.objectStore('metadata');
    const stateReq = metadata.get('state');
    stateReq.onsuccess = () => {
      try {
        for (const { store, value } of captured.puts) tx.objectStore(store).put(value);
        for (const { store, id } of captured.deletes) tx.objectStore(store).delete(id);
        if (countChange) metadata.put({ ...stateReq.result, revision: (stateReq.result?.revision || 0) + 1, changedAt: now() });
      } catch { try { tx.abort(); } catch { /* Already aborted. */ } }
    };
    await completed;
  });
}

export const put = (store, value) => mutate({ puts: [{ store, value }] });
export const remove = (store, id) => mutate({ deletes: [{ store, id }] });

// Resolve duplicates and restore archived records within the write transaction,
// so simultaneous imports in different tabs keep a single exercise and its history.
export function addCatalogExercise(item) {
  const incoming=structuredClone(item);
  return enqueue(async()=>{
    const database=await openDB(),tx=database.transaction(['exercises','metadata'],'readwrite');
    const completed=done(tx),store=tx.objectStore('exercises');
    let result;
    store.getAll().onsuccess=event=>{
      try {
        const existing=findCatalogExercise(event.target.result,incoming);
        result={exercise:existing || catalogExercise(incoming),added:!existing,restored:Boolean(existing?.archived)};
        if(existing && !existing.archived)return;
        if(existing)result.exercise={...existing,archived:false};
        store.put(result.exercise);
        const metadata=tx.objectStore('metadata');
        metadata.get('state').onsuccess=event=>metadata.put({...event.target.result,revision:(event.target.result?.revision || 0)+1,changedAt:now()});
      } catch {tx.abort();}
    };
    await completed;return result;
  });
}

export function snapshotFromData(data) {
  return {
    schemaVersion: SCHEMA_VERSION, exportedAt: now(),
    exercises: data.exercises, routines: data.routines, sessions: data.sessions,
    bodyMeasurements: data.bodyMeasurements || [],
    workoutPreferences: { unit: data.preferences.unit }
  };
}

export function markBackup(revision, exportedAt, kind) {
  return enqueue(async () => {
    const database = await openDB();
    const tx = database.transaction('metadata', 'readwrite');
    const completed = done(tx);
    const store = tx.objectStore('metadata');
    const req = store.get('state');
    req.onsuccess = () => store.put({
      ...req.result,
      ...(kind === 'drive' ? { backedUpRevision: revision, lastDriveBackupAt: exportedAt } : { lastExportAt: exportedAt })
    });
    await completed;
  });
}

// The recovery copy and replacement live in one transaction: both commit, or neither does.
export function replaceData(snapshot) {
  const incoming = structuredClone(snapshot);
  return enqueue(async () => {
    const database = await openDB();
    const tx = database.transaction(STORES, 'readwrite');
    const completed = done(tx);
    const current = {};
    let remaining = STORES.length;
    for (const storeName of STORES) {
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        current[storeName] = req.result;
        if (--remaining !== 0) return;
        try {
          const oldState = current.metadata.find(item => item.id === 'state');
          const oldPreferences = current.metadata.find(item => item.id === 'preferences');
          const recovery = {
            schemaVersion: SCHEMA_VERSION, exportedAt: now(), exercises: current.exercises,
            routines: current.routines, sessions: current.sessions,
            bodyMeasurements: current.bodyMeasurements,
            workoutPreferences: { unit: oldPreferences?.unit || 'kg' }
          };
          for (const storeName of ['exercises', 'routines', 'sessions', 'bodyMeasurements']) {
            const store = tx.objectStore(storeName);
            store.clear();
            for (const value of incoming[storeName]) store.put(value);
          }
          const metadata = tx.objectStore('metadata');
          metadata.put({ id: 'recovery', snapshot: recovery, restoredAt: now() });
          metadata.put({ id: 'preferences', ...incoming.workoutPreferences });
          metadata.put({ id: 'state', revision: (oldState?.revision || 0) + 1, backedUpRevision: null, lastDriveBackupAt: null, lastExportAt: null, changedAt: now() });
        } catch { try { tx.abort(); } catch { /* Already aborted. */ } }
      };
    }
    await completed;
  });
}
