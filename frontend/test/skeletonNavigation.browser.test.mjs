import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { performance, rawYears } from './fixtures/principalRecords.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-skeleton-navigation-')), server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92012, role: 'principal', first_name: 'Fixture', last_name: 'Principal' })));
  let fail = false, empty = false, reads = 0;
  const writes = [], errors = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (url.pathname === '/api/school-years') return json(rawYears);
    if (url.pathname.startsWith('/api/principal/performance/')) {
      reads++;
      return fail ? json({ error: 'Fixture unavailable' }, 503) : json(performance(url.pathname.split('/').at(-1), Object.fromEntries(url.searchParams), empty));
    }
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const navigate = path => page.evaluate(path => {
    history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  const invalidate = () => page.evaluate(async () => (await import('/src/services/navigationCache.js')).clearNavigationCache());
  await page.goto(server.resolvedUrls.local[0] + 'principal/performance-level/sections');
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  await navigate('/principal/performance-level/subjects');
  await page.locator('.pa-content .app-skeleton-region').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('.pa-skeleton'));
  await page.evaluate(() => {
    window.__skeletonOnWarmVisit = false;
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1
        && (node.matches('.app-skeleton-region') || node.querySelector('.app-skeleton-region'))))) window.__skeletonOnWarmVisit = true;
    }).observe(document.querySelector('.page-content-area'), { childList: true, subtree: true });
  });
  await navigate('/principal/performance-level/sections');
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__skeletonOnWarmVisit), false, 'cached revisit does not flash a skeleton');
  const before = reads;
  const reloaded = page.waitForRequest(request => request.url().includes('/principal/performance/sections'), { timeout: 3000 });
  await invalidate(); await reloaded;
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  assert(reads > before, 'invalidating a mounted cache starts another read immediately');
  empty = true; await invalidate();
  await page.getByText('No section results', { exact: true }).waitFor();
  assert.equal(await page.locator('.app-skeleton-region').count(), 0);
  fail = true; await invalidate();
  await page.getByText('Section performance is unavailable', { exact: true }).waitFor();
  assert.equal(await page.locator('.app-skeleton-region').count(), 0);
  fail = false; empty = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('PASS cached revisits, immediate invalidation recovery, empty/error states, retry and no data writes');
} finally { await browser?.close(); await server.close(); }
