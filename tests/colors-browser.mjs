import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}) });
const contexts=[];
const context=await browser.newContext({colorScheme:'light',viewport:{width:1440,height:1000}});contexts.push(context);
await context.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`
window.google={accounts:{id:{initialize(){},disableAutoSelect(){},renderButton(container){
window.googleRenderCount=(window.googleRenderCount||0)+1;const button=document.createElement('button');button.textContent='Sign in with Google';container.replaceChildren(button);
}},oauth2:{initTokenClient(options){return options;}}}};`}));
const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const hue=key=>page.getByRole('spinbutton',{name:`${key} hue in degrees`,exact:true});
const theme=name=>page.getByRole('group',{name:'Color theme'}).getByRole('button',{name,exact:true});
const data=()=>page.evaluate(async()=> (await import('./js/db.js')).readData());
const background=()=>page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor);
async function openColors(target=page) {
  const details=target.locator('#custom-colors');
  await details.waitFor();
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
}
try {
  await page.goto(`${origin}/#settings`);await openColors();await hue('Background').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  const before=await data(), original=await background();
  await page.getByRole('slider',{name:'Background hue'}).press('Home');
  await page.getByRole('slider',{name:'Background hue'}).press('ArrowRight');
  assert.equal(await hue('Background').inputValue(),'1');
  await hue('Background').fill('235');await hue('Foreground').fill('195');
  assert.equal(await page.locator('#background-hue-output').textContent(),'235°');
  assert.equal(await page.locator('#foreground-hue-output').textContent(),'195°');
  assert.notEqual(await background(),original);assert.deepEqual(await data(),before);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('form.colors'))),{background:235,foreground:195});
  assert.match(await page.locator('meta[name="theme-color"]').getAttribute('content'),/235/);
  console.log('PASS keyboard sliders, numeric hues, live colors, browser color and unchanged workout data');

  // Exercise rendered borders and the empty/set-row styles without creating workout data.
  const borderChecks = await page.evaluate(async()=>{
    const controller=await import('./js/theme.js');
    const fixture=document.createElement('div');fixture.hidden=true;
    fixture.innerHTML='<div class="empty"></div><div class="set-row"></div>';
    document.body.append(fixture);
    const border=(selector,side='borderTopColor')=>getComputedStyle(document.querySelector(selector))[side];
    const sample=()=>({
      borders:[border('.sidebar','borderRightColor'),border('.palette-preview'),border('#background-hue + input'),
        getComputedStyle(fixture.querySelector('.empty')).borderTopColor,
        getComputedStyle(fixture.querySelector('.set-row')).borderTopColor],
      surface:getComputedStyle(document.documentElement).backgroundColor,
      brand:getComputedStyle(document.querySelector('.brand-symbol')).backgroundColor
    });
    const checks=[];
    try {
      for(const mode of ['light','dark'])for(const brightness of [0,50,100]){
        controller.setThemePreference(mode);
        controller.setColorPreferences({background:235,foreground:195,brightness});const before=sample();
        controller.setColorPreferences({background:235,foreground:315,brightness});const foreground=sample();
        controller.setColorPreferences({background:55,foreground:315,brightness});const background=sample();
        checks.push({mode,brightness,before,foreground,background});
      }
    } finally {
      fixture.remove();controller.setThemePreference('light');
      controller.setColorPreferences({background:235,foreground:195});
    }
    return checks;
  });
  for(const {mode,brightness,before,foreground,background} of borderChecks){
    const label=`${mode}, brightness ${brightness}`;
    before.borders.forEach((color,index)=>assert.notEqual(foreground.borders[index],color,`${label}: border ${index} follows foreground`));
    assert.equal(foreground.surface,before.surface,`${label}: foreground preserves surface`);
    assert.deepEqual(background.borders,foreground.borders,`${label}: background preserves borders`);
    // Pure white/black surfaces at brightness endpoints have no visible hue.
    if(brightness===50)assert.notEqual(background.surface,foreground.surface,`${label}: background changes surface`);
    assert.equal(foreground.brand,before.brand,`${label}: brand stays neutral`);
  }
  console.log('PASS borders and workout dividers follow foreground independently of surfaces in both themes at all brightness limits');

  await theme('Dark').click();await context.setOffline(true);await page.reload();await openColors();await hue('Background').waitFor();
  assert.equal(await hue('Background').inputValue(),'235');assert.equal(await hue('Foreground').inputValue(),'195');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.customColors),'true');
  for(const view of ['routines','exercises','history','settings']) {
    await page.locator(`nav [data-view="${view}"]`).click();await page.waitForFunction(view=>document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current')==='page',view);
    assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--background-hue')),'235');
  }
  await context.setOffline(false);await theme('System').click();await page.emulateMedia({colorScheme:'dark'});
  await openColors();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await hue('Foreground').inputValue(),'195');
  console.log('PASS custom colors persist through offline reload, navigation, light/dark and device changes');

  await page.getByRole('button',{name:'Sign in with Google',exact:true}).waitFor();
  const renders=await page.evaluate(()=>window.googleRenderCount);
  for(const value of ['90','180','270','195'])await hue('Foreground').fill(value);
  assert.equal(await page.evaluate(()=>window.googleRenderCount),renders,'Hue changes must not recreate Google sign-in');
  const other=await context.newPage();await other.goto(`${origin}/#settings`);await openColors(other);await other.locator('#background-hue').waitFor();
  await hue('Background').fill('220');
  await other.waitForFunction(()=>document.documentElement.style.getPropertyValue('--background-hue')==='220');
  await page.getByRole('button',{name:'Reset colors',exact:true}).click();
  await other.waitForFunction(()=>document.documentElement.dataset.customColors==='false');await other.close();
  assert.equal(await page.evaluate(()=>localStorage.getItem('form.colors')),null);
  console.log('PASS cross-tab updates and reset restore defaults without rebuilding Google controls');

  await page.evaluate(()=>{window.originalColorSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='form.colors')throw new DOMException('Denied','QuotaExceededError');return window.originalColorSet.call(this,key,value);};});
  await hue('Background').fill('300');
  await page.getByText('Colors changed for this visit. Your browser could not remember the choice.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--background-hue')),'300');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalColorSet;});
  await hue('Background').fill('400');assert.equal(await hue('Background').inputValue(),'359');
  await hue('Foreground').fill('-10');assert.equal(await hue('Foreground').inputValue(),'0');
  await page.evaluate(()=>localStorage.setItem('form.colors','{"background":"invalid","foreground":null}'));
  await page.reload();await openColors();await hue('Background').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.customColors),'false');
  console.log('PASS denied storage, out-of-range values and malformed saved colors stay usable');

  const boot=await browser.newContext({serviceWorkers:'block'});contexts.push(boot);
  await boot.addInitScript(()=>{localStorage.setItem('form.theme','dark');localStorage.setItem('form.colors',JSON.stringify({background:235,foreground:195,brightness:25}));});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await boot.route(`${origin}/js/app.js`,async route=>{await gate;await route.continue();});
  const initial=await boot.newPage();await initial.goto(origin,{waitUntil:'commit'});
  await initial.waitForFunction(()=>document.documentElement.dataset.customColors==='true');
  assert.equal(await initial.evaluate(()=>document.documentElement.style.getPropertyValue('--foreground-hue')),'195');
  assert.equal(await initial.evaluate(()=>document.documentElement.style.getPropertyValue('--brightness-offset')),'-4.5%');
  assert.match(await initial.locator('meta[name="theme-color"]').getAttribute('content'),/235/);
  release();await initial.locator('main h1').waitFor();await boot.close();
  console.log('PASS custom hues apply before app startup without a default-palette flash');

  const brightness = page.getByRole('slider', { name:'Background brightness', exact:true });
  const brightnessNumber = page.getByRole('spinbutton', { name:'Background brightness in percent', exact:true });
  await theme('Dark').click();
  await hue('Background').fill('235'); await hue('Foreground').fill('195');
  await brightness.press('Home'); const dim = await background();
  await brightness.press('End'); assert.notEqual(await background(), dim);
  assert.equal(await brightnessNumber.inputValue(), '100');
  await brightness.press('ArrowLeft'); assert.equal(await brightnessNumber.inputValue(), '99');
  await brightnessNumber.fill('25');
  await brightnessNumber.fill('150'); assert.equal(await brightnessNumber.inputValue(),'100');
  await brightnessNumber.fill('-10'); assert.equal(await brightnessNumber.inputValue(),'0');
  await brightnessNumber.fill('25');
  assert.equal(await page.locator('#background-brightness-output').textContent(), '25%');
  assert.equal(await brightness.getAttribute('aria-valuetext'), '25 percent');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('form.colors')).brightness),25);
  const savedBackground = await background();
  const brightnessTab = await context.newPage(); await brightnessTab.goto(`${origin}/#settings`);
  await brightnessNumber.fill('35');
  await brightnessTab.waitForFunction(()=>document.querySelector('#background-brightness').value==='35');
  await brightnessTab.close(); await brightnessNumber.fill('25');
  await context.setOffline(true); await page.reload(); await openColors(); await brightness.waitFor();
  assert.equal(await brightnessNumber.inputValue(),'25'); assert.equal(await background(),savedBackground);
  await context.setOffline(false); await theme('Light').click();
  assert.equal(await brightnessNumber.inputValue(),'25');
  await page.getByRole('button',{name:'Reset colors',exact:true}).click();
  assert.equal(await brightnessNumber.inputValue(),'50');
  assert.equal(await page.evaluate(()=>localStorage.getItem('form.colors')),null);
  assert.deepEqual(await data(),before);
  console.log('PASS brightness keyboard/numeric input, live surfaces, offline persistence, cross-tab updates, themes and reset');

  // Read computed CSS colors, not duplicate palette formulas. Sweep independent
  // background/foreground hues in both modes, including saturated yellow/blue.
  const measurements=await page.evaluate(async()=>{
    const controller=await import('./js/theme.js'), root=document.documentElement;
    const probe=document.createElement('span');document.body.append(probe);
    const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=value=>rgb(value).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const pairs=[['--ink','--paper'],['--ink','--white'],['--muted','--paper'],['--muted','--white'],['--muted','--record-bg'],['--green','--record-bg'],['--accent','--paper'],['--accent','--icon-bg'],['--accent-dark','--error-bg'],['--on-green','--ink'],['--placeholder','--white'],['--ink','--hover-surface'],['--on-green','--button-hover'],['--green','--soft'],['--muted','--soft'],['--error-toast-ink','--error-toast-bg']];
    let minimum=100,worst=null,count=0;
    for(const theme of ['light','dark']){
      controller.setThemePreference(theme);
      for(const brightness of [0,50,100])for(let background=0;background<360;background+=30)for(let foreground=0;foreground<360;foreground+=30){
        controller.setColorPreferences({background,foreground,brightness});
        for(const [fg,bg] of pairs){
          probe.style.color=`var(${fg})`;probe.style.backgroundColor=`var(${bg})`;
          const style=getComputedStyle(probe),a=lum(style.color),b=lum(style.backgroundColor),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          count++;if(ratio<minimum){minimum=ratio;worst={theme,background,foreground,brightness,fg,bg,ratio};}
        }
      }
    }
    probe.remove();return{minimum,worst,count};
  });
  assert.ok(measurements.minimum>=4.5,JSON.stringify(measurements.worst));
  console.log(`PASS ${measurements.count} computed contrast checks; minimum ${measurements.minimum.toFixed(2)}:1`);

  await hue('Background').fill('235');await hue('Foreground').fill('195');await theme('Dark').click();
  await brightnessNumber.fill('35');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/custom-colors-desktop.png',fullPage:true});
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:950});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:390,height:1300});
  await page.locator('.appearance-settings').screenshot({path:'test-results/custom-colors-mobile.png'});
  assert.deepEqual(await data(),before);assert.deepEqual(errors,[]);
  console.log('PASS mobile/desktop color controls and preview preserve all workout records');
}finally{for(const item of contexts)await item.close().catch(()=>{});await browser.close();}
