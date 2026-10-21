import { CATALOG_SOURCE, findCatalogExercise, filterCatalog } from './catalog.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=value=>value[0].toUpperCase()+value.slice(1);
function addButton(item,exercises) {
  const existing=findCatalogExercise(exercises,item);
  return `<button class="button secondary small" data-action="catalog-add" data-id="${item.id}" ${existing && !existing.archived ? 'disabled' : ''}>${existing ? existing.archived ? 'Unarchive' : 'In collection' : 'Add to collection'}</button>`;
}
export function catalogFilters(items,state) {
  const options=(key,all)=>`<option value="">${all}</option>${[...new Set(items.map(item=>item[key]))].sort().map(value=>`<option value="${escape(value)}" ${state[key]===value?'selected':''}>${escape(label(value))}</option>`).join('')}`;
  return `<p class="small-text muted">${items.length.toLocaleString()} exercises available offline. Add the ones you use to your collection.</p>
    <div class="catalog-filters"><label class="field">Search library<input type="search" id="catalog-search" value="${escape(state.query)}" placeholder="Name, equipment, or muscle"></label>
    <label class="field">Body part<select id="catalog-bodyPart">${options('bodyPart','All body parts')}</select></label>
    <label class="field">Equipment<select id="catalog-equipment">${options('equipment','All equipment')}</select></label></div>
    <div id="catalog-results"></div><p class="small-text muted catalog-credit">Exercise data and English instructions: <a href="${CATALOG_SOURCE}" target="_blank" rel="noopener noreferrer">Hasan Emir Yıldırım</a> · MIT license. <a href="./data/EXERCISES-LICENSE.txt" target="_blank" rel="noopener noreferrer">License</a></p>`;
}
export function catalogResults(items,exercises,state) {
  const matches=filterCatalog(items,state),shown=matches.slice(0,state.limit);
  return `<p class="small-text muted" role="status">Showing ${shown.length} of ${matches.length.toLocaleString()} matching exercises</p>
    <div class="catalog-list">${shown.map(item=>`<article class="catalog-item"><div><h3>${escape(item.name)}</h3><p class="small-text muted">${escape(label(item.bodyPart))} · ${escape(item.equipment)} · ${escape(item.target)}</p></div><div class="catalog-actions"><button class="text-button" data-action="catalog-details" data-id="${item.id}" aria-label="Details for ${escape(item.name)}">Details</button>${addButton(item,exercises)}</div></article>`).join('') || '<p class="catalog-empty">No exercises match. Try another name or clear the filters.</p>'}</div>
    ${matches.length>state.limit ? '<button class="button secondary" data-action="catalog-more">Show more exercises</button>' : ''}`;
}
export function catalogDetails(item,exercises) {
  return `<div class="catalog-detail"><dl><div><dt>Body part</dt><dd>${escape(label(item.bodyPart))}</dd></div><div><dt>Equipment</dt><dd>${escape(item.equipment)}</dd></div><div><dt>Target muscle</dt><dd>${escape(item.target)}</dd></div><div><dt>Supporting muscles</dt><dd>${escape(item.secondaryMuscles.join(', ') || 'Not listed')}</dd></div></dl>
    <h3>Instructions</h3><ol>${item.instructions.map(step=>`<li>${escape(step)}</li>`).join('')}</ol>
    ${item.bodyPart==='cardio' ? '<p class="small-text muted">Form records weight and reps. Timed and distance-based logging are not available.</p>' : ''}
    <p class="small-text muted catalog-credit">English instructions from <a href="${CATALOG_SOURCE}" target="_blank" rel="noopener noreferrer">Hasan Emir Yıldırım’s exercise dataset</a> (MIT).</p>
    <div class="modal-actions"><button class="text-button" data-action="browse-catalog">Back to library</button>${addButton(item,exercises)}</div></div>`;
}
