import { validateSet } from './model.js';

// Retain actual sets: weight and reps in a plotted record always come from
// the same set. Nothing is estimated or written back to workout history.
export function exercisePerformances(sessions) {
  const performances=[];
  for(const session of sessions) {
    if(session.status!=='completed' || !Number.isFinite(Date.parse(session.finishedAt)))continue;
    for(const entry of session.entries || []) {
      const sets=[];
      for(const set of entry.sets || []) {
        if(set.completed!==true)continue;
        try {sets.push(validateSet(set));} catch { /* Invalid historical inputs cannot become chart points. */ }
      }
      if(!sets.length)continue;
      performances.push({exerciseId:entry.exerciseId,exerciseName:entry.exerciseName,sessionId:session.id,
        finishedAt:session.finishedAt,routineName:session.routineName,sets});
    }
  }
  return performances.sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt) || a.sessionId.localeCompare(b.sessionId));
}

export function strengthProgress(sessions,exercises,state={}) {
  const performances=exercisePerformances(sessions),byExercise=new Map();
  for(const performance of performances)byExercise.set(performance.exerciseId,performance);
  const choices=[...byExercise].map(([id,latest])=>{
    const exercise=exercises.find(item=>item.id===id);
    return {id,name:exercise?.name || latest.exerciseName,archived:Boolean(exercise?.archived)};
  }).sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const retained=byExercise.has(state.exerciseId);
  const exerciseId=retained ? state.exerciseId : performances.at(-1)?.exerciseId || '';
  const matching=performances.filter(item=>item.exerciseId===exerciseId);
  const loads=[...new Set(matching.flatMap(item=>item.sets.map(set=>set.weight)))].sort((a,b)=>a-b);
  const metric=retained && ['weight','reps'].includes(state.metric) ? state.metric : loads.length===1 && loads[0]===0 ? 'reps' : 'weight';
  const latestLoads=matching.at(-1)?.sets.map(set=>set.weight) || [];
  const load=retained && loads.includes(state.load) ? state.load : latestLoads.length ? Math.max(...latestLoads) : null;
  const series=matching.flatMap(performance=>{
    const candidates=performance.sets.filter(set=>metric==='weight' || set.weight===load)
      .sort((a,b)=>b.weight-a.weight || b.reps-a.reps || a.position-b.position || String(a.id).localeCompare(String(b.id)));
    return candidates.length ? [{...performance,set:candidates[0]}] : [];
  });
  return {choices,exerciseId,metric,load,loads,series};
}
