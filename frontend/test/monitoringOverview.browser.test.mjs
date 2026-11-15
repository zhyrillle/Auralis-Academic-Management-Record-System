// Actual routes and components; every API is intercepted and writes are blocked.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { attendanceOptions, attendanceOverview, riskSummary } from './fixtures/monitoringOverviewData.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-monitoring-overview-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
let browser, releaseOldYear;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const errors = [], writes = [], reads = [];
  let attendanceError = false, riskError = false, comparisonLegacy = false, holdOldYear = false;
  const oldYearGate = new Promise(resolve => { releaseOldYear = resolve; });
  const setup = async role => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(role => localStorage.setItem('user', JSON.stringify({ user_id: 92040, role, first_name: 'Fixture' })), role);
    await ctx.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (!path.startsWith('/api/')) return req.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
      if (req.method() === 'OPTIONS') return json({});
      if (req.method() !== 'GET') { writes.push(path); return route.abort(); }
      reads.push({ path, params: Object.fromEntries(url.searchParams) });
      if (path.endsWith('/attendance-monitoring/options')) return json(attendanceOptions);
      if (path.endsWith('/attendance-monitoring/preview')) {
        const year = url.searchParams.get('schoolYear');
        if (holdOldYear && year === '2') await oldYearGate;
        return attendanceError ? json({ message: 'Fixture attendance error' }, 503) : json(attendanceOverview(year));
      }
      if (path.endsWith('/monitoring/context')) return json({ department: { name: 'English' }, schoolYears: [{ id: 3, label: '2026-2027', isCurrent: true }] });
      if (path.endsWith('/monitoring/academic-risk')) {
        const result = riskSummary(url.searchParams.get('term') || 'T2');
        if (url.searchParams.get('term') === 'T3') {
          result.summary = { high: 0, moderate: 0, low: 0, total: 0, unavailable: 12, totalLearners: 12 };
          result.byGrade = [{ grade: 8, high: 0, moderate: 0, low: 0 }];
        }
        return riskError ? json({ error: 'Fixture risk error' }, 503) : json(result);
      }
      if (path.endsWith('/stats')) return json({ totalTeachers: 8, submittedGrades: 1, submittedGradesPercent: 50, delayedSubmissions: 0, atRiskStudents: 99 });
      if (path.endsWith('/pass-rate')) return json(url.searchParams.get('quarter') === '3' ? { passed: 0, failed: 0, total: 0, passRatePercentage: 0 } : { passed: 7, failed: 3, total: 10, passRatePercentage: 70 });
      if (path.endsWith('/comparative-analysis')) return json(comparisonLegacy ? [{ gradeLevel: 'G8', aboveAverage: 4, fail: 3, passingRate: 70 }]
        : url.searchParams.get('quarter') === '3' ? [] : [{ gradeLevel: 'G8', passed: 7, fail: 3, passedLearners: 7, failedLearners: 3, passingRate: 70 }]);
      if (path.endsWith('/grade-distribution-report')) return json({ departmentName: 'English', grades: [], summary: {} });
      return json([]);
    });
    const page = await ctx.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    return { ctx, page };
  };
  const { page } = await setup('principal');
  await page.clock.install();
  await page.goto(server.resolvedUrls.local[0] + 'principal/student-monitoring/attendance');
  await page.getByRole('button', { name: 'Review Fixture Learner 01', exact: true }).waitFor();
  assert.equal(await page.locator('.submenu-item.active').textContent(), 'Attendance Monitoring');
  assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).count(), 0);
  assert.equal(await page.locator('.attendance-monitor__card--total .attendance-monitor__stat-value').textContent(), '22');
  assert.equal(await page.locator('.attendance-monitor__overview button').count(), 7);
  assert.equal(await page.locator('.attendance-monitor__tiers button').count(), 6);
  await page.getByRole('columnheader', { name: 'Longest streak', exact: true }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: 'Occurrences', exact: true }).count(), 0);
  const firstRow = page.locator('.attendance-monitor tbody tr').first();
  assert.equal(await firstRow.locator('td').nth(3).textContent(), '5 days');
  const reviewColors = await firstRow.getByRole('button', { name: 'Review Fixture Learner 01', exact: true }).evaluate(node => ({ bg: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color }));
  assert.deepEqual(reviewColors, { bg: 'rgb(17, 45, 97)', text: 'rgb(255, 255, 255)' });
  const disclaimer = 'Numerical thresholds serve only as monitoring and intervention guides.';
  assert.equal(await page.locator('.attendance-monitor__disclaimer').count(), 0);
  await page.locator('.attendance-monitor__scope').getByRole('button', { name: 'Monitoring guidance only', exact: true }).click();
  assert.ok((await page.getByRole('dialog').textContent()).includes(disclaimer));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('Incomplete records', { exact: true }).count(), 0);
  assert.equal(await page.locator('.attendance-monitor__table-filters').getByRole('textbox', { name: 'Search learner name…' }).count(), 1);
  await page.getByRole('button', { name: 'How attendance monitoring works', exact: true }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'How attendance monitoring works', exact: true }).waitFor();
  assert.match(await page.getByRole('dialog').textContent(), /Each recorded absence counts as one occurrence/);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.attendance-monitor tbody tr').count(), 15);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('.attendance-monitor tbody tr').count(), 7);
  await page.locator('.attendance-monitor__card--tier2').click();
  assert.equal(await page.locator('.attendance-monitor tbody tr').count(), 1);
  await page.locator('.attendance-monitor__card--tier2').click();
  await page.getByRole('button', { name: 'Review Fixture Learner 01', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText('Fixture Adviser', { exact: true }).waitFor();
  const guidance = modal.getByRole('region', { name: 'Guided Intervention', exact: true });
  assert.match(await guidance.textContent(), /Tier 3/);
  assert.match(await guidance.textContent(), /potential 1-day suspension/);
  assert.match(await guidance.textContent(), /subject to due process/);
  assert.equal(await guidance.locator('button, input, textarea, select').count(), 0, 'guided intervention is strictly read-only');
  assert.match(await modal.locator('.attendance-review__totals').textContent(), /Longest streak5 days/);
  assert.doesNotMatch(await modal.locator('.attendance-review__totals').textContent(), /Occurrences/);
  assert.doesNotMatch(await modal.textContent(), /Incomplete records|absence-equivalent|School-year comparison|consecutive absences|Coverage/i);
  const june = modal.getByRole('button', { name: 'June 2026', exact: true });
  assert.equal(await june.getAttribute('aria-expanded'), 'false');
  await june.click();
  assert.equal(await june.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await modal.getByRole('list', { name: 'Absence dates in June 2026', exact: true }).locator('time').evaluateAll(nodes => nodes.map(node => node.dateTime)),
    ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']);
  assert.match(await guidance.textContent(), /5 cumulative absences recorded/);
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Review Fixture Learner 05', exact: true }).click();
  await modal.getByRole('button', { name: 'June 2026', exact: true }).click();
  await modal.getByRole('button', { name: 'July 2026', exact: true }).click();
  assert.equal(await modal.getByRole('list', { name: 'Absence dates in June 2026', exact: true }).locator('li').count(), 2);
  assert.equal(await modal.getByRole('list', { name: 'Absence dates in July 2026', exact: true }).locator('li').count(), 3);
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Review Fixture Learner 03', exact: true }).click();
  const totals = modal.locator('.attendance-review__totals');
  assert.match(await totals.textContent(), /Late arrivals3/);
  assert.match(await totals.textContent(), /Longest streak0 days/);
  assert.match(await guidance.textContent(), /No accumulated absences are recorded/);
  await modal.getByRole('button', { name: 'June 2026', exact: true }).click();
  assert.equal(await modal.getByRole('list', { name: 'Late dates in June 2026', exact: true }).locator('li').count(), 3);
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Review Fixture Learner 04', exact: true }).click();
  assert.doesNotMatch(await modal.textContent(), /Incomplete|missing attendance|conflicting|Coverage/i);
  await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.attendance-monitor__overview .attendance-monitor__card--excessive').count(), 0);
  assert.doesNotMatch(await page.locator('.attendance-monitor').textContent(), /Excessive Absences|20%|11–15\+/);
  await page.getByRole('button', { name: 'Attendance alert: All alerts', exact: true }).click();
  assert.doesNotMatch(await page.getByRole('listbox', { name: 'Attendance alert', exact: true }).textContent(), /Incomplete|Excessive/);
  await page.keyboard.press('Escape');
  const drop = async (name, choice) => { await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('option', { name: choice, exact: true }).click(); };
  for (const [tier, count, learnerNumber] of [[1, 1, '02'], [2, 1, '07'], [3, 2, '01'], [4, 1, '08'], [5, 1, '09'], [6, 1, '06']]) {
    await page.locator(`.attendance-monitor__card--tier${tier}`).click();
    assert.equal(await page.locator('.attendance-monitor tbody tr').count(), count, `tier ${tier} filters the list`);
    await page.getByRole('button', { name: `Review Fixture Learner ${learnerNumber}`, exact: true }).click();
    assert.match(await guidance.textContent(), new RegExp(`Tier ${tier}`));
    await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
    await page.locator(`.attendance-monitor__card--tier${tier}`).click();
  }
  await drop('Grade level: All grade levels', 'Grade 8');
  await drop('Section: All sections', 'Fixture A');
  assert.equal(await page.locator('.attendance-monitor tbody tr').count(), 11);
  await page.getByRole('textbox', { name: 'Search learner name…' }).fill('nothing matches');
  await page.getByRole('heading', { name: 'No matching learners', exact: true }).waitFor();
  assert.equal(await page.locator('.attendance-monitor__card--total .attendance-monitor__stat-value').textContent(), '11', 'search does not change overview counts');
  await page.getByRole('textbox', { name: 'Search learner name…' }).fill('');
  await drop('Grade level: Grade 8', 'All grade levels');
  attendanceError = true;
  await page.clock.fastForward(61_000);
  await page.getByRole('alert').filter({ hasText: 'Fixture attendance error' }).waitFor();
  assert.equal(await page.locator('.attendance-monitor tbody tr').count(), 15, 'usable data survives a background failure');
  const beforeRetry = reads.filter(row => row.path.endsWith('/attendance-monitoring/preview')).length;
  attendanceError = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'detached' });
  await page.clock.resume();
  assert.ok(reads.filter(row => row.path.endsWith('/attendance-monitoring/preview')).length > beforeRetry, 'Retry reaches the API');
  holdOldYear = true;
  await drop('School year: SY 2026–2027', 'SY 2025–2026');
  await page.getByRole('status', { name: 'Loading school-year attendance', exact: true }).waitFor();
  await drop('School year: SY 2025–2026', 'SY 2026–2027');
  await page.getByRole('button', { name: 'Review Fixture Learner 01', exact: true }).waitFor();
  releaseOldYear();
  await page.waitForTimeout(250);
  assert.equal(await page.getByText('Previous Year Learner', { exact: true }).count(), 0, 'late response does not replace current year');
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `attendance page overflow at ${width}`);
    const compactOverview = page.locator('.attendance-monitor__overview');
    if (width === 1366) assert.ok(await compactOverview.evaluate(node => {
      const total = node.querySelector('.attendance-monitor__total').getBoundingClientRect();
      return [...node.querySelectorAll('.attendance-monitor__tiers button')].every(button => Math.abs(button.getBoundingClientRect().top - total.top) < 2);
    }), 'all six tiers share one horizontal row with total students');
    await page.screenshot({ path: join(artifacts, `attendance-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Review Fixture Learner 01', exact: true }).click();
    assert.ok(await modal.evaluate(node => { const box = node.querySelector('.app-overlay__panel').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }));
    assert.ok(await modal.locator('.app-overlay__body').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `review body overflow at ${width}`);
    await page.screenshot({ path: join(artifacts, `attendance-review-${width}.png`) });
    await modal.getByRole('button', { name: 'June 2026', exact: true }).click();
    assert.ok(await modal.locator('.attendance-review__monthly .attendance-monitor__scroll').evaluate(node => innerWidth > 600 || node.scrollWidth <= node.clientWidth + 1), `expanded month overflow at ${width}`);
    await page.screenshot({ path: join(artifacts, `attendance-review-month-${width}.png`) });
    await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' });
  }
  const { page: dept } = await setup('department_head');
  await dept.goto(server.resolvedUrls.local[0] + 'department-head/dashboard');
  await dept.getByRole('heading', { name: 'Academic risk', exact: true }).waitFor();
  const riskCard = dept.locator('.dept-stats-row .summary-stat-card').last();
  await dept.waitForFunction(() => document.querySelector('.dept-stats-row .summary-stat-card:last-child strong')?.textContent === '8');
  assert.equal(await riskCard.locator('strong').textContent(), '8', 'Overall uses monitoring endpoint, not legacy saved-grade count 99');
  assert.match(await riskCard.textContent(), /Overall/);
  await dept.getByText('Passed 7 / 10 grade results', { exact: true }).waitFor();
  await dept.getByRole('button', { name: 'Term: Overall', exact: true }).click();
  await dept.getByRole('listbox', { name: 'Term', exact: true }).getByRole('option', { name: 'Term 1', exact: true }).click();
  await dept.getByRole('button', { name: 'Term: Term 1', exact: true }).waitFor();
  await dept.waitForFunction(() => document.querySelector('.dept-stats-row .summary-stat-card:last-child strong')?.textContent === '4');
  assert.match(await riskCard.textContent(), /Term 1/);
  assert.equal(await dept.getByRole('button', { name: /Risk-monitoring term:/ }).count(), 0);
  assert.equal(await dept.locator('.dept-risk-overview .ar-chart-card').count(), 0, 'risk charts are on the analysis page');
  assert.equal(await dept.locator('.dept-risk-summary__bands article').count(), 3);
  const greenRatio = await dept.locator('.dept-comparison-chart .stacked-bar-chart__bar').nth(1).evaluate(node => node.firstElementChild.getBoundingClientRect().width / node.getBoundingClientRect().width);
  assert.ok(Math.abs(greenRatio - .7) < .01, `green passed bar ratio: ${greenRatio}`);
  assert.equal(await dept.getByText(/learners with grade previews/).count(), 0);
  for (const width of [1366, 768, 390]) {
    await dept.setViewportSize({ width, height: 900 });
    assert.ok(await dept.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `department page overflow at ${width}`);
    await dept.screenshot({ path: join(artifacts, `department-risk-${width}.png`), fullPage: true });
  }
  await dept.getByRole('link', { name: 'View risk analysis', exact: false }).click();
  await dept.waitForURL(/dashboard\/risk-analysis/);
  await dept.getByRole('heading', { name: 'English risk analysis', exact: true }).waitFor();
  assert.equal(new URL(dept.url()).searchParams.get('quarter'), '1');
  await dept.getByRole('button', { name: 'Term: Term 1', exact: true }).waitFor();
  assert.equal(await dept.locator('.dept-risk-overview .ar-chart-card').count(), 2);
  assert.equal(await dept.locator('.dept-stats-row .summary-stat-card').count(), 4);
  assert.match(await dept.locator('.dept-stats-row .summary-stat-card').last().textContent(), /Total Learners13/);
  for (const width of [1366, 768, 390]) {
    await dept.setViewportSize({ width, height: 900 });
    assert.ok(await dept.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `analysis page overflow at ${width}`);
    await dept.screenshot({ path: join(artifacts, `department-analysis-${width}.png`), fullPage: true });
  }
  await dept.getByRole('button', { name: 'Back to department overview', exact: true }).click();
  await dept.getByRole('button', { name: 'Term: Term 1', exact: true }).waitFor();
  riskError = true;
  comparisonLegacy = true;
  await dept.getByRole('button', { name: 'Term: Term 1', exact: true }).click();
  await dept.getByRole('listbox', { name: 'Term', exact: true }).getByRole('option', { name: 'Term 3', exact: true }).click();
  await dept.getByRole('button', { name: 'Retry risk counts', exact: true }).waitFor();
  await dept.getByRole('button', { name: 'Retry grade comparison', exact: true }).waitFor();
  assert.equal(await dept.locator('.dept-comparison-chart .stacked-bar-chart').count(), 0, 'legacy response cannot silently produce red-only bars');
  assert.equal(await riskCard.locator('strong').textContent(), '—', 'failed context is not rendered as zero');
  riskError = false;
  comparisonLegacy = false;
  await dept.getByRole('button', { name: 'Retry grade comparison', exact: true }).click();
  await dept.locator('.dept-comparison-chart .stacked-bar-chart').waitFor();
  await dept.getByRole('button', { name: 'Retry risk counts', exact: true }).click();
  await dept.waitForFunction(() => document.querySelector('.dept-stats-row .summary-stat-card:last-child strong')?.textContent === '0');
  await dept.getByText('No grade results available for this selection.', { exact: true }).waitFor();
  assert.equal(await dept.locator('.dept-pass-chart').getByText('100%', { exact: true }).count(), 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS attendance navigation, filters, Retry, and department risk source/shared header terms at 390/768/1366px.');
  console.log(artifacts);
} finally { releaseOldYear?.(); await browser?.close(); await server.close(); }
