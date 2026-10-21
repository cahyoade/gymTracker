import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const context = await browser.newContext();
const page = await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const origin=process.env.APP_URL || 'http://localhost:4173';
async function palette(mode,brightness,background,foreground) {
  await page.evaluate(async values=>{
    const theme=await import('./js/theme.js');
    theme.setThemePreference(values.mode);
    theme.setColorPreferences(values);
  },{mode,brightness,background,foreground});
}
async function sample(target) {
  await target.hover();
  return target.evaluate(el=>{
    const style=getComputedStyle(el);
    return {background:style.backgroundColor,color:style.color,hovered:el.matches(':hover')};
  });
}
async function check(target,label,mode,brightness) {
  await palette(mode,brightness,235,195);const before=await sample(target);
  await palette(mode,brightness,235,315);const foreground=await sample(target);
  await palette(mode,brightness,55,315);const background=await sample(target);
  assert.ok(before.hovered && foreground.hovered && background.hovered,`${label}: actual hover state`);
  assert.notEqual(foreground.background,before.background,`${label}: hover fill follows foreground hue`);
  assert.notEqual(foreground.color,before.color,`${label}: hover text follows foreground hue`);
  assert.deepEqual(background,foreground,`${label}: background hue preserves hover colors`);
}
try {
  await page.goto(`${origin}/#exercises`);await page.locator('main h1').waitFor();
  // Remove transition timing only in this isolated test context so computed endpoints are deterministic.
  await page.addStyleTag({content:'* { transition:none !important; }'});
  const before=await page.evaluate(async()=> (await import('./js/db.js')).readData());
  let checks=0;
  for(const width of [390,1440])for(const mode of ['light','dark'])for(const brightness of [0,50,100]) {
    await page.setViewportSize({width,height:1000});
    for(const selector of ['nav [data-view="routines"]','nav [data-view="exercises"]','[data-action="new-exercise"]']) {
      await check(page.locator(selector),`${width}/${mode}/${brightness}/${selector}`,mode,brightness);checks++;
    }
    await page.locator('[data-action="new-exercise"]').click();
    for(const selector of ['dialog .icon-button','dialog .button.secondary','dialog button[type="submit"]']) {
      await check(page.locator(selector),`${width}/${mode}/${brightness}/${selector}`,mode,brightness);checks++;
    }
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  }
  assert.deepEqual(await page.evaluate(async()=> (await import('./js/db.js')).readData()),before);
  assert.deepEqual(errors,[]);
  await palette('dark',50,27,214);
  await page.getByRole('button',{name:'Add exercise',exact:false}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).hover();
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/hover-colors.png'});
  console.log(`PASS ${checks} actual hover states: active/inactive navigation, primary/secondary buttons and icon buttons; light/dark, mobile/desktop, brightness limits, independent hues, unchanged records`);
} finally {
  await context.close();await browser.close();
}
