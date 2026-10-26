import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_FOODS } from '../js/food-seeds.js';
import { DEFAULT_TARGETS, validateFood, validateMeal, validateTargets, validateNutrition, totals, mealItem, quantityInServings, nutritionSeries, targetsAt, shiftDate } from '../js/nutrition.js';
import { validateBackup } from '../js/backup.js';
import { nutritionChart } from '../js/nutrition-ui.js';
const date='2026-10-26',stamp=`${date}T12:00:00Z`;
const food=id=>SEED_FOODS.find(f=>f.id===`food-${id}`);
const meal=(items,day=date)=>({id:`meal-${day}`,date:day,name:'Meal',items,updatedAt:stamp});
const snapshot=()=>({schemaVersion:3,exportedAt:stamp,exercises:[],routines:[],sessions:[],bodyMeasurements:[],workoutPreferences:{unit:'kg'},foods:structuredClone(SEED_FOODS),foodMeals:[meal([mealItem(food('rice'),2)])],foodDays:[{id:date,date,complete:true,updatedAt:stamp}],nutritionTargets:structuredClone(DEFAULT_TARGETS),foodDraft:null});
test('19 starter foods preserve supplied calories/protein and reproduce the reference day and warteg plate',()=>{
  assert.equal(SEED_FOODS.length,19);SEED_FOODS.forEach(f=>assert.deepEqual(validateFood(f),f));
  const selected=[['rice',5],['chicken',1],['egg',3],['tempe',1],['beans',1],['greens',1],['milk',2],['banana',2]].map(([id,q])=>mealItem(food(id),q));
  assert.equal(totals(selected).calories.value,2169);assert.equal(totals(selected).protein.value,103);
  const plate=[['rice',2],['chicken',1],['tempe',1],['beans',1]].map(([id,q])=>mealItem(food(id),q));
  assert.equal(totals(plate).calories.value,980);assert.equal(totals(plate).protein.value,56);
});
test('fractional portions and gram/ml conversions use the declared basis only',()=>{
  assert.equal(quantityInServings(150,'g',food('rice')),1.5);assert.equal(quantityInServings(125,'ml',food('milk')),.5);
  assert.equal(totals([mealItem(food('egg'),.5)]).calories.value,39);
  for(const args of [[100,'g',food('chicken')],[-1,'servings',food('rice')],['','servings',food('rice')],[Infinity,'servings',food('rice')]])assert.throws(()=>quantityInServings(...args));
});
test('unknown macros are partial, known zero is included, and no grams/energy difference is invented',()=>{
  const known={...food('rice'),carbs:0,fat:0},items=[mealItem(known,2),mealItem(food('chicken'),1)];
  assert.deepEqual(totals(items).carbs,{value:0,missing:1,count:2,complete:false});
  assert.equal(totals([mealItem(known,1)]).carbs.complete,true);assert.equal(totals([]).calories.complete,false);
});
test('meal snapshots survive food edits/archiving; invalid and blank portions cannot be logged',()=>{
  const original=structuredClone(food('rice')),item=mealItem(original,1);original.name='New rice';original.calories=999;original.archived=true;
  assert.equal(item.food.name,'Nasi putih');assert.equal(item.food.calories,130);
  for(const quantity of ['',-1,Infinity,NaN,0])assert.throws(()=>validateMeal(meal([{...item,quantity}])));
  assert.doesNotThrow(()=>validateMeal(meal([{...item,quantity:''}]),{draft:true}));
  assert.throws(()=>validateMeal(meal([item,item])));assert.throws(()=>validateMeal({...meal([item]),date:'2026-02-30'}));
});
test('effective dates preserve prior targets, validate optional goals and reject reversed ranges',()=>{
  const targets=validateTargets([...DEFAULT_TARGETS,{date:'2026-11-01',calories:'2600',proteinMin:'125',proteinMax:'140',carbs:'',fat:null}]);
  assert.equal(targetsAt(targets,date).calories,2500);assert.equal(targetsAt(targets,'2026-11-01').calories,2600);
  assert.throws(()=>validateTargets([{...DEFAULT_TARGETS[0],proteinMax:100}]));assert.throws(()=>validateTargets([DEFAULT_TARGETS[0],DEFAULT_TARGETS[0]]));
  assert.equal(shiftDate('2026-12-31',1),'2027-01-01');assert.equal(shiftDate('2028-03-01',-1),'2028-02-29');
});
test('averages exclude gaps, in-progress days and missing nutrients with separate coverage',()=>{
  const meals=[meal([mealItem(food('rice'),1)],'2026-10-24'),meal([mealItem(food('chicken'),1)],'2026-10-25'),meal([mealItem(food('rice'),2)])];
  const days=meals.slice(0,2).map(m=>({date:m.date,complete:true}));
  const calories=nutritionSeries(meals,days,DEFAULT_TARGETS,{end:date,range:7,metric:'calories'});
  assert.equal(calories.completed,2);assert.equal(calories.coverage,2);assert.equal(calories.average,300);assert.equal(calories.points.filter(p=>!p.logged).length,4);
  const carbs=nutritionSeries(meals,days,DEFAULT_TARGETS,{end:date,range:7,metric:'carbs'});assert.equal(carbs.coverage,1);assert.equal(carbs.average,food('rice').carbs);
  assert.doesNotMatch(nutritionChart(carbs,{key:'carbs',label:'Carbohydrate',unit:'g'}),/NaN|Infinity/);
});
test('schema 3 round trips nutrition and drafts; old backups receive starters without meal history',()=>{
  const value=snapshot();value.foodDraft={...meal([mealItem(food('egg'),'')]),id:'draft'};
  assert.deepEqual(validateBackup(JSON.stringify(value)),value);
  for(const version of [1,2]){const legacy={schemaVersion:version,exportedAt:stamp,exercises:[],routines:[],sessions:[],bodyMeasurements:[],workoutPreferences:{unit:'kg'}};
    const migrated=validateBackup(legacy);assert.equal(migrated.schemaVersion,3);assert.equal(migrated.foods.length,19);assert.deepEqual(migrated.foodMeals,[]);assert.equal(migrated.foodDraft,null);}
});
test('malformed nutrition imports reject references, duplicate IDs, invalid amounts/dates/goals without mutating input',()=>{
  const changes=[b=>delete b.foodMeals,b=>b.foods.push(b.foods[0]),b=>b.foodMeals[0].items[0].quantity=-1,b=>b.foodMeals[0].date='2026-02-30',b=>b.foodMeals[0].items[0].foodId='missing',b=>b.foods[0].calories=null,b=>b.foodDays[0].id='other',b=>b.nutritionTargets[0].proteinMax=10,b=>b.foodDraft={},b=>b.foodMeals[0].items[0].food.macroUrl='javascript:alert(1)'];
  for(const change of changes){const value=snapshot();change(value);const before=structuredClone(value);assert.throws(()=>validateBackup(value));assert.deepEqual(value,before);}
  const value=snapshot();assert.deepEqual(validateNutrition(value).foodMeals,value.foodMeals);
});
