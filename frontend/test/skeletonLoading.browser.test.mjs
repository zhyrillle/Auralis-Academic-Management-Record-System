// Hold every API read to inspect the actual page before data arrives. Never use
// school services, live learners, or writes for these loading-state checks.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-skeletons-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
const cases = [
  ...['grade-levels', 'sections', 'subjects', 'teachers', 'lowest-performers'].map(name => ['principal', `principal/performance-level/${name}`]),
  ...['subject-trend', 'historical-comparison'].map(name => ['principal', `principal/analytics/${name}`]),
  ...['at-risk-students/prediction', 'at-risk-students/prediction/learners/all', 'reports', 'feedback'].map(name => ['principal', `principal/${name}`]),
  ...['dashboard', 'manage-users', 'manage-students', 'student-section-management', 'grading-periods', 'ws-config', 'grade-transmutation'].map(name => ['system_admin', `system-admin/${name}`]),
  ...['dashboard', 'sections', 'master-sheet', 'performance', 'notifications', 'feedback', 'request', 'phil-iri', 'sections/details', 'attendance'].map(name => ['adviser', `adviser/${name}`]),
  ...['dashboard', 'sections', 'notifications', 'performance', 'feedback', 'phil-iri', 'class-record/18/81'].map(name => ['subject_teacher', `teacher/${name}`]),
  ...['dashboard', 'class-records', 'phil-iri', 'notifications'].map(name => ['department_head', `department-head/${name}`]),
  ['principal', 'profile'],
];
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const failures = [];
  for (const [role, path] of cases.filter(([, path]) => !process.env.SKELETON_TEST_FILTER || path.includes(process.env.SKELETON_TEST_FILTER))) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ role }) => {
      localStorage.setItem('user', JSON.stringify({ user_id: 92010, role, is_adviser: role === 'adviser', first_name: 'Fixture', last_name: 'Account' }));
      const cls = { id: 'teaching-41', section_id: 18, subject_id: 1, subject_offering_id: 81, school_year_id: 3,
        assignmentType: 'teaching', assignmentId: 41, subject: 'English', sectionName: 'Fixture', gradeLevel: 'G8' };
      history.replaceState({ ...history.state, usr: { activeClass: cls, activeSelectedClass: cls, section: cls, sectionId: 18 } }, '');
    }, { role });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const errors = [], writes = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
      } });
      if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
      await gate;
      await route.abort().catch(() => {});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(server.resolvedUrls.local[0] + path);
      await page.locator('.app-skeleton-block:visible').first().waitFor({ timeout: 7000 });
      assert(await page.locator('.page-content-area').isVisible(), `${path}: content shell stays visible`);
      assert(await page.locator('.page-content-area h1, .adviser-dashboard__banner').first().isVisible(), `${path}: real page heading stays visible`);
      assert(await page.locator('.dashboard-layout').isVisible(), `${path}: navigation shell stays mounted`);
      assert.equal(await page.locator('.app-skeleton-block:visible').first().evaluate(el => getComputedStyle(el).animationName), 'none', 'reduced motion disables shimmer');
      assert.equal(await page.locator('.app-skeleton-block:visible').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(232, 237, 244)', `${path}: shared reduced-motion color`);
      // Check the agreed appearance, not merely that some skeleton exists.
      if (path.startsWith('principal/performance-level/')) {
        assert(await page.getByRole('tab', { name: 'Overall', exact: true }).isVisible(), 'term controls remain real');
        assert.equal(await page.locator('.pa-skeleton h2').count(), 0, 'content panel titles are placeholders');
        if (path.endsWith('/grade-levels')) {
          await page.getByRole('tab', { name: 'Term 2', exact: true }).click();
          assert.equal(await page.getByRole('tab', { name: 'Term 2', exact: true }).getAttribute('aria-selected'), 'true');
        }
      }
      if (path === 'principal/at-risk-students/prediction') {
        assert.equal(await page.locator('.pa-stat-card__label, .pa-stat-card__icon').count(), 0, 'whole summary cards load, including labels and icons');
        assert.equal(await page.getByRole('heading', { name: 'Breakdown by Grade Level', exact: true }).count(), 0);
        assert(await page.getByPlaceholder('Search name, section or adviser…').isVisible(), 'learner search remains visible');
      }
      if (path === 'system-admin/manage-students') {
        assert.equal(await page.locator('.summary-stat-card__title, .summary-stat-card__icon').count(), 0, 'no real statistic labels or colored icons while loading');
        assert.equal(await page.getByRole('heading', { name: 'Student directory', exact: true }).count(), 0);
        assert(await page.getByPlaceholder('Search name, LRN, or section…').isVisible(), 'directory search remains visible');
      }
      if (path === 'adviser/performance' || path === 'teacher/performance') {
        assert.equal(await page.getByRole('heading', { name: 'Mean and MPS', exact: true }).count(), 0);
        assert.equal(await page.getByRole('columnheader').count(), 0, 'the whole report waits, including column headings');
        assert(await page.getByRole('combobox', { name: 'Subject', exact: true }).isVisible());
      }
      if (path === 'adviser/master-sheet') {
        assert.equal(await page.locator('.app-skeleton-card').count(), 0, 'Master Sheet uses compact counters instead of cards');
        assert.equal(await page.locator('.ms-loading-grid thead tr').count(), 3, 'placeholder shows grouped subject and term headings');
        assert.equal(await page.locator('.ms-loading-row').count(), 7, 'placeholder suggests learner rows');
        assert.equal(await page.locator('.ms-loading-subject').first().evaluate(el => getComputedStyle(el).borderLeftWidth), '0px', 'subject headings have no thick borders');
        assert(await page.getByRole('button', { name: 'Submission status' }).isVisible());
        assert(await page.getByRole('button', { name: 'Submission status' }).isDisabled());
        assert(await page.getByPlaceholder('Search student name or LRN...').isVisible());
        assert(await page.getByRole('button', { name: 'Download PDF' }).isDisabled());
        assert(await page.getByRole('button', { name: 'Advisory class: Advisory class' }).isDisabled());
        assert.equal(await page.locator('.ms-controls-row--loading').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'loading controls fit their row');
      }
      if (path === 'adviser/request') {
        assert.equal(await page.getByRole('heading', { name: 'Create New Request', exact: true }).count(), 0);
        assert.equal(await page.getByRole('heading', { name: 'My Requests', exact: true }).count(), 0);
      }
      if (path === 'teacher/class-record/18/81') {
        const record = page.getByRole('status', { name: 'Loading Term 1 record', exact: true });
        assert(await record.isVisible(), 'class record has an accessible loading region');
        assert.equal(await record.locator('.cr-record-skeleton-seal').count(), 2, 'document header retains both seal placeholders');
        assert.equal(await record.locator('.cr-record-skeleton-title').count(), 1, 'document title is a placeholder');
        assert.equal(await record.locator('.app-skeleton-table-row').count(), 7, 'document includes a grid placeholder');
        assert(await page.getByRole('button', { name: 'T2', exact: true }).isVisible(), 'term controls stay visible');
      }
      if (path === 'principal/performance-level/grade-levels') {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        assert.equal(await page.locator('.app-skeleton-block:visible').first().evaluate(el => getComputedStyle(el).animationName), 'app-skeleton-shimmer');
        await page.emulateMedia({ reducedMotion: 'reduce' });
      }
      if (path === 'system-admin/grading-periods') {
        await page.locator('.grading-period-overview-skeleton .app-skeleton-block').first().waitFor();
        await page.getByRole('button', { name: 'Timeline & Settings', exact: true }).click();
        await page.locator('.grading-period-timeline-skeleton .app-skeleton-block').first().waitFor();
        assert.equal(await page.locator('.grading-period-overview-skeleton').count(), 0);
        assert(await page.locator('.page-content-area h1').isVisible(), 'academic-period heading stays visible when switching loading layouts');
      }
      if (path === 'system-admin/manage-students' || path === 'system-admin/student-section-management') {
        assert.equal((await page.locator('.student-admin-count').innerText()).trim(), '', 'directory count is unknown, not zero');
        assert.equal(await page.locator('.student-admin-count .app-skeleton-block').count(), 1);
      }
      if (path === 'system-admin/grade-transmutation') {
        assert.equal(await page.getByRole('switch', { name: 'Custom Transmutation' }).count(), 0, 'unknown settings do not imply OFF');
        assert.equal(await page.getByText('OFF', { exact: true }).count(), 0);
      }
      if (path === 'adviser/request') {
        assert.equal(await page.locator('.app-skeleton-card').count(), 4, 'all four summary values wait for data');
        await page.getByRole('status', { name: 'Loading request form', exact: true }).waitFor();
        await page.getByRole('status', { name: 'Loading request history', exact: true }).waitFor();
        assert.equal(await page.getByText('No reopen requests submitted yet.', { exact: true }).count(), 0);
        assert.equal(await page.locator('.grr-stat-value, .grr-container table').count(), 0, 'no placeholder zero or unrelated table');
      }
      if (path === 'principal/feedback') {
        assert.equal(await page.locator('.pa-skeleton table').count(), 1, 'feedback waits for ratings and comments');
        assert.equal(await page.locator('.pa-skeleton .app-skeleton-chart').count(), 0, 'feedback has no chart placeholders');
      }
      if (path === 'principal/performance-level/lowest-performers') {
        assert.equal(await page.locator('.pa-skeleton .pp-lowest-grid > section').count(), 3);
        assert.equal(await page.locator('.pa-skeleton table').count(), 0, 'lowest performers is rankings and charts');
      }
      if (path === 'department-head/dashboard') {
        const details = page.locator('.dept-loading-details');
        assert.equal(await details.locator('.dept-loading-submissions table').count(), 1, 'submission monitor has a table placeholder');
        assert.equal(await details.locator('.dept-loading-report-card table').count(), 2, 'grade distribution has both report tables');
        await details.screenshot({ path: join(artifacts, 'department-dashboard-lower.png'), animations: 'disabled' });
        await page.setViewportSize({ width: 390, height: 844 });
        const overflow = await details.evaluate(el => [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(child => child.className).slice(0, 8));
        assert.deepEqual(overflow, [], 'department placeholders fit on mobile');
      }
      assert.deepEqual(errors, [], path);
      assert.deepEqual(writes, [], path);
      if (/manage-users|manage-students|student-section-management|grade-transmutation|principal\/feedback|adviser\/request|performance-level\/sections|adviser\/sections$|adviser\/master-sheet$|profile$|teacher\/class-record/.test(path)) {
        await page.screenshot({ path: join(artifacts, path.replaceAll('/', '-') + '.png'), fullPage: true, animations: 'disabled' });
        await page.setViewportSize({ width: 390, height: 844 });
        if (path === 'teacher/class-record/18/81') {
          assert.equal(await page.locator('.cr-record-loading').evaluate(el => el.getBoundingClientRect().right > el.closest('.page-content-area').getBoundingClientRect().right + 1), false, `${path}: mobile skeleton fits`);
        } else {
          assert.equal(await page.locator('.page-content-area').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, `${path}: mobile fits`);
        }
      }
      console.log('PASS initial skeleton + visible heading/navigation: ' + path);
    } catch (error) {
      failures.push(`${path}: ${error.message}; page errors: ${errors.join('; ')}`);
    } finally { await context.close(); release(); }
  }
  console.log('Screenshots: ' + artifacts);
  assert.deepEqual(failures, []);
} finally { await browser?.close(); await server.close(); }
