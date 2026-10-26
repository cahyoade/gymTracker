import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.APP_URL||'http://localhost:4181';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('dialog',dialog=>dialog.accept());
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const action=name=>page.locator(`[data-action="nut-${name}"]`);
const read=()=>page.evaluate(async()=>(await import('./js/db.js')).readData());
const saved=()=>page.waitForFunction(()=>document.querySelector('#nut-save-status')?.textContent==='Meal draft saved on this device');
const clickFood=id=>page.locator(`[data-action="nut-add"][data-id="food-${id}"]`).click();
const check=async(name,run)=>{await run();console.log(`PASS ${name}`);};
try {
  await check('v2 migration preserves workouts/body records and adds 19 foods once',async()=>{
    await page.goto(`${origin}/manifest.webmanifest`);
    await page.evaluate(async()=>{
      const model=await import('./js/model.js');const routine={id:'old-routine',name:'Keep workout',updatedAt:new Date().toISOString(),entries:[{exerciseId:'seed-bench-press',setCount:3,repMin:8,repMax:12}]};
      const draft=model.createDraft(routine,model.SEED_EXERCISES);draft.notes='Workout survives nutrition';
      await new Promise((resolve,reject)=>{const request=indexedDB.open('form-training',2);request.onupgradeneeded=()=>{for(const name of ['exercises','routines','sessions','metadata','bodyMeasurements'])request.result.createObjectStore(name,{keyPath:'id'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction(['exercises','routines','sessions','metadata','bodyMeasurements'],'readwrite');for(const exercise of model.SEED_EXERCISES)tx.objectStore('exercises').put(exercise);tx.objectStore('routines').put(routine);tx.objectStore('sessions').put(draft);tx.objectStore('metadata').put({id:'preferences',unit:'kg'});tx.objectStore('metadata').put({id:'state',revision:10});tx.objectStore('bodyMeasurements').put({id:'old-body',date:'2026-10-20',weight:62,muscleMass:null,bodyFat:null,updatedAt:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
    });
    await page.goto(`${origin}/#food`);await page.getByRole('heading',{name:'Food',exact:true}).waitFor();
    const data=await read();assert.equal(data.foods.length,19);assert.equal(data.foodMeals.length,0);assert.equal(data.sessions[0].notes,'Workout survives nutrition');assert.equal(data.bodyMeasurements[0].weight,62);assert.equal(data.state.revision,11);
  });
  await check('visible food library creates, searches and edits custom foods for meal assembly',async()=>{
    await page.getByRole('button',{name:'Food library',exact:true}).click();await action('food-new').click();
    await page.locator('#nut-food-form [name="name"]').fill('Test tofu bowl');await page.locator('#nut-food-form [name="portion"]').fill('1 bowl');await page.locator('#nut-food-form [name="calories"]').fill('200');await page.locator('#nut-food-form [name="protein"]').fill('15');
    await page.getByRole('button',{name:'Save food',exact:true}).click();await action('library').click();await page.locator('#nut-library-search').fill('tofu');assert.equal(await page.locator('#nut-library-results article').count(),1);
    await page.getByRole('button',{name:'Edit Test tofu bowl',exact:true}).click();await page.locator('#nut-food-form [name="calories"]').fill('240');await page.getByRole('button',{name:'Save food',exact:true}).click();
    const custom=(await read()).foods.find(food=>food.name==='Test tofu bowl');assert.equal(custom.calories,240);
    await action('new').click();await page.locator('#nut-search').fill('tofu');await page.locator(`[data-action="nut-add"][data-id="${custom.id}"]`).click();await saved();assert.match(await page.locator('#nut-builder-totals').innerText(),/240/);
    assert.equal(await page.locator('#meal-builder [data-action="nut-food-new"]').count(),1);await action('discard').click();
  });
  await check('fresh plate, half servings, gram conversion, draft isolation and offline resume',async()=>{
    await action('new').click();await clickFood('rice');await page.locator('[data-nut-unit="food-rice"]').selectOption('g');await page.locator('[data-nut-quantity="food-rice"]').fill('200');
    await clickFood('chicken');await clickFood('tempe');await clickFood('beans');await page.locator('#nut-meal-name').fill('Warteg lunch');await saved();
    const data=await read();assert.equal(data.foodMeals.length,0);assert.equal(data.foodDraft.items.find(i=>i.foodId==='food-rice').quantity,2);
    assert.match(await page.locator('#nut-builder-totals').innerText(),/980/);assert.match(await page.locator('#nut-builder-totals').innerText(),/56/);
    await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await action('resume').click();
    assert.equal(await page.locator('#nut-meal-name').inputValue(),'Warteg lunch');assert.equal(await page.locator('[data-nut-quantity="food-rice"]').inputValue(),'2');
    await action('log').click();await page.locator('.meal-card').waitFor();assert.equal((await read()).foodMeals.length,1);assert.equal((await read()).foodDraft,null);
    await action('new').click();assert.equal(await page.locator('[data-nut-quantity]').count(),0);await action('discard').click();
  });
  await check('completion, Progress averages, unknown macro coverage and correction reopening',async()=>{
    await action('complete').click();await page.locator('nav [data-view="progress"]').click();await page.locator('#nutrition-progress').waitFor();
    assert.match(await page.locator('#nutrition-progress').innerText(),/980 kcal daily average/);assert.match(await page.locator('#nutrition-progress').innerText(),/1 of 7 days complete/);
    await page.locator('#nut-metric').selectOption('carbs');assert.match(await page.locator('#nutrition-progress').innerText(),/No complete-day average/);assert.match(await page.locator('#nutrition-progress').innerText(),/Partial/);
    await page.locator('nav [data-view="food"]').click();await action('edit').click();await page.locator('[data-nut-quantity="food-rice"]').fill('1.5');await action('log').click();await page.waitForFunction(async()=>!(await(await import('./js/db.js')).readData()).foodDays[0].complete);
    assert.equal((await read()).foodMeals.length,1);assert.equal((await read()).foodMeals[0].items.find(i=>i.foodId==='food-rice').quantity,1.5);
  });
  await check('food editing and archiving preserve old meal snapshots; targets keep effective dates',async()=>{
    await action('library').click();await page.locator('[data-action="nut-food-edit"][data-id="food-rice"]').click();await page.locator('#nut-food-form [name="name"]').fill('Edited rice');await page.locator('#nut-food-form [name="calories"]').fill('140');await page.getByRole('button',{name:'Save food',exact:true}).click();
    assert.equal((await read()).foodMeals[0].items[0].food.name,'Nasi putih');assert.equal((await read()).foodMeals[0].items[0].food.calories,130);
    await action('library').click();await page.locator('[data-action="nut-food-archive"][data-id="food-rice"]').click();await action('modal-close').click();assert.equal((await read()).foods.find(f=>f.id==='food-rice').archived,true);
    await action('targets').click();await page.locator('#nut-target-form [name="date"]').fill('2026-11-01');await page.locator('#nut-target-form [name="calories"]').fill('2600');await page.getByRole('button',{name:'Save targets',exact:true}).click();
    const targets=(await read()).nutritionTargets;assert.equal(targets.length,2);assert.equal(targets[0].calories,2500);assert.equal(targets[1].calories,2600);
  });
  await check('invalid imports and interrupted transactions preserve records; legacy recovery includes nutrition',async()=>{
    const legacyFile=await page.evaluate(async()=>{const d=await(await import('./js/db.js')).readData();return {schemaVersion:2,exportedAt:new Date().toISOString(),exercises:d.exercises,routines:d.routines,sessions:d.sessions,bodyMeasurements:d.bodyMeasurements,workoutPreferences:{unit:'kg'}};});
    await page.locator('nav [data-view="settings"]').click();await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyFile))});
    await page.getByText('This older backup contains no nutrition history.',{exact:false}).waitFor();await page.locator('[data-action="close-modal"]').first().click();await page.locator('nav [data-view="food"]').click();
    const report=await page.evaluate(async()=>{
      const db=await import('./js/db.js'),{validateBackup}=await import('./js/backup.js');const before=await db.readData(),snapshot=db.snapshotFromData(before);
      const roundTrip=validateBackup(JSON.stringify(snapshot));let rejected=false;try{validateBackup({...snapshot,foodMeals:[{...snapshot.foodMeals[0],items:[{...snapshot.foodMeals[0].items[0],quantity:-1}]}]});}catch{rejected=true;}
      const legacy=validateBackup({schemaVersion:2,exportedAt:new Date().toISOString(),exercises:before.exercises,routines:before.routines,sessions:before.sessions,bodyMeasurements:before.bodyMeasurements,workoutPreferences:{unit:'kg'}});
      await db.replaceData(legacy);const after=await db.readData();const recovery=validateBackup(after.recovery.snapshot);await db.replaceData(recovery);
      return {rejected,roundTrip:roundTrip.foodMeals.length,legacyMeals:after.foodMeals.length,recoveryMeals:recovery.foodMeals.length,restoredMeals:(await db.readData()).foodMeals.length};
    });
    assert.deepEqual(report,{rejected:true,roundTrip:1,legacyMeals:0,recoveryMeals:1,restoredMeals:1});
    await context.setOffline(false);
    // Force one transactional meal write to abort after scheduling writes.
    const before=await read();
    const aborted=await page.evaluate(async()=>{const db=await import('./js/db.js'),database=await db.openDB(),original=database.transaction.bind(database);database.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'&&args[0].includes('foodMeals'))setTimeout(()=>{try{tx.abort();}catch{}},0);return tx;};let failed=false;try{const data=await db.readData();await db.saveFoodMeal({...data.foodMeals[0],name:'Should roll back'});}catch{failed=true;}database.transaction=original;return failed;});
    assert.equal(aborted,true);assert.deepEqual((await read()).foodMeals,before.foodMeals);
  });
  await check('saved drafts survive failed persistence, date switches and active-workout updates',async()=>{
    await page.reload();await action('new').click();await clickFood('egg');await saved();
    await page.evaluate(async()=>{const db=await(await import('./js/db.js')).openDB(),original=db.transaction.bind(db);window.restoreNutritionTransactions=()=>db.transaction=original;db.transaction=(stores,mode,...rest)=>{if(mode==='readwrite')throw new Error('Simulated disk full');return original(stores,mode,...rest);};});
    await page.locator('#nut-meal-name').fill('Keep visible');await page.getByText('Not saved · retry before closing',{exact:true}).waitFor();assert.equal(await page.locator('#nut-meal-name').inputValue(),'Keep visible');
    await page.evaluate(()=>window.restoreNutritionTransactions());await action('retry').click();await saved();
    await action('prev').click();await action('resume').click();assert.equal(await page.locator('#nut-meal-name').inputValue(),'Keep visible');
    // Simulate a release through the same server mechanism as the workout suite.
    await context.request.post(`${origin}/__test__/release`);await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});await page.locator('#update-banner').waitFor({state:'visible'});await page.locator('#apply-update').click();await page.waitForEvent('load');await action('resume').click();assert.equal(await page.locator('#nut-meal-name').inputValue(),'Keep visible');assert.equal((await read()).sessions[0].notes,'Workout survives nutrition');
  });
  await check('90-day ranges bound history to 20 dates and expand without losing meals',async()=>{
    await page.evaluate(async()=>{const db=await import('./js/db.js'),{shiftDate}=await import('./js/nutrition.js'),data=await db.readData(),base=data.foodMeals[0];const puts=[];for(let i=1;i<=25;i++){const date=shiftDate(base.date,-i);puts.push({store:'foodMeals',value:{...base,id:`history-${i}`,date}});puts.push({store:'foodDays',value:{id:date,date,complete:true,updatedAt:base.updatedAt}});}await db.mutate({puts});});
    await page.locator('nav [data-view="progress"]').click();await page.locator('#nut-range').selectOption('90');assert.equal(await page.locator('.nutrition-history>div').count(),20);await action('more').click();assert.equal(await page.locator('.nutrition-history>div').count(),26);
    await page.locator('nav [data-view="food"]').click();await page.locator('#meal-builder').waitFor();
  });
  await check('mobile/desktop keyboard and palette layout across six navigation items',async()=>{
    await mkdir('test-results',{recursive:true});
    const plus=page.locator('[data-action="nut-plus"][data-id="food-egg"]');await plus.focus();await plus.press('Space');await saved();assert.equal((await read()).foodDraft.items[0].quantity,1.5);assert.equal(await plus.evaluate(node=>document.activeElement===node),true);
    await page.locator('[data-action="nut-filter"][data-selected="true"]').click();
    for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:900});await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.customColors='true';document.documentElement.style.setProperty('--foreground-hue','220');document.documentElement.style.setProperty('--background-hue','90');},theme);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width} ${theme}`);
      const targets=await page.locator('nav a').evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));assert.equal(targets.length,6);assert.ok(targets.every(t=>t.width>=44&&t.height>=44));
      const dates=await page.locator('.food-datebar').evaluate(node=>{const controls=[...node.querySelectorAll('button,input')].map(control=>control.getBoundingClientRect());return {rows:new Set(controls.map(r=>Math.round(r.top))).size,minWidth:Math.min(...controls.map(r=>r.width)),minHeight:Math.min(...controls.map(r=>r.height))};});assert.equal(dates.rows,1);assert.ok(dates.minWidth>=44&&dates.minHeight>=44);
    }
    await page.setViewportSize({width:390,height:844});await page.locator('#meal-builder').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/nutrition-meal-mobile.png'});
    await page.locator('nav [data-view="progress"]').click();await page.screenshot({path:'test-results/nutrition-progress-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
  });
} finally {await context.close();await browser.close();}
