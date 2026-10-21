import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const origin = process.env.APP_URL || 'http://localhost:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const contexts = [];
const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 1000 } }); contexts.push(context);
// Keep account/network behavior out of theme tests, while checking the actual
// renderButton options passed to Google Identity Services.
await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'text/javascript', body: `
window.google={accounts:{id:{initialize(){},disableAutoSelect(){},renderButton(container,options){
const button=document.createElement('button');button.textContent='Sign in with Google';
button.dataset.googleTheme=options.theme;button.style.padding='12px';
button.style.background=options.theme==='filled_black'?'#202124':'#ffffff';
button.style.color=options.theme==='filled_black'?'#ffffff':'#202124';container.replaceChildren(button);
}},oauth2:{initTokenClient(options){return options;}}}};` }));
const page = await context.newPage(); page.setDefaultTimeout(10000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const action = name => page.locator(`[data-action="${name}"]`);
const choice = name => page.getByRole('group', { name: 'Color theme' }).getByRole('button', { name, exact: true });
const waitTheme = theme => page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
const nav = async view => { await page.locator(`nav [data-view="${view}"]`).click(); await page.waitForFunction(view => document.querySelector(`nav [data-view="${view}"]`).getAttribute('aria-current') === 'page', view); };
const readData = () => page.evaluate(async () => (await import('./js/db.js')).readData());
const saved = () => page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
try {
  await page.goto(`${origin}/#settings`); await choice('System').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  assert.equal(await choice('System').getAttribute('aria-pressed'), 'true'); await waitTheme('light');
  const before = await readData();
  await page.emulateMedia({ colorScheme: 'dark' }); await waitTheme('dark');
  assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#131a17');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  await choice('Light').click(); await waitTheme('light');
  await page.emulateMedia({ colorScheme: 'light' }); await page.emulateMedia({ colorScheme: 'dark' }); await waitTheme('light');
  await choice('Dark').focus(); await choice('Dark').press('Enter'); await waitTheme('dark');
  await page.locator('[data-google-theme="filled_black"]').waitFor();
  assert.deepEqual(await readData(), before);
  console.log('PASS light/dark/system, keyboard selection, device changes, theme-color, Google button and unchanged workout data');

  await context.setOffline(true); await page.reload(); await choice('Dark').waitFor(); await waitTheme('dark');
  assert.equal(await choice('Dark').getAttribute('aria-pressed'), 'true');
  for (const view of ['routines', 'exercises', 'history', 'settings']) { await nav(view); await waitTheme('dark'); }
  await context.setOffline(false);
  console.log('PASS saved theme and all four views survive offline reload');

  // The synchronous head bootstrap must apply before the app module can run.
  const boot = await browser.newContext({ colorScheme: 'light', serviceWorkers: 'block' }); contexts.push(boot);
  await boot.addInitScript(() => localStorage.setItem('form.theme', 'dark'));
  let releaseModule; const gate = new Promise(resolve => { releaseModule = resolve; });
  await boot.route(`${origin}/js/app.js`, async route => { await gate; await route.continue(); });
  const bootPage = await boot.newPage(); await bootPage.goto(origin, { waitUntil: 'commit' });
  await bootPage.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await bootPage.locator('meta[name="theme-color"]').getAttribute('content'), '#131a17');
  releaseModule(); await bootPage.locator('main h1').waitFor(); await boot.close();
  console.log('PASS saved dark preference applies before app startup to avoid a light flash');

  const other = await context.newPage(); await other.goto(`${origin}/#settings`); await other.locator('[data-theme-choice="light"]').waitFor();
  await choice('Light').click();
  await other.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await choice('Dark').click(); await other.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await other.close();
  await page.evaluate(() => {
    window.themeOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'form.theme') throw new DOMException('Denied', 'QuotaExceededError'); return window.themeOriginalSetItem.call(this,key,value); };
  });
  await choice('Light').click(); await waitTheme('light');
  await page.getByText('Theme changed for this visit. Your browser could not remember the choice.', { exact: true }).waitFor();
  await page.evaluate(() => { Storage.prototype.setItem = window.themeOriginalSetItem; });
  await choice('System').click(); await waitTheme('dark');
  console.log('PASS other tabs update and blocked preference storage keeps the switch usable with clear feedback');

  await page.evaluate(async () => {
    const db = await import('./js/db.js'), model = await import('./js/model.js');
    const routine = { id:'theme-routine',name:'Upper body A',updatedAt:model.now(),entries:[{exerciseId:'seed-bench-press',setCount:3,repMin:8,repMax:12}] };
    await db.put('routines',routine);
    const first = model.createDraft(routine,model.SEED_EXERCISES); first.startedAt='2026-10-13T01:00:00Z'; first.finishedAt='2026-10-13T02:00:00Z';
    Object.assign(first.entries[0].sets[0],{weight:40,reps:8,completed:true}); await db.put('sessions',model.finishSession(first));
    const second = model.createDraft(routine,model.SEED_EXERCISES); second.startedAt='2026-10-14T01:00:00Z'; second.finishedAt='2026-10-14T02:00:00Z';
    Object.assign(second.entries[0].sets[0],{weight:42.5,reps:8,completed:true}); await db.put('sessions',model.finishSession(second));
  });
  await page.reload(); await choice('System').waitFor(); await nav('routines'); await action('start').click();
  const field = page.locator('[data-field="weight"]').first(); await field.fill('45.25'); await saved();
  const handle = await field.elementHandle();
  await page.emulateMedia({ colorScheme: 'light' }); await waitTheme('light');
  await page.emulateMedia({ colorScheme: 'dark' }); await waitTheme('dark');
  assert.equal(await handle.evaluate(node => node.isConnected && node.value === '45.25'), true);
  await nav('settings'); await choice('Dark').click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path:'test-results/dark-settings.png', fullPage:true });
  await nav('routines'); await page.screenshot({ path:'test-results/dark-routines.png', fullPage:true });
  console.log('PASS device theme changes preserve live workout inputs and autosaved drafts');

  const contrast = await page.evaluate(() => {
    const rgb = color => color.match(/[\d.]+/g).slice(0,3).map(Number);
    const luminance = color => rgb(color).map(value => { const c=value/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; }).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const root=getComputedStyle(document.documentElement), button=getComputedStyle(document.querySelector('main .button'));
    const muted=getComputedStyle(document.querySelector('main .muted'));
    return {body:ratio(root.color,root.backgroundColor),muted:ratio(muted.color,root.backgroundColor),button:ratio(button.color,button.backgroundColor)};
  });
  for(const [name,ratio] of Object.entries(contrast)) assert.ok(ratio>=4.5,`${name} contrast ${ratio}`);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:950});
    for(const view of ['routines','exercises','history','settings']) {
      await nav(view); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
  }
  await page.setViewportSize({width:390,height:844}); await nav('exercises');
  await action('exercise-records').filter({hasText:'Personal records'}).first().click();
  await page.screenshot({path:'test-results/dark-records-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await action('new-exercise').click();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('dialog')).backgroundColor),'rgb(19, 26, 23)');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  assert.deepEqual(errors,[]);
  console.log('PASS dark contrast, mobile/desktop layouts, PR dialog and form surfaces');
} finally { for(const item of contexts) await item.close().catch(()=>{}); await browser.close(); }
