import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
const frontend = process.cwd();
const require = createRequire(join(frontend, 'package.json'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-skeleton-cached-reports-'));
const server = await createServer({ root: frontend, cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
const assignment = { adviserAssignmentId: 1, sectionId: 18, schoolYearId: 1, schoolYearLabel: '2026-2027', gradeLevel: 'G8', sectionName: 'Fixture', isCurrent: true };
const sheet = { section: { name: 'Fixture', gradeLevel: 'G8' }, schoolYear: { label: '2026-2027' },
  students: [{ studentSectionId: 501, studentId: 41, id: 41, displayName: 'Fixture Learner', sex: 'M', grades: { english: { terms: [88, null, null], finalGrade: null } }, generalAverage: null }],
  subjects: [{ key: 'english', label: 'English' }], terms: [], completeness: { studentCount: 1, completedTermGrades: 1, expectedTermGrades: 3 } };
let browser;
const results = [];
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  for (const path of ['master-sheet', 'performance']) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92030, role: 'adviser', first_name: 'Fixture' })));
    let release; const gate = new Promise(done => { release = done; }); let reads = 0;
    const writes = [], errors = [];
    let delayTerms = false, failReport = false;
    const releases = new Map(), started = new Map();
    const waiting = new Map(['2', '3'].map(term => [term, new Promise(resolve => started.set(term, resolve))]));
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
      const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      if (req.method() === 'OPTIONS') return json({});
      if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      reads++; await gate;
      if (url.pathname === '/api/master-sheets/options') return json({ assignments: [assignment] });
      if (url.pathname === '/api/master-sheets/1') return json(sheet);
      if (url.pathname.endsWith('/performance-filters')) return json({ schoolYears: [{ school_year_id: 1, label: '2026-2027', is_active: true }], terms: [1, 2, 3].map(value => ({ value, label: `Term ${value}`, is_active: value === 1 })), subjects: [{ subject_id: 1, subject_name: 'English' }], currentSchoolYearId: 1, currentTerm: 1 });
      if (url.pathname.endsWith('/grade-range-report')) {
        if (failReport) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}', headers: { 'Access-Control-Allow-Origin': '*' } });
        const term = url.searchParams.get('term');
        if (delayTerms) {
          started.get(term)?.();
          await new Promise(resolve => releases.set(term, resolve));
        }
        return json({ sections: term === '1' ? [] : [{ section_id: Number(term), section_name: `Term ${term} Fixture`, is_submitted: true, total_score: 80, num_takers: 1, score_mean: 80, mps: 80 }] });
      }
      if (url.pathname.includes('/notifications/')) return json({ notifications: { today: [], yesterday: [] } });
      return json([]);
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0] + 'adviser/' + path);
    await page.locator('.app-skeleton-block:visible').first().waitFor();
    const initial = await page.locator('.page-content-area').innerText();
    await page.screenshot({ path: join(artifacts, path + '-pending.png'), fullPage: true });
    release();
    if (path === 'master-sheet') await page.locator('.ms-table').waitFor();
    await page.waitForFunction(() => !document.querySelector('.page-content-area .app-skeleton-block'));
    const navigate = path => page.evaluate(path => { history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await navigate('/adviser/sections');
    await page.getByRole('heading', { name: 'Assigned Classes', exact: true }).waitFor();
    await page.evaluate(() => {
      window.__revisitSkeletonInsertions = 0;
      new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType === 1 && (node.matches('.app-skeleton-block') || node.querySelector('.app-skeleton-block'))) window.__revisitSkeletonInsertions++;
        }
      }).observe(document.querySelector('.page-content-area'), { childList: true, subtree: true });
    });
    const before = reads;
    await navigate('/adviser/' + path);
    await page.getByRole('heading', { name: path === 'master-sheet' ? 'Fixture' : 'Performance Report', level: 1, exact: true }).waitFor();
    if (path === 'master-sheet') await page.locator('.ms-table').waitFor();
    await page.waitForFunction(() => !document.querySelector('.page-content-area .app-skeleton-block'));
    results.push({ page: path, initialVisibleText: initial, cachedRevisitSkeletonInsertions: await page.evaluate(() => window.__revisitSkeletonInsertions), extraReads: reads - before, errors, writes });
    assert.equal(results.at(-1).cachedRevisitSkeletonInsertions, 0, path + ': cached revisits must not reinsert skeletons');
    if (path === 'performance') {
      assert.equal(await page.getByText('No data provided yet', { exact: true }).count(), 2, 'successful empty reports display their empty states');
      delayTerms = true;
      await page.getByRole('combobox', { name: 'Term', exact: true }).selectOption('2');
      await waiting.get('2');
      await page.getByRole('status', { name: 'Loading mean and MPS', exact: true }).waitFor();
      assert.equal(await page.locator('.performance-table').count(), 0, 'old-context tables are hidden');
      await page.getByRole('combobox', { name: 'Term', exact: true }).selectOption('3');
      await waiting.get('3');
      releases.get('3')();
      await page.getByText('Term 3 Fixture', { exact: true }).first().waitFor();
      releases.get('2')();
      // Wait for the older response's cache entry to finish; it must not replace Term 3.
      await page.waitForFunction(async () => {
        const { getCachedData, cacheKey } = await import('/src/services/navigationCache.js');
        return Boolean(getCachedData(cacheKey('adviser:performance-report', { userId: 92030, selectedSchoolYear: '1', selectedTerm: '2', selectedSubject: 'all' })));
      });
      assert.equal(await page.getByText('Term 3 Fixture', { exact: true }).count(), 2);
      assert.equal(await page.getByText('Term 2 Fixture', { exact: true }).count(), 0);
      delayTerms = false;
      failReport = true;
      await page.getByRole('combobox', { name: 'Subject', exact: true }).selectOption('1');
      await page.getByRole('alert').filter({ hasText: 'Performance records could not be loaded.' }).waitFor();
      assert.equal(await page.locator('.app-skeleton-block:visible').count(), 0, 'failure stops the skeleton');
      failReport = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await page.getByText('Term 3 Fixture', { exact: true }).first().waitFor();
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    await context.close();
  }
  writeFileSync(join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log('PASS cached Master Sheet/Performance revisits without skeleton reinsertion; rapid term changes; empty reports; failure and retry; no database writes');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
