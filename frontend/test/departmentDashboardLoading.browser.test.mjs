// Intercept all reads and block writes while checking report state across loaders.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-department-loading-')),
  server: { host: '127.0.0.1', port: 0, open: false } });
const scores = { total_score: 80, num_takers: 1, score_mean: 80, mps: 80, r80_84: 1 };
const report = { departmentName: 'English', summary: { ...scores, name: 'Total' },
  grades: [{ ...scores, id: 'G8', name: 'Grade 8', teachers: [{ ...scores, id: 1, name: 'Fixture Teacher',
    sections: [{ ...scores, id: 18, name: 'Fixture Section' }] }] }] };
let browser, release;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92031, role: 'department_head', first_name: 'Fixture' })));
  const errors = [], writes = [];
  let gate = null, reportReads = 0;
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    if (req.method() === 'OPTIONS') return json({});
    if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (url.pathname.endsWith('/monitoring/context')) return json({ department: { name: 'English' },
      schoolYears: [{ id: 3, label: '2026-2027', isCurrent: true }] });
    if (url.pathname.endsWith('/grade-distribution-report')) { reportReads++; return json(report); }
    if (gate && url.pathname.startsWith('/api/department-head/')) await gate;
    if (url.pathname.endsWith('/stats')) return json({ totalTeachers: 1, submittedGrades: 1, submittedGradesPercent: 100, delayedSubmissions: 0, atRiskStudents: 0 });
    if (url.pathname.endsWith('/pass-rate')) return json({ passed: 1, failed: 0, total: 1, passRatePercentage: 100 });
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'department-head/dashboard');
  const term = page.getByRole('combobox', { name: 'Term', exact: true });
  await term.waitFor();
  await term.selectOption('2');
  await page.locator('.dept-grade-distribution-container .app-skeleton-block').first().waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'View teachers for Grade 8', exact: true }).first().click();
  await page.getByRole('button', { name: 'View sections for Fixture Teacher', exact: true }).first().waitFor();
  const readsBeforeFilter = reportReads;
  gate = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'Grade level: All grade levels', exact: true }).click();
  await page.getByRole('option', { name: 'Grade 8', exact: true }).click();
  await page.getByRole('status', { name: 'Loading department dashboard', exact: true }).waitFor();
  assert.equal(await page.locator('.dept-grade-distribution-container').isVisible(), false, 'previous records stay hidden while the new context loads');
  release();
  await page.getByRole('status', { name: 'Loading department dashboard', exact: true }).waitFor({ state: 'detached' });
  assert.equal(await term.inputValue(), '2', 'report term survives the dashboard skeleton');
  await page.getByRole('button', { name: 'View sections for Fixture Teacher', exact: true }).first().waitFor();
  assert.equal(reportReads, readsBeforeFilter, 'dashboard filtering does not restart the unchanged report');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log('PASS Department Head filter skeleton preserves report term and drill-down; no record writes');
} finally { release?.(); await browser?.close(); await server.close(); }
