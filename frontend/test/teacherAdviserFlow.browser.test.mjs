// Real teacher directory/GradingSheet, MasterSheet and API wrappers. All API data is intercepted.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-teacher-adviser-'));
const classInfo = { id: 'teaching-131', section_id: 18, subject_offering_id: 131, school_year_id: 1,
  sectionName: 'Fixture', gradeLevel: 'G8', subject: 'English', classType: 'Regular Class', active_term: 'T2', deadline: '2026-12-19' };
const assignment = { adviserAssignmentId: 1, sectionId: 18, schoolYearId: 1, schoolYearLabel: '2026-2027', gradeLevel: 'G8', sectionName: 'Fixture', isCurrent: true };
const student = { id: 195, student_id: 195, student_section_id: 177, firstName: 'Fixture', lastName: 'Learner', middleName: '', lrn: '100000000001', sex: 'M', term1: 98, term2: 97, term3: '' };
let submitted = false, correction = false, corrected = false, responseMode = 'ok', releaseSubmission, submissionStarted;
let masterReadMode = 'ok', masterReadStarted, releaseMasterRead;
const reads = [], writes = [], errors = [];
const summary = () => ({ summaryVersion: 2, context: { subjectOfferingId: 131, sectionId: 18, schoolYearId: 1, activeTerm: 'T2',
  submissionTerms: [...(!submitted ? [{ term: 'T2', deadline: '2026-12-19', correction: false }] : []),
    ...(correction ? [{ term: 'T1', deadline: '2026-11-01', correction: true }] : [])] },
  students: [{ ...student, term1: correction || corrected ? 99 : 98 }], warnings: [] });
const status = query => ({ statusVersion: 1, context: { sectionId: 18, schoolYearId: 1, ...query }, subjects: [{ subjectOfferingId: 131,
  subjectName: 'English', assignedTeachers: ['Fixture Teacher'], terms: [1, 2, 3].map(n => ({ term: `T${n}`,
    state: n === 1 ? correction ? 'IN_CORRECTION' : 'SUBMITTED' : n === 2 && submitted ? 'SUBMITTED' : 'NOT_SUBMITTED',
    submittedAt: n === 1 || n === 2 && submitted ? '2026-10-23T06:00:00Z' : null,
    submittedBy: n === 1 || n === 2 && submitted ? { userId: 3, name: 'Fixture Teacher' } : null })) }] });
const master = () => ({ assignment: { adviserAssignmentId: 1, sectionId: 18, schoolYearId: 1 }, section: { id: 18, name: 'Fixture', gradeLevel: 'G8' },
  schoolYear: { id: 1, label: '2026-2027' }, subjects: [{ key: 'english', label: 'English' }], terms: [], gradeFlowVersion: 2,
  submissionRevision: `12:${corrected ? 2 : 1}|38:${submitted ? 1 : 0}`,
  students: [{ ...student, studentSectionId: 177, displayName: 'Learner, Fixture', generalAverage: null,
    grades: { english: { terms: [corrected ? 99 : 98, submitted ? 97 : null, null], finalGrade: null } } }],
  completeness: { studentCount: 1, completedTermGrades: submitted ? 2 : 1, expectedTermGrades: 33 }, warnings: [] });
