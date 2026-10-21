import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin=process.env.APP_URL || 'http://localhost:4173';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:390,height:950}});
await context.route('https://accounts.google.com/**',route=>route.abort());
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
const action=name=>page.locator(`[data-action="${name}"]`);
const nav=async view=>{await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current')==='page',view);};
const read=()=>page.evaluate(async()=> (await import('./js/db.js')).readData());
const latest=()=>page.locator('.strength-latest strong').textContent();
async function bench(){await page.locator('#strength-exercise').selectOption('seed-bench-press');}
async function audit() {
  return page.locator('#strength-progress').evaluate(root=>{
    const problems=[];
    if(document.documentElement.scrollWidth>innerWidth || root.scrollWidth>root.clientWidth)problems.push('Overflow');
    const visible=el=>el.getBoundingClientRect().width>0 && !el.closest('details:not([open]) :not(summary)');
    for(const el of root.querySelectorAll('select,summary,a,button')) {
      if(!visible(el))continue;const rect=el.getBoundingClientRect();
      if(rect.width<43.9 || rect.height<43.9)problems.push('Small control: '+el.tagName);
    }
    const lum=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let text;
    while(text=walker.nextNode()) {
      const el=text.parentElement;
      if(!text.textContent.trim() || el.closest('option,svg') || !visible(el))continue;
      const style=getComputedStyle(el);let background;
      for(let node=el;node;node=node.parentElement) {const color=getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)' && color!=='transparent'){background=color;break;}}
      const a=lum(style.color),b=lum(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const size=parseFloat(style.fontSize),large=size>=24 || (size>=18.66 && parseInt(style.fontWeight)>=700);
      if(size<12)problems.push('Small type');if(ratio<(large?3:4.5))problems.push('Low contrast: '+text.textContent.slice(0,35));
    }
    return problems;
  });
}
try {
  await page.goto(`${origin}/#progress`);await page.getByRole('heading',{name:'Progress',exact:true}).waitFor();
  await page.getByText('Complete a set in a workout to start a strength trend.',{exact:false}).waitFor();
  await page.evaluate(async()=>{
    const db=await import('./js/db.js'),model=await import('./js/model.js'),data=await db.readData();
    const routines=[{id:'strength-upper',name:'Upper A',updatedAt:model.now(),entries:[{exerciseId:'seed-bench-press',setCount:2,repMin:6,repMax:12}]},
      {id:'strength-full',name:'Full body',updatedAt:model.now(),entries:[{exerciseId:'seed-bench-press',setCount:2,repMin:6,repMax:12}]},
      {id:'strength-pull',name:'Pull day',updatedAt:model.now(),entries:[{exerciseId:'seed-pull-up',setCount:2,repMin:6,repMax:12}]}];
    for(const routine of routines)await db.put('routines',routine);
    const fixtures=[['strength-b1',0,'2026-10-01T08:00:00Z',[[40,10],[35,15]]],['strength-b2',1,'2026-10-08T08:00:00Z',[[45,8],[40,9]]],['strength-b3',0,'2026-10-14T08:00:00Z',[[50,6],[45,10]]],
      ['strength-p1',2,'2026-10-02T08:00:00Z',[[0,8]]],['strength-p2',2,'2026-10-16T08:00:00Z',[[0,12]]]];
    for(const [id,routineIndex,time,sets] of fixtures) {
      const draft=model.createDraft(routines[routineIndex],data.exercises);draft.id=id;draft.startedAt=time;draft.finishedAt=time;
      sets.forEach(([weight,reps],index)=>Object.assign(draft.entries[0].sets[index],{weight,reps,completed:true}));
      await db.put('sessions',model.finishSession(draft));
    }
    const draft=model.createDraft(routines[0],data.exercises);draft.notes='Preserve strength test draft';
    Object.assign(draft.entries[0].sets[0],{weight:999,reps:99,completed:true});await db.put('sessions',draft);
    for(const [id,date,weight] of [['body-1','2026-10-01',75],['body-2','2026-10-16',76]])await db.put('bodyMeasurements',{id,date,weight,muscleMass:32,bodyFat:20,updatedAt:model.now()});
  });
  await page.reload();await page.locator('#strength-exercise').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const before=await read();
  assert.equal(await page.locator('#strength-exercise').inputValue(),'seed-pull-up');
  assert.equal(await page.locator('#strength-metric').inputValue(),'reps');assert.equal(await latest(),'0 kg × 12 reps');
  await bench();assert.equal(await page.locator('#strength-metric').inputValue(),'weight');assert.equal(await latest(),'50 kg × 6 reps');
  assert.equal(await page.locator('.strength-chart circle').count(),3);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'strength-exercise');
  await page.locator('.strength-records summary').click();assert.equal(await page.locator('.strength-records tbody tr').count(),3);
  assert.match(await page.locator('.strength-records').textContent(),/Full body/);
  await page.locator('#strength-metric').selectOption('reps');await page.locator('#strength-load').selectOption('45');
  assert.equal(await latest(),'45 kg × 10 reps');assert.equal(await page.locator('.strength-chart circle').count(),2);
  assert.match(await page.locator('.strength-result').textContent(),/\+2 reps/);
  await page.locator('#body-metric').selectOption('muscleMass');assert.match(await page.locator('.body-chart').getAttribute('aria-label'),/Muscle mass/);
  assert.deepEqual(await read(),before);
  console.log('PASS derived session sets across routines, paired load/reps, fixed-weight comparisons, bodyweight, exact table and untouched body/draft data');

  await context.setOffline(true);await page.reload();await bench();assert.equal(await latest(),'50 kg × 6 reps');
  await page.locator('#strength-metric').selectOption('reps');await page.locator('#strength-load').selectOption('40');
  assert.equal(await latest(),'40 kg × 9 reps');assert.match(await page.locator('.strength-result').textContent(),/-1 reps/);
  await context.setOffline(false);
  console.log('PASS complete offline reopening, exercise selection and same-load rep trends');

  await nav('history');await page.locator('[data-action="session-details"][data-id="strength-b3"]').click();await action('edit-session').click();
  const row=page.locator('.set-row').first();await row.locator('[data-field="weight"]').fill('47.5');await row.locator('[data-field="reps"]').fill('9');await row.locator('[data-field="completed"]').check();
  await action('finish-workout').click();await page.locator('.history-card').first().waitFor();
  await nav('progress');await bench();assert.equal(await latest(),'47.5 kg × 9 reps');
  await nav('history');await page.locator('[data-action="session-details"][data-id="strength-b3"]').click();await action('delete-session').click();
  await nav('progress');await bench();assert.equal(await latest(),'45 kg × 8 reps');assert.equal(await page.locator('.strength-chart circle').count(),2);
  await nav('exercises');const card=page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:'Bench press',exact:true})});
  await card.locator('[data-action="edit-exercise"]').click();await page.locator('#exercise-form [name="name"]').fill('My bench');
  await page.getByRole('button',{name:'Save exercise',exact:false}).click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:'My bench',exact:true})}).locator('[data-action="archive-exercise"]').click();
  await nav('progress');await bench();assert.equal(await page.locator('#strength-exercise option:checked').textContent(),'My bench (archived)');assert.equal(await latest(),'45 kg × 8 reps');
  assert.deepEqual((await read()).bodyMeasurements,before.bodyMeasurements);assert.deepEqual((await read()).sessions.find(item=>item.status==='draft'),before.sessions.find(item=>item.status==='draft'));
  console.log('PASS real history corrections, session deletion and exercise rename/archive recalculate strength without losing body data or draft');

  const backup=await page.evaluate(async()=>{const db=await import('./js/db.js');return db.snapshotFromData(await db.readData());});
  assert.equal(Object.hasOwn(backup,'strength'),false);
  await page.evaluate(async()=>{const db=await import('./js/db.js'),data=await db.readData();await db.mutate({deletes:data.sessions.filter(item=>item.status==='completed').map(item=>({store:'sessions',id:item.id}))});});
  await nav('routines');await nav('progress');await page.getByText('Complete a set in a workout to start a strength trend.',{exact:false}).waitFor();
  await nav('settings');await page.locator('#import-file').setInputFiles({name:'strength-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await action('confirm-restore').click();await page.locator('dialog').waitFor({state:'hidden'});await nav('progress');await bench();assert.equal(await latest(),'45 kg × 8 reps');
  assert.deepEqual((await read()).bodyMeasurements,before.bodyMeasurements);
  console.log('PASS empty-history fallback and backup restore reconstruct charts with no new schema or persisted strength scores');

  let checks=0;
  for(const palette of ['light','dark','custom-light','custom-dark'])for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1000});
    await page.evaluate(async palette=>{const theme=await import('./js/theme.js');theme.resetColorPreferences();theme.setThemePreference(palette.endsWith('dark')?'dark':'light');if(palette.startsWith('custom'))theme.setColorPreferences({background:27,foreground:214,brightness:50});},palette);
    for(const metric of ['weight','reps']) {
      await page.locator('#strength-metric').selectOption(metric);
      await page.locator('.strength-records summary').click();assert.deepEqual(await audit(),[],`${palette}/${width}/${metric}`);checks++;
    }
  }
  await page.locator('#strength-metric').selectOption('weight');await page.setViewportSize({width:390,height:1000});await mkdir('test-results',{recursive:true});
  await page.locator('#toast').waitFor({state:'hidden'});
  await page.locator('#strength-progress').screenshot({path:'test-results/strength-progress-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/strength-progress-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${checks} strength design states: default/custom themes, mobile/desktop, contrast, 12px type, 44px controls and no overflow`);
} finally {await context.close();await browser.close();}
