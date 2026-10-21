// Records are derived from completed history, so edits, deletes and restores
// cannot leave stale achievements behind. Nothing extra is stored in backups.
export function buildPersonalRecords(sessions) {
  const byExercise = new Map(), bySession = new Map();
  const completed = sessions.filter(session => session.status === 'completed')
    .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt) || a.id.localeCompare(b.id));
  for (const session of completed) {
    const achievements = [];
    for (const entry of session.entries) {
      const current = { bestWeight: null, repsByWeight: new Map() };
      for (const set of [...entry.sets].sort((a, b) => a.position - b.position)) {
        const weight = Number(set.weight), reps = Number(set.reps);
        if (!set.completed || !Number.isFinite(weight) || weight < 0 || !Number.isSafeInteger(reps) || reps < 1) continue;
        const record = { weight, reps, sessionId: session.id, setId: set.id, position: set.position,
          finishedAt: session.finishedAt, routineName: session.routineName, exerciseName: entry.exerciseName };
        if (betterSet(record, current.bestWeight)) current.bestWeight = record;
        if (!current.repsByWeight.has(weight) || reps > current.repsByWeight.get(weight).reps) current.repsByWeight.set(weight, record);
      }
      if (!current.bestWeight) continue;
      const previous = byExercise.get(entry.exerciseId) || { bestWeight: null, repsByWeight: new Map() };
      // First-ever performances establish a baseline. A new weight earns one
      // weight PR; a rep PR requires beating an existing record at that weight.
      if (previous.bestWeight && current.bestWeight.weight > previous.bestWeight.weight) {
        achievements.push({ kind: 'weight', exerciseId: entry.exerciseId, exerciseName: entry.exerciseName,
          record: current.bestWeight, previous: previous.bestWeight });
      }
      for (const [weight, record] of current.repsByWeight) {
        const old = previous.repsByWeight.get(weight);
        if (old && record.reps > old.reps) achievements.push({ kind: 'reps', exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName, record, previous: old });
        if (!old || record.reps > old.reps) previous.repsByWeight.set(weight, record);
      }
      if (betterSet(current.bestWeight, previous.bestWeight)) previous.bestWeight = current.bestWeight;
      byExercise.set(entry.exerciseId, previous);
    }
    bySession.set(session.id, achievements);
  }
  return { byExercise, bySession };
}

function betterSet(candidate, previous) {
  return !previous || candidate.weight > previous.weight ||
    (candidate.weight === previous.weight && candidate.reps > previous.reps);
}
