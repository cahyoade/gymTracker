import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendProgression } from '../js/progression.js';

const asOf = Date.parse('2026-10-15T12:00:00Z');
const entry = () => ({ exerciseId:'bench', plannedSets:3, repMin:8, repMax:12 });
function session(id, reps=[12,12,12], weights=[50,50,50], overrides={}) {
  const finishedAt = id === 'a' ? '2026-10-10T12:00:00Z' : '2026-10-12T12:00:00Z';
  return { id, status:'completed', routineName:`Routine ${id}`, finishedAt, entries:[{ ...entry(), sets:reps.map((reps,i)=>({position:i+1,weight:weights[i],reps,completed:true})) }], ...overrides };
}
const run = (sessions=[], options={}) => recommendProgression({sessions, entry:entry(), asOf, ...options});

test('no history, drafts, excluded IDs, future sessions and unperformed exercises cannot establish readiness', () => {
  assert.equal(run().kind,'baseline');
  assert.equal(run([session('a',undefined,undefined,{status:'draft'})]).kind,'baseline');
  assert.equal(run([session('a')],{excludeId:'a'}).kind,'baseline');
  assert.equal(run([session('a',undefined,undefined,{finishedAt:'2027-01-01T00:00:00Z'})]).kind,'baseline');
  const skipped=session('a'); skipped.entries[0].sets.forEach(set=>set.completed=false);
  assert.equal(run([skipped]).kind,'baseline');
});
test('two completed exposures at the ceiling allow a small equipment increase across routines', () => {
  const sessions=[session('b'),session('a')], before=structuredClone(sessions);
  const result=run(sessions);
  assert.equal(result.kind,'load'); assert.equal(result.increasePercent,5);
  assert.deepEqual(result.targets.map(set=>[set.weight,set.reps]),[[52.5,8],[52.5,8],[52.5,8]]);
  assert.deepEqual(result.evidence.map(item=>item.sessionId),['b','a']);
  assert.deepEqual(sessions,before);
});
test('first success needs confirmation and increased load resets readiness', () => {
  assert.equal(run([session('a')]).kind,'confirm');
  assert.equal(run([session('a'),session('b',[12,12,12],[52.5,52.5,52.5])]).kind,'confirm');
});
test('rep progression adds only one total rep and preserves per-set loading', () => {
  const result=run([session('a',[12,10,8],[50,47.5,45])]);
  assert.equal(result.kind,'reps');
  assert.deepEqual(result.targets.map(set=>[set.weight,set.reps]),[[50,12],[47.5,11],[45,8]]);
});
test('one missed minimum holds load; repeated misses request a recovery/load review', () => {
  assert.equal(run([session('a',[8,8,7])]).title,'Hold the load for now');
  assert.equal(run([session('a',[8,8,7]),session('b',[8,7,6])]).title,'Review the load and recovery');
  assert.deepEqual(run([session('a',[8,8,7])]).targets,[]);
});
test('incomplete sessions and changed plans block load increases instead of cherry-picking older success', () => {
  for(const alter of [
    item=>item.entries[0].sets.pop(),
    item=>item.entries[0].sets[1].completed=false,
    item=>item.entries[0].repMax=15,
    item=>item.entries[0].repMin=6,
    item=>item.entries[0].plannedSets=4,
    item=>item.entries[0].sets[1].position=4,
    item=>item.entries[0].sets.push({position:4,weight:50,reps:12,completed:true})
  ]) {
    const latest=session('b'); alter(latest);
    assert.equal(run([session('a'),latest]).kind,'incomplete');
  }
  const active={...entry(),sets:[{position:1},{position:2}]};
  assert.equal(run([session('a'),session('b')],{entry:active}).kind,'incomplete');
});
test('bodyweight and mixed-load ceilings never produce a calculated increase', () => {
  assert.equal(run([session('a',undefined,[0,0,0]),session('b',undefined,[0,0,0])]).kind,'bodyweight');
  assert.equal(run([session('a',undefined,[50,45,40]),session('b',undefined,[50,45,40])]).kind,'mixed');
  assert.equal(run([session('a',[8,9,10],[0,0,0])]).kind,'reps');
});
test('equipment increments above 10 percent are withheld, while microloads and exact 10 percent work', () => {
  const sessions=[session('a'),session('b')];
  assert.equal(run(sessions,{increment:5}).kind,'load');
  assert.equal(run(sessions,{increment:5.01}).kind,'increment');
  assert.equal(run(sessions,{increment:.25}).targets[0].weight,50.25);
  for(const increment of [NaN,Infinity,0,-1,.001,'2.5',1001]) assert.equal(run(sessions,{increment}).kind,'increment');
});
test('old history and old confirmations reset readiness, without prescribing a deload', () => {
  assert.equal(run([session('a')],{asOf:asOf+40*86400000}).kind,'return');
  const old=session('a',undefined,undefined,{finishedAt:'2026-08-01T12:00:00Z'});
  assert.equal(run([old,session('b')]).kind,'confirm');
});
test('corrections, deletions and JSON round trips recalculate advice without stored recommendations', () => {
  const sessions=[session('a'),session('b')];
  assert.deepEqual(run(JSON.parse(JSON.stringify(sessions))),run(sessions));
  assert.equal(run(sessions.slice(1)).kind,'confirm');
  sessions[0].entries[0].sets[2].reps=10;
  assert.equal(run(sessions).kind,'confirm');
});
test('exercise identity, numeric imported records and actual timestamps determine comparisons', () => {
  const a=session('a'), b=session('b');
  b.entries[0].sets.forEach(set=>{set.weight='50';set.reps='12';});
  assert.equal(run([a,b]).kind,'load');
  b.entries[0].exerciseId='another-exercise';assert.equal(run([a,b]).kind,'confirm');
  const sameInstant=session('b',undefined,undefined,{finishedAt:'2026-10-10T14:00:00+02:00'});
  assert.equal(run([a,sameInstant]).kind,'confirm');
});
test('malformed completed sets cannot trigger heavier suggestions', () => {
  for(const weight of ['',null,-1,Infinity,'bad']) {
    const b=session('b'); b.entries[0].sets[0].weight=weight;
    assert.equal(run([session('a'),b]).kind,'incomplete');
  }
});
