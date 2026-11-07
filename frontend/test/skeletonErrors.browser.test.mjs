import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-skeleton-errors-')), server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  for (const target of ['profile', 'teacher/sections']) {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92011, role: 'subject_teacher', first_name: 'Fixture', last_name: 'Account' })));
    let fail = true, release;
    const holdRetry = new Promise(resolve => { release = resolve; });
    const errors = [], writes = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      if (request.method() === 'OPTIONS') return json({});
      if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      const relevant = url.pathname.includes('/profile') || url.pathname.includes('/sections/adviser/') || url.pathname === '/api/users';
      if (!relevant) return json([]);
      if (fail) return json({ error: 'Fixture records unavailable' }, 503);
      await holdRetry;
      return json(target === 'profile' ? { user_id: 92011, first_name: 'Fixture', last_name: 'Profile', email: 'fixture@example.test', role: 'subject_teacher', account_status: 'active' } : []);
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0] + target);
    await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
    assert.equal(await page.locator('.app-skeleton-region').count(), 0, 'failure ends the loading state');
    assert(await page.locator('.page-content-area h1').isVisible(), 'page heading remains on failure');
    fail = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('.app-skeleton-region').waitFor();
    release();
    await page.locator('.app-skeleton-region').waitFor({ state: 'detached' });
    if (target === 'profile') await page.getByText('Fixture Profile', { exact: true }).waitFor();
    else await page.getByText('No assigned classes found', { exact: true }).waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log('PASS loading failure, retry, and completion: ' + target);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
