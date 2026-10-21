// Explainable hypertrophy guidance, derived from history without changing it.
// The decision rules are product heuristics, not a validated prediction model.
export const PROGRESSION_SOURCES = [
  { title: 'ACSM position stand (2026)', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/',
    summary: 'Progressive resistance training supports muscle growth. Higher weekly volume can help; training to failure is not consistently necessary. This app does not estimate muscle-group volume from exercise names.' },
  { title: 'Plotkin et al. (2022): load vs. repetition progression', url: 'https://pubmed.ncbi.nlm.nih.gov/36199287/',
    summary: 'An eight-week trial in 43 trained adults found that both load and repetition progression can support muscular adaptations. It does not validate this app’s exact decision rules.' },
  { title: 'ACSM progression guidance (2009; updated in 2026)', url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/',
    summary: 'The older guideline suggested a 2–10% load increase when the current workload could be exceeded by one or two reps. Form instead uses its own two-session, all-sets-at-the-ceiling rule and caps suggested jumps at 10%.' },
  { title: 'Refalo et al. (2024): failure vs. reps in reserve', url: 'https://pubmed.ncbi.nlm.nih.gov/38393985/',
    summary: 'An eight-week study found similar quadriceps growth with 1–2 reps in reserve and training to failure, with more acute fatigue at failure. Leaving a little in reserve is a useful option, not a guaranteed optimum.' }
];

const validSet = set => set.completed && ['number', 'string'].includes(typeof set.weight) && String(set.weight).trim() !== '' &&
  Number.isFinite(Number(set.weight)) && Number(set.weight) >= 0 &&
  Number.isSafeInteger(Number(set.reps)) && Number(set.reps) > 0;

export function recommendProgression({ sessions, entry, excludeId, increment = 2.5, asOf = Date.now() }) {
  const planned = entry.plannedSets ?? entry.setCount;
  const positions = entry.sets ? entry.sets.map(set => set.position).sort((a, b) => a - b) : Array.from({ length: planned }, (_, i) => i + 1);
  const result = (kind, title, reason, targets = []) => ({ kind, title, reason, targets, evidence: history.slice(0, 2).map(({ session, sets }) => ({
    sessionId: session.id, finishedAt: session.finishedAt, routineName: session.routineName,
    sets: sets.map(({ position, weight, reps }) => ({ position, weight: Number(weight), reps: Number(reps) }))
  })) });
  // Skip sessions in which this exercise was entirely unperformed. A partial
  // performance remains the latest exposure and blocks a load increase.
  const history = sessions.filter(session => session.status === 'completed' && session.id !== excludeId &&
    Number.isFinite(Date.parse(session.finishedAt)) && Date.parse(session.finishedAt) <= asOf)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt) || b.id.localeCompare(a.id))
    .map(session => ({ session, entry: session.entries.find(item => item.exerciseId === entry.exerciseId) }))
    .filter(item => item.entry?.sets.some(set => set.completed))
    .map(item => ({ ...item, sets: item.entry.sets.filter(validSet).sort((a, b) => a.position - b.position) }));
  const latest = history[0];
  if (!latest) return result('baseline', 'Build your starting point', 'Choose a manageable load for your planned rep range. Log a full session before using a numerical target.');
  if (asOf - Date.parse(latest.session.finishedAt) > 28 * 86400000) return result('return', 'Re-establish your baseline', 'Your last recorded exposure was over four weeks ago. Check your current capacity before chasing the old numbers.');
  const compatible = item => item && item.entry.plannedSets === planned && item.entry.repMin === entry.repMin &&
    item.entry.repMax === entry.repMax && item.sets.length === planned && positions.length === planned &&
    item.sets.every((set, i) => set.position === positions[i]);
  if (!compatible(latest)) return result('incomplete', 'Complete a comparable session', 'The latest performance has a different rep range, set plan, or missing sets. Keep the load manageable and complete the current plan before increasing it.');
  const repeat = latest.sets.map(set => ({ position: set.position, weight: Number(set.weight), reps: Math.min(entry.repMax, Math.max(entry.repMin, Number(set.reps))) }));
  if (latest.sets.some(set => Number(set.reps) < entry.repMin)) {
    const repeatedMiss = compatible(history[1]) && latest.sets.every((set, i) => Number(set.weight) === Number(history[1].sets[i].weight)) &&
      history[1].sets.some(set => Number(set.reps) < entry.repMin);
    return result('review', repeatedMiss ? 'Review the load and recovery' : 'Hold the load for now',
      repeatedMiss ? 'The last two comparable sessions missed the bottom of the rep range. Review rest, technique, recovery, and whether a lighter load would let you meet the target.' :
        'At least one completed set fell below the rep range. Try to meet the lower target with controlled reps before progressing. A single session does not establish a plateau.');
  }
  if (!latest.sets.every(set => Number(set.reps) >= entry.repMax)) {
    // One additional rep across the exercise, not an extra rep on every set.
    const target = repeat.find(set => set.reps < entry.repMax);
    target.reps++;
    return result('reps', 'Aim for one more total rep', 'Keep each set’s load. If form and effort allow, add one rep on the first set below the ceiling; match the other sets. This is a goal, not a requirement.', repeat);
  }
  if (latest.sets.some(set => Number(set.weight) === 0)) return result('bodyweight', 'Review your bodyweight progression', 'You reached the rep ceiling. Keep the movement controlled; consider a harder variation or external load when appropriate. Logged 0 kg does not describe bodyweight or assistance, so no kilogram increase is calculated.', repeat);
  if (!latest.sets.every(set => Number(set.weight) === Number(latest.sets[0].weight))) return result('mixed', 'Keep the per-set loading plan', 'You reached the ceiling with different weights across sets. Repeat the controlled performance or adjust your loading plan manually; Form does not combine warm-ups, back-off sets, or mixed loading into one weight recommendation.', repeat);
  const previous = history[1];
  const confirmed = compatible(previous) && latest.sets.every((set, i) => Number(set.weight) === Number(previous.sets[i].weight) && Number(previous.sets[i].reps) >= entry.repMax) &&
    Date.parse(latest.session.finishedAt) > Date.parse(previous.session.finishedAt) &&
    Date.parse(latest.session.finishedAt) - Date.parse(previous.session.finishedAt) <= 28 * 86400000;
  if (!confirmed) return result('confirm', 'Repeat the top of your range', 'All planned sets reached the rep ceiling. Confirm it at the same load in another comparable session before increasing the weight.', repeat);
  if (!Number.isFinite(increment) || increment < .01 || increment > 1000) return result('increment', 'Choose your available load increase', 'Enter an increment between 0.01 and 1000 kg that your equipment supports, in the same units you log.');
  const weight = Number(latest.sets[0].weight), next = Math.round((weight + increment) * 1000000) / 1000000;
  if (next <= weight || (next - weight) / weight > .100000001) return result('increment', 'Use a smaller load increase', 'Your selected equipment increment would exceed 10% of the current load. Use a smaller available increase, or keep practicing at this load.', repeat);
  return { ...result('load', 'Consider a small load increase', 'All planned sets reached the ceiling in two consecutive comparable exposures at the same load. If technique was controlled and effort felt manageable, try the available increase and return to the lower rep target.',
    repeat.map(set => ({ ...set, weight: next, reps: entry.repMin }))), increasePercent: (next - weight) / weight * 100 };
}
