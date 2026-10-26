import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin=process.env.APP_URL || 'http://localhost:4173';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
const context=await browser.newContext({viewport:{width:390,height:950},acceptDownloads:true});
await context.route('https://accounts.google.com/**',route=>route.abort());
await context.route(`${origin}/__test__/blank`,route=>route.fulfill({contentType:'text/html',body:'<title>Isolated migration fixture</title>'}));
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const action=name=>page.locator(`[data-action="${name}"]`);
const closed=()=>page.waitForFunction(()=>!document.querySelector('#modal').open);
const nav=async view=>{await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current')==='page',view);};
const read=()=>page.evaluate(async()=>(await import('./js/db.js')).readData());
const field=name=>page.locator(`#measurement-form [name="${name}"]`);
async function add(date,weight='',muscleMass='',bodyFat='') {
  await action('new-measurement').first().click();
  for(const [key,value] of Object.entries({date,weight,muscleMass,bodyFat})) await field(key).fill(String(value));
  await page.getByRole('button',{name:'Save measurement',exact:false}).click();await closed();
}
try {
  await page.goto(`${origin}/__test__/blank`);
  // Old v1 database fixture, with a renamed/archived exercise and live draft.
  const original=await page.evaluate(async()=>{
    const model=await import('/js/model.js'), stamp=new Date().toISOString();
    const exercises=structuredClone(model.SEED_EXERCISES);exercises[0].name='My preserved squat';exercises[0].archived=true;
    const routine={id:'old-routine',name:'Preserved routine',updatedAt:stamp,entries:[{exerciseId:exercises[0].id,setCount:3,repMin:8,repMax:12}]};
    const draft=model.createDraft(routine,exercises);draft.entries[0].sets[0].weight='42.5';draft.notes='Keep this active draft';
    const oldSnapshot={schemaVersion:1,exportedAt:stamp,exercises,routines:[routine],sessions:[draft],workoutPreferences:{unit:'kg'}};
    await new Promise((resolve,reject)=>{
      const request=indexedDB.open('form-training',1);
      request.onupgradeneeded=()=>{for(const name of ['exercises','routines','sessions','metadata'])request.result.createObjectStore(name,{keyPath:'id'});};
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result,tx=db.transaction(['exercises','routines','sessions','metadata'],'readwrite');
        for(const exercise of exercises)tx.objectStore('exercises').put(exercise);
        tx.objectStore('routines').put(routine);tx.objectStore('sessions').put(draft);
        tx.objectStore('metadata').put({id:'preferences',unit:'kg'});
        tx.objectStore('metadata').put({id:'state',revision:7,backedUpRevision:7,lastDriveBackupAt:stamp,lastExportAt:null});
        tx.objectStore('metadata').put({id:'recovery',snapshot:oldSnapshot,restoredAt:stamp});
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };
    });return{exercises,routine,draft,oldSnapshot};
  });
  await page.goto(`${origin}/#progress`);await page.getByRole('heading',{name:'Progress',exact:true}).waitFor();
  const upgraded=await read();
  assert.deepEqual(upgraded.exercises,[...original.exercises].sort((a,b)=>a.id.localeCompare(b.id)));
  assert.deepEqual(upgraded.sessions,[original.draft]);assert.deepEqual(upgraded.bodyMeasurements,[]);
  assert.equal(upgraded.state.revision,8);assert.equal(upgraded.state.backedUpRevision,7);
  assert.deepEqual(upgraded.recovery.snapshot,original.oldSnapshot);
  assert.equal(await page.evaluate(async()=>(await(await import('./js/db.js')).openDB()).version),3);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  console.log('PASS database v1-to-v3 upgrade preserves exercises, routines, draft, preferences and recovery, and marks the new food library unbacked-up');

  await add('2026-10-02','75','32','20');await add('2026-10-09','76','33.5','19.4');await add('2026-10-16','76.2');
  assert.equal(await page.locator('.measurement-card').count(),3);
  assert.match(await page.locator('[aria-label="Latest muscle mass"]').textContent(),/33.5/);
  assert.match(await page.locator('[aria-label="Latest body fat"]').textContent(),/-0.6 percentage points/);
  assert.equal((await read()).bodyMeasurements.find(item=>item.date==='2026-10-16').muscleMass,null);
  assert.deepEqual((await read()).sessions,[original.draft]);assert.equal((await read()).state.revision,11);
  await page.locator('#body-metric').selectOption('muscleMass');assert.match(await page.locator('.body-chart').getAttribute('aria-label'),/Muscle mass trend/);
  await context.setOffline(true);await page.reload();await page.locator('.measurement-card').first().waitFor();
  assert.equal(await page.locator('.measurement-card').count(),3);assert.deepEqual((await read()).sessions,[original.draft]);
  console.log('PASS partial/decimal records, per-metric latest readings and changes, chart selection, offline reload and unchanged draft');

  await action('edit-measurement').first().click();await field('weight').fill('75.8');await page.getByRole('button',{name:'Save measurement',exact:false}).click();await closed();
  assert.match(await page.locator('[aria-label="Latest body weight"]').textContent(),/75.8/);
  await action('new-measurement').first().click();await field('date').fill('2026-10-09');await field('weight').fill('80');
  await page.getByRole('button',{name:'Save measurement',exact:false}).click();await page.locator('#form-error').waitFor();
  assert.match(await page.locator('#form-error').textContent(),/already exists/);assert.equal(await field('weight').inputValue(),'80');
  await field('date').fill('2026-10-15');await field('weight').fill('');await page.getByRole('button',{name:'Save measurement',exact:false}).click();
  assert.match(await page.locator('#form-error').textContent(),/at least one/);
  await field('weight').fill('74');await field('bodyFat').fill('101');await page.getByRole('button',{name:'Save measurement',exact:false}).click();
  assert.equal(await field('bodyFat').evaluate(input=>input.validity.valid),false);await field('bodyFat').fill('18');
  await page.evaluate(()=>{window.originalBodyTx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')throw new DOMException('Test storage full','QuotaExceededError');return window.originalBodyTx.apply(this,args);};});
  await page.getByRole('button',{name:'Save measurement',exact:false}).click();
  await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('storage full'));
  assert.equal(await field('weight').inputValue(),'74');assert.equal((await read()).bodyMeasurements.length,3);
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=window.originalBodyTx;});
  await page.getByRole('button',{name:'Save measurement',exact:false}).click();await closed();
  assert.equal((await read()).bodyMeasurements.length,4);
  const unique=await page.evaluate(async()=>{const db=await import('./js/db.js'),data=await db.readData();try{await db.put('bodyMeasurements',{...data.bodyMeasurements[0],id:'duplicate-date'});return false;}catch{return true;}});
  assert.equal(unique,true);assert.equal((await read()).bodyMeasurements.length,4);
  console.log('PASS corrections, duplicate-date constraint, validation, storage failure with preserved fields, and retry');

  await context.setOffline(false);await nav('settings');const download=page.waitForEvent('download');await action('export').click();
  const exportPath=await(await download).path(), exported=JSON.parse(await readFile(exportPath,'utf8'));
  assert.equal(exported.schemaVersion,3);assert.equal(exported.bodyMeasurements.length,4);
  const beforeRestore=await read();
  const invalid=structuredClone(exported);invalid.bodyMeasurements[0].bodyFat=101;
  await page.locator('#import-file').setInputFiles({name:'invalid-measurements.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await page.getByText('Body fat must be between 0 and 100%.',{exact:true}).waitFor();
  assert.deepEqual((await read()).bodyMeasurements,beforeRestore.bodyMeasurements);
  await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original.oldSnapshot))});
  assert.match(await page.locator('.restore-summary').textContent(),/0 body measurements/);
  await action('confirm-restore').click();await closed();
  assert.equal((await read()).bodyMeasurements.length,0);assert.equal((await read()).recovery.snapshot.bodyMeasurements.length,4);
  await action('restore-recovery').click();await action('confirm-restore').click();await closed();assert.equal((await read()).bodyMeasurements.length,4);
  await nav('progress');await action('edit-measurement').first().click();await action('delete-measurement').click();await closed();
  assert.equal((await read()).bodyMeasurements.length,3);
  await nav('settings');await page.locator('#import-file').setInputFiles(exportPath);await action('confirm-restore').click();await closed();
  assert.deepEqual((await read()).bodyMeasurements,exported.bodyMeasurements);
  const beforeAbort=await read();
  const aborted=await page.evaluate(async()=>{const db=await import('./js/db.js'),snapshot=db.snapshotFromData(await db.readData()),clear=IDBObjectStore.prototype.clear;IDBObjectStore.prototype.clear=function(...args){const request=clear.apply(this,args);if(this.name==='bodyMeasurements')this.transaction.abort();return request;};try{await db.replaceData(snapshot);return false;}catch{return true;}finally{IDBObjectStore.prototype.clear=clear;}});
  assert.equal(aborted,true);assert.deepEqual(await read(),beforeAbort);
  console.log('PASS v2 export/import, invalid import rejection, legacy restore with recovery, deletion and atomic abort');

  await nav('progress');await mkdir('test-results',{recursive:true});
  for(const theme of ['light','dark']) {
    await page.evaluate(async theme=>(await import('./js/theme.js')).setThemePreference(theme),theme);
    for(const width of [320,390,640,768,1440]) {
      await page.setViewportSize({width,height:1050});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('nav a')].every(node=>node.getBoundingClientRect().width>=44)),true);
      assert.equal(await page.locator('nav [data-view]').count(),6);
      await action('new-measurement').first().click();
      assert.equal(await page.evaluate(()=>{const dialog=document.querySelector('dialog');return dialog.scrollWidth<=dialog.clientWidth;}),true);
      await action('close-modal').last().click();await closed();
    }
  }
  await page.evaluate(()=>{document.querySelector('#toast').hidden=true;});
  await page.setViewportSize({width:390,height:1050});await page.screenshot({path:'test-results/body-progress-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/body-progress-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS light/dark measurement view, charts, six-item navigation, and editor at mobile/tablet/desktop widths');
}finally{await context.close();await browser.close();}
