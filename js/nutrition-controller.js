import { id, now } from './model.js';
import { todayLocal } from './measurements.js';
import { put, saveNutritionState, saveFoodMeal } from './db.js';
import { validateFood, validateMeal, validateTargets, targetsAt, quantityInServings, mealItem, shiftDate } from './nutrition.js';
import { foodPage, foodResults, nutrientStats, foodLibrary, foodLibraryRows, foodForm, targetForm, nutritionProgress } from './nutrition-ui.js';

export function createNutritionController(env) {
  const state={date:todayLocal(),editing:false,query:'',libraryQuery:'',group:'',selected:false,units:{},metric:'calories',range:7,end:todayLocal(),detail:todayLocal(),limit:20};
  let draft=null,loaded=false,revision=0,saved=0,error=null,timer,saving=0,locked=false;
  const data=()=>env.getData();
  const status=()=>error?'Not saved · retry before closing':saving||revision!==saved?'Saving meal draft…':'Meal draft saved on this device';
  function label(){const node=document.querySelector('#nut-save-status');if(node)node.textContent=status();}
  function ensureLoaded(){if(!loaded){draft=structuredClone(data().foodDraft);loaded=true;}}
  function reset(){clearTimeout(timer);loaded=false;draft=null;revision=saved=0;error=null;state.editing=false;state.units={};}
  async function persist(){ensureLoaded();if(saved===revision&&!error)return;const captured=revision,snapshot=draft?structuredClone({...draft,updatedAt:now()}):null;saving++;label();
    try {if(snapshot)validateMeal(snapshot,{draft:true});await saveNutritionState({draft:snapshot});saved=Math.max(saved,captured);error=null;}
    catch(problem){error=problem;throw new Error('Meal changes could not be saved. Keep this page open and use Retry draft save.');}
    finally {saving--;label();}
  }
  async function flush(){clearTimeout(timer);await persist();if(saved!==revision)await flush();}
  function touch(){revision++;label();clearTimeout(timer);timer=setTimeout(()=>persist().catch(problem=>env.toast(problem.message,true)),250);}
  function render(){ensureLoaded();return foodPage(data(),state,draft,status());}
  function results(focus){const node=document.querySelector('#nut-food-results');if(node)node.innerHTML=foodResults(data(),state,draft);const summary=document.querySelector('#nut-builder-totals');if(summary)summary.innerHTML=nutrientStats(draft.items,targetsAt(data().nutritionTargets,draft.date));label();
    if(focus){const controls=[...document.querySelectorAll('#nut-food-results button')];(controls.find(node=>node.dataset.id===focus.id&&node.dataset.action===focus.action)||controls.find(node=>node.dataset.id===focus.id&&node.dataset.action==='nut-add'))?.focus({preventScroll:true});}
  }
  function showProgress(){const node=document.querySelector('#nutrition-progress');if(node)node.outerHTML=nutritionProgress(data(),state);}
  function pick(foodId){let item=draft.items.find(item=>item.foodId===foodId);if(!item){const food=data().foods.find(food=>food.id===foodId&&!food.archived);if(!food)throw new Error('This food is archived or unavailable.');item=mealItem(food,0);draft.items.push(item);}return item;}
  function showLibrary(){env.showModal(foodLibrary(data(),state.libraryQuery));}
  function showBuilder(){env.render();document.querySelector('#meal-builder')?.scrollIntoView({block:'start'});}
  async function action(name,button){
    ensureLoaded();const kind=name.slice(4);if(locked)return;
    if(['add','plus','minus'].includes(kind)) {
      const item=pick(button.dataset.id),old=Number(item.quantity)||0;
      item.quantity=Math.max(0,old+(kind==='add'?1:kind==='plus'?.5:-.5));
      if(item.quantity===0)draft.items=draft.items.filter(other=>other!==item);touch();results({id:button.dataset.id,action:button.dataset.action});return;
    }
    if(kind==='filter'){state.selected=button.dataset.selected==='true';results();document.querySelectorAll('[data-action="nut-filter"]').forEach(node=>node.setAttribute('aria-pressed',String((node.dataset.selected==='true')===state.selected)));return;}
    if(kind==='retry'){await flush();return;}
    if(kind==='library'){state.libraryQuery='';showLibrary();return;}
    if(kind==='food-new'){env.showModal(foodForm());return;}
    if(kind==='food-edit'){env.showModal(foodForm(data().foods.find(food=>food.id===button.dataset.id)));return;}
    if(kind==='modal-close'){env.closeModal();return;}
    if(kind==='food-archive'){const food=data().foods.find(food=>food.id===button.dataset.id);await put('foods',{...food,archived:!food.archived});await env.refresh();showLibrary();return;}
    if(kind==='targets'){env.showModal(targetForm(targetsAt(data().nutritionTargets,state.date),state.date));return;}
    if(kind==='more'){state.limit+=20;showProgress();return;}
    if(kind==='detail'){state.detail=button.dataset.date;showProgress();return;}
    if(kind==='open-day'){await flush();state.date=button.dataset.date;state.editing=false;await env.openFood();return;}
    if(['prev','next','today'].includes(kind)){await flush();state.date=kind==='today'?todayLocal():shiftDate(state.date,kind==='prev'?-1:1);state.editing=false;env.render();return;}
    if(kind==='complete'){await flush();const complete=data().foodDays.find(day=>day.date===state.date)?.complete;if(!complete&&draft?.date===state.date&&draft.items.some(item=>Number(item.quantity)>0))throw new Error('Log or discard the unfinished meal before marking this day complete.');await put('foodDays',{id:state.date,date:state.date,complete:!complete,updatedAt:now()});await env.refresh();env.render();return;}
    if(kind==='resume'){state.editing=true;state.date=draft.date;showBuilder();return;}
    if(kind==='pause'){await flush();state.editing=false;env.render();return;}
    if(kind==='new'||kind==='edit'){
      await flush();if(draft && !confirm('Replace the unfinished meal draft? Logged meals will stay saved.'))return;
      draft=kind==='edit'?structuredClone(data().foodMeals.find(meal=>meal.id===button.dataset.id)):{id:id(),date:state.date,name:'',items:[],updatedAt:now()};
      state.editing=true;state.date=draft.date;state.query='';state.group='';state.selected=false;state.units={};touch();showBuilder();return;
    }
    if(kind==='discard'){if(!confirm('Discard this unfinished meal draft? Logged meals stay saved.'))return;await flush();await saveNutritionState({draft:null});draft=null;saved=revision;state.editing=false;await env.refresh();env.render();return;}
    if(kind==='delete'){
      if(!confirm('Delete this logged meal and its nutrient contributions?'))return;await flush();
      const meal=data().foodMeals.find(meal=>meal.id===button.dataset.id);await saveFoodMeal(meal,{remove:true});
      if(draft?.id===meal.id){draft=null;state.editing=false;saved=revision;}await env.refresh();env.render();return;
    }
    if(kind==='log'){
      locked=true;document.querySelectorAll('#meal-builder input,#meal-builder select,#meal-builder button').forEach(node=>node.disabled=true);
      try {await flush();const meal=validateMeal({...draft,items:draft.items.filter(item=>item.quantity===''||Number(item.quantity)!==0),updatedAt:now()});await saveFoodMeal(meal);draft=null;saved=revision;state.editing=false;await env.refresh();env.render();env.toast('Meal logged on this device.');}
      finally {locked=false;document.querySelectorAll('#meal-builder input,#meal-builder select,#meal-builder button').forEach(node=>node.disabled=false);}
      return;
    }
  }
  function input(target){
    if(!target.id?.startsWith('nut-')&&!target.hasAttribute('data-nut-quantity'))return false;
    ensureLoaded();if(locked)return true;
    if(target.id==='nut-library-search'){state.libraryQuery=target.value;document.querySelector('#nut-library-results').innerHTML=foodLibraryRows(data(),state.libraryQuery);return true;}
    if(target.id==='nut-search'){state.query=target.value;results();return true;}
    if(target.id==='nut-meal-name'){draft.name=target.value;touch();return true;}
    if(target.hasAttribute('data-nut-quantity')){
      const item=pick(target.dataset.nutQuantity),unit=state.units[item.foodId]||'servings';
      // Blank/invalid inputs remain a draft and cannot be logged as zero.
      item.quantity=target.value===''?'':unit==='servings'?target.value:Number(target.value)/item.food.baseAmount;
      touch();const summary=document.querySelector('#nut-builder-totals');if(summary)summary.innerHTML=nutrientStats(draft.items,targetsAt(data().nutritionTargets,draft.date));return true;
    }
    return true;
  }
  async function change(target){
    if(!target.id?.startsWith('nut-')&&!target.hasAttribute('data-nut-unit'))return false;
    try {
      if(target.id==='nut-date'){await flush();if(!target.value)return true;state.date=target.value;state.editing=false;env.render();}
      if(target.id==='nut-group'){state.group=target.value;results();}
      if(target.hasAttribute('data-nut-unit')){state.units[target.dataset.nutUnit]=target.value;results();}
      if(target.id==='nut-range'){state.range=Number(target.value);state.limit=20;showProgress();}
      if(target.id==='nut-metric'){state.metric=target.value;showProgress();}
      if(target.id==='nut-end'&&target.value){state.end=target.value;state.limit=20;showProgress();}
      if(target.id==='nut-detail-date'&&target.value){state.detail=target.value;showProgress();}
    } catch(problem){env.toast(problem.message,true);}
    return true;
  }
  async function submit(form){
    const value=Object.fromEntries(new FormData(form));
    if(form.id==='nut-food-form'){
      const previous=data().foods.find(food=>food.id===form.dataset.id);
      const food=validateFood({...previous,...value,id:previous?.id||id(),archived:previous?.archived||false});
      await put('foods',food);
    } else {
      const targets=validateTargets([...data().nutritionTargets.filter(target=>target.date!==value.date),value]);
      await saveNutritionState({targets});
    }
    await env.refresh();env.closeModal();env.render();env.toast('Saved on this device.');
  }
  return {render,progress:()=>nutritionProgress(data(),state),action,input,change,submit,flush,reset,dirty:()=>Boolean(error||saving||saved!==revision)};
}
