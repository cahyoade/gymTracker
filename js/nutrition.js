import { FOOD_GROUPS } from './food-seeds.js';
export const NUTRIENTS = [{key:'calories',label:'Calories',unit:'kcal'}, {key:'protein',label:'Protein',unit:'g'}, {key:'carbs',label:'Carbohydrate',unit:'g'}, {key:'fat',label:'Fat',unit:'g'}];
export const DEFAULT_TARGETS = [{date:'0001-01-01',calories:2500,proteinMin:120,proteinMax:135,carbs:null,fat:null}];
const ensure = (value,message) => {if(!value)throw new Error(message);};
const object = value => value && typeof value==='object' && !Array.isArray(value);
const text = (value,max=160) => typeof value==='string' && value.trim().length>0 && value.length<=max;
const identifier = value => text(value,100);
export function validDate(value) {return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;}
export function shiftDate(value,days) {ensure(validDate(value),'Choose a valid date.'); const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function nutrientNumber(value,optional=false) {
  if(optional && (value===null || value===undefined || value===''))return null;
  ensure((typeof value==='number' || (typeof value==='string' && value.trim()!=='')) && Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=1000000,'Nutrients must be finite, nonnegative values (or blank when unknown).');
  return Number(value);
}
export function validateFood(input) {
  ensure(object(input),'Invalid food.');const food=structuredClone(input);
  ensure(identifier(food.id) && text(food.name) && FOOD_GROUPS.includes(food.group) && text(food.portion),'Give the food a name, group and base portion.');
  ensure(typeof food.archived==='boolean','Invalid food archive status.');
  for(const {key} of NUTRIENTS)food[key]=nutrientNumber(food[key],key==='carbs'||key==='fat');
  if(food.baseAmount==='' || food.baseAmount===undefined)food.baseAmount=null;
  if(food.baseAmount===null) {ensure(food.baseUnit===null || food.baseUnit==='' || food.baseUnit===undefined,'A conversion needs a base amount.');food.baseUnit=null;}
  else {food.baseAmount=nutrientNumber(food.baseAmount);ensure(food.baseAmount>0 && ['g','ml'].includes(food.baseUnit),'Use a positive base amount and g or ml.');}
  for(const key of ['source','macroNote','macroUrl']) {food[key]??='';ensure(typeof food[key]==='string' && food[key].length<=2000,'Food source notes are too long.');}
  ensure(!food.macroUrl || /^https:\/\/[^\s]+$/.test(food.macroUrl),'Source links must use HTTPS.');
  return food;
}
export function validateTargets(input) {
  ensure(Array.isArray(input) && input.length>0 && input.length<=10000,'Invalid nutrition targets.');const dates=new Set();
  return input.map(item=>{ensure(object(item) && validDate(item.date) && !dates.has(item.date),'Targets need unique valid effective dates.');dates.add(item.date);
    const target={date:item.date};for(const key of ['calories','proteinMin','proteinMax','carbs','fat'])target[key]=nutrientNumber(item[key],true);
    ensure((target.proteinMin===null && target.proteinMax===null) || (target.proteinMin!==null && target.proteinMax!==null && target.proteinMax>=target.proteinMin),'Enter both protein bounds with the maximum at least the minimum.');return target;
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
export function targetsAt(targets,date) {return [...targets].sort((a,b)=>a.date.localeCompare(b.date)).filter(t=>t.date<=date).at(-1) || {calories:null,proteinMin:null,proteinMax:null,carbs:null,fat:null};}
export function quantityInServings(amount,unit,food) {const number=Number(amount);ensure(String(amount).trim()!=='' && Number.isFinite(number) && number>=0 && number<=100000,'Enter a valid portion quantity.');if(unit==='servings')return number;ensure(food.baseUnit===unit && food.baseAmount>0,'This food has no conversion for that unit.');return number/food.baseAmount;}
export function mealItem(food,quantity) {return {foodId:food.id,food:structuredClone(food),quantity};}
export function validateMeal(input,{draft=false}={}) {
  ensure(object(input) && identifier(input.id) && validDate(input.date) && typeof input.name==='string' && input.name.length<=160,'Invalid meal name or date.');
  ensure(Array.isArray(input.items) && input.items.length<=(draft?200:1000) && (draft || input.items.length>0),'Choose at least one food.');
  ensure(typeof input.updatedAt==='string' && Number.isFinite(Date.parse(input.updatedAt)),'Invalid meal timestamp.');
  const seen=new Set();const items=input.items.map(item=>{ensure(object(item) && identifier(item.foodId) && !seen.has(item.foodId),'Invalid or duplicate meal food.');seen.add(item.foodId);
    const food=validateFood(item.food);ensure(food.id===item.foodId,'Food snapshot identity does not match.');
    if(draft) {ensure((typeof item.quantity==='string' && item.quantity.length<=30 && (item.quantity==='' || Number.isFinite(Number(item.quantity)))) || (typeof item.quantity==='number' && Number.isFinite(item.quantity)),'Invalid draft quantity.');return {...item,food};}
    const quantity=quantityInServings(item.quantity,'servings',food);ensure(draft || quantity>0,'Logged portions must be positive.');return {foodId:food.id,food,quantity};
  });return {...input,name:input.name.trim() || (draft?'':'Meal'),items};
}
export function validateDay(day) {ensure(object(day) && day.id===day.date && validDate(day.date) && typeof day.complete==='boolean' && typeof day.updatedAt==='string' && Number.isFinite(Date.parse(day.updatedAt)),'Invalid food-day state.');return structuredClone(day);}
export function totals(items) {
  return Object.fromEntries(NUTRIENTS.map(({key})=>{let value=0,missing=0,count=0;
    for(const item of items){const q=Number(item.quantity);if(!Number.isFinite(q)||q<=0)continue;count++;if(item.food[key]===null || item.food[key]===undefined)missing++;else value+=item.food[key]*q;}
    return [key,{value,missing,count,complete:count>0 && missing===0}];
  }));
}
export function nutritionSeries(meals,days,targets,{end,range=7,metric='calories'}={}) {
  ensure(validDate(end) && [7,30,90].includes(Number(range)) && NUTRIENTS.some(n=>n.key===metric),'Invalid nutrition chart range.');
  const byDate=new Map();for(const meal of meals){if(!byDate.has(meal.date))byDate.set(meal.date,[]);byDate.get(meal.date).push(...meal.items);}
  const points=Array.from({length:Number(range)},(_,i)=>{const date=shiftDate(end,i-Number(range)+1),items=byDate.get(date)||[],total=totals(items)[metric];return {date,total,logged:items.length>0,complete:days.some(d=>d.date===date&&d.complete),target:targetsAt(targets,date)};});
  const qualifying=points.filter(p=>p.logged&&p.complete&&p.total.complete),completed=points.filter(p=>p.logged&&p.complete).length;
  return {points,completed,coverage:qualifying.length,average:qualifying.length?qualifying.reduce((sum,p)=>sum+p.total.value,0)/qualifying.length:null};
}
export function validateNutrition(data,{legacy=false}={}) {
  if(legacy)return {foods:[],foodMeals:[],foodDays:[],nutritionTargets:structuredClone(DEFAULT_TARGETS),foodDraft:null};
  const result={};
  for(const [key,validator] of [['foods',validateFood],['foodMeals',validateMeal],['foodDays',validateDay]]) {
    ensure(Array.isArray(data[key]) && data[key].length<=100000,`Invalid ${key} list.`);const ids=new Set();
    result[key]=data[key].map(value=>{const record=validator(value);ensure(!ids.has(record.id),`Duplicate ${key} ID.`);ids.add(record.id);return record;});
  }
  result.nutritionTargets=validateTargets(data.nutritionTargets);
  result.foodDraft=data.foodDraft===null?null:validateMeal(data.foodDraft,{draft:true});
  const foodIds=new Set(result.foods.map(f=>f.id));
  for(const meal of [...result.foodMeals,...(result.foodDraft?[result.foodDraft]:[])]) for(const item of meal.items)ensure(foodIds.has(item.foodId),'Meal references an unknown food.');
  return result;
}
