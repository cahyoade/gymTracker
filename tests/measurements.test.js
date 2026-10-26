import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMeasurement, measurementSeries, measurementSummary } from '../js/measurements.js';
import { validateBackup } from '../js/backup.js';
import { bodyChart } from '../js/body-progress-ui.js';
const record = (overrides={}) => ({id:'body-a',date:'2026-10-16',weight:75.25,muscleMass:33.1,bodyFat:18.5,updatedAt:'2026-10-16T01:00:00Z',...overrides});
const backup = () => ({schemaVersion:2,exportedAt:'2026-10-16T01:00:00Z',exercises:[],routines:[],sessions:[],bodyMeasurements:[record()],workoutPreferences:{unit:'kg'}});

test('measurements accept decimal inputs and preserve absent readings as null',()=>{
  assert.deepEqual(validateMeasurement(record({weight:'75.25',muscleMass:'',bodyFat:undefined})),record({muscleMass:null,bodyFat:null}));
  assert.equal(validateMeasurement(record({weight:null,muscleMass:null,bodyFat:'0'})).bodyFat,0);
  assert.equal(validateMeasurement(record({bodyFat:100})).bodyFat,100);
});
test('measurement validation rejects empty, malformed dates, impossible pairs and invalid numbers',()=>{
  for(const change of [
    {weight:null,muscleMass:null,bodyFat:null}, {date:'2026-02-30'}, {date:'2025-02-29'}, {date:'bad'},
    {weight:0},{weight:-1},{weight:Infinity},{weight:1001},{weight:' '},{weight:true},
    {muscleMass:100},{muscleMass:-1},{muscleMass:NaN},{bodyFat:-1},{bodyFat:100.01},{bodyFat:'bad'}
  ]) assert.throws(()=>validateMeasurement(record(change)),JSON.stringify(change));
  assert.equal(validateMeasurement(record({date:'2024-02-29'})).date,'2024-02-29');
});
test('latest and change use each metric’s actual dated readings without interpreting direction',()=>{
  const records=[record({id:'b',date:'2026-10-16',weight:76,muscleMass:null,bodyFat:18}),record({id:'a',date:'2026-10-09',weight:75,muscleMass:32,bodyFat:19}),record({id:'c',date:'2026-10-17',weight:null,muscleMass:33,bodyFat:null})];
  const before=structuredClone(records);
  assert.equal(measurementSummary(records,'weight').latest.id,'b');
  assert.equal(measurementSummary(records,'muscleMass').latest.id,'c');
  assert.equal(measurementSummary(records,'bodyFat').change,-1);
  assert.deepEqual(measurementSeries(records,'weight').map(item=>item.id),['a','b']);
  assert.equal(measurementSummary([records[0]],'weight').change,null);
  assert.deepEqual(records,before);
});
test('current backups round trip and legacy backups migrate to empty body history',()=>{
  const value=validateBackup(backup());assert.deepEqual(validateBackup(JSON.stringify(value)),value);
  const legacy=backup();legacy.schemaVersion=1;delete legacy.bodyMeasurements;
  const migrated=validateBackup(legacy);
  assert.equal(migrated.schemaVersion,3);assert.deepEqual(migrated.bodyMeasurements,[]);
  assert.equal(legacy.bodyMeasurements,undefined);
});
test('invalid measurement backups reject duplicates, dates and values before replacement',()=>{
  for(const mutate of [
    value=>{delete value.bodyMeasurements;}, value=>{value.schemaVersion=3;},
    value=>{value.bodyMeasurements.push(record());}, value=>{value.bodyMeasurements.push(record({id:'other'}));},
    value=>{value.bodyMeasurements[0].weight='75';},value=>{value.bodyMeasurements[0].bodyFat=101;},
    value=>{value.bodyMeasurements[0].updatedAt='bad';},value=>{value.bodyMeasurements[0].date='2026-04-31';}
  ]) {const value=backup();mutate(value);assert.throws(()=>validateBackup(value));}
});
test('charts handle a flat trend, sparse data and large histories without invalid SVG coordinates',()=>{
  assert.match(bodyChart([record()],'weight'),/at least two/);
  const flat=[record({id:'a',date:'2026-10-01'}),record({id:'b',date:'2026-10-16'})];
  assert.doesNotMatch(bodyChart(flat,'weight'),/NaN|Infinity/);
  const many=Array.from({length:40},(_,i)=>record({id:String(i),date:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10)}));
  assert.match(bodyChart(many,'weight'),/Latest 30 readings/);
});
