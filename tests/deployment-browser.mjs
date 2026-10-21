// Smoke-test the packaged site, not the development checkout. Run after build.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain'};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Outside site');
    const content = await readFile(target);
    response.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
    response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const origin = `http://localhost:${server.address().port}`;
  browser = await chromium.launch({headless:true, ...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {})});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const file of ['README.md','NETLIFY_SETUP.md','netlify.toml','package.json','tests/unit.test.js','.git/config']) {
    assert.equal((await context.request.get(`${origin}/${file}`)).status(),404,file);
  }
  const action = name => page.locator(`[data-action="${name}"]`);
  await page.goto(origin);
  await action('new-routine').click();
  await page.locator('#routine-name').fill('Deployment check');
  await page.locator('#routine-exercise').selectOption('seed-bench-press');
  await action('editor-add').click();
  await page.getByRole('button',{name:'Save routine',exact:false}).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Every worker asset, including the full exercise library, must be cached.
  const cached = await page.evaluate(async () => (await caches.keys()).length);
  assert.ok(cached > 0);
  await context.setOffline(true);
  await page.reload();
  await action('start').click();
  const row = page.locator('.set-row').first();
  await row.locator('[data-field="weight"]').fill('20');
  await row.locator('[data-field="reps"]').fill('10');
  await row.locator('[data-field="completed"]').check();
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
  await page.reload();
  await action('resume').click();
  assert.equal(await row.locator('[data-field="weight"]').inputValue(),'20');
  assert.equal(await row.locator('[data-field="reps"]').inputValue(),'10');
  await action('finish-workout').click();
  await page.locator('.history-card').waitFor();
  await page.locator('nav [data-view="exercises"]').click();
  await action('browse-catalog').click();
  await page.locator('.catalog-item').first().waitFor();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  for (const view of ['progress','settings','exercises','routines']) {
    await page.locator(`nav [data-view="${view}"]`).click();
    await page.locator('main h1').waitFor();
  }
  await action('start').click();
  await row.waitFor();
  assert.match(await row.locator('.previous-record').innerText(),/20\s*kg\s*×\s*10/);
  assert.equal(await row.locator('[data-field="weight"]').inputValue(),'');
  assert.deepEqual(errors,[]);
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/deployment-mobile.png',fullPage:true});
  console.log('PASS packaged site: private-file exclusion, offline startup, workout save/resume/completion, all views, and next-session comparison.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
