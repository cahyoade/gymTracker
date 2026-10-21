import test from 'node:test';
import assert from 'node:assert/strict';
import { exercisePerformances, strengthProgress } from '../js/strength.js';
import { strengthView, strengthChart } from '../js/strength-progress-ui.js';
const set=(weight,reps,position=1,completed=true)=>({id:`set-${position}`,weight,reps,position,completed});
const session=(id,finishedAt,sets,exerciseId='bench',routineName='Upper body')=>({id,status:'completed',finishedAt,routineName,entries:[{exerciseId,exerciseName:'Bench press',sets}]});
const exercises=[{id:'bench',name:'Bench press',archived:false},{id:'pull-up',name:'Pull-up',archived:false}];
const history=[session('a','2026-10-01T08:00:00Z',[set(40,10),set(35,15,2)]),session('b','2026-10-08T08:00:00Z',[set(45,8),set(40,9,2)],'bench','Full body'),session('c','2026-10-15T08:00:00Z',[set(50,6),set(45,10,2)])];

test('strength uses completed valid sets and preserves weight/reps from one actual set',()=>{
  const sessions=[...history,session('bad','2026-10-16T08:00:00Z',[set('',8),set(null,5,2),set(false,5,3),set(Infinity,5,4),set(90,1.5,5),set(999,20,6,false)]),{...session('draft','2026-10-17T08:00:00Z',[set(999,50)]),status:'draft'},session('invalid-date','broken',[set(90,10)])];
  const original=structuredClone(sessions),result=strengthProgress(sessions,exercises);
  assert.deepEqual(result.series.map(item=>[item.set.weight,item.set.reps]),[[40,10],[45,8],[50,6]]);
  assert.equal(result.series[1].routineName,'Full body');assert.deepEqual(sessions,original);
});
test('heaviest-set ties use reps, then position, with one point per completed exposure',()=>{
  const result=strengthProgress([session('tie','2026-10-18T08:00:00Z',[set(60,5),set(60,8,3),set(60,8,2),set(40,30,4)])],exercises);
  assert.equal(result.series.length,1);assert.equal(result.series[0].set.position,2);
  assert.deepEqual([result.series[0].set.weight,result.series[0].set.reps],[60,8]);
});
test('fixed-weight reps exclude unmatched sessions and take the best single set, not total reps',()=>{
  const result=strengthProgress(history,exercises,{exerciseId:'bench',metric:'reps',load:45});
  assert.deepEqual(result.series.map(item=>[item.sessionId,item.set.reps]),[['b',8],['c',10]]);
  const html=strengthView(result);assert.match(html,/Most reps in one completed set at 45 kg/);assert.match(html,/\+2 reps/);
});
test('fractional loads remain distinguishable in selectors and exact set labels',()=>{
  const result=strengthProgress([session('fractional','2026-10-18T08:00:00Z',[set(.125,8),set(.126,9,2)])],exercises,{exerciseId:'bench',metric:'reps',load:.125});
  const html=strengthView(result);
  assert.match(html,/0\.125 kg × 8 reps/);assert.match(html,/0\.126 kg/);
});
test('bodyweight zero defaults to reps and remains separate from positive loaded sets',()=>{
  const sessions=[session('a','2026-10-01T08:00:00Z',[set('0','8')],'pull-up'),session('b','2026-10-02T08:00:00Z',[set(0,12)],'pull-up')];
  const result=strengthProgress(sessions,exercises);
  assert.equal(result.exerciseId,'pull-up');assert.equal(result.metric,'reps');assert.equal(result.load,0);
  assert.deepEqual(result.series.map(item=>item.set.reps),[8,12]);
  assert.match(strengthView(result),/body weight is not added/);
});
test('chronology uses completion instants, while renames/archives preserve exercise identity',()=>{
  const sessions=[session('a','2026-10-18T10:00:00+07:00',[set(40,8)]),session('b','2026-10-18T04:00:00Z',[set(45,6)])];
  const result=strengthProgress(sessions,[{id:'bench',name:'My archived bench',archived:true}]);
  assert.deepEqual(result.series.map(item=>item.sessionId),['a','b']);
  assert.equal(result.choices[0].name,'My archived bench');assert.match(strengthView(result),/My archived bench \(archived\)/);
  assert.equal(strengthProgress(sessions,[]).choices[0].name,'Bench press');
});
test('corrections, deletes and a history round trip derive new results without stored summaries',()=>{
  const corrected=structuredClone(history);corrected[2].entries[0].sets[0]=set(42.5,11);
  assert.equal(strengthProgress(corrected,exercises).series.at(-1).set.weight,45);
  corrected.pop();assert.equal(strengthProgress(corrected,exercises).series.at(-1).set.reps,8);
  assert.deepEqual(strengthProgress(JSON.parse(JSON.stringify(history)),exercises),strengthProgress(history,exercises));
  assert.equal(exercisePerformances([]).length,0);assert.match(strengthView(strengthProgress([],exercises)),/Complete a set in a workout/);
});
test('missing selections or weights recover to available history without mixing exercises',()=>{
  const sessions=[...history,session('pull','2026-10-18T08:00:00Z',[set(0,12)],'pull-up')];
  const removed=strengthProgress(sessions,exercises,{exerciseId:'deleted',metric:'weight',load:900});
  assert.equal(removed.exerciseId,'pull-up');assert.equal(removed.metric,'reps');
  const noLoad=strengthProgress(history,exercises,{exerciseId:'bench',metric:'reps',load:999});
  assert.equal(noLoad.load,50);assert.equal(noLoad.series.length,1);
});
test('bounded charts and tables keep exact sets, escape snapshots, and handle flat or coincident dates',()=>{
  const sessions=Array.from({length:50},(_,index)=>session(`s${index}`,'2026-10-18T08:00:00Z',[set(40,8)],'bench','<script>unsafe</script>'));
  const result=strengthProgress(sessions,exercises),html=strengthView(result);
  assert.equal((html.match(/<circle /g)||[]).length,30);assert.equal((html.match(/<time /g)||[]).length,30);
  assert.ok(!/NaN|Infinity|<script>/.test(html));assert.match(html,/&lt;script&gt;/);
  for(const value of [0,42.5,Number.MAX_VALUE]) {
    const series=strengthProgress([session('a','2026-10-18T08:00:00Z',[set(value,8)])],exercises).series;
    const chart=strengthChart(series,'weight',value);
    assert.ok(!/NaN|Infinity/.test(chart));assert.equal((chart.match(/<circle /g)||[]).length,1);
  }
});
