import { FOOD_GROUPS } from './food-seeds.js';
import { NUTRIENTS, totals, targetsAt, nutritionSeries } from './nutrition.js';
import { todayLocal } from './measurements.js';
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value);
const button = (action,label,extra='',secondary=true) => `<button type="button" class="button ${secondary?'secondary':''}" data-action="nut-${action}" ${extra}>${label}</button>`;
const labelDate = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
export function nutrientStats(items,target={}) {
  const summary=totals(items);
  return `<div class="nutrition-stats">${NUTRIENTS.map(({key,label,unit})=>{
    const total=summary[key],goal=key==='protein'?(target.proteinMin===null||target.proteinMin===undefined?null:`${number(target.proteinMin)}–${number(target.proteinMax)}`):target[key]===null||target[key]===undefined?null:number(target[key]);
    return `<section><span>${label}</span><strong>${total.count===0?'—':total.missing===total.count?'Unknown':number(total.value)} <small>${unit}</small></strong><span class="muted small-text">${total.missing?`${total.missing===total.count?'Unknown':'Partial'} · ${total.missing} of ${total.count} items missing`:total.count?'Estimated total':'No foods logged'}</span>${goal!==null?`<span class="small-text">Target: ${goal} ${unit}${total.complete&&key==='calories'?` · ${number(Math.abs(target.calories-total.value))} ${target.calories>=total.value?'remaining':'above target'}`:''}${total.complete&&key==='protein'?` · ${total.value<target.proteinMin?`${number(target.proteinMin-total.value)} g to lower target`:total.value<=target.proteinMax?'Within target range':'Above target range'}`:''}</span>`:''}</section>`;
  }).join('')}</div>`;
}
export function foodPage(data,state,draft,status) {
  const meals=data.foodMeals.filter(meal=>meal.date===state.date).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  const complete=data.foodDays.find(day=>day.date===state.date)?.complete;
  return `<div class="page-heading food-heading"><div><h1>Food</h1><p class="muted">Log meals and track daily nutrition.</p></div><div class="food-page-actions">${button('new','+ Add meal','',false)}${button('library','Food library')}</div></div>
  <div class="food-datebar" role="group" aria-label="Food date navigation">${button('prev','‹','aria-label="Previous day" title="Previous day"')}<input type="date" id="nut-date" aria-label="Food date" value="${state.date}">${button('next','›','aria-label="Next day" title="Next day"')}</div>
  <div class="food-day-heading"><h2>Daily intake</h2><div><span class="small-text muted">${state.date===todayLocal()?'Today · ':''}${meals.length?(complete?'Complete':'In progress'):'No meals yet'}</span>${state.date!==todayLocal()?button('today','Today'):''}</div></div>
  ${nutrientStats(meals.flatMap(meal=>meal.items),targetsAt(data.nutritionTargets,state.date))}
  <div class="button-row food-day-actions">${button('targets','Edit targets')}${meals.length?button('complete',complete?'Reopen day':'Mark day complete'):''}</div>
  ${draft && !state.editing?`<div class="notice nutrition-resume"><span>Unfinished meal · ${escape(labelDate(draft.date))}</span>${button('resume','Resume meal')}</div>`:''}
  ${state.editing&&draft?mealBuilder(data,state,draft,status):''}
  <section class="nutrition-meals"><h2>Logged meals</h2>${meals.length?meals.map(meal=>`<article class="meal-card"><div class="section-heading"><h3>${escape(meal.name)}</h3><div class="button-row">${button('edit','Edit',`data-id="${escape(meal.id)}"`)}${button('delete','Delete',`data-id="${escape(meal.id)}"`)}</div></div>${meal.items.map(item=>`<p>${escape(item.food.name)} · ${number(item.quantity)} × ${escape(item.food.portion)}</p>`).join('')}${nutrientStats(meal.items)}<p class="small-text muted">Saved ${escape(new Date(meal.updatedAt).toLocaleString())}</p></article>`).join(''):'<p class="muted">Choose Add meal to start with an empty plate.</p>'}</section>`;
}
export function mealBuilder(data,state,draft,status) {
  return `<section id="meal-builder" class="meal-builder"><div class="section-heading"><h2>${data.foodMeals.some(meal=>meal.id===draft.id)?'Edit meal':'Assemble a meal'}</h2>${button('pause','Save & close')}</div>
  <p class="muted small-text">Logging for ${escape(labelDate(draft.date))}. Tap a dish to add one base serving. Adjust by halves or enter another amount.</p>
  <label class="field">Meal name (optional)<input id="nut-meal-name" maxlength="160" value="${escape(draft.name)}" placeholder="Meal"></label>
  <div class="food-builder-library"><h3>Choose foods</h3>${button('food-new','+ Add food')}</div><label class="field">Find a food<input type="search" id="nut-search" value="${escape(state.query)}" placeholder="Rice, chicken, vegetables…"></label>
  <div class="nutrition-controls"><label class="field">Food group<select id="nut-group"><option value="">All groups</option>${FOOD_GROUPS.map(group=>`<option ${state.group===group?'selected':''}>${escape(group)}</option>`).join('')}</select></label><div class="segmented">${button('filter','All foods',`aria-pressed="${!state.selected}"`)}${button('filter','Selected',`data-selected="true" aria-pressed="${state.selected}"`)}</div></div>
  <div id="nut-food-results">${foodResults(data,state,draft)}</div>
  <div id="nut-builder-totals" aria-live="polite">${nutrientStats(draft.items,targetsAt(data.nutritionTargets,draft.date))}</div>
  <p id="nut-save-status" role="status">${escape(status)}</p><p id="nut-error" class="form-error" role="alert" tabindex="-1" hidden></p>
  <div class="button-row">${button('log','Log meal','',false)}${button('retry','Retry draft save')}${button('discard','Discard meal draft')}</div></section>`;
}
export function foodResults(data,state,draft) {
  const selected=new Map(draft.items.map(item=>[item.foodId,item]));
  const foods=new Map(data.foods.filter(food=>!food.archived).map(food=>[food.id,food]));
  for(const item of draft.items)foods.set(item.foodId,item.food);
  const query=state.query.toLocaleLowerCase().trim();
  const matches=[...foods.values()].filter(food=>(!state.group||food.group===state.group)&&(!state.selected||selected.has(food.id))&&`${food.name} ${food.group}`.toLocaleLowerCase().includes(query));
  return matches.length?matches.map(food=>{
    const item=selected.get(food.id),quantity=item?.quantity??0,unit=state.units[food.id]||'servings';
    const displayed=unit==='servings'?quantity:quantity===''?'':Number(quantity)*food.baseAmount;
    return `<article class="food-choice ${item?'is-selected':''}" data-food-id="${escape(food.id)}"><div>${button('add',escape(food.name),`data-id="${escape(food.id)}" aria-label="Add one serving of ${escape(food.name)}"`)}<p class="small-text muted">${escape(food.portion)} · ${number(food.calories)} kcal · ${number(food.protein)} g protein</p>${item?`<details><summary>Estimate details</summary><p>${escape(food.source)}</p><p>${escape(food.macroNote)}</p>${food.macroUrl?`<a href="${escape(food.macroUrl)}" target="_blank" rel="noopener noreferrer">Nutrient source</a>`:''}<p>Carbohydrate: ${food.carbs===null?'unknown':`${number(food.carbs)} g`} · Fat: ${food.fat===null?'unknown':`${number(food.fat)} g`}</p></details>`:''}</div>
    ${item?`<div class="portion-controls">${button('minus','−½',`data-id="${escape(food.id)}" aria-label="Remove half serving of ${escape(food.name)}"`)}<label>Quantity<input type="number" min="0" step="any" inputmode="decimal" data-nut-quantity="${escape(food.id)}" aria-label="${escape(food.name)} quantity" value="${escape(displayed)}"></label>${button('plus','+½',`data-id="${escape(food.id)}" aria-label="Add half serving of ${escape(food.name)}"`)}<label>Unit<select data-nut-unit="${escape(food.id)}" aria-label="${escape(food.name)} quantity unit"><option value="servings">Servings</option>${food.baseAmount?`<option value="${food.baseUnit}" ${unit===food.baseUnit?'selected':''}>${food.baseUnit}</option>`:''}</select></label></div>`:''}</article>`;
  }).join(''):'<p class="muted">No matching foods. Add custom foods from Manage foods.</p>';
}
export function foodLibrary(data,query='') {
  return `<h2 id="modal-title">Food library</h2><p class="muted">Add foods or edit saved portions and nutrients. Logged meals keep their original estimates.</p>${button('food-new','+ Add food','',false)}<label class="field food-library-search">Find a saved food<input type="search" id="nut-library-search" placeholder="Search saved foods" value="${escape(query)}"></label><div class="food-library" id="nut-library-results">${foodLibraryRows(data,query)}</div>${button('modal-close','Close')}`;
}
export function foodLibraryRows(data,query='') {
  const needle=query.toLocaleLowerCase().trim();
  const matches=data.foods.filter(food=>`${food.name} ${food.group}`.toLocaleLowerCase().includes(needle));
  return matches.length?matches.map(food=>`<article><div><strong>${escape(food.name)}</strong><p class="small-text muted">${escape(food.portion)}${food.archived?' · Archived':''}</p></div><div class="button-row">${button('food-edit','Edit',`data-id="${escape(food.id)}" aria-label="Edit ${escape(food.name)}"`)}${button('food-archive',food.archived?'Unarchive':'Archive',`data-id="${escape(food.id)}" aria-label="${food.archived?'Unarchive':'Archive'} ${escape(food.name)}"`)}</div></article>`).join(''):'<p class="muted">No matching saved foods. Add a food with the button above.</p>';
}
export function foodForm(food={}) {
  return `<h2 id="modal-title">${food.id?'Edit food':'Add food'}</h2><form id="nut-food-form" data-id="${escape(food.id||'')}">
  <label class="field">Name<input name="name" required maxlength="160" value="${escape(food.name)}"></label>
  <label class="field">Group<select name="group">${FOOD_GROUPS.map(group=>`<option ${food.group===group?'selected':''}>${escape(group)}</option>`).join('')}</select></label>
  <label class="field">Base portion (for example 1 bowl or 100 g cooked)<input name="portion" required maxlength="160" value="${escape(food.portion)}"></label>
  <div class="nutrition-form-grid"><label class="field">Base amount (optional)<input type="number" min="0.001" step="any" name="baseAmount" value="${food.baseAmount??''}"></label><label class="field">Conversion unit<select name="baseUnit"><option value="">Unknown</option><option value="g" ${food.baseUnit==='g'?'selected':''}>g</option><option value="ml" ${food.baseUnit==='ml'?'selected':''}>ml</option></select></label></div>
  <p class="small-text muted">Enter values per base portion. Leave unavailable carbohydrate/fat blank; zero means known zero.</p><div class="nutrition-form-grid">${NUTRIENTS.map(({key,label,unit})=>`<label class="field">${label} (${unit})<input type="number" min="0" max="1000000" step="any" inputmode="decimal" name="${key}" value="${food[key]??''}" ${key==='calories'||key==='protein'?'required':''}></label>`).join('')}</div>
  <label class="field">Calorie/protein source or assumptions<textarea name="source" maxlength="2000">${escape(food.source)}</textarea></label><label class="field">Carbohydrate/fat source or assumptions<textarea name="macroNote" maxlength="2000">${escape(food.macroNote)}</textarea></label><label class="field">Macro source link (optional HTTPS)<input type="url" name="macroUrl" maxlength="2000" value="${escape(food.macroUrl)}"></label>
  <p id="form-error" class="form-error" role="alert" hidden></p><div class="modal-actions">${button('modal-close','Cancel')}<button class="button" type="submit">Save food</button></div></form>`;
}
export function targetForm(target,date) {
  return `<h2 id="modal-title">Nutrition targets</h2><p class="muted">Your own editable targets. Leave optional values blank to track without a goal. Earlier dates keep their targets.</p><form id="nut-target-form"><label class="field">Effective from<input type="date" name="date" value="${date}" required></label><div class="nutrition-form-grid">${[['calories','Calories (kcal)'],['proteinMin','Protein minimum (g)'],['proteinMax','Protein maximum (g)'],['carbs','Carbohydrate (g, optional)'],['fat','Fat (g, optional)']].map(([key,label])=>`<label class="field">${label}<input name="${key}" type="number" min="0" step="any" inputmode="decimal" value="${target[key]??''}"></label>`).join('')}</div><p id="form-error" class="form-error" role="alert" hidden></p><div class="modal-actions">${button('modal-close','Cancel')}<button class="button" type="submit">Save targets</button></div></form>`;
}
export function nutritionProgress(data,state) {
  const metric=NUTRIENTS.find(item=>item.key===state.metric),series=nutritionSeries(data.foodMeals,data.foodDays,data.nutritionTargets,{end:state.end,range:state.range,metric:state.metric});
  const days=[...new Set(data.foodMeals.filter(m=>m.date>=series.points[0].date&&m.date<=state.end).map(m=>m.date))].sort().reverse();
  const selectedMeals=data.foodMeals.filter(m=>m.date===state.detail);
  return `<section id="nutrition-progress" class="nutrition-progress"><div class="section-heading"><h2>Nutrition</h2><a class="button secondary" href="#food">Log food</a></div><div class="nutrition-controls"><label class="field">Period<select id="nut-range">${[7,30,90].map(n=>`<option value="${n}" ${state.range===n?'selected':''}>${n} days</option>`).join('')}</select></label><label class="field">Nutrient<select id="nut-metric">${NUTRIENTS.map(n=>`<option value="${n.key}" ${n.key===state.metric?'selected':''}>${n.label} (${n.unit})</option>`).join('')}</select></label><label class="field">Through date<input id="nut-end" type="date" value="${state.end}"></label></div>
  <p><strong>${series.average===null?'No complete-day average':`${number(series.average)} ${metric.unit} daily average`}</strong></p><p class="small-text muted">${series.completed} of ${state.range} days complete · ${series.coverage} days with complete ${metric.label.toLowerCase()} data. Draft meals excluded.</p>
  ${nutritionChart(series,metric)}<p class="small-text muted">Filled points: complete days. Hollow points: in progress or partial nutrient data. Gaps: no logged meals. Dashed lines: effective targets. Food estimates do not establish the cause of body or training changes.</p>
  <h3>Daily records</h3>${days.length?`<div class="nutrition-history">${days.slice(0,state.limit).map(date=>{const point=series.points.find(p=>p.date===date);return `<div>${button('detail',escape(labelDate(date)),`data-date="${date}"`)}<span>${point.total.missing===point.total.count?'Unknown':`${number(point.total.value)} ${metric.unit}`}${point.total.missing?' · Partial':''} · ${point.complete?'Complete':'In progress'}</span>${button('open-day','Edit food',`data-date="${date}"`)}</div>`;}).join('')}</div>${days.length>state.limit?button('more','Show more dates'):''}`:'<p class="muted">No meals logged in this period.</p>'}
  <div class="nutrition-contributions"><label class="field">Breakdown date<input type="date" id="nut-detail-date" value="${state.detail}"></label><h3>Food contributions · ${escape(labelDate(state.detail))}</h3>${nutrientStats(selectedMeals.flatMap(m=>m.items),targetsAt(data.nutritionTargets,state.detail))}${selectedMeals.length?`<div class="nutrition-table-wrap"><table><caption>Estimated nutrients by logged food</caption><thead><tr><th>Food and portion</th>${NUTRIENTS.map(n=>`<th>${n.label} (${n.unit})</th>`).join('')}</tr></thead><tbody>${selectedMeals.flatMap(m=>m.items.map(item=>`<tr><th scope="row">${escape(item.food.name)}<small>${number(item.quantity)} × ${escape(item.food.portion)} · ${escape(m.name)}</small></th>${NUTRIENTS.map(n=>`<td>${item.food[n.key]===null?'Unknown':number(item.food[n.key]*item.quantity)}</td>`).join('')}</tr>`)).join('')}</tbody></table></div>`:'<p class="muted">No logged food for this date.</p>'}</div></section>`;
}
export function nutritionChart(series,metric) {
  if(!series.points.some(p=>p.logged))return '<p class="nutrition-chart-empty muted">Log meals to see estimated intake here.</p>';
  const bounds=p=>metric.key==='protein'?[p.target.proteinMin,p.target.proteinMax]:[p.target[metric.key]];
  const max=Math.max(1,...series.points.flatMap(p=>[p.total.value,...bounds(p).filter(v=>v!==null&&v!==undefined)]))*1.1;
  const x=i=>55+i*550/(series.points.length-1),y=v=>205-v/max*175;
  const hasValue=p=>p.logged && p.total.missing<p.total.count;
  const guide=Array.from({length:3},(_,i)=>{const v=max*i/2;return `<line x1="55" x2="605" y1="${y(v)}" y2="${y(v)}" class="nutrition-grid"/><text x="48" y="${y(v)+4}" text-anchor="end">${number(v)}</text>`;}).join('');
  const targetLines=series.points.slice(1).map((p,i)=>bounds(p).map((v,j)=>{const before=bounds(series.points[i])[j];return v!==null&&v!==undefined&&before!==null&&before!==undefined?`<path d="M${x(i)},${y(before)} L${x(i+1)},${y(v)}" class="nutrition-target"/>`:'';}).join('')).join('');
  // Each adjacent pair is drawn independently, so unlogged days are real gaps.
  const lines=series.points.slice(1).map((p,i)=>hasValue(p)&&hasValue(series.points[i])?`<path d="M${x(i)},${y(series.points[i].total.value)} L${x(i+1)},${y(p.total.value)}" class="nutrition-line"/>`:'').join('');
  const dots=series.points.map((p,i)=>hasValue(p)?`<circle cx="${x(i)}" cy="${y(p.total.value)}" r="4" class="nutrition-point ${p.complete&&p.total.complete?'':'provisional'}"><title>${escape(p.date)}: ${number(p.total.value)} ${metric.unit}${p.total.missing?' partial':''} · ${p.complete?'complete':'in progress'}</title></circle>`:'').join('');
  return `<svg class="nutrition-chart" viewBox="0 0 640 250" role="img" aria-label="Daily ${metric.label.toLowerCase()} in ${metric.unit}"><title>Daily ${metric.label} (${metric.unit})</title>${guide}${targetLines}${lines}${dots}${[0,Math.floor((series.points.length-1)/2),series.points.length-1].map(i=>`<text x="${x(i)}" y="232" text-anchor="middle">${series.points[i].date.slice(5)}</text>`).join('')}</svg>`;
}
