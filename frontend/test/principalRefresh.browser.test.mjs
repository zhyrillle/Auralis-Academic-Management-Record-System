// Real page/cache with intercepted fixtures and a virtual clock. No school API or database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { performance, rawYears } from './fixtures/principalRecords.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-refresh-')),
  server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({
    user_id: 92000, role: 'principal', first_name: 'Fixture', last_name: 'Principal',
  })));
  const reads = [], writes = [], errors = [];
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };
  let hold = null, updated = false, fail = false;
  const holdSectionReads = () => (hold = { started: deferred(), resume: deferred() });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    }
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return json({}); }
    reads.push(url.pathname);
    if (url.pathname === '/api/school-years') return json(rawYears);
    if (url.pathname === '/api/principal/performance/sections') {
      const paused = hold;
      if (paused) { paused.started.resolve(); await paused.resume.promise; }
      if (fail) return json({ error: 'Fixture temporary failure' }, 503);
      const payload = performance('sections', Object.fromEntries(url.searchParams));
      if (updated) payload.summary.averageGrade = 88.75;
      return json(payload);
    }
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  await page.goto(server.resolvedUrls.local[0] + 'principal/performance-level/sections');
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  const sectionReads = () => reads.filter(path => path.endsWith('/performance/sections')).length;
  const average = page.locator('.pa-stat-card').filter({ hasText: 'School-wide Average' }).locator('.pa-stat-card__value');
  assert.equal(await average.textContent(), '81.25');
  await page.getByRole('searchbox', { name: 'Search grade distribution sections' }).fill('Fixture');
  await page.evaluate(() => {
    window.__busyDuringRefresh = false;
    new MutationObserver(() => {
      if (document.querySelector('.pa-content.is-busy, .pa-busy-overlay')) window.__busyDuringRefresh = true;
    }).observe(document.querySelector('main'), { childList: true, attributes: true, subtree: true });
    document.querySelector('.stacked-bar-chart')?.scrollIntoView();
  });
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const start = sectionReads();
  await page.clock.runFor(59_000);
  assert.equal(sectionReads(), start, 'no periodic request before one minute');

  // Hold the actual timer request open: old data and controls must remain usable.
  const unchangedRead = holdSectionReads();
  const unchangedRequest = page.waitForRequest(request => request.url().includes('/principal/performance/sections'));
  await page.clock.runFor(1000);
  await unchangedRequest;
  await unchangedRead.started.promise;
  assert.equal(sectionReads(), start + 1, 'the timer checks at one minute');
  assert.equal(await page.locator('.pa-busy-overlay, .pa-content.is-busy').count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'Term 1', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('searchbox', { name: 'Search grade distribution sections' }).isEnabled(), true);
  assert.equal(await average.textContent(), '81.25');
  const unchangedResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections'));
  hold = null; unchangedRead.resume.resolve();
  await unchangedResponse;
  await page.clock.runFor(100);

  // Check what subscribers last received, not just the cache's internal pending field.
  const cacheResult = await page.evaluate(async () => {
    const nav = await import('/src/services/navigationCache.js');
    const key = 'regression:refresh-completion', states = [];
    const originalNow = Date.now;
    let time = originalNow();
    Date.now = () => time;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    let unsubscribe = () => {};
    try {
      await nav.loadCached(key, async () => ({ count: 1 }));
      unsubscribe = nav.subscribeNavigationCache(() => {
        const entry = nav.getNavigationSnapshot(key);
        states.push({ pending: Boolean(entry?.pending), data: entry?.data });
      });
      time += 3000;
      await nav.loadCached(key, async () => ({ count: 1 }));
      await nav.getNavigationSnapshot(key).pending;
      check(states.some(state => state.pending), 'refresh start was not published');
      check(states.at(-1).pending === false, 'unchanged response did not publish completion');
      check(states.at(-1).data.count === 1, 'unchanged data was lost');

      await nav.loadCached(key, async () => ({ count: 2 }), { force: true });
      check(states.at(-1).pending === false && states.at(-1).data.count === 2, 'changed response did not publish completion');

      let finishOld;
      const older = nav.loadCached(key, () => new Promise(resolve => { finishOld = resolve; }), { force: true });
      await Promise.resolve();
      await nav.loadCached(key, async () => ({ count: 3 }), { force: true });
      finishOld({ count: 0 }); await older;
      check(nav.getCachedData(key).count === 3, 'late request replaced the newer response');

      try { await nav.loadCached('regression:initial-error', async () => { throw new Error('Fixture failure'); }); }
      catch { /* Expected initial error. */ }
      check(!nav.getNavigationSnapshot('regression:initial-error').pending, 'failed request stayed pending');
      await nav.loadCached('regression:initial-error', async () => 'recovered', { force: true });
      check(nav.getCachedData('regression:initial-error') === 'recovered', 'retry failed');
      return states;
    } finally { unsubscribe(); Date.now = originalNow; }
  });
  assert.equal(cacheResult.at(-1).pending, false);

  // Changed results update the mounted chart without losing search or scroll.
  updated = true;
  const changedResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections'));
  await page.clock.runFor(60_000);
  await changedResponse;
  await page.getByText('88.75', { exact: true }).waitFor();
  assert.equal(await page.getByRole('searchbox', { name: 'Search grade distribution sections' }).inputValue(), 'Fixture');
  assert.equal(await page.evaluate(() => window.scrollY), scrollBefore);
  assert.equal(await page.evaluate(() => window.__busyDuringRefresh), false, 'background refresh flashed the blocking overlay');

  // Server failure must retain usable cached data and allow the next check to recover.
  fail = true;
  const failedResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections') && response.status() === 503);
  await page.clock.runFor(60_000); await failedResponse;
  assert.equal(await average.textContent(), '88.75');
  assert.equal(await page.locator('.pa-busy-overlay').count(), 0);
  fail = false;
  const recoveredResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections') && response.status() === 200);
  await page.clock.runFor(60_000); await recoveredResponse;

  // A deliberate filter change still indicates that the visible values belong to old filters.
  const filteredRead = holdSectionReads();
  await page.getByRole('tab', { name: 'Term 1', exact: true }).click();
  await page.locator('.pa-busy-overlay').waitFor();
  await filteredRead.started.promise;
  const filteredResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections') && response.url().includes('term=term-1'));
  hold = null; filteredRead.resume.resolve(); await filteredResponse;
  await page.locator('.pa-busy-overlay').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('tab', { name: 'Term 1', exact: true }).getAttribute('aria-selected'), 'true');

  // Hidden tabs skip timer work; returning checks again without a blocking state.
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
  const beforeHidden = sectionReads();
  await page.clock.runFor(60_000);
  assert.equal(sectionReads(), beforeHidden);
  const returnResponse = page.waitForResponse(response => response.url().includes('/principal/performance/sections'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await returnResponse;
  assert.equal(await page.locator('.pa-busy-overlay').count(), 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS: 60-second quiet refresh, unchanged/changed/error responses, cache completion, request races, filters, hidden tabs and return refresh');
  await context.close();
} finally { await browser?.close(); await server.close(); }
