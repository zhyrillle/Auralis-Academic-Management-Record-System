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
const details = (type, id, term) => ({
  context: { assignmentType: type, assignmentId: id, sectionId: 18, sectionName: 'Carrots', gradeLevel: 'Grade 8',
    schoolYear: { id: 3, label: '2026-2027' }, subject: type === 'teaching' ? { name: id === 41 ? 'English' : 'Science' } : null,
    selectedTerm: { code: term, label: `Term ${term[1]}` } },
  capabilities: { atRiskApplicable: id === 41, atRiskAvailable: id === 41 && term !== 'T3' },
  summary: { learnerCount: 1, performanceBands: {} }, warnings: [],
  riskContext: { targetTerm: term === 'T3' ? null : `T${Number(term[1]) + 1}` },
  learners: [{ studentSectionId: 501, studentId: 101, name: 'Fixture Learner', termGrade: 80, gradeState: 'COMPLETE',
    honorStatus: 'NONE', riskAssessment: { status: 'available', riskLevel: 'medium', label: 'Medium Risk' } }],
});
let browser;
let heldTerm = null;
let heldReport = null;
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
    if (url.pathname === '/api/sections/adviser/92001') {
      assert.equal(url.searchParams.get('classContextVersion'), '3'); return json(cards);
    }
    if (url.pathname === '/api/class-record/grading-summary/81') return json({ summaryVersion: 2,
      context: { subjectOfferingId: 81, sectionId: 18, schoolYearId: 3, activeTerm: 'T1', submissionTerms: [] }, students: [] });
    if (url.pathname === '/api/grade-submission-status') return json({ statusVersion: 1,
      context: { subjectOfferingId: '81' }, subjects: [] });
    const match = url.pathname.match(/^\/api\/section-details\/(advisory|teaching)\/(\d+)$/);
    if (match) {
      const held = heldTerm;
      if (held && url.searchParams.get('term') === held.term) { held.started(); await held.gate; }
      return json(details(match[1], Number(match[2]), url.searchParams.get('term')));
    }
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'adviser/sections');
  const grid = page.locator('.classes-grid');
  await grid.getByRole('button', { name: 'VIEW', exact: true }).first().waitFor();
  assert.equal(await grid.locator(':scope > div').count(), 4);
  const assertAdvisoryFirst = async () => {
    const subjects = await grid.locator(':scope > div').evaluateAll(cards => cards.map(card => card.textContent));
    assert(subjects.slice(0, 2).every(text => text.includes('All subjects')));
    assert(subjects.slice(2).every(text => !text.includes('All subjects')));
  };
  await assertAdvisoryFirst();
  await page.locator('button[title="Toggle sorting order"]').click();
  await assertAdvisoryFirst();
  await page.locator('button[title="Toggle sorting order"]').click();
  const advisory = grid.locator(':scope > div').filter({ hasText: 'All subjects' }).filter({ hasText: 'Carrots' });
  const english = grid.locator(':scope > div').filter({ hasText: 'English' });
  assert.equal(await advisory.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 248, 225)');
  assert.equal(await advisory.evaluate(el => getComputedStyle(el).borderColor), 'rgb(238, 242, 246)');
  assert.equal(await english.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  assert.equal(await advisory.getByRole('button').count(), 1);
  assert.equal(await english.getByText('Advisory Class', { exact: true }).count(), 1);
  await page.screenshot({ path: join(artifacts, 'cards-desktop.png'), fullPage: true, animations: 'disabled' });
  await english.getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: /At-risk Status/ }).waitFor();
  assert.equal(await page.getByText('Medium Risk', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('columnheader', { name: 'Honor Status' }).count(), 0);
  assert.equal(reads.filter(path => path === '/api/section-details/teaching/41').length, 1);
  assert.equal(reads.some(path => /grading-summary|students$/.test(path)), false, 'details must not start a separate grading-sheet read');
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
  await page.getByRole('columnheader', { name: /At-risk Status/ }).waitFor();
  let finishReport;
  heldReport = new Promise(resolve => { finishReport = resolve; });
  await page.getByRole('button', { name: 'View Fixture Learner', exact: true }).click();
  await page.getByRole('status', { name: 'Loading learner report', exact: true }).waitFor();
  assert(await page.locator('.student-sf9-container h1').isVisible());
  assert(await page.locator('.student-sf9-container .app-skeleton-block').first().isVisible());
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  heldReport = null; finishReport();
  await page.getByRole('columnheader', { name: /At-risk Status/ }).waitFor();
  await page.screenshot({ path: join(artifacts, 'english-details.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Back to Classes', exact: true }).click();
  await advisory.getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Honor Status' }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: /At-risk Status/ }).count(), 0);
  assert.equal(reads.filter(path => path === '/api/section-details/advisory/9').length, 1);
  await page.getByRole('button', { name: 'Back to Classes', exact: true }).click();
  await grid.locator(':scope > div').filter({ hasText: 'Science' }).getByRole('button', { name: 'VIEW', exact: true }).click();
  await page.getByRole('columnheader', { name: 'Term 1 Grade' }).waitFor();
  assert.equal(await page.getByRole('columnheader', { name: /At-risk Status|Honor Status/ }).count(), 0);
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
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS separate advisory/English/Science views, card colors, retained advisory badge, and no redundant grading reads');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
