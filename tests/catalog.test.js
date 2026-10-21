import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, filterCatalog, catalogExercise, findCatalogExercise } from '../js/catalog.js';
import { validateBackup } from '../js/backup.js';
const payload=JSON.parse(await readFile(new URL('../data/exercises.json',import.meta.url),'utf8'));
const items=validateCatalog(payload);
test('pinned text catalog contains all source exercises, English instructions and no media',()=>{
  assert.equal(items.length,1324);assert.equal(new Set(items.map(item=>item.id)).size,1324);
  assert.equal(payload.source.revision,'7455efae41b330c265e7cd4b78dfa848e7ce5ebd');
  assert.equal(payload.source.mediaIncluded,false);
  assert.ok(items.every(item=>item.instructions.length>0 && !item.image && !item.gif_url));
  assert.throws(()=>validateCatalog({exercises:[items[0],items[0]]}));
  assert.throws(()=>validateCatalog({exercises:[{...items[0],instructions:['']}]}));
});
test('library search combines name, muscle and equipment terms with exact filters',()=>{
  const sample=items.find(item=>item.equipment==='dumbbell' && item.bodyPart==='chest');
  const result=filterCatalog(items,{query:'DUMBBELL',bodyPart:'chest',equipment:'dumbbell'});
  assert.ok(result.some(item=>item.id===sample.id));
  assert.ok(result.every(item=>item.equipment==='dumbbell' && item.bodyPart==='chest'));
  assert.deepEqual(filterCatalog(items,{query:'no-such-exercise-789xyz'}),[]);
});
test('catalog references are stable and preserve renamed or archived matches',()=>{
  const item=items[0],exercise=catalogExercise(item);
  assert.equal(exercise.id,`catalog-hasaneyldrm-${item.id}`);
  assert.equal(findCatalogExercise([{...exercise,name:'My version',archived:true}],item).id,exercise.id);
  assert.equal(findCatalogExercise([{id:'custom',name:`  ${item.name.toUpperCase()}  `,archived:false}],item).id,'custom');
  const variants=items.filter(item=>item.name==='Lever chest press');
  assert.equal(variants.length,2);
  assert.equal(findCatalogExercise([catalogExercise(variants[0])],variants[1]),undefined,'Different source IDs remain distinct even when source names match');
});
test('catalog exercise references survive backups and invalid references are rejected',()=>{
  const snapshot={schemaVersion:2,exportedAt:new Date().toISOString(),exercises:[catalogExercise(items[0])],routines:[],sessions:[],bodyMeasurements:[],workoutPreferences:{unit:'kg'}};
  assert.deepEqual(validateBackup(JSON.stringify(snapshot)).exercises,snapshot.exercises);
  assert.throws(()=>validateBackup({...snapshot,exercises:[{...snapshot.exercises[0],catalogId:'../invalid'}]}));
});
