export const CATALOG_SOURCE='https://github.com/hasaneyldrm/exercises-dataset';
export const CATALOG_CATEGORIES={back:'Back',chest:'Chest',shoulders:'Shoulders',waist:'Core','upper arms':'Arms','lower arms':'Arms','upper legs':'Legs','lower legs':'Legs',neck:'Neck',cardio:'Cardio'};
export const catalogKey=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
let loading;
export function validateCatalog(payload) {
  if(!Array.isArray(payload?.exercises) || !payload.exercises.length || payload.exercises.length>5000)throw new Error('The exercise library could not be read.');
  const ids=new Set();
  for(const item of payload.exercises) {
    if(!/^\d{4}$/.test(item.id) || ids.has(item.id) || typeof item.name!=='string' || !item.name.trim() || item.name.length>120 || !CATALOG_CATEGORIES[item.bodyPart] ||
      !['equipment','target'].every(key=>typeof item[key]==='string' && item[key].length>0 && item[key].length<=120) ||
      !Array.isArray(item.secondaryMuscles) || item.secondaryMuscles.some(value=>typeof value!=='string' || value.length>120) ||
      !Array.isArray(item.instructions) || !item.instructions.length || item.instructions.some(value=>typeof value!=='string' || !value.trim() || value.length>10000))throw new Error('The exercise library contains an invalid record.');
    ids.add(item.id);
  }
  return payload.exercises;
}
export function loadCatalog() {
  if(!loading)loading=fetch(new URL('../data/exercises.json',import.meta.url),{signal:AbortSignal.timeout(15000)}).then(async response=>{
    if(!response.ok)throw new Error('The exercise library is unavailable. Open Form online once, then try again.');
    return validateCatalog(await response.json());
  }).catch(error=>{
    loading=null;
    if(error instanceof TypeError || error.name==='TimeoutError' || error.name==='AbortError')throw new Error('The exercise library is unavailable. Open Form online once, then try again.');
    throw error;
  });
  return loading;
}
export function filterCatalog(items,{query='',bodyPart='',equipment=''}={}) {
  const terms=catalogKey(query).split(' ').filter(Boolean);
  return items.filter(item=>(!bodyPart || item.bodyPart===bodyPart) && (!equipment || item.equipment===equipment) &&
    terms.every(term=>catalogKey([item.name,item.bodyPart,item.equipment,item.target,...item.secondaryMuscles].join(' ')).includes(term)))
    .sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function findCatalogExercise(exercises,item) {
  return exercises.find(exercise=>exercise.catalogId===item.id || exercise.id===`catalog-hasaneyldrm-${item.id}`) ||
    exercises.find(exercise=>!exercise.catalogId && !exercise.archived && catalogKey(exercise.name)===catalogKey(item.name)) ||
    exercises.find(exercise=>!exercise.catalogId && catalogKey(exercise.name)===catalogKey(item.name));
}
export function catalogExercise(item) {
  return {id:`catalog-hasaneyldrm-${item.id}`,catalogId:item.id,name:item.name,category:CATALOG_CATEGORIES[item.bodyPart],archived:false};
}
