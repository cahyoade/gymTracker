import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {}) });
const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
await context.route('https://accounts.google.com/**',route=>route.abort());
const page = await context.newPage(); page.setDefaultTimeout(10000);
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
const action=name=>page.locator(`[data-action="${name}"]`);
const closed=()=>page.waitForFunction(()=>!document.querySelector('#modal').open);
const nav=async view=>{await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current')==='page',view);};
const card=name=>page.locator('.exercise-card').filter({has:page.getByRole('heading',{name,exact:true})});
const workout=name=>page.locator('.workout-exercise').filter({has:page.getByRole('heading',{name,exact:true})});
const result=kind=>page.locator(`[data-recommendation="${kind}"]`);
const read=()=>page.evaluate(async()=>(await import('./js/db.js')).readData());
async function openBench(){await nav('exercises');await card('Bench press').locator('[data-action="exercise-guidance"]').click();}
try {
  await page.goto(origin); await page.locator('main h1').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready); await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await nav('exercises'); await card('Bench press').locator('[data-action="exercise-guidance"]').click();
  await page.getByText('Add this exercise to a routine to set its sets and rep range.',{exact:false}).waitFor();
  await action('close-modal').last().click(); await closed();
  // Test fixtures live only in this disposable browser context.
  await page.evaluate(async()=>{
    const db=await import('./js/db.js'), timestamp=new Date().toISOString();
    const routine={id:'muscle-gain',name:'Muscle gain A',updatedAt:timestamp,entries:['seed-bench-press','seed-pull-up'].map(exerciseId=>({exerciseId,setCount:3,repMin:8,repMax:12}))};
    await db.put('routines',routine);
  });
  await page.reload(); await card('Bench press').waitFor();
  await card('Bench press').locator('[data-action="exercise-guidance"]').click(); await result('baseline').waitFor();
  await action('close-modal').last().click(); await closed();
  console.log('PASS empty collection guidance and routine-based baseline without invented loads');

  await page.evaluate(async()=>{
    const db=await import('./js/db.js');
    for(const [id,days] of [['older',4],['newer',2]]) {
      const finishedAt=new Date(Date.now()-days*86400000).toISOString();
      await db.put('sessions',{id,status:'completed',routineId:id==='older'?'other-routine':'muscle-gain',routineName:id==='older'?'Another routine':'Muscle gain A',startedAt:finishedAt,finishedAt,updatedAt:finishedAt,notes:'',entries:['seed-bench-press','seed-pull-up'].map((exerciseId,index)=>({exerciseId,exerciseName:index?'Pull-up':'Bench press',plannedSets:3,repMin:8,repMax:12,sets:[1,2,3].map(position=>({id:`${id}-${index}-${position}`,position,weight:index?0:50,reps:12,completed:true}))}))});
    }
  });
  await page.reload(); await card('Bench press').waitFor();
  const before=await read();
  await card('Bench press').locator('[data-action="exercise-guidance"]').click(); await result('load').waitFor();
  assert.match(await result('load').textContent(),/52.5 kg/);
  await page.getByText('History used for this suggestion',{exact:true}).click();
  assert.equal(await page.locator('.progression-evidence>div').count(),2);
  assert.match(await page.locator('.progression-evidence').textContent(),/Another routine/);
  const increment=page.getByLabel('Smallest load increase (kg)',{exact:true});
  await increment.fill('10');await increment.press('Tab');await result('increment').waitFor();
  await increment.fill('1.25');await increment.press('Tab');await result('load').waitFor();
  assert.match(await result('load').textContent(),/51.25 kg/);
  assert.deepEqual(await read(),before);
  await action('close-modal').last().click(); await closed();
  await card('Pull-up').locator('[data-action="exercise-guidance"]').click();await result('bodyweight').waitFor();
  assert.equal(await page.locator('.progression-targets').getByText('2.5 kg',{exact:true}).count(),0);
  await action('close-modal').last().click(); await closed();
  console.log('PASS shared history, equipment increments, 10-percent guard, bodyweight guard and unchanged dataset');

  await nav('routines');await action('start').click();await page.locator('#workout-fields').waitFor();
  assert.equal(await page.locator('[data-field="weight"]').first().inputValue(),'');
  assert.equal(await page.locator('[data-field="reps"]').first().inputValue(),'');
  await page.locator('[data-field="weight"]').first().fill('51');await page.locator('[data-field="reps"]').first().fill('9');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Saved on this device');
  const active=await read();
  await workout('Bench press').locator('[data-action="workout-guidance"]').click();await result('load').waitFor();
  assert.equal(await increment.inputValue(),'1.25');
  await increment.fill('2.5');await increment.press('Tab');await result('load').waitFor();
  assert.equal(await page.locator('[data-field="weight"]').first().inputValue(),'51');
  assert.deepEqual(await read(),active);
  await action('close-modal').last().click();await closed();
  await context.setOffline(true);await page.reload();await action('resume').click();
  assert.equal(await page.locator('[data-field="weight"]').first().inputValue(),'51');
  await workout('Bench press').locator('[data-action="workout-guidance"]').click();await result('load').waitFor();
  assert.equal(await increment.inputValue(),'2.5');
  await action('progression-research').click();
  assert.equal(await page.locator('.progression-research a').count(),4);
  await page.getByText('These thresholds, the one-rep target, and the two-session rule',{exact:false}).waitFor();
  await action('close-modal').last().click();await closed();
  assert.equal(await page.locator('[data-field="reps"]').first().inputValue(),'9');
  await context.setOffline(false);
  console.log('PASS offline recommendations/research, saved increment, draft resume, blank inputs and preserved live logging');

  await action('discard-workout').click();await page.locator('.routine-card').waitFor();
  await nav('settings');
  const download=page.waitForEvent('download');await action('export').click();const backupPath=await(await download).path();
  await nav('history');await action('session-details').first().click();await action('edit-session').click();
  assert.equal(await page.locator('[data-progression-summary]').count(),0);
  await workout('Bench press').locator('[data-field="reps"]').last().fill('10');
  await workout('Bench press').locator('[data-field="completed"]').last().check();
  await action('finish-workout').click();await page.locator('.history-card').first().waitFor();
  await openBench();await result('reps').waitFor();
  assert.match(await page.locator('.progression-targets').textContent(),/11/);
  await action('close-modal').last().click();await closed();
  await nav('history');await action('session-details').first().click();await action('delete-session').click();await closed();
  await openBench();await result('confirm').waitFor();await action('close-modal').last().click();await closed();
  await nav('settings');await page.locator('#import-file').setInputFiles(backupPath);await action('confirm-restore').click();await closed();
  await openBench();await result('load').waitFor();
  assert.match(await result('load').textContent(),/52.5 kg/);
  await action('close-modal').last().click();await closed();
  console.log('PASS history corrections, deletion and transactional backup restore recalculate suggestions');

  // Denied preference storage changes only this visit, never the workout data.
  const restored=await read();await openBench();
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('form.loadIncrement.'))throw new DOMException('Denied','QuotaExceededError');return window.originalSetItem.call(this,key,value);};});
  await increment.fill('.5');await increment.press('Tab');await result('load').waitFor();
  await page.getByText('Increment changed for this visit. Your browser could not remember it.',{exact:true}).waitFor();
  assert.match(await result('load').textContent(),/50.5 kg/);assert.deepEqual(await read(),restored);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
  await mkdir('test-results',{recursive:true});
  for(const theme of ['Light','Dark']) {
    await page.evaluate(async theme=>(await import('./js/theme.js')).setThemePreference(theme.toLowerCase()),theme);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:950});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.evaluate(()=>{const dialog=document.querySelector('dialog');return dialog.scrollWidth<=dialog.clientWidth;}),true);
    }
  }
  await page.setViewportSize({width:390,height:1000});
  await page.screenshot({path:'test-results/progression-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/progression-desktop.png',fullPage:false});
  await action('progression-research').click();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:950});
    assert.equal(await page.evaluate(()=>{const dialog=document.querySelector('dialog');return dialog.scrollWidth<=dialog.clientWidth && document.documentElement.scrollWidth<=innerWidth;}),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS storage denial, light/dark targets, responsive research dialogs and error-free UI');
} finally {await context.close();await browser.close();}