const server = await createServer({ cacheDir: mkdtempSync(join(tmpdir(), 'auralis-flow-vite-')),
  plugins: [{ name: 'isolated-teacher-flow', resolveId(id) { if (id === '/__flow.jsx') return '\0flow.jsx'; },
    load(id) { if (id !== '\0flow.jsx') return null; return `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
      import AdviserSections from '/src/pages/adviser/AdviserSections.jsx';import MasterSheet from '/src/pages/adviser/MasterSheet.jsx';
      import{submitTeacherGrades}from'/src/services/classRecordApi.js';import db from '/src/offline/db.js';
      import{saveOfflineScores}from'/src/offline/syncManager.js'; window.__submit=submitTeacherGrades;window.__db=db;window.__saveOffline=saveOfflineScores;
      const teacher=new URL(location.href).searchParams.get('mode')==='teacher';
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:[{pathname:'/test',state:{currentView:'grading-sheet',activeSelectedClass:${JSON.stringify(classInfo)}}}]},
      React.createElement(teacher?AdviserSections:MasterSheet)));`; } }], server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const setup = async teacher => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ teacher }) => {
      localStorage.setItem('user', JSON.stringify({ user_id: teacher ? 3 : 28, role: teacher ? 'subject_teacher' : 'adviser', first_name: 'Fixture' }));
      window.__streams = [];
      window.EventSource = class extends EventTarget { constructor(url) { super(); this.url = url; window.__streams.push(this); } close() { this.closed = true; } };
    }, { teacher });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = (body, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
      if (url.pathname === '/flow-test') return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(url.pathname,
        '<html><head><style>body{margin:0;padding:20px;font-family:Arial;background:#f7f9fb}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/__flow.jsx"></script></body></html>') });
      if (!url.pathname.startsWith('/api/')) return req.url().startsWith(server.resolvedUrls.local[0]) || url.protocol === 'data:' ? route.continue() : route.abort();
      if (req.method() === 'OPTIONS') return json({});
      if (req.method() !== 'GET') {
        writes.push({ path: url.pathname, owner: req.headers()['x-auralis-user-id'], body: req.postDataJSON() });
        assert.equal(url.pathname, '/api/class-record/submit');
        if (responseMode === 'server-error') return json({ error: 'Synthetic database failure' }, 500);
        if (responseMode === 'malformed') return json({});
        if (responseMode === 'network-error') return route.abort('failed');
        if (responseMode === 'hold') await new Promise(resolve => {
          releaseSubmission = resolve;
          submissionStarted?.();
        });
        if (req.postDataJSON().term === 'T1') { corrected = true; correction = false; } else submitted = true;
        return json({ submitted: true, submissionVersion: 2, subjectOfferingId: 131, sectionId: 18, schoolYearId: 1, term: req.postDataJSON().term, revision: corrected ? 2 : 1 });
      }
      reads.push({ path: url.pathname, owner: req.headers()['x-auralis-user-id'], query: Object.fromEntries(url.searchParams) });
      if (url.pathname === '/api/sections/adviser/3') return json([classInfo]);
      if (url.pathname === '/api/class-record/grading-summary/131') return json(summary());
      if (url.pathname === '/api/grade-submission-status') return json(status(Object.fromEntries(url.searchParams)));
      if (url.pathname === '/api/master-sheets/options') return json({ assignments: [assignment] });
      if (url.pathname === '/api/master-sheets/1') {
        if (masterReadMode === 'hold') await new Promise(resolve => { releaseMasterRead = resolve; masterReadStarted?.(); });
        if (masterReadMode === 'error') return json({ message: 'Synthetic refresh failure' }, 503);
        return json(master());
      }
      throw Error('Unexpected API: ' + req.url());
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.resolvedUrls.local[0] + 'flow-test?mode=' + (teacher ? 'teacher' : 'adviser'), {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    return { context, page };
  };
  const adviser = await setup(false), teacher = await setup(true);
  const a = adviser.page, t = teacher.page;
  await t.getByText('Term 2 · Not submitted', { exact: true }).waitFor();
  await t.getByRole('button', { name: 'Submit', exact: true }).waitFor();
  assert.equal(await t.locator('.grade-value-cell').first().textContent(), '98');
  assert.equal(await a.locator('.ms-grade-cell').first().textContent(), '98', 'Both users read the accepted T1 grade, not a separate formula');
  assert.equal(await a.locator('.ms-grade-cell').nth(1).textContent(), '—', 'Unsubmitted T2 stays private');
  const event = { type: 'SUBMISSION', related_entity_type: 'GRADE_SHEET', section_id: 18, school_year_id: 1 };
  const masterReads = () => reads.filter(read => read.path === '/api/master-sheets/1').length;
  await a.locator('.ms-container[aria-busy="false"]').waitFor();
  const loadedReads = masterReads();
  const returnToSheet = () => a.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await returnToSheet(); await returnToSheet();
  await a.waitForTimeout(350);
  assert.equal(masterReads(), loadedReads, 'Returning to a recently loaded sheet does not fetch it again');
  assert.equal(await a.locator('.ms-refresh-overlay').count(), 0);
  masterReadMode = 'hold';
  const started = new Promise(resolve => { masterReadStarted = resolve; });
  await a.evaluate(() => { const now = Date.now; window.__restoreClock = () => { Date.now = now; }; Date.now = () => now() + 61_000; });
  await returnToSheet();
  await started;
  assert.equal(await a.locator('.ms-refresh-overlay').count(), 0, 'A stale focus check keeps the table visible without an overlay');
  assert.equal(await a.locator('.ms-container').getAttribute('aria-busy'), 'false');
  assert(await a.getByRole('button', { name: 'Download PDF', exact: true }).isEnabled());
  await a.getByPlaceholder('Search student name or LRN...').fill('Fixture');
  assert.equal(await a.locator('.ms-grade-cell').first().textContent(), '98', 'The loaded sheet stays usable during the request');
  await returnToSheet(); await returnToSheet();
  await a.evaluate(data => {
    const stream = window.__streams.at(-1);
    stream.onmessage({ data: JSON.stringify(data) });
    stream.onmessage({ data: JSON.stringify(data) });
  }, event);
  await a.waitForTimeout(250);
  assert.equal(masterReads(), loadedReads + 1, 'Focus and visibility events do not duplicate the pending read');
  masterReadMode = 'ok';
  const followup = a.waitForResponse(response => new URL(response.url()).pathname === '/api/master-sheets/1');
  releaseMasterRead();
  await followup;
  await a.waitForTimeout(350);
  assert.equal(masterReads(), loadedReads + 2, 'Submissions arriving during a read trigger one follow-up snapshot');
  await a.evaluate(() => window.__restoreClock());
  await a.getByPlaceholder('Search student name or LRN...').fill('');
  masterReadMode = 'error';
  await a.evaluate(data => window.__streams.at(-1).onmessage({ data: JSON.stringify(data) }), event);
  await a.getByRole('alert').filter({ hasText: 'Synthetic refresh failure' }).waitFor();
  assert.equal(await a.locator('.ms-grade-cell').first().textContent(), '98', 'A failed background read preserves the loaded grades');
  assert.equal(await a.locator('.ms-refresh-overlay').count(), 0);
  masterReadMode = 'ok';
  await t.getByRole('button', { name: 'Submit', exact: true }).click();
  const modal = t.getByRole('heading', { name: 'Submit Term 2 grades to adviser?' }); await modal.waitFor();
  responseMode = 'server-error';
  await t.getByRole('button', { name: 'Submit', exact: true }).last().click();
  await t.getByRole('alert').filter({ hasText: 'Synthetic database failure' }).waitFor();
  assert.equal(submitted, false); assert.equal(await a.locator('.ms-grade-cell').nth(1).textContent(), '—');
  responseMode = 'hold';
  const heldSubmission = new Promise(resolve => { submissionStarted = resolve; });
  await t.getByRole('button', { name: 'Submit', exact: true }).last().click();
  // The busy UI appears before pending IndexedDB edits have been checked.
  // Wait until the intercepted request is actually held before releasing it.
  let requestTimeout;
  try {
    await Promise.race([heldSubmission, new Promise((_, reject) => {
      requestTimeout = setTimeout(() => reject(new Error('The submission request never reached the test handler.')), 15000);
    })]);
  } finally {
    clearTimeout(requestTimeout);
    submissionStarted = undefined;
  }
  await t.getByRole('button', { name: 'Submitting...' }).last().waitFor();
  assert.equal(await t.getByText('Submitted!', { exact: true }).count(), 0, 'No success before server confirmation');
  releaseSubmission(); responseMode = 'ok';
  await t.getByText('Term 2 · Submitted', { exact: true }).waitFor();
  await t.getByRole('button', { name: 'Submitted', exact: true }).waitFor();
  assert.deepEqual(writes.at(-1), { path: '/api/class-record/submit', owner: '3', body: { subject_offering_id: 131, section_id: 18, school_year_id: 1, term: 'T2' } }, 'Only selected term/context are sent; never browser grade values');
  await a.evaluate(data => window.__streams.at(-1).onmessage({ data: JSON.stringify(data) }), event);
  await a.locator('.ms-grade-cell').nth(1).filter({ hasText: '97' }).waitFor();
  await a.getByRole('button', { name: 'Submission status', exact: true }).click();
  const panel = a.getByRole('dialog', { name: 'Submission status', exact: true });
  await panel.getByText('Submitted', { exact: true }).nth(1).waitFor();
  await a.keyboard.press('Escape');
  correction = true; await t.reload();
  await t.getByText('Term 1 · Correction in progress', { exact: true }).waitFor();
  assert.equal(await t.locator('.grade-value-cell').first().textContent(), '99', 'Teacher can review the correction draft');
  await a.evaluate(data => window.__streams.at(-1).onmessage({ data: JSON.stringify(data) }), event);
  await a.waitForFunction(() => !document.querySelector('.ms-container')?.getAttribute('aria-busy') || document.querySelector('.ms-container').getAttribute('aria-busy') === 'false');
  assert.equal(await a.locator('.ms-grade-cell').first().textContent(), '98', 'Opening a correction does not replace the accepted grade');
  await t.getByRole('button', { name: 'Submit', exact: true }).click();
  await t.getByRole('heading', { name: 'Submit Term 1 grades to adviser?' }).waitFor();
  await t.getByRole('button', { name: 'Submit', exact: true }).last().click();
  await t.getByText('Term 1 grades for G8 - Fixture submitted successfully!', { exact: true }).waitFor();
  assert.equal(writes.at(-1).body.term, 'T1');
  await a.evaluate(data => window.__streams.at(-1).onmessage({ data: JSON.stringify(data) }), event);
  await a.locator('.ms-grade-cell').first().filter({ hasText: '99' }).waitFor();
  const count = writes.length;
  await t.evaluate(async () => window.__saveOffline({ subject_offering_id: 131, term: 'T2', scores: [{ assessment_id: 10, student_id: 195, raw_score: 20 }] }));
  const pendingError = await t.evaluate(async () => { try { await window.__submit({ subject_offering_id: 131, section_id: 18, school_year_id: 1, term: 'T2' }); } catch (e) { return e.message; } });
  assert.match(pendingError, /pending score edits/); assert.equal(writes.length, count, 'Unsent score drafts block publication and remain local');
  assert.equal(await t.evaluate(() => window.__db.offlineScores.count()), 1);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await a.setViewportSize(viewport); await a.screenshot({ path: join(artifacts, `master-${viewport.width}.png`), fullPage: true });
    assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  }
  assert(reads.some(read => read.path === '/api/class-record/grading-summary/131' && read.owner === '3' && read.query.gradeFlowVersion === '2'));
  assert(reads.some(read => read.path === '/api/master-sheets/1' && read.query.gradeFlowVersion === '2'));
  assert.deepEqual(errors, []);
  await a.evaluate(() => { localStorage.removeItem('user'); window.dispatchEvent(new Event('auralis-session-changed')); });
  assert(await a.evaluate(() => window.__streams.at(-1).closed), 'Logout closes the former account’s live refresh stream');
  console.log('Teacher → Adviser browser checks passed:', artifacts);
} finally { await browser?.close(); await server.close(); }
