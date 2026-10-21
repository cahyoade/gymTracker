import { mkdir, writeFile } from 'node:fs/promises';
const revision='7455efae41b330c265e7cd4b78dfa848e7ce5ebd';
const repository='https://github.com/hasaneyldrm/exercises-dataset';
const base=`https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${revision}/`;
async function download(path) {
  const response=await fetch(base+path,{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error(`Download failed: ${path} (${response.status})`);
  return response.text();
}
const [raw,license]=await Promise.all([download('data/exercises.json'),download('LICENSE')]);
const ids=new Set();
const exercises=JSON.parse(raw).map(item=>{
  if(!/^\d{4}$/.test(item.id) || ids.has(item.id) || typeof item.name!=='string' || item.name.length>120 || !item.instructions?.en)throw new Error(`Invalid source exercise: ${item.id}`);
  ids.add(item.id);
  return {id:item.id,name:item.name[0].toUpperCase()+item.name.slice(1),bodyPart:item.body_part,equipment:item.equipment,target:item.target,
    secondaryMuscles:item.secondary_muscles || [],instructions:item.instruction_steps?.en?.length ? item.instruction_steps.en : [item.instructions.en]};
});
const catalog={source:{repository,revision,license:'MIT',language:'en',mediaIncluded:false},exercises};
const directory=new URL('../data/',import.meta.url);
await mkdir(directory,{recursive:true});
await writeFile(new URL('exercises.json',directory),JSON.stringify(catalog)+'\n');
await writeFile(new URL('EXERCISES-LICENSE.txt',directory),license);
console.log(`${exercises.length} exercises; ${Buffer.byteLength(JSON.stringify(catalog))} bytes; revision ${revision}; no media`);
