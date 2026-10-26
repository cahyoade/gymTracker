export const SCHEMA_VERSION = 3;
export const SEED_EXERCISES = [
  ['Squat', 'Legs'], ['Bench press', 'Chest'], ['Deadlift', 'Back'],
  ['Overhead press', 'Shoulders'], ['Row', 'Back'], ['Lat pulldown', 'Back'],
  ['Pull-up', 'Back'], ['Leg press', 'Legs'], ['Romanian deadlift', 'Legs'],
  ['Leg curl', 'Legs'], ['Biceps curl', 'Arms'], ['Triceps pushdown', 'Arms']
].map(([name, category]) => ({
  id: `seed-${name.toLowerCase().replaceAll(' ', '-')}`, name, category, archived: false
}));

export function id() {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  // getRandomValues is available on LAN HTTP previews; randomUUID requires a secure origin.
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const now = () => new Date().toISOString();

export function validateSet(set) {
  const numeric = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const weight = numeric(set.weight) ? Number(set.weight) : NaN;
  const reps = numeric(set.reps) ? Number(set.reps) : NaN;
  if (!Number.isFinite(weight) || weight < 0) throw new Error('Enter a weight of 0 kg or more.');
  if (!Number.isSafeInteger(reps) || reps < 1) throw new Error('Enter a whole number of reps greater than zero.');
  return { ...set, weight, reps };
}

export function createDraft(routine, exercises) {
  const timestamp = now();
  return {
    id: id(), routineId: routine.id, routineName: routine.name, status: 'draft',
    startedAt: timestamp, finishedAt: null, updatedAt: timestamp, notes: '',
    entries: routine.entries.map(entry => ({
      exerciseId: entry.exerciseId,
      exerciseName: exercises.find(exercise => exercise.id === entry.exerciseId)?.name || 'Archived exercise',
      plannedSets: entry.setCount, repMin: entry.repMin, repMax: entry.repMax,
      sets: Array.from({ length: entry.setCount }, (_, i) => ({
        id: id(), position: i + 1, weight: '', reps: '', completed: false
      }))
    }))
  };
}

export function finishSession(session) {
  const entries = session.entries.map(entry => ({
    ...entry, sets: entry.sets.filter(set => set.completed).map(validateSet)
  })).filter(entry => entry.sets.length);
  if (!entries.length) throw new Error('Complete at least one set before saving this workout.');
  const timestamp = now();
  return { ...session, entries, status: 'completed', finishedAt: session.finishedAt || timestamp, updatedAt: timestamp };
}

export function lastPerformance(sessions, exerciseId, excludeId) {
  const candidates = sessions.filter(session => session.status === 'completed' && session.id !== excludeId)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt) || b.id.localeCompare(a.id));
  for (const session of candidates) {
    const entry = session.entries.find(item => item.exerciseId === exerciseId && item.sets.some(set => set.completed));
    if (entry) return { session, entry };
  }
  return null;
}

export function previousSet(performance, position) {
  return performance?.entry.sets.find(set => set.position === position && set.completed) || null;
}

export function sessionTotals(session) {
  const sets = session.entries.flatMap(entry => entry.sets.filter(set => set.completed));
  return { sets: sets.length, reps: sets.reduce((sum, set) => sum + Number(set.reps), 0), volume: sets.reduce((sum, set) => sum + Number(set.weight) * Number(set.reps), 0) };
}

export function validateRoutine(routine, exercises) {
  if (!routine.name.trim()) throw new Error('Give your routine a name.');
  if (!routine.entries.length) throw new Error('Add at least one exercise.');
  const unique = new Set();
  for (const entry of routine.entries) {
    if (!exercises.some(exercise => exercise.id === entry.exerciseId)) throw new Error('An exercise is missing from the collection.');
    if (unique.has(entry.exerciseId)) throw new Error('An exercise can only appear once in a routine.');
    unique.add(entry.exerciseId);
    if (!Number.isInteger(entry.setCount) || entry.setCount < 1 || entry.setCount > 50) throw new Error('Use between 1 and 50 planned sets.');
    if (!Number.isInteger(entry.repMin) || !Number.isInteger(entry.repMax) || entry.repMin < 1 || entry.repMax < entry.repMin || entry.repMax > 999) throw new Error('Use a valid rep range between 1 and 999.');
  }
  return routine;
}
