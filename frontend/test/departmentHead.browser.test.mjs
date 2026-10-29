// Actual app + intercepted synthetic APIs. Never connects to the school database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-department-ui-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
const user = { user_id: 91000, role: 'department_head', department_id: 9, first_name: 'Demo', last_name: 'Head' };
const contextData = { department: { id: 9, name: 'English', code: 'ENG' }, subject: { subjectId: 33, code: 'ENG', name: 'English' }, canViewPhilIri: true,
  school: { name: 'Gingoog City Comprehensive National High School', region: '10', division: 'Gingoog City' },
  schoolYears: [{ id: 12, label: '2026-2027', isCurrent: true }, { id: 11, label: '2025-2026', isCurrent: false }],
  gradeLevels: [7, 8, 9, 10].map((grade, i) => ({ id: i + 1, name: `G${grade}` })) };
const sections = Array.from({ length: 11 }, (_, i) => ({ sectionId: i + 7, sectionName: i === 0 ? 'Carrots' : `Section ${i}`,
  gradeLevelId: i % 4 + 1, gradeLevelName: `G${i % 4 + 7}`, programCode: i % 2 ? 'STE' : 'EBEC',
  learnerCount: 3, teacherName: 'Demo Teacher', adviserName: 'Demo Adviser', subjectOfferingId: i + 88, screeningComplete: 1, screeningIncomplete: 1, postTestComplete: 1, postTestIncomplete: 0 }));
const learners = ['Complete', 'Incomplete', 'Not assessed'].map((status, i) => ({ enrollmentId: i + 101, sectionId: 7, name: `Demo Learner ${i + 1}`, lrn: String(123456789010 + i),
  sex: ['M', 'F', null][i],
  screeningStatus: status, postTestStatus: i === 0 ? 'Complete' : 'Not assessed',
  screening: i === 2 ? null : { test_taken: 1, literal_score: 0, inferential_score: 2, critical_score: i === 1 ? null : 3,
    literal_max: 14, inferential_max: 12, critical_max: 14, score_threshold: 28, test_level: 'Grade 7', assessed_on: '2026-07-15' },
  postTest: i === 0 ? { oral_reading_percent: 80, comp_score_percent: 50, oral_reading_level: 'FRUSTRATION', comp_reading_level: 'FRUSTRATION', overall_reading_level: 'FRUSTRATION' } : null }));
