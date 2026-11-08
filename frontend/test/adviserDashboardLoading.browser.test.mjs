// Hold selected dashboard reads so their loading appearance and controls can be checked safely.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-dashboard-loading-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const overview = deferred(), testT1 = deferred(), testT2 = deferred(), area = deferred();
const writes = [], errors = [];
let browser, context;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92044, role: 'adviser', is_adviser: true, first_name: 'Fixture' })));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (url.pathname.includes('/check-role/') || url.pathname.endsWith('/summary') || url.pathname.endsWith('/assigned-classes') || url.pathname.endsWith('/attendance-trend')) await overview.promise;
    if (url.pathname.includes('/check-role/')) return json({ isAdviser: true });
    if (url.pathname.endsWith('/summary')) return json({ isAdviser: true, activeTerm: 'T1', totalClasses: 5, totalStudents: 52 });
    if (url.pathname.endsWith('/assigned-classes')) return json({ classes: [] });
    if (url.pathname.endsWith('/attendance-trend')) return json({ trend: [] });
    if (url.pathname.endsWith('/subject-performance')) return json({ performance: [] });
    if (url.pathname.endsWith('/grade-distribution')) return json({ distribution: [0, 0, 0, 0, 0] });
    if (url.pathname.endsWith('/test-exam-results')) {
      const isT2 = url.searchParams.get('term') === 'T2';
      await (isT2 ? testT2.promise : testT1.promise);
      return json({ above75: [], below75: [], scores: { ST1: { highest: isT2 ? 91 : 55, lowest: 10 }, ST2: {}, TE: {} } });
    }
    if (url.pathname.endsWith('/subject-area-performance')) { await area.promise; return json({ sectionName: 'Banana', adviserSectionSubjects: [{ subject: 'English', grade: 83 }] }); }
    if (url.pathname.endsWith('/core-values')) return json({ values: [] });
    return json(url.pathname.includes('notifications') ? { notifications: { today: [], yesterday: [] } } : []);
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'adviser/dashboard');
  const initial = page.locator('.adviser-dashboard__container--initial-loading');
  await initial.waitFor();
  assert(await page.getByRole('heading', { name: 'Dashboard', level: 1 }).isVisible());
  assert.equal(await initial.locator('.adviser-dashboard__stat-row > *').count(), 3, 'overview has three summary cards');
  assert.equal(await initial.locator('.adviser-dashboard__performance-row > *').count(), 3, 'gauge, chart and actions occupy the actual dashboard layout');
  assert.equal(await initial.locator('.adviser-dashboard__class-cards-track > *').count(), 3, 'assigned classes use class-shaped cards');
  assert.equal(await initial.locator('.adviser-dashboard__assigned-stats-col > *').count(), 2);
  assert.equal(await initial.locator('.adviser-dashboard__mid-grid > *').count(), 2);
  for (const selector of ['.adviser-dashboard__performance-row .adviser-dashboard__chart-header .app-skeleton-block', '.adviser-dashboard__mid-right-col .adviser-dashboard__chart-header .app-skeleton-block']) {
    assert((await initial.locator(selector).boundingBox()).width > 100, 'chart heading placeholder has visible width');
  }
  const initialChart = initial.locator('.adviser-dashboard__performance-row .adviser-dashboard__chart-card');
  await initialChart.getByRole('button', { name: 'T2', exact: true }).click();
  assert((await initialChart.getByRole('button', { name: 'T2', exact: true }).getAttribute('class')).includes('active'));
  await initialChart.getByRole('button', { name: 'T1', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('.page-content-area').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'initial skeleton fits mobile');
  await page.setViewportSize({ width: 1366, height: 900 });
  overview.resolve();
  await page.getByText('Total Classes', { exact: true }).waitFor();
  const card = page.locator('.adviser-dashboard__test-exam-card');
  const loading = card.getByRole('status', { name: 'Loading test and exam results' });
  await loading.waitFor();
  assert.equal(await card.locator('.adviser-dashboard__test-chart-skeleton').count(), 2);
  assert.equal(await card.locator('.app-skeleton-chart, .app-skeleton-card').count(), 0, 'no nested placeholder cards');
  assert.equal(await card.locator('.adviser-dashboard__test-exam-right').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert(await card.getByRole('button', { name: 'Section' }).isVisible());
  const areaCard = page.locator('.adviser-dashboard__bottom-grid .adviser-dashboard__chart-card');
  assert.equal(await areaCard.getByText('Mahogany').count(), 0, 'unknown section is not shown while loading');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'dashboard-loading.png'), animations: 'disabled' });
  await card.getByRole('button', { name: 'T2', exact: true }).click();
  assert.equal(await card.getByRole('button', { name: 'T2', exact: true }).getAttribute('class').then(c => c.includes('active')), true);
  testT2.resolve();
  await card.getByText('91', { exact: true }).waitFor();
  testT1.resolve(); area.resolve();
  await areaCard.getByText('Banana', { exact: true }).waitFor();
  assert.equal(await card.getByText('55', { exact: true }).count(), 0, 'older term cannot replace selected term');
  assert.equal(await card.locator('.adviser-dashboard__test-chart-skeleton').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('PASS dashboard loading regions, visible controls, term selection and response ordering');
  console.log('Screenshot: ' + join(artifacts, 'dashboard-loading.png'));
} finally {
  overview.resolve(); testT1.resolve(); testT2.resolve(); area.resolve();
  await context?.close(); await browser?.close(); await server.close();
}
