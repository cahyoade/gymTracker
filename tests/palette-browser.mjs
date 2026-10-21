import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context=await browser.newContext();
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const origin=process.env.APP_URL || 'http://localhost:4173';
try {
  await page.goto(`${origin}/#exercises`);await page.locator('.category').first().waitFor();
  const before=await page.evaluate(async()=> (await import('./js/db.js')).readData());
  await page.locator('[data-action="new-exercise"]').click();
  await page.getByRole('dialog').waitFor();
  const audit=await page.evaluate(async()=>{
    // Fixed literals belong in palette declarations. The only component-level
    // exceptions are the functional hue spectrum and black-to-white brightness scale.
    const literals=[];
    function inspect(rules) {
      for(const rule of rules) {
        if(rule.cssRules)inspect(rule.cssRules);
        if(!rule.style)continue;
        for(const property of rule.style) {
          if(property.startsWith('--'))continue;
          const value=rule.style.getPropertyValue(property);
          if(!/#[\da-f]{3,8}\b|\b(?:rgb|hsl|color)\(/i.test(value))continue;
          const scale=rule.selectorText?.includes('input[type="range"]') || rule.selectorText?.includes('input[type=range]');
          if(scale && property==='background-image' && /slider.*track|range-track/.test(rule.selectorText))continue;
          literals.push({selector:rule.selectorText,property,value});
        }
      }
    }
    for(const sheet of document.styleSheets)inspect(sheet.cssRules);
    const controller=await import('./js/theme.js');
    const fixture=document.createElement('div');fixture.hidden=true;
    fixture.innerHTML='<span class="restore-summary">Backup details</span><span class="form-error">Error</span><span class="toast">Saved</span><span class="toast error">Error</span><span data-color-probe></span>';
    document.body.append(fixture);
    const probe=fixture.querySelector('[data-color-probe]');
    const style=(selector,pseudo)=>getComputedStyle(document.querySelector(selector),pseudo);
    function snapshot() {
      const root=getComputedStyle(document.documentElement),tokens={};
      for(const name of root) {
        if(!name.startsWith('--') || !CSS.supports('color',root.getPropertyValue(name).trim()))continue;
        probe.style.color=`var(${name})`;tokens[name]=getComputedStyle(probe).color;
      }
      return {tokens,components:{
        category:style('.category').backgroundColor,
        restoreSummary:getComputedStyle(fixture.querySelector('.restore-summary')).backgroundColor,
        formError:getComputedStyle(fixture.querySelector('.form-error')).backgroundColor,
        errorToast:getComputedStyle(fixture.querySelector('.toast.error')).backgroundColor,
        errorToastInk:getComputedStyle(fixture.querySelector('.toast.error')).color,
        toastShadow:getComputedStyle(fixture.querySelector('.toast')).boxShadow,
        dropdown:style('dialog select').backgroundImage,
        dialogShadow:style('dialog').boxShadow,
        backdrop:style('dialog','::backdrop').backgroundColor,
        selection:style('body','::selection').backgroundColor,
        nativeAccent:root.accentColor,
        scrollbar:root.scrollbarColor
      }};
    }
    const states=[];
    try {
      for(const mode of ['light','dark'])for(const brightness of [0,50,100]) {
        controller.setThemePreference(mode);
        controller.setColorPreferences({background:27,foreground:214,brightness});const before=snapshot();
        controller.setColorPreferences({background:27,foreground:319,brightness});const foreground=snapshot();
        controller.setColorPreferences({background:235,foreground:319,brightness});const background=snapshot();
        states.push({mode,brightness,before,foreground,background});
      }
    } finally {fixture.remove();}
    return {literals,states};
  });
  assert.deepEqual(audit.literals,[],'Component colors must use palette tokens; keep only functional color scales fixed');
  const surfaces=new Set(['--paper','--white','--empty-bg']);
  const neutralBrand=new Set(['--brand-ink','--brand-on']);
  let tokenChecks=0;
  for(const {mode,brightness,before,foreground,background} of audit.states) {
    for(const name of Object.keys(before.tokens)) {
      const label=`${mode}/${brightness}/${name}`;tokenChecks++;
      if(surfaces.has(name) || neutralBrand.has(name))assert.equal(foreground.tokens[name],before.tokens[name],`${label}: preserves surface/brand`);
      else {
        assert.notEqual(foreground.tokens[name],before.tokens[name],`${label}: follows foreground hue`);
        assert.equal(background.tokens[name],foreground.tokens[name],`${label}: independent of background hue`);
      }
      if(neutralBrand.has(name))assert.equal(background.tokens[name],foreground.tokens[name],`${label}: brand remains neutral`);
    }
    for(const name of Object.keys(before.components)) {
      assert.notEqual(foreground.components[name],before.components[name],`${mode}/${brightness}/${name}: rendered style follows foreground`);
      // Scrollbars combine a foreground thumb and a background track.
      if(name!=='scrollbar')assert.equal(background.components[name],foreground.components[name],`${mode}/${brightness}/${name}: foreground and background are independent`);
    }
  }
  assert.ok(tokenChecks>150,'Audit must cover the full palette, not only selected examples');
  assert.deepEqual(await page.evaluate(async()=> (await import('./js/db.js')).readData()),before);
  assert.deepEqual(errors,[]);
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/palette-audit.json',JSON.stringify({tokenChecks,...audit,errors},null,2));
  console.log(`PASS ${tokenChecks} palette token checks and ${audit.states.length * 12} rendered color checks: all foreground tints, independent surfaces, neutral brand, dropdowns, errors, overlays, selection and scrollbars; no component color literals`);
} finally {await context.close();await browser.close();}