const navigate = (page, path) => page.evaluate(path => { history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const errors = []; const reads = []; const writes = []; const adviserSaves = []; let rejectSections = false; let unavailable = false;
  async function setup(math = false, screeningVariant = 'standard', role = 'department_head') {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await ctx.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), { ...user, role });
    await ctx.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, '');
      if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) || url.protocol === 'blob:' ? route.continue() : route.abort();
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Disposition' } });
      if (request.method() === 'OPTIONS') return json({});
      if (request.method() !== 'GET') {
        if (role === 'adviser' && ['/phil-iri/screening/7', '/phil-iri/batch'].includes(path)) {
          adviserSaves.push({ path, payload: request.postDataJSON() });
          return json({ success: true, tableReady: true });
        }
        writes.push(path); return json({});
      }
      reads.push({ path, params: Object.fromEntries(url.searchParams), math });
      if (path.startsWith('/department-head/monitoring/')) assert.equal(request.headers()['x-auralis-user-id'], String(user.user_id));
      if (path === '/department-head/monitoring/context') return json(math === 'mapeh' ? { ...contextData, department: { id: 8, name: 'MAPEH', code: 'MAPEH' }, subject: { subjectId: 33, code: 'MAPEH', name: 'MAPEH' }, canViewPhilIri: false }
        : math ? { ...contextData, department: { id: 8, name: 'Mathematics', code: 'MATH' }, subject: { subjectId: 22, code: 'MATH', name: 'Mathematics' }, canViewPhilIri: false } : contextData);
      if (path === '/department-head/monitoring/sections') return rejectSections ? json({ error: 'Example server error' }, 500) : json({ ...contextData, schoolYearId: Number(url.searchParams.get('schoolYearId')), sections });
      if (path.startsWith('/department-head/monitoring/phil-iri')) {
        const sourceLearners = screeningVariant === 'longRoster' ? Array.from({ length: 26 }, (_, index) => ({
          ...learners[0], enrollmentId: 1000 + index, name: 'Roster Learner ' + (index + 1), sex: index % 2 ? 'F' : 'M',
          screening: { ...learners[0].screening, literal_score: 13 },
          postTest: { ...learners[0].postTest, words_correct: 13, passage_words_count: 14, comp_correct: 4, total_comp_items: 5,
            oral_reading_percent: 92.86, comp_score_percent: 80, oral_reading_level: 'INSTRUCTIONAL', comp_reading_level: 'INDEPENDENT', overall_reading_level: 'INSTRUCTIONAL' },
        })) : learners;
        const screeningLearners = sourceLearners.map((learner, index) => screeningVariant === 'missing' ? { ...learner, screening: null, screeningStatus: 'Not assessed' }
          : screeningVariant === 'mixed' && index === 1 ? { ...learner, screening: { ...learner.screening, literal_max: 15 } } : learner);
        return json({ sections, availability: { screening: !unavailable, postTest: true }, ...(path.endsWith('/7') ? { learners: screeningLearners } : {}) });
      }
      if (path === '/department-head/class-record') return json({ department: contextData.department, section: { name: 'Carrots', gradeLevel: 'G7' }, subjects: [{ subjectId: 33, subjectOfferingId: 88, label: 'English' }], students: [], terms: [] });
      if (path === '/class-record/88/export') return route.fulfill({ body: 'synthetic-workbook', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Disposition', 'Content-Disposition': 'attachment; filename="Demo.xlsx"' } });
      if (path === '/class-record/88') return json({ class_context: { section_name: 'Carrots', subject_name: 'English', teacher_name: 'Demo Teacher', school_year_label: '2026-2027', school_year_id: 12 }, assessments: [],
        students: [{ student_id: 101, student_section_id: 101, LRN: '123456789010', first_name: 'Demo', last_name: 'Learner', sex: 'M', scores: {}, saved_summary: { initialGrade: 80, termGrade: 87, calculationError: null } }] });
      if (role === 'adviser' && path === '/phil-iri/screening/7') return json({ records: [{ ...learners[0].screening, student_section_id: 101 }], tableReady: true });
      if (role === 'adviser' && path === '/phil-iri/7') return json({ records: [{ student_section_id: 101, words_correct: 56, comp_correct: 2 }], tableReady: true });
      if (path === '/department-head/comparative-analysis') return json([{ gradeLevel: 'G7', aboveAverage: 2, fail: 1, passingRate: 75 }]);
      if (path === '/department-head/pass-rate') return json({ passed: 3, failed: 1, total: 4, passRatePercentage: 75 });
      if (path === '/department-head/stats') return json({ totalTeachers: 8, submittedGrades: 3, submittedGradesPercent: 60, delayedSubmissions: 2, atRiskStudents: 1 });
      if (path === '/department-head/submission-monitor') return json(Array.from({ length: 8 }, (_, i) => ({ subjectOfferingId: i + 88, subject: 'English', teacher: i ? 'Demo Teacher ' + (i + 1) : 'Demo Teacher', gradeSection: 'G7 - Carrots', status: 'Pending', completion: 0, submittedTerms: 0, expectedTerms: 3, overdueTerms: 0, lateTerms: 0 })));
      if (path === '/department-head/performance-matrix') return json([{ section: 'G7 - Carrots', mean: 83.2, mps: 83.2, examDistribution: 'Average' }]);
      if (path === '/department-head/grade-distribution') return json([{ gradeLevel: 'G7', term1Mean: 83.2, term2Mean: null, term3Mean: null, term1Mps: 83.2, term2Mps: null, term3Mps: null }]);
      return json([]);
    });
    const page = await ctx.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    return { ctx, page };
  }
  const { ctx, page } = await setup();
  await page.goto(`${server.resolvedUrls.local[0]}department-head/dashboard`);
  await page.getByRole('heading', { name: 'English Department', exact: true }).waitFor();
  await page.getByText('Pass rate 3 / 4 students', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Submission Monitor', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Performance Analysis Matrix', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Submissions', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Performance', exact: true }).count(), 0);
  assert.equal(await page.locator('.dept-stats-row .summary-stat-card').count(), 4);
  assert.equal(await page.locator('.dept-main-cards .donut-chart').count(), 1);
  assert.equal(await page.locator('.dept-main-cards .stacked-bar-chart').count(), 1);
  assert.equal(await page.locator('.dept-comparison-chart .stacked-bar-chart__group').count(), 4);
  await page.locator('.dept-comparison-chart').getByText('G10', { exact: true }).waitFor();
  assert.equal(await page.locator('.dept-comparison-chart').getByText('No records', { exact: true }).count(), 3);
  const chartHeights = await page.locator('.dept-main-cards').evaluate(row => [...row.children].map(card => card.getBoundingClientRect().height));
  assert(Math.abs(chartHeights[0] - chartHeights[1]) < 2);
  const comparisonSegments = page.locator('.dept-comparison-chart .stacked-bar-chart__bar').first().locator('span');
  for (let index = 0; index < 2; index++) {
    const segment = comparisonSegments.nth(index);
    await segment.hover();
    await page.waitForFunction(element => getComputedStyle(element).filter !== 'none', await segment.elementHandle());
    const tooltip = page.getByRole('tooltip');
    await tooltip.waitFor();
    assert.match(await tooltip.textContent(), new RegExp(`G7${index === 0 ? 'Above average2' : 'Failing1'} learners`));
    assert.equal(await segment.getAttribute('title'), null, 'do not also show a browser-native tooltip');
    assert.equal(await segment.getAttribute('aria-describedby'), await tooltip.getAttribute('id'));
    const tooltipAppearance = await tooltip.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius }));
    assert.deepEqual(tooltipAppearance, { background: 'rgb(20, 47, 88)', radius: '9px' });
    const tooltipBox = await tooltip.boundingBox();
    const segmentBox = await segment.boundingBox();
    assert(tooltipBox.y >= 0 && tooltipBox.y + tooltipBox.height < segmentBox.y, 'floating tooltip should appear above the bar');
  }
  await comparisonSegments.first().focus();
  assert(await comparisonSegments.first().evaluate(element => element.matches(':focus-visible')));
  await page.getByRole('tooltip').getByText('Above average', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'grade-comparison-tooltip-laptop.png'), animations: 'disabled', fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('tooltip').count(), 0);
  await comparisonSegments.last().focus();
  await page.getByRole('tooltip').getByText('Failing', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Submission Monitor', exact: true }).hover();
  await comparisonSegments.last().evaluate(element => element.blur());
  assert.equal(await page.getByRole('tooltip').count(), 0);
  assert.equal(await page.locator('.dept-submission-monitor tbody tr').count(), 5);
  const rowsDropdown = await page.getByRole('button', { name: /^Submission rows:/ }).boundingBox();
  assert(rowsDropdown.height >= 38 && rowsDropdown.width >= 130, 'row-count control should be comfortably sized');
  await page.locator('.dept-submission-monitor').getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('.dept-submission-monitor tbody tr').count(), 3);
  await page.getByRole('button', { name: /^Submission rows:/ }).click();
  await page.getByRole('option', { name: '10 rows', exact: true }).click();
  assert.equal(await page.locator('.dept-submission-monitor tbody tr').count(), 8);
  await page.getByRole('button', { name: /^Submission rows:/ }).click();
  await page.getByRole('option', { name: '5 rows', exact: true }).click();
  await page.locator('.dept-submission-monitor').getByText('0%', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('group', { name: 'Academic term' }).count(), 0);
  await page.getByRole('button', { name: /^Term: Overall$/ }).waitFor();
  await page.getByRole('button', { name: /^School year:/ }).click();
  assert.equal(await page.getByRole('option', { name: /All school years/i }).count(), 0);
  await page.keyboard.press('Escape');
  assert(reads.filter(read => read.path === '/department-head/stats').every(read => read.params.schoolYear === '2026-2027'));
  const headerColors = await page.locator('.dept-grade-table').evaluate(table => ['.dept-column-mean', '.dept-column-mps'].map(selector => getComputedStyle(table.querySelector(selector)).backgroundColor));
  assert.notEqual(headerColors[0], headerColors[1]);
  const separator = await page.locator('.dept-grade-table .dept-column-mean').evaluate(header => getComputedStyle(header).borderRightColor);
  assert.equal(separator, 'rgb(203, 213, 225)');
  const bodySeparators = await page.locator('.dept-grade-table tbody tr').evaluateAll(rows => rows.map(row => [
    getComputedStyle(row.cells[0]).borderRight,
    getComputedStyle(row.cells[4]).borderLeft,
  ]));
  assert.equal(bodySeparators.length, 2, 'checks include the Average row');
  assert(bodySeparators.flat().every(border => border === '1px solid rgb(203, 213, 225)'));
  assert.equal(await page.locator('.dept-grade-table .dept-column-mps').evaluate(header => getComputedStyle(header).borderBottomColor), 'rgb(203, 213, 225)');
  assert.equal(await page.locator('.dept-monitor-details .dept-column-mean').count(), 1);
  const headerGap = await page.evaluate(() => document.querySelector('.dept-dashboard-header').getBoundingClientRect().top - document.querySelector('.navbar-container').getBoundingClientRect().bottom);
  assert(headerGap <= 22, 'laptop header gap should be compact');
  await page.locator('.page-content-area').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: join(artifacts, 'dashboard-laptop.png'), animations: 'disabled', fullPage: true });
  await page.locator('.dept-grade-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'dashboard-tables-laptop.png'), animations: 'disabled', fullPage: true });
  console.log('PASS existing dashboard values and analytics-first details');

  await page.getByRole('link', { name: 'Class Records', exact: true }).click();
  await page.getByRole('heading', { name: 'Carrots', exact: true }).waitFor();
  assert.equal(await page.locator('.section-card').count(), sections.length);
  assert.equal(await page.getByRole('button', { name: 'Refresh sections' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Next', exact: true }).count(), 0);
  assert((await page.locator('.section-card').first().boundingBox()).width >= 360);
  await page.getByLabel('Section count', { exact: true }).getByText('11', { exact: true }).waitFor();
  await page.locator('.section-card').first().getByText('Adviser: Demo Adviser', { exact: true }).waitFor();
  assert.equal(await page.locator('.dept-adviser-card').count(), sections.length);
  assert.equal(await page.getByText('Advisory Class', { exact: true }).count(), 0);
  const gradeBadges = await page.locator('.dept-adviser-card .section-card__grade').evaluateAll(badges => badges.map(badge => ({
    grade: badge.dataset.gradeLevel, background: getComputedStyle(badge).backgroundColor,
  })));
  assert.equal(new Set(gradeBadges.map(badge => badge.background)).size, 4);
  for (const grade of ['1', '2', '3', '4']) assert.equal(new Set(gradeBadges.filter(badge => badge.grade === grade).map(badge => badge.background)).size, 1);
  assert(await page.locator('.dept-class-card-facts').first().evaluate(row => row.getBoundingClientRect().top - row.previousElementSibling.getBoundingClientRect().bottom >= 20));
  const facts = await page.locator('.dept-class-card-facts').first().evaluate(row => [...row.children].map(child => ({ x: child.getBoundingClientRect().x, y: child.getBoundingClientRect().y })));
  assert(facts[1].x > facts[0].x && Math.abs(facts[1].y - facts[0].y) < 3);
  assert(await page.locator('.dept-monitor-navigation').evaluate(nav => nav.querySelector('[aria-label^="School year:"]').parentElement.nextElementSibling.contains(nav.querySelector('[aria-label^="Grade level:"]'))));
  assert.equal(reads.filter(read => read.path === '/department-head/class-record' || /^\/class-record\//.test(read.path)).length, 0);
  assert.equal(await page.locator('.section-capacity').count(), 0);
  await page.getByRole('textbox', { name: 'Search sections or teachers…', exact: true }).fill('Carrots');
  await page.waitForURL(/q=Carrots/);
  await page.locator('.section-card').filter({ has: page.getByRole('heading', { name: 'Carrots', exact: true }) }).getByRole('button', { name: 'View Class Records', exact: true }).click();
  await page.getByText('Learner, Demo', { exact: true }).waitFor();
  assert(reads.some(read => read.path === '/class-record/88' && read.params.read_only === '1'));
  assert.equal(await page.getByRole('button', { name: /^Subject:/ }).count(), 0);
  await page.locator('.term-grade-cell').filter({ hasText: '87' }).first().waitFor();
  assert.equal(await page.getByText('123456789010', { exact: true }).count(), 0);
  const termResponse = page.waitForResponse(response => response.url().includes('/class-record/88?term=T2'));
  await page.getByRole('button', { name: 'T2', exact: true }).click();
  await termResponse;
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(artifacts, 'class-record-laptop.png'), animations: 'disabled', fullPage: true });
  await page.getByRole('button', { name: 'Download', exact: true }).waitFor({ state: 'visible' });
  const download = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await download.catch(error => { console.log('Export diagnostics: ' + JSON.stringify(reads.filter(read => read.path.includes('class-record')))); throw error; });
  assert(reads.some(read => read.path === '/class-record/88/export' && read.params.term === 'T2'));
  await page.getByRole('button', { name: 'Back to sections', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Search sections or teachers…', exact: true }).inputValue(), 'Carrots');
  assert.equal(reads.filter(read => read.path === '/department-head/monitoring/sections').length, 1);
  await page.getByRole('textbox', { name: 'Search sections or teachers…', exact: true }).fill('');
  await page.waitForURL(url => !url.searchParams.has('q'));
  await page.getByRole('button', { name: /^Grade level:/ }).click();
  await page.getByRole('option', { name: 'G8', exact: true }).click();
  await page.waitForURL(/grade=2/);
  await page.getByRole('heading', { name: 'Carrots', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: /^Grade level:/ }).click();
  await page.getByRole('option', { name: 'All grade levels', exact: true }).click();
  await page.waitForURL(/grade=all/);
  await page.locator('.page-content-area').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: join(artifacts, 'sections-laptop.png'), animations: 'disabled', fullPage: true });
  console.log('PASS directory does not load records; assigned subject, saved grade, masking, export, back filters and caching');

  await page.evaluate(async oldLearners => {
    const { cacheKey, loadCached } = await import('/src/services/navigationCache.js');
    for (const schoolYearId of [12, '12']) await loadCached(cacheKey('department-phil-iri-detail', { schoolYearId, sectionId: 7 }),
      async () => ({ learners: oldLearners, availability: { screening: true, postTest: true } }));
  }, learners.map(({ sex: _sex, ...learner }) => learner));
  await page.getByRole('link', { name: 'PHIL-IRI', exact: true }).click();
  await page.getByRole('heading', { name: 'PHIL-IRI Monitoring', exact: true }).waitFor();
  const completionPositions = await page.locator('.dept-monitor-completion').first().evaluate(row => [...row.children].map(child => ({ left: child.getBoundingClientRect().left, right: child.getBoundingClientRect().right })));
  assert(completionPositions[1].left - completionPositions[0].right >= 40, 'screening and post-test counts should sit apart');
  await page.screenshot({ path: join(artifacts, 'phil-iri-directory-laptop.png'), animations: 'disabled', fullPage: true });
  await page.locator('.section-card').filter({ has: page.getByRole('heading', { name: 'Carrots', exact: true }) }).getByRole('button').click();
  await page.locator('.dept-phil-screening-table .dept-phil-learner-row').first().getByRole('cell', { name: '0', exact: true }).waitFor();
  assert.equal(await page.locator('.dept-monitor-stats .summary-stat-card__value').first().textContent(), '1');
  assert.equal(await page.getByRole('button', { name: 'Refresh PHIL-IRI results' }).count(), 0);
  assert.equal(await page.getByText(/Saved assessment records · Read-only/).count(), 0);
  assert.equal(await page.locator('.app-back-button').count(), 1);
  await page.getByRole('heading', { name: 'Philippine - Informal Reading Inventory (PHIL - IRI)', exact: true }).waitFor();
  assert.equal(await page.locator('.dept-phil-adviser-report img').count(), 1);
  await page.getByRole('img', { name: 'DepEd Official Seal', exact: true }).waitFor();
  await page.getByText('Republic of the Philippines', { exact: true }).waitFor();
  await page.getByText('Department of Education', { exact: true }).waitFor();
  await page.locator('.phil-iri-sheet-header').getByText('10', { exact: true }).waitFor();
  await page.getByText('Division of Gingoog City', { exact: true }).waitFor();
  await page.getByText('Gingoog City Comprehensive National High School', { exact: true }).waitFor();
  assert(reads.some(read => read.path === '/department-head/monitoring/phil-iri/7' && read.params.viewVersion === '2'));
  assert.equal(await page.locator('.dept-phil-adviser-report input').count(), 0);
  assert.equal(await page.getByRole('button', { name: /Download PDF|Edit Screening Test|Finish editing/ }).count(), 0);
  assert.equal(await page.locator('.phil-iri-subheader, .phil-iri-sheet-footer, .screening-document-footer').count(), 0);
  assert.equal(await page.locator('.dept-monitor-stats .summary-stat-card').count(), 3);
  assert.equal(await page.getByRole('textbox').count(), 1);
  assert.deepEqual(await page.locator('.phil-iri-score-max').allTextContents(), ['(14)', '(12)', '(14)']);
  assert.equal(await page.getByRole('columnheader', { name: 'Assessment details', exact: true }).count(), 0);
  const screeningRows = await page.locator('.dept-phil-screening-table .dept-phil-learner-row').evaluateAll(rows => rows.map(row => row.cells.length));
  assert.deepEqual(screeningRows, [10, 10, 10]);
  const unassessedCells = await page.locator('.dept-phil-screening-table .dept-phil-learner-row').last().locator('td').allTextContents();
  assert.deepEqual(unassessedCells.slice(3), Array(7).fill(''));
  assert((await page.locator('.dept-phil-screening-table tbody td').allTextContents()).every(value => !value.includes('—')));
  assert.equal(await page.locator('.screening-gender-divider').count(), 3);
  assert.equal(await page.locator('.dept-phil-adviser-report .student-admin-pagination').count(), 0);
  assert((await page.locator('.dept-phil-screening-table .screening-score').allTextContents()).every(value => !value.includes('/')));
  await page.getByRole('columnheader', { name: 'Score < 28', exact: true }).waitFor();
  await page.getByRole('columnheader', { name: 'Score ≥ 28', exact: true }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: 'Status', exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'phil-iri-screening-laptop.png'), animations: 'disabled', fullPage: true });
  const comprehensionHeaderWidths = await page.locator('.dept-phil-screening-table thead tr').nth(1).locator('th').evaluateAll(headers => headers.map(header => header.getBoundingClientRect().width));
  assert(comprehensionHeaderWidths.every(width => width >= 88), 'comprehension labels should not break into narrow letter stacks');
  await page.locator('.dept-phil-screening-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'phil-iri-screening-table-laptop.png'), animations: 'disabled', fullPage: true });
  await page.locator('.page-content-area').evaluate(element => { element.scrollTop = 0; });
  await page.getByRole('textbox').fill('No matching learner');
  await page.getByText('No learners match this search.', { exact: true }).waitFor();
  assert.equal(await page.locator('.dept-phil-screening-table tbody td').getAttribute('colspan'), '10');
  await page.getByRole('textbox').fill('');
  await page.getByRole('button', { name: 'Post-Test', exact: true }).click();
  await page.getByRole('cell', { name: '80%', exact: true }).waitFor();
  await page.getByRole('columnheader', { name: 'Oral Reading', exact: true }).waitFor();
  await page.getByRole('columnheader', { name: 'Comprehension', exact: true }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: 'Status', exact: true }).count(), 0);
  const lrnColumnWidth = await page.locator('.dept-phil-post-table thead .col-lrn').boundingBox();
  assert(lrnColumnWidth.width >= 210);
  const lrnContentFits = await page.locator('.dept-phil-post-table .dept-phil-lrn').first().evaluate(cell => {
    const cellBounds = cell.getBoundingClientRect(), contents = cell.querySelector('.masked-lrn-wrapper').getBoundingClientRect();
    return contents.left > cellBounds.left && contents.right < cellBounds.right;
  });
  assert(lrnContentFits, 'masked LRN and reveal icon should fit inside their own column');
  assert(await page.locator('.dept-phil-post-table .reading-level-text').evaluateAll(labels => labels.every(label => {
    if (!label.textContent) return true;
    const bounds = label.getBoundingClientRect(), cell = label.closest('td').getBoundingClientRect();
    return bounds.left >= cell.left && bounds.right <= cell.right;
  })), 'reading-level badges should remain inside their cells');
  assert((await page.locator('.dept-phil-post-table tbody td').allTextContents()).every(value => !value.includes('—')));
  await page.locator('.phil-iri-sheet-summary-table caption').filter({ hasText: 'Overall Reading Level Summary' }).waitFor();
  const readingSummary = await page.locator('.phil-iri-sheet-summary-table tbody tr').allTextContents();
  assert(readingSummary[0].replace(/\s/g, '').includes('Males001'));
  assert(readingSummary.at(-1).replace(/\s/g, '').includes('Total001'));
  await page.screenshot({ path: join(artifacts, 'phil-iri-laptop.png'), animations: 'disabled', fullPage: true });
  await page.locator('.phil-iri-sheet-summary-table').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(artifacts, 'phil-iri-summary-laptop.png'), animations: 'disabled', fullPage: true });
  await page.locator('.page-content-area').evaluate(element => { element.scrollTop = 0; });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('.dept-phil-adviser-report input').count(), 0);
  await page.screenshot({ path: join(artifacts, 'phil-iri-narrow.png'), animations: 'disabled', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  unavailable = true;
  await page.reload();
  await page.getByText('Assessment records are unavailable', { exact: true }).waitFor();
  console.log('PASS read-only PHIL-IRI, incomplete/missing/zero handling and unavailable state');

  await navigate(page, '/department-head/class-records');
  await page.getByRole('heading', { name: 'Carrots', exact: true }).waitFor();
  rejectSections = true;
  await page.reload();
  await page.getByText('Example server error', { exact: true }).waitFor();
  rejectSections = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'Carrots', exact: true }).waitFor();
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.page-content-area').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: join(artifacts, `sections-${viewport.width}.png`), animations: 'disabled', fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('textbox', { name: 'Search sections or teachers…', exact: true }).focus();
  assert.equal(await page.getByRole('textbox', { name: 'Search sections or teachers…', exact: true }).evaluate(element => element === document.activeElement), true);
  await ctx.close();
  unavailable = false;
  for (const [variant, expected] of [['mixed', '(Varies)'], ['missing', '']]) {
    const sample = await setup(false, variant);
    await sample.page.goto(`${server.resolvedUrls.local[0]}department-head/phil-iri?section=7&year=12`);
    await sample.page.locator('.phil-iri-score-max').first().waitFor({ state: 'attached' });
    assert.equal(await sample.page.locator('.phil-iri-score-max').first().textContent(), expected);
    await sample.ctx.close();
  }
  const longRoster = await setup(false, 'longRoster');
  await longRoster.page.goto(`${server.resolvedUrls.local[0]}department-head/phil-iri?section=7&year=12`);
  await longRoster.page.locator('.dept-phil-learner-row').nth(25).waitFor();
  assert.equal(await longRoster.page.locator('.dept-phil-screening-table .dept-phil-learner-row').count(), 26);
  assert.deepEqual(await longRoster.page.locator('.screening-gender-divider').allTextContents(), ['MALES', 'FEMALES']);
  assert.equal(await longRoster.page.locator('.dept-phil-learner-row').last().locator('td').first().textContent(), '26');
  assert.equal(await longRoster.page.locator('.dept-phil-adviser-report .student-admin-pagination').count(), 0);
  assert.equal(await longRoster.page.getByRole('button', { name: /^(Next|Previous)$/ }).count(), 0);
  assert.deepEqual(await longRoster.page.locator('.dept-phil-learner-row').first().locator('.screening-score').allTextContents(), ['13', '2', '3', '18']);
  await longRoster.page.getByRole('textbox').fill('Roster Learner 26');
  assert.equal(await longRoster.page.locator('.dept-phil-learner-row').count(), 1);
  await longRoster.page.getByRole('textbox').fill('');
  await longRoster.page.getByRole('button', { name: 'Post-Test', exact: true }).click();
  assert.equal(await longRoster.page.locator('.dept-phil-post-table .dept-phil-learner-row').count(), 26);
  assert.equal(await longRoster.page.locator('.post-test-gender-row').count(), 2);
  assert.equal(await longRoster.page.locator('.dept-phil-adviser-report .student-admin-pagination').count(), 0);
  assert.equal(await longRoster.page.locator('.dept-phil-learner-row .col-words-read').first().textContent(), '13');
  assert.equal(await longRoster.page.locator('.dept-phil-learner-row .col-comp-score').first().textContent(), '4');
  await longRoster.ctx.close();
  console.log('PASS all 26 learners on one continuous report, male/female separators, search, and plain score values in both stages');
  console.log('PASS full-height neutral separators, larger row selector, colored grade badges, card spacing, chart hover/focus and recorded screening maxima');
  const math = await setup(true);
  await math.page.goto(`${server.resolvedUrls.local[0]}department-head/phil-iri`);
  await math.page.getByText('PHIL-IRI access is restricted', { exact: true }).waitFor();
  assert.equal(await math.page.getByRole('link', { name: 'PHIL-IRI', exact: true }).count(), 0);
  assert.equal(reads.filter(read => read.math && read.path.includes('/monitoring/phil-iri')).length, 0);
  await math.ctx.close();
  const mapeh = await setup('mapeh');
  await mapeh.page.goto(`${server.resolvedUrls.local[0]}department-head/class-records?section=7&year=12`);
  await mapeh.page.getByRole('button', { name: 'PE & Health', exact: true }).waitFor();
  const componentResponse = mapeh.page.waitForResponse(response => response.url().includes('/class-record/88?') && response.url().includes('mapeh_component=PEH'));
  await mapeh.page.getByRole('button', { name: 'PE & Health', exact: true }).click(); await componentResponse;
  assert.equal(await mapeh.page.getByRole('button', { name: /^Subject:/ }).count(), 0);
  await mapeh.ctx.close();
  const adviser = await setup(false, 'standard', 'adviser');
  await adviser.ctx.addInitScript(() => {
    if (location.pathname === '/adviser/phil-iri') history.replaceState({ usr: { activeClass: { section_id: 7, subject_offering_id: 88, section_name: 'Carrots' } }, key: 'demo', idx: 0 }, '');
  });
  await adviser.page.goto(`${server.resolvedUrls.local[0]}adviser/phil-iri`);
  const literal = adviser.page.getByRole('spinbutton', { name: 'literal score for Learner, Demo', exact: true });
  await literal.waitFor();
  assert.equal(await literal.inputValue(), '0');
  assert.equal(await adviser.page.locator('.screening-table thead tr').first().getByRole('columnheader').count(), 7);
  const screeningSave = adviser.page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/phil-iri/screening/7') && request.postDataJSON().records?.[0]?.literal_score === 1);
  await literal.fill('1');
  await screeningSave;
  await adviser.page.getByText('Screening scores saved', { exact: true }).waitFor();
  await adviser.page.getByRole('button', { name: 'Edit Screening Test', exact: true }).click();
  const maximumSave = adviser.page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/phil-iri/screening/7') && Number(request.postDataJSON().config?.literal_max) === 15);
  await adviser.page.getByRole('spinbutton', { name: 'literal item count', exact: true }).fill('15');
  await maximumSave;
  await adviser.page.getByRole('button', { name: 'Finish editing Screening Test', exact: true }).click();
  await adviser.page.screenshot({ path: join(artifacts, 'adviser-shared-screening-laptop.png'), animations: 'disabled', fullPage: true });
  await adviser.page.getByRole('tab', { name: 'Post-Test', exact: true }).click();
  const words = adviser.page.getByRole('spinbutton', { name: 'Words correctly read by Learner, Demo', exact: true });
  await words.waitFor();
  assert.equal(await words.inputValue(), '56');
  await adviser.page.getByText('All changes saved to cloud', { exact: true }).waitFor();
  // The existing adviser loader releases its save guard 400 ms after loading.
  await adviser.page.waitForTimeout(450);
  const postSave = adviser.page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/phil-iri/batch') && request.postDataJSON().records?.[0]?.words_correct === 57);
  await words.fill('57');
  await words.press('Tab');
  await postSave;
  await adviser.page.getByRole('cell', { name: '81.43%', exact: true }).waitFor();
  assert(await adviser.page.getByRole('button', { name: 'Download PDF', exact: true }).isEnabled());
  assert.equal(await adviser.page.locator('.phil-iri-sheet-footer').count(), 1);
  await adviser.page.screenshot({ path: join(artifacts, 'adviser-shared-post-test-laptop.png'), animations: 'disabled', fullPage: true });
  assert(adviserSaves.length >= 3);
  assert(adviserSaves.every(save => save.payload.schoolYearId === 12));
  await adviser.ctx.close();
  console.log('PASS shared adviser report retains score editing, maximum settings, autosave, calculations, PDF action and branded footer');
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS continuous section scrolling, filters, retries, responsive layouts, shared back button, non-English restriction, MAPEH controls and no writes');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
