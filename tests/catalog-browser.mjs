import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:390,height:950}});
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const origin=process.env.APP_URL || 'http://localhost:4173';
const action=name=>page.locator(`${name.startsWith('catalog-')?'dialog ':''}[data-action="${name}"]`);
const data=()=>page.evaluate(async()=> (await import('./js/db.js')).readData());
const close=()=>page.getByRole('button',{name:'Close dialog',exact:true}).click();
async function auditDialog() {
  const result=await page.locator('dialog').evaluate(dialog=>{
    const issues=[];
    for(const element of dialog.querySelectorAll('button,a,input,select')) {
      if(element.disabled)continue;
      const rect=element.getBoundingClientRect();
      if(rect.width<43.9 || rect.height<43.9)issues.push(`Small control: ${element.textContent || element.id}`);
    }
    const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=value=>rgb(value).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const walker=document.createTreeWalker(dialog,NodeFilter.SHOW_TEXT);let text;
    while(text=walker.nextNode()) {
      if(!text.textContent.trim() || text.parentElement.closest('option,button:disabled'))continue;
      const element=text.parentElement,style=getComputedStyle(element);let background;
      for(let parent=element;parent;parent=parent.parentElement) {
        const value=getComputedStyle(parent).backgroundColor;
        if(value!=='rgba(0, 0, 0, 0)' && value!=='transparent'){background=value;break;}
      }
      const a=lum(style.color),b=lum(background),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const large=parseFloat(style.fontSize)>=24 || (parseFloat(style.fontSize)>=18.66 && parseInt(style.fontWeight)>=700);
      if(contrast<(large?3:4.5))issues.push(`Low contrast: ${text.textContent.slice(0,40)}`);
    }
    if(document.documentElement.scrollWidth>innerWidth || dialog.scrollWidth>dialog.clientWidth)issues.push('Horizontal overflow');
    return issues;
  });
  assert.deepEqual(result,[]);
}
try {
  await page.goto(`${origin}/#exercises`);await action('browse-catalog').waitFor();
  const initial=await data();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await action('browse-catalog').click();await page.locator('.catalog-item').first().waitFor();
  assert.equal(await page.locator('.catalog-item').count(),24);
  await action('catalog-more').click();assert.equal(await page.locator('.catalog-item').count(),48);
  await page.locator('#catalog-search').fill('dumbbell');assert.equal(await page.locator('.catalog-item').count(),24);
  await page.locator('#catalog-bodyPart').selectOption('chest');await page.locator('#catalog-equipment').selectOption('dumbbell');
  assert.ok((await page.locator('.catalog-item').count())>0);
  await page.locator('#catalog-search').fill('no-such-exercise-789xyz');await page.getByText('No exercises match.',{exact:false}).waitFor();
  await page.locator('#catalog-search').fill('');
  console.log('PASS complete catalog, bounded lists, combined search/filters and empty state');

  const selected=await action('catalog-details').first().getAttribute('data-id');
  await action('catalog-details').first().click();await page.locator('.catalog-detail ol li').first().waitFor();
  await action('catalog-add').click();await page.getByText('Exercise added to your collection.',{exact:true}).waitFor();
  assert.equal((await data()).exercises.length,initial.exercises.length+1);
  const imported=(await data()).exercises.find(item=>item.catalogId===selected);
  assert.ok(imported);assert.equal(await action('catalog-add').isDisabled(),true);
  await close();
  const card=page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:imported.name,exact:true})});
  await card.locator('[data-action="edit-exercise"]').click();await page.locator('#exercise-form input[name="name"]').fill('My library lift');
  await page.getByRole('button',{name:'Save exercise',exact:false}).click();await page.locator('dialog').waitFor({state:'hidden'});
  assert.equal((await data()).exercises.find(item=>item.id===imported.id).catalogId,selected);
  await page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:'My library lift',exact:true})}).getByRole('button',{name:'Instructions',exact:true}).click();
  await page.locator('.catalog-detail ol li').first().waitFor();await close();
  console.log('PASS add, stable library reference, instructions and renaming without duplicates');

  await page.evaluate(async selected=>{
    const db=await import('./js/db.js'),catalog=await import('./js/catalog.js'),item=(await catalog.loadCatalog()).find(item=>item.id===selected);
    const current=await db.readData(),exercise=current.exercises.find(value=>value.catalogId===selected);
    await db.put('exercises',{...exercise,archived:true});
    await db.addCatalogExercise(item);
  },selected);
  assert.equal((await data()).exercises.find(item=>item.id===imported.id).archived,false);
  assert.equal((await data()).exercises.find(item=>item.id===imported.id).name,'My library lift');
  const concurrent=await context.newPage();await concurrent.goto(`${origin}/#exercises`);await concurrent.locator('main h1').waitFor();
  const concurrentId=await page.evaluate(async()=> (await (await import('./js/catalog.js')).loadCatalog()).find(item=>item.equipment==='barbell').id);
  await Promise.all([page,concurrent].map(target=>target.evaluate(async id=>{
    const catalog=await import('./js/catalog.js'),db=await import('./js/db.js');
    await db.addCatalogExercise((await catalog.loadCatalog()).find(item=>item.id===id));
  },concurrentId)));
  assert.equal((await data()).exercises.filter(item=>item.catalogId===concurrentId).length,1);await concurrent.close();
  console.log('PASS archived re-add preserves names and simultaneous tabs keep one catalog exercise');

  await page.reload();await action('browse-catalog').click();
  const beforeFailure=await data();
  await page.evaluate(()=>{
    window.originalCatalogTransaction=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(stores,mode,...rest) {
      if(mode==='readwrite' && Array.from(typeof stores==='string'?[stores]:stores).includes('exercises'))throw new DOMException('Test storage failure','QuotaExceededError');
      return window.originalCatalogTransaction.call(this,stores,mode,...rest);
    };
  });
  await action('catalog-add').filter({hasText:'Add to collection'}).first().click();
  await page.getByText('Test storage failure',{exact:true}).waitFor();
  assert.deepEqual((await data()).exercises,beforeFailure.exercises);
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=window.originalCatalogTransaction;});
  await action('catalog-add').filter({hasText:'Add to collection'}).first().click();
  await page.getByText('Exercise added to your collection.',{exact:true}).waitFor();await close();
  const failedContext=await browser.newContext({serviceWorkers:'block'}),failedPage=await failedContext.newPage();
  await failedContext.route('**/data/exercises.json',route=>route.abort());
  await failedPage.goto(`${origin}/#exercises`);await failedPage.locator('[data-action="browse-catalog"]').click();
  await failedPage.getByText('The exercise library is unavailable. Open Form online once, then try again.',{exact:true}).waitFor();
  assert.equal(await failedPage.locator('dialog').isVisible(),false);
  await failedContext.unroute('**/data/exercises.json');await failedPage.locator('[data-action="browse-catalog"]').click();
  await failedPage.locator('.catalog-item').first().waitFor();await failedContext.close();
  console.log('PASS failed storage/import leaves records intact and retries; interrupted library fetch recovers');

  await context.setOffline(true);await page.reload();await action('browse-catalog').click();await page.locator('.catalog-item').first().waitFor();
  await page.locator('#catalog-search').fill('barbell');await page.locator('#catalog-bodyPart').selectOption('back');
  await action('catalog-details').first().click();await page.locator('.catalog-detail ol li').first().waitFor();await close();
  await page.locator('nav [data-view="routines"]').click();await action('new-routine').click();
  await page.locator('#routine-name').fill('Library workout');await page.locator('#routine-exercise').selectOption(imported.id);await action('editor-add').click();
  await page.getByRole('button',{name:'Save routine',exact:false}).click();await action('start').click();
  const first=page.locator('.set-row').first();await first.locator('[data-field="weight"]').fill('20');await first.locator('[data-field="reps"]').fill('10');await first.locator('[data-field="completed"]').check();
  await page.waitForFunction(()=>document.querySelector('#save-status')?.textContent==='Saved on this device');await page.reload();
  await action('resume').click();assert.equal(await first.locator('[data-field="reps"]').inputValue(),'10');
  await action('finish-workout').click();await page.waitForFunction(()=>!document.querySelector('#workout-fields'));
  assert.equal((await data()).sessions.find(item=>item.status==='completed').entries[0].exerciseId,imported.id);
  const roundtrip=await page.evaluate(async()=>{
    const db=await import('./js/db.js'),backup=await import('./js/backup.js');
    const snapshot=backup.validateBackup(JSON.stringify(db.snapshotFromData(await db.readData())));
    await db.replaceData(snapshot);return db.readData();
  });
  assert.ok(roundtrip.exercises.find(item=>item.id===imported.id).catalogId);
  assert.ok(roundtrip.sessions.find(item=>item.status==='completed'));
  await context.setOffline(false);
  console.log('PASS offline library/details, routine workout, reload/resume/completion and backup/restore');

  await page.goto(`${origin}/#exercises`);await action('browse-catalog').click();
  for(const mode of ['light','dark'])for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:950});
    await page.evaluate(async mode=>{const theme=await import('./js/theme.js');theme.setThemePreference(mode);theme.setColorPreferences({background:27,foreground:214,brightness:50});},mode);
    await auditDialog();
    await action('catalog-details').first().click();await auditDialog();await page.getByRole('button',{name:'Back to library',exact:true}).click();
  }
  await page.setViewportSize({width:390,height:950});await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/catalog-mobile.png'});
  const scrollStyle=await page.locator('dialog').evaluate(dialog=>({
    width:getComputedStyle(dialog).scrollbarWidth,colors:getComputedStyle(dialog).scrollbarColor,
    overflow:getComputedStyle(document.documentElement).overflow,
    scrollable:dialog.scrollHeight>dialog.clientHeight
  }));
  assert.equal(scrollStyle.width,'thin');assert.match(scrollStyle.colors,/rgba/);
  assert.equal(scrollStyle.overflow,'hidden');assert.equal(scrollStyle.scrollable,true);
  await page.locator('#modal-title').focus();await page.keyboard.press('PageDown');
  await page.waitForFunction(()=>document.querySelector('dialog').scrollTop>0);
  assert.deepEqual(errors,[]);
  await page.locator('#catalog-search').focus();await page.keyboard.type('squat');await page.keyboard.press('Escape');
  // Native search fields consume the first Escape to clear their value.
  assert.equal(await page.locator('#catalog-search').inputValue(),'');
  await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'hidden'});
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
  console.log('PASS 16 library/detail design states: mobile/desktop, custom themes, contrast, 44px controls, keyboard search/Escape; no browser errors');
} finally {await context.close();await browser.close();}
