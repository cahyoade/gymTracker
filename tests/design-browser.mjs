import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin=process.env.APP_URL || 'http://localhost:4173';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
const context=await browser.newContext({serviceWorkers:'block'});
await context.route(`${origin}/js/config.js`,route=>route.fulfill({contentType:'text/javascript',body:"export const GOOGLE_CLIENT_ID = '';"}));
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[],reports=[];page.on('pageerror',error=>errors.push(error.message));
const action=name=>page.locator(`[data-action="${name}"]`);
const nav=async view=>{await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current')==='page',view);};
async function audit(state,palette,width) {
  const result=await page.evaluate(()=>{
    const visible=el=>{
      const closed=el.closest('details:not([open])');
      if(closed && !closed.querySelector('summary')?.contains(el))return false;
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return r.width>1 && r.height>1 && s.visibility!=='hidden' && s.opacity!=='0' && !el.closest('.sr-only,[aria-hidden="true"]');
    };
    const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=value=>rgb(value).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const background=el=>{for(let node=el;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;}return 'rgb(255,255,255)';};
    const label=el=>(el.getAttribute('aria-label')||el.textContent||el.type||el.tagName).trim().slice(0,65);
    const root=document.querySelector('dialog[open]')||document.body;
    const contrast=[],smallType=[],controls=[];let checks=0,min=100;
    function textCheck(el,text,style=getComputedStyle(el)) {
      if(el.closest('[disabled]')||!visible(el))return;
      const a=lum(style.color),b=lum(background(el)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const size=parseFloat(style.fontSize),large=size>=24 || (size>=18.66&&parseInt(style.fontWeight)>=700);
      checks++;min=Math.min(min,ratio);
      if(ratio<(large?3:4.5))contrast.push({text:text.slice(0,65),ratio,size,fg:style.color,bg:background(el)});
      if(size<12)smallType.push({text:text.slice(0,65),size});
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let text;
    while(text=walker.nextNode()){
      const el=text.parentElement;
      if(!text.textContent.trim()||['STYLE','SCRIPT','OPTION','TITLE'].includes(el.tagName)||el.closest('svg'))continue;
      textCheck(el,text.textContent.trim());
    }
    for(const input of root.querySelectorAll('input[placeholder],textarea[placeholder]'))if(input.placeholder)textCheck(input,input.placeholder,getComputedStyle(input,'::placeholder'));
    for(const el of root.querySelectorAll('button,a[href],input,select,textarea,summary')){
      if(!visible(el)||el.matches(':disabled'))continue;
      const r=el.getBoundingClientRect();
      if(r.width<43.9||r.height<43.9)controls.push({label:label(el),width:r.width,height:r.height});
    }
    return{contrast,smallType,controls,checks,min,overflow:document.documentElement.scrollWidth>innerWidth+1};
  });
  reports.push({state,palette,width,...result});
}
try {
  await page.goto(origin);await page.locator('main h1').waitFor();
  await page.evaluate(async()=>{
    const db=await import('./js/db.js'),model=await import('./js/model.js');
    const routine={id:'design-routine',name:'Upper body',updatedAt:model.now(),entries:[{exerciseId:'seed-bench-press',setCount:3,repMin:8,repMax:12}]};
    await db.put('routines',routine);
    const current=await db.readData(),draft=model.createDraft(routine,current.exercises);
    for(const set of draft.entries[0].sets)Object.assign(set,{weight:42.5,reps:12,completed:true});
    await db.put('sessions',model.finishSession(draft));
    for(const [id,date,weight] of [['m1','2026-10-01',75],['m2','2026-10-16',76]])await db.put('bodyMeasurements',{id,date,weight,muscleMass:32,bodyFat:20,updatedAt:model.now()});
    await db.replaceData(db.snapshotFromData(await db.readData()));
  });
  await page.reload();await page.locator('.routine-card').waitFor();await mkdir('test-results',{recursive:true});
  for(const palette of ['light','dark','custom-light','custom-dark']) {
    await page.evaluate(async palette=>{const theme=await import('./js/theme.js');theme.resetColorPreferences();theme.setThemePreference(palette.endsWith('dark')?'dark':'light');if(palette.startsWith('custom'))theme.setColorPreferences({background:235,foreground:315,brightness:100});},palette);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      for(const view of ['routines','exercises','history','progress','settings']) {
        await nav(view);await audit(view,palette,width);
        if(view==='exercises'){
          await page.locator('.exercise-card').filter({has:page.getByRole('heading',{name:'Bench press',exact:true})}).locator('[data-action="exercise-records"]').click();
          await audit('personal-records',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        }
        if(view==='history'){
          await action('session-details').first().click();
          assert.ok((await page.locator('.modal-heading .small-text').textContent()).length>0);
          await audit('session-details',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        }
        if(view==='progress'){
          await action('new-measurement').first().click();
          await audit('measurement-editor',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        }
        if(view==='settings'){
          assert.equal(await page.locator('.settings-card h2').first().textContent(),'File backup');
          assert.equal(await page.locator('#custom-colors').getAttribute('open'),null);
          await page.locator('#custom-colors summary').click();await page.locator('#background-hue').waitFor();await audit('settings-colors',palette,width);
          await action('restore-recovery').click();
          await audit('restore-preview',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
        }
        if(['light','dark'].includes(palette)&&[390,1440].includes(width)&&['routines','settings'].includes(view))await page.screenshot({path:`test-results/refined-${view}-${palette}-${width}.png`,fullPage:false});
      }
      await nav('routines');await action('edit-routine').click();await audit('routine-editor',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      await action('start').click();await page.locator('#workout-fields').waitFor();await audit('workout',palette,width);
      if(['light','dark'].includes(palette)&&width===390)await page.screenshot({path:`test-results/refined-workout-${palette}.png`,fullPage:true});
      await nav('exercises');await action('new-exercise').click();await audit('exercise-editor',palette,width);await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      // Keep a single saved draft; starting again resumes it.
    }
  }
  // Native disclosure and dialog controls must work without a pointer.
  await nav('settings');
  await page.locator('#custom-colors summary').focus();await page.keyboard.press('Enter');
  assert.notEqual(await page.locator('#custom-colors').getAttribute('open'),null);
  const focus=await page.locator('#custom-colors summary').evaluate(el=>{const s=getComputedStyle(el);return{style:s.outlineStyle,width:parseFloat(s.outlineWidth)};});
  assert.notEqual(focus.style,'none');assert.ok(focus.width>=2);
  await nav('progress');await action('new-measurement').click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').getAttribute('open'),null);
  const failures=reports.filter(report=>report.contrast.length||report.smallType.length||report.controls.length||report.overflow);
  await writeFile('test-results/design-verification.json',JSON.stringify({reports,errors},null,2));
  console.log(JSON.stringify(failures.slice(0,3),null,2));
  assert.equal(failures.length,0,'See test-results/design-verification.json for failing states');assert.deepEqual(errors,[]);
  console.log(`PASS ${reports.length} rendered design states: default/custom themes, contrast, 12px text, 44px controls, disclosures, keyboard focus and Escape.`);
}finally{await context.close();await browser.close();}
