// Real Grading Sheet and Master Sheet, isolated browser responses; no school DB.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-grade-status-'));
const learner = { studentSectionId: 501, studentId: 41, id: 41, lrn: '100000000041', displayName: 'Fixture Learner',
  firstName: 'Fixture', lastName: 'Learner', sex: 'M', term1: 98, term2: 97, term3: '', grades: { english: { terms: [92, null, null], finalGrade: null } }, generalAverage: null };
const classInfo = { id: 'teaching-131', section_id: 18, subject_offering_id: 131, school_year_id: 1, sectionName: 'Fixture',
  gradeLevel: 'G8', subject: 'English', deadline: '2026-12-18', submitted: false, active_term: 'T2' };
const assignment = { adviserAssignmentId: 1, sectionId: 18, schoolYearId: 1, schoolYearLabel: '2026-2027', gradeLevel: 'G8', sectionName: 'Fixture', isCurrent: true };
const sheet = { section: { name: 'Fixture', gradeLevel: 'G8' }, schoolYear: { label: '2026-2027' },
  students: [learner], subjects: [{ key: 'english', label: 'English' }], terms: [], completeness: { studentCount: 1, completedTermGrades: 1, expectedTermGrades: 3 } };
let error = false, malformed = false, noSubjects = false, missingActor = false, submittedTerm2 = false;
let holdStatus = false, releaseStatus;
const reads = [], writes = [], errors = [];
const payload = query => ({ statusVersion: 1, context: { sectionId: 18, schoolYearId: 1, ...query }, subjects: noSubjects ? [] : [{
  subjectOfferingId: 131, subjectName: 'English', assignedTeachers: ['Assigned Teacher'], terms: [1, 2, 3].map(n => ({
    term: `T${n}`, state: n === 1 || (n === 2 && submittedTerm2) ? 'SUBMITTED' : 'NOT_SUBMITTED',
    submittedAt: n === 1 ? '2026-10-04T15:35:19.719Z' : null,
    submittedBy: n === 1 && !missingActor ? { userId: 33, name: 'Actual Submitter' } : null,
  })),
}] });
const server = await createServer({
  cacheDir: mkdtempSync(join(tmpdir(), 'auralis-grade-status-vite-')),
  plugins: [{ name: 'isolated-grade-status', resolveId(id) { if (id === '/__grade-status.jsx') return '\0grade-status.jsx'; },
    load(id) { if (id !== '\0grade-status.jsx') return null;
      return `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';
      import MasterSheet from '/src/pages/adviser/MasterSheet.jsx';import GradingSheet from '/src/pages/adviser/GradingSheet.jsx';
      const teacher=new URL(location.href).searchParams.get('mode')==='teacher';
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,teacher
        ?React.createElement(GradingSheet,{activeSelectedClass:${JSON.stringify(classInfo)},students:${JSON.stringify([learner])},onBack:()=>{},
          onSubmit:()=>{throw Error('No submissions allowed')},calculateFinalGrade:(...terms)=>Math.round(terms.filter(v=>v!=='').reduce((s,n)=>s+Number(n),0)/terms.filter(v=>v!=='').length)})
        :React.createElement(MasterSheet)));`;
    } }], server: { host: '127.0.0.1', port: 0, open: false },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const teacher = new URL(location.href).searchParams.get('mode') === 'teacher';
    localStorage.setItem('user', JSON.stringify({ user_id: teacher ? 3 : 28, role: 'adviser', first_name: 'Fixture' }));
  });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (url.pathname === '/grade-status-test') return route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml(url.pathname,
      '<html><head><style>body{margin:0;padding:20px;font-family:Arial;background:#f7f9fb}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/__grade-status.jsx"></script></body></html>') });
    if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) || url.protocol === 'data:' ? route.continue() : route.abort();
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(request.url()); return route.abort(); }
    if (url.pathname === '/api/grade-submission-status') {
      reads.push({ query: Object.fromEntries(url.searchParams), owner: request.headers()['x-auralis-user-id'] });
      if (holdStatus) await new Promise(resolve => { releaseStatus = resolve; });
      if (error) return json({ message: 'Unable to load submission status. Please retry.' }, 500);
      if (malformed) return json({});
      return json(payload(Object.fromEntries(url.searchParams)));
    }
    if (url.pathname === '/api/master-sheets/options') return json({ assignments: [assignment] });
    if (url.pathname === '/api/notifications/stream') return route.fulfill({ contentType: 'text/event-stream', body: ': isolated stream\n\n', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname === '/api/master-sheets/1') return json(sheet);
    if (url.pathname === '/api/class-record/131') return json({ active_term: 'T2' });
    throw Error('Unexpected API: ' + request.url());
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  const go = mode => page.goto(server.resolvedUrls.local[0] + 'grade-status-test?mode=' + mode);
  const finishMotion = () => page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
  const open = async () => { await page.getByRole('button', { name: 'Submission status', exact: true }).click(); return page.getByRole('dialog', { name: 'Submission status', exact: true }); };
  await go('teacher'); await page.getByText('Term 2 · Not submitted', { exact: true }).waitFor();
  assert.equal(await page.locator('.grade-value-cell').first().textContent(), '98', 'teacher grades remain unchanged');
  assert(reads.some(r => r.owner === '3' && r.query.subjectOfferingId === '131'));
  submittedTerm2 = true; await page.reload(); await page.getByText('Term 2 · Submitted', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Submitted', exact: true }).isDisabled(), 'server status restores the submitted footer after reload');
  submittedTerm2 = false; error = true; await page.reload(); await page.getByText('Term 2 · Status unavailable', { exact: true }).waitFor();
  error = false; await page.getByRole('button', { name: 'Retry submission status' }).click(); await page.getByText('Term 2 · Not submitted', { exact: true }).waitFor();
  await finishMotion(); await page.screenshot({ path: join(artifacts, 'teacher-laptop.png'), fullPage: true });
  await go('adviser'); assert.equal(await page.locator('.ms-grade-cell').first().textContent(), '92', 'Master Sheet grades remain unchanged');
  holdStatus = true;
  const panel = await open();
  await panel.getByText('Loading submission status…', { exact: true }).waitFor();
  assert(await panel.locator('.grade-submission-spinner').isVisible(), 'pending status read has a visible spinner');
  assert.equal(await panel.locator('.grade-submission-spinner').evaluate(node => getComputedStyle(node).animationName), 'none', 'reduced motion disables spinning');
  assert.equal(await panel.locator('.app-overlay__panel').evaluate(node => getComputedStyle(node).animationName), 'none', 'reduced motion disables the upward pop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.equal(await panel.locator('.grade-submission-spinner').evaluate(node => getComputedStyle(node).animationName), 'grade-submission-spin');
  const pop = await panel.locator('.app-overlay__panel').evaluate(node => {
    const animation = node.getAnimations().find(item => item.animationName === 'grade-submission-pop-up');
    if (!animation) return null;
    animation.pause();
    const frames = [0, 180, 360].map(time => {
      animation.currentTime = time;
      const style = getComputedStyle(node), matrix = new DOMMatrix(style.transform);
      return { y: matrix.m42, scale: matrix.m11, opacity: Number(style.opacity) };
    });
    animation.finish();
    return frames;
  });
  assert(pop, 'status panel has its own upward-pop animation');
  assert(pop[0].y > 40 && pop[0].scale < 1 && pop[0].opacity === 0, 'pop starts below its resting position and slightly smaller');
  assert(pop[1].y < pop[0].y && pop[1].opacity > 0, 'pop interpolates upward instead of appearing instantly');
  assert(Math.abs(pop[2].y) < .1 && Math.abs(pop[2].scale - 1) < .001 && pop[2].opacity === 1, 'pop settles at normal size and position');
  holdStatus = false; releaseStatus(); await page.emulateMedia({ reducedMotion: 'reduce' });
  await panel.getByText('Submitted by: Actual Submitter', { exact: true }).waitFor();
  assert.equal(await panel.locator('.grade-submission-spinner').count(), 0, 'spinner disappears when status finishes loading');
  assert(await panel.evaluate(node => node.classList.contains('app-overlay--bottom')), 'status uses the shared bottom-floating presentation');
  const laptopPanel = await panel.locator('.app-overlay__panel').boundingBox();
  assert(Math.abs(768 - laptopPanel.y - laptopPanel.height - 20) < 2, 'status floats above the bottom edge, not centered');
  assert.equal(await panel.getByText('Not submitted', { exact: true }).count(), 2);
  assert(reads.some(r => r.owner === '28' && r.query.adviserAssignmentId === '1'));
  await page.screenshot({ path: join(artifacts, 'master-status-laptop.png'), fullPage: true });
  await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Submission status', exact: true }).focus(); await page.keyboard.press('Enter');
  await panel.getByRole('rowheader').filter({ hasText: 'English' }).waitFor();
  await panel.getByRole('button', { name: 'Close Submission status' }).click(); await panel.waitFor({ state: 'hidden' });
  error = true; await open(); await panel.getByRole('alert').waitFor();
  assert.equal(await panel.getByText('Not submitted', { exact: true }).count(), 0, 'failures never imply no submissions');
  error = false; malformed = true; await panel.getByRole('button', { name: 'Retry submission status' }).click();
  await panel.getByText('Submission status returned incomplete information. Please retry.', { exact: true }).waitFor();
  malformed = false; missingActor = true; await panel.getByRole('button', { name: 'Retry submission status' }).click();
  await panel.getByText('Submitted by: Not recorded', { exact: true }).waitFor();
  await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' }); noSubjects = true; await open();
  await panel.getByText('No subjects are configured for this section and school year.').waitFor();
  noSubjects = false;
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await go('adviser'); await open(); await panel.getByRole('rowheader').filter({ hasText: 'English' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'status panel stays inside viewport');
    const bounds = await panel.locator('.app-overlay__panel').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
    const bottomGap = viewport.height - bounds.y - bounds.height;
    assert(bottomGap >= 8 && bottomGap <= 24, 'bottom-floating status keeps a small viewport inset');
    await page.screenshot({ path: join(artifacts, `master-status-${viewport.width}.png`), fullPage: true });
  }
  await go('teacher'); await page.getByText('Term 2 · Not submitted', { exact: true }).waitFor();
  const footer = await page.locator('.persistent-footer').boundingBox();
  assert(footer.x >= 0 && footer.x + footer.width <= 391, 'teacher status footer fits narrow screens');
  await finishMotion(); await page.screenshot({ path: join(artifacts, 'teacher-390.png'), fullPage: true });
  assert.deepEqual(writes, [], 'viewing status never writes'); assert.deepEqual(errors, []);
  console.log('Grade submission status browser checks passed:', artifacts);
} finally { await browser?.close(); await server.close(); }
