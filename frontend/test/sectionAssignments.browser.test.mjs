// Exercise the real Sections page with owned assignments and intercepted reads.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-section-cards-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'),
  server: { host: '127.0.0.1', port: 0, open: false } });
const base = { section_id: 18, school_year_id: 3, sectionName: 'Carrots', gradeLevel: 'G8', isAdviser: true, classType: 'Advisory Class' };
const cards = [
  { ...base, id: 'advisory-9', assignmentType: 'advisory', assignmentId: 9, subject: 'All subjects' },
  { ...base, id: 'teaching-41', assignmentType: 'teaching', assignmentId: 41, subject_offering_id: 81, subject: 'English' },
  { ...base, id: 'teaching-42', assignmentType: 'teaching', assignmentId: 42, subject_offering_id: 82, subject: 'Science' },
  { ...base, section_id: 19, sectionName: 'Mahogany', id: 'advisory-10', assignmentType: 'advisory', assignmentId: 10, subject: 'All subjects' },
];
const VIEW_VERSION = 'teacher-monitoring-v2';
let submissionReady = true;
let academicState = 'available';
const details = (type, id, term, requestedMode = 'monitoring') => {
  const ready = id === 41 && term === 'T1' && submissionReady;
  const mode = type === 'advisory' ? 'advisory' : requestedMode === 'prediction' && ready ? 'prediction' : 'monitoring';
  const available = academicState === 'available';
  const base = {
  viewVersion: VIEW_VERSION,
  context: { assignmentType: type, assignmentId: id, sectionId: 18, sectionName: 'Carrots', gradeLevel: 'Grade 8',
    schoolYear: { id: 3, label: '2026-2027' }, subject: type === 'teaching' ? { id: id === 41 ? 1 : 3, offeringId: id === 41 ? 81 : 82,
      code: id === 41 ? 'ENG' : 'SCI', name: id === 41 ? 'English' : 'Science' } : null,
    selectedTerm: { code: term, label: `Term ${term[1]}` }, riskMode: mode },
  capabilities: { atRiskApplicable: id === 41, predictionApplicable: id === 41, predictionReady: ready,
    predictionUnavailableReason: term === 'T3' ? 'Term 3 has no following term.' : 'The term must end and the grade sheet must be submitted and locked.',
    predictionUnavailableLabel: term === 'T3' ? 'No next term' : 'Grades need to be submitted',
    atRiskAvailable: type === 'teaching' },
  summary: { learnerCount: type === 'teaching' ? 2 : 1, incompleteGradeCount: 0,
    missingDisplayGradeCount: available ? 0 : 2,
    performanceBands: mode === 'prediction' ? { BENCHMARKING: { count: 1 }, DEVELOPING: { count: 1 } }
      : available ? { CONNECTING: { count: id === 41 ? 1 : 0 }, DEVELOPING: { count: id === 41 ? 0 : 1 }, ADVANCING: { count: 1 } } : {} }, warnings: [],
  riskContext: { mode, targetTerm: mode === 'prediction' ? `T${Number(term[1]) + 1}` : null },
  learners: [{ studentSectionId: 501, studentId: 101, name: 'Fixture Learner', termGrade: type === 'advisory' ? 95 : id === 41 ? 84 : 77, gradeState: 'COMPLETE',
    academic: { status: academicState, gradePreview: available ? (id === 41 ? 78 : 71) : null,
      riskLevel: available ? (id === 41 ? 'moderate' : 'high') : null, reasons: available ? [] : ['Activities need records or review.'] },
    honorStatus: 'NONE', riskAssessment: { status: 'available', riskLevel: 'medium', label: 'Medium Risk' } }],
  };
  if (type === 'teaching') base.learners.push({ ...base.learners[0], studentSectionId: 502, studentId: 102, name: 'Zed Learner', termGrade: 65,
    academic: { status: academicState, gradePreview: available ? 99 : null, riskLevel: available ? 'low' : null, reasons: [] },
    riskAssessment: { status: 'available', riskLevel: 'high', label: 'High Risk' } });
  if (requestedMode === 'prediction' && mode === 'monitoring') base.notice = 'Prediction is no longer available. Showing current-term monitoring.';
  return base;
};
let browser;
let heldTerm = null;
let heldReport = null;
let teachingOnly = false;
let malformedNextRead = false;
let failedNextRead = false;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({
    user_id: 92001, role: 'subject_teacher', is_adviser: true, first_name: 'Fixture', last_name: 'Adviser',
  })));
  const reads = [], writes = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = payload => route.fulfill({ contentType: 'application/json', body: JSON.stringify(payload),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return json({}); }
    reads.push(url.pathname);
    if (heldReport && url.pathname.startsWith('/api/student-sf9/')) await heldReport;
    if (/^\/api\/sections\/adviser\/9200[12]$/.test(url.pathname)) {
      assert.equal(url.searchParams.get('classContextVersion'), '3');
      return json(teachingOnly ? [{ ...cards[2], isAdviser: false, classType: 'Regular Class' }] : cards);
    }
    if (url.pathname === '/api/class-record/grading-summary/81') return json({ summaryVersion: 2,
      context: { subjectOfferingId: 81, sectionId: 18, schoolYearId: 3, activeTerm: 'T1', submissionTerms: [] }, students: [] });
    if (url.pathname === '/api/grade-submission-status') return json({ statusVersion: 1,
      context: { subjectOfferingId: '81' }, subjects: [] });
    const match = url.pathname.match(/^\/api\/section-details\/(advisory|teaching)\/(\d+)$/);
    if (match) {
      assert.equal(url.searchParams.get('viewVersion'), VIEW_VERSION);
      if (Number(match[2]) !== 41) assert.equal(url.searchParams.get('riskMode'), 'monitoring');
      const held = heldTerm;
      if (held && url.searchParams.get('term') === held.term) { held.started(); await held.gate; }
      if (failedNextRead) { failedNextRead = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary test failure' }), headers: { 'Access-Control-Allow-Origin': '*' } }); }
      const payload = details(match[1], Number(match[2]), url.searchParams.get('term'), url.searchParams.get('riskMode'));
      if (malformedNextRead) { malformedNextRead = false; delete payload.learners[0].academic.gradePreview; }
      return json(payload);
    }
    return json([]);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'adviser/sections');
  const grid = page.locator('.classes-grid');
  await grid.getByRole('button', { name: 'VIEW', exact: true }).first().waitFor();
  assert.equal(await grid.locator(':scope > div').count(), 3);
  assert((await grid.locator(':scope > div').first().textContent()).includes('Carrots'));
  await page.locator('button[title="Toggle sorting order"]').click();
  assert((await grid.locator(':scope > div').first().textContent()).includes('Mahogany'));
  await page.locator('button[title="Toggle sorting order"]').click();
  const advisory = grid.locator(':scope > div').filter({ hasText: 'All subjects' }).filter({ hasText: 'Mahogany' });
  const english = grid.locator(':scope > div').filter({ hasText: 'English' });
  assert.equal(await advisory.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await advisory.evaluate(el => getComputedStyle(el).borderColor), 'rgb(238, 242, 246)');
  assert.equal(await english.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await advisory.getByRole('button').count(), 3);
  assert.equal(await english.getByText('Advisory Class', { exact: true }).count(), 1);
  await page.screenshot({ path: join(artifacts, 'cards-desktop.png'), fullPage: true, animations: 'disabled' });
  await english.getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).waitFor();
  const columns = await page.locator('.section-data-table thead th').allTextContents();
  assert.match(columns[2], /At-risk Status/);
  assert.equal(columns[3], 'Term 1 Grade');
  const fixtureRow = () => page.locator('.section-data-table tbody tr').filter({ hasText: 'Fixture Learner' });
  assert.equal(await fixtureRow().locator('td').nth(3).textContent(), '78', 'monitoring grade and risk share the running preview');
  assert(await page.getByRole('cell', { name: 'Moderate Risk', exact: true }).isVisible());
  assert.equal(await page.locator('.section-status-detail').count(), 0);
  assert(await page.getByRole('button', { name: 'View SF9 for Fixture Learner', exact: true }).isVisible());
  assert(await page.getByRole('button', { name: 'View SF10 for Fixture Learner', exact: true }).isVisible());
  assert.equal(reads.filter(path => path === '/api/section-details/teaching/41').length, 1);
  assert.equal(reads.includes('/api/section-details/advisory/9'), false);
  assert.equal(reads.some(path => /grading-summary|students$/.test(path)), false, 'details must not start a separate grading-sheet read');
  await page.locator('.table-sub-header select').selectOption('termGrade');
  assert.equal(await page.locator('.section-data-table tbody tr').first().locator('td').nth(3).textContent(), '78');
  await page.getByRole('button', { name: 'Moderate', exact: true }).click();
  await page.getByPlaceholder('Search student...').fill('Fixture');
  failedNextRead = true;
  await page.getByRole('switch', { name: 'Predict', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Temporary test failure' }).waitFor();
  assert.equal(await fixtureRow().locator('td').nth(3).textContent(), '78', 'failed prediction keeps the coherent previous monitoring view');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('columnheader', { name: /English.*Term 2/ }).waitFor();
  assert.equal(await fixtureRow().locator('td').nth(3).textContent(), '84');
  assert.equal(await page.getByPlaceholder('Search student...').inputValue(), 'Fixture');
  assert.equal(await page.locator('.table-sub-header select').inputValue(), 'termGrade');
  assert.equal(await page.getByRole('button', { name: 'Medium', exact: true }).getAttribute('aria-pressed'), 'false');
  await page.getByPlaceholder('Search student...').fill('');
  assert.equal(await page.locator('.section-data-table tbody tr').first().locator('td').nth(3).textContent(), '65', 'prediction sorting uses submitted grades');
  assert.equal(await page.locator('.section-status-detail').textContent(), 'English · Term 2');
  await page.getByRole('button', { name: 'Refresh grades and statuses', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.section-details-refresh')?.disabled === false);
  assert.equal(await page.getByRole('switch', { name: 'Predict', exact: true }).getAttribute('aria-checked'), 'true');
  submissionReady = false;
  await page.getByRole('button', { name: 'Refresh grades and statuses', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Prediction is no longer available' }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Predict', exact: true }).getAttribute('aria-checked'), 'false');
  assert(await page.getByRole('switch', { name: 'Predict', exact: true }).isDisabled());
  const predictHelp = page.locator('.section-predict-help');
  const disabledBounds = await predictHelp.boundingBox();
  await predictHelp.hover();
  await page.getByRole('tooltip').waitFor();
  assert(await page.getByRole('tooltip').getByText('Grades need to be submitted', { exact: true }).isVisible());
  assert.deepEqual(await predictHelp.boundingBox(), disabledBounds, 'the tooltip does not move the Predict switch');
  await predictHelp.focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('tooltip').count(), 0, 'Escape dismisses the prediction help');
  await page.mouse.move(0, 0);
  await predictHelp.blur();
  await predictHelp.focus();
  assert(await page.getByRole('tooltip').isVisible(), 'disabled prediction help is available from the keyboard');
  await page.keyboard.press('Escape');
  await predictHelp.blur();
  assert.equal(await fixtureRow().locator('td').nth(3).textContent(), '78');
  submissionReady = true;
  const hold = term => {
    let started, resume;
    const begun = new Promise(resolve => { started = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    heldTerm = { term, started, gate };
    return { begun, resume };
  };
  const term2 = hold('T2');
  await page.getByRole('button', { name: 'T2', exact: true }).click();
  await term2.begun;
  assert(await page.locator('.app-skeleton-region').first().isVisible());
  assert.equal(await page.getByText('Fixture Learner', { exact: true }).count(), 0, 'old-term records are replaced by placeholders');
  assert(await page.getByRole('button', { name: 'Back to Classes', exact: true }).isVisible());
  // A newer selection wins even when the older request finishes later.
  heldTerm = null;
  await page.getByRole('button', { name: 'T3', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Term 3 Grade' }).waitFor();
  assert(await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).isVisible(), 'Term 3 retains monitoring');
  assert(await page.getByRole('switch', { name: 'Predict', exact: true }).isDisabled());
  await predictHelp.hover();
  assert(await page.getByRole('tooltip').getByText('No next term', { exact: true }).isVisible());
  await page.mouse.move(0, 0);
  const oldTermFinished = page.waitForResponse(response => response.url().includes('/section-details/teaching/41') && response.url().includes('term=T2'));
  term2.resume(); await oldTermFinished;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.getByRole('columnheader', { name: 'Term 3 Grade' }).waitFor();
  const refresh3 = hold('T3');
  await page.getByRole('button', { name: 'Refresh grades and statuses', exact: true }).click();
  await refresh3.begun;
  assert.equal(await page.locator('.app-skeleton-region, .section-details-busy-overlay').count(), 0, 'same-context refresh retains the current table');
  assert(await page.getByRole('columnheader', { name: 'Term 3 Grade' }).isVisible());
  heldTerm = null; refresh3.resume();
  await page.getByRole('button', { name: 'T1', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Term 1 Grade', exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Predict', exact: true }).getAttribute('aria-checked'), 'false', 'changing terms resets to monitoring');
  let finishReport;
  heldReport = new Promise(resolve => { finishReport = resolve; });
  await page.getByRole('button', { name: 'View SF9 for Fixture Learner', exact: true }).click();
  await page.getByRole('status', { name: 'Loading learner report', exact: true }).waitFor();
  assert(await page.locator('.student-sf9-container h1').isVisible());
  assert(await page.locator('.student-sf9-container .app-skeleton-block').first().isVisible());
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  heldReport = null; finishReport();
  await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'english-advisory-details.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Back to Classes', exact: true }).click();
  await advisory.getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Term 1 Grade' }).waitFor();
  assert(await page.getByRole('cell', { name: '95', exact: true }).isVisible());
  assert.equal(await page.getByRole('columnheader', { name: /At-risk Status/ }).count(), 0);
  assert.equal(reads.filter(path => path === '/api/section-details/advisory/10').length, 1);
  await page.getByRole('button', { name: 'Back to Classes', exact: true }).click();
  await grid.locator(':scope > div').filter({ hasText: 'Science' }).getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Term 1 Grade' }).waitFor();
  assert(await page.getByRole('cell', { name: '71', exact: true }).isVisible());
  assert(await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).isVisible());
  assert.equal(await page.getByRole('switch', { name: 'Predict', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Back to Classes', exact: true }).click();
  // Opening the grading sheet updates class metadata. That must not start a read loop.
  const summaryRead = page.waitForResponse(response => response.url().includes('/class-record/grading-summary/81'));
  await english.getByRole('button', { name: 'Grading Sheet', exact: true }).click();
  await summaryRead;
  await page.locator('button[title="Print Grading Sheet"]').waitFor();
  await page.locator('button[title="Back to Classes"]').click();
  assert.equal(reads.filter(path => path === '/api/class-record/grading-summary/81').length, 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(artifacts, 'cards-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.equal(await grid.evaluate(el => el.scrollWidth > el.clientWidth), false, 'cards fit on a narrow screen');
  teachingOnly = true;
  malformedNextRead = true;
  await page.evaluate(() => localStorage.setItem('user', JSON.stringify({ user_id: 92002, role: 'subject_teacher', is_adviser: false })));
  await page.goto(server.resolvedUrls.local[0] + 'teacher/sections');
  await page.locator('.classes-grid').getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByText('Section Details could not be loaded', { exact: true }).waitFor();
  assert.equal(await page.getByRole('cell', { name: /Risk/ }).count(), 0, 'a risk without its grade must not render');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('cell', { name: 'High Risk', exact: true }).waitFor();
  for (const status of ['needs_records', 'review']) {
    academicState = status;
    await page.getByRole('button', { name: 'Refresh grades and statuses', exact: true }).click();
    await page.getByRole('cell', { name: status === 'review' ? 'Review records' : 'Records needed', exact: true }).first().waitFor();
    assert.equal(await page.getByRole('cell', { name: '—', exact: true }).count(), 2);
    assert.equal(await page.getByRole('cell', { name: /Low Risk|Moderate Risk|High Risk/ }).count(), 0);
  }
  academicState = 'available';
  await page.getByRole('button', { name: 'Refresh grades and statuses', exact: true }).click();
  await page.getByRole('cell', { name: '71', exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'teacher-monitoring-mobile.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS combined advisory/subject card, advisory-only section, regular subject view, and no redundant grading reads');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
