import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalRecords } from '../js/records.js';
import { validateBackup } from '../js/backup.js';
import { SEED_EXERCISES } from '../js/model.js';
const exerciseId = 'seed-bench-press';
function session(id, finishedAt, sets, overrides = {}) {
  return { id, status: 'completed', startedAt: finishedAt, finishedAt, updatedAt: finishedAt,
    routineId: `routine-${id}`, routineName: `Routine ${id}`, notes: '', entries: [{ exerciseId,
      exerciseName: 'Bench press', plannedSets: 3, repMin: 8, repMax: 12,
      sets: sets.map(([weight, reps, completed = true], i) => ({ id: `${id}-set-${i}`, position: i + 1, weight, reps, completed })) }], ...overrides };
}
const older = () => session('a', '2026-10-10T01:00:00Z', [[40, 10], [50, 5]]);
const newer = () => session('b', '2026-10-11T01:00:00Z', [[40, 12], [55, 3], [55, 4]]);
test('records share exercise IDs across routines and retain best reps at every weight', () => {
  const input = [newer(), older()], before = structuredClone(input);
  const index = buildPersonalRecords(input), records = index.byExercise.get(exerciseId);
  assert.deepEqual(input, before);
  assert.equal(records.bestWeight.weight, 55); assert.equal(records.bestWeight.reps, 4);
  assert.equal(records.bestWeight.setId, 'b-set-2');
  assert.equal(records.repsByWeight.get(40).reps, 12);
  assert.equal(records.repsByWeight.get(50).reps, 5);
  assert.deepEqual(index.bySession.get('b').map(item => item.kind), ['weight', 'reps']);
  assert.deepEqual(index.bySession.get('a'), []);
});
test('drafts and unfinished sets do not establish PRs', () => {
  const draft = session('draft', '2026-10-12T01:00:00Z', [[999, 100]], { status: 'draft' });
  const skipped = session('skip', '2026-10-12T01:00:00Z', [[999, 100, false]]);
  const records = buildPersonalRecords([older(), draft, skipped]).byExercise.get(exerciseId);
  assert.equal(records.bestWeight.weight, 50); assert.equal(records.repsByWeight.has(999), false);
});
test('ties retain the original achievement and do not award duplicate PRs', () => {
  const tied = session('c', '2026-10-12T01:00:00Z', [[40, 10], [50, 5]]);
  const index = buildPersonalRecords([older(), tied]);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.sessionId, 'a');
  assert.deepEqual(index.bySession.get('c'), []);
});
test('bodyweight rep improvements are records without inventing heavier weights', () => {
  const first = session('a', '2026-10-10T01:00:00Z', [[0, 8]]);
  const second = session('b', '2026-10-11T01:00:00Z', [[0, 12]]);
  const index = buildPersonalRecords([first, second]);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.reps, 12);
  assert.deepEqual(index.bySession.get('b').map(item => item.kind), ['reps']);
});
test('lower-weight higher reps do not replace the heaviest set or compare unlike loads', () => {
  const second = session('b', '2026-10-11T01:00:00Z', [[20, 50], [50, 6]]);
  const index = buildPersonalRecords([older(), second]);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.weight, 50);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.reps, 6);
  assert.equal(index.bySession.get('b').length, 1);
  assert.equal(index.bySession.get('b')[0].record.weight, 50);
});
test('deletion and corrections recalculate both all-time records and historical badges', () => {
  assert.equal(buildPersonalRecords([older()]).byExercise.get(exerciseId).bestWeight.weight, 50);
  const correction = newer(); correction.entries[0].sets[1].weight = 45; correction.entries[0].sets[2].weight = 45;
  const index = buildPersonalRecords([older(), correction]);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.weight, 50);
  assert.deepEqual(index.bySession.get('b').map(item => item.kind), ['reps']);
  const changedBaseline = older(); changedBaseline.entries[0].sets[0].reps = 20;
  assert.deepEqual(buildPersonalRecords([changedBaseline, newer()]).bySession.get('b').map(item => item.kind), ['weight']);
});
test('timezone timestamps, numeric strings and fractional weights compare by actual values', () => {
  const first = session('a', '2026-10-10T01:00:00+07:00', [['42.5', '8']]);
  const second = session('b', '2026-10-09T20:00:00Z', [[42.5, 9]]);
  const index = buildPersonalRecords([second, first]);
  assert.equal(index.byExercise.get(exerciseId).bestWeight.sessionId, 'b');
  assert.equal(index.bySession.get('b')[0].kind, 'reps');
});
test('backup round trips and renamed/archived exercises preserve derived PRs without a schema change', () => {
  const exercises = structuredClone(SEED_EXERCISES);
  Object.assign(exercises.find(item => item.id === exerciseId), { name: 'Renamed bench', archived: true });
  const backup = validateBackup(JSON.stringify({ schemaVersion: 1, exportedAt: '2026-10-13T01:00:00Z', exercises,
    routines: [], sessions: [older(), newer()], workoutPreferences: { unit: 'kg' } }));
  assert.equal(buildPersonalRecords(backup.sessions).byExercise.get(exerciseId).bestWeight.weight, 55);
  assert.equal(backup.sessions[1].entries[0].exerciseName, 'Bench press');
});
