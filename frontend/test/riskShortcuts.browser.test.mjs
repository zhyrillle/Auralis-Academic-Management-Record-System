// Real pages with intercepted synthetic responses. Never contact school APIs.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-risk-shortcuts-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92000, role: 'principal', first_name: 'Fixture' })));
  const writes = [], errors = [];
  const students = ['low', 'moderate', 'high', null].map((level, i) => ({ id: String(i), studentId: i + 1,
    studentSectionId: i + 10, name: `Fixture ${level || 'pending'}`, grade: 8, section: 'Demo', sectionId: 7,
    adviser: 'Fixture Adviser', academic: { status: level ? 'available' : 'needs_records', riskLevel: level,
      progress: level ? 80 : null, gradePreview: level ? 85 : null, recordedActivities: level ? 1 : 0, availableWeight: 30 },
    attendance: { recordedDays: 0 } }));
  const modelStudents = students.slice(0, 3).map((row, i) => ({ ...row, riskLevel: ['low', 'medium', 'high'][i], flags: [] }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data), headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return json({}); }
    if (url.pathname.endsWith('/student-monitoring/options')) return json({ today: '2026-11-10', defaultSchoolYear: '3',
      schoolYears: [{ value: '3', label: 'SY 2026–2027', terms: [{ value: 'T2', label: 'Term 2', startsOn: '2026-10-01', endsOn: '2026-12-31' }] }],
      subjects: [{ value: '1', label: 'English', code: 'ENG', schoolYearId: '3' }] });
    if (url.pathname.endsWith('/student-monitoring/preview')) return json({ students,
      context: { subject: 'English', term: 'T2', schoolYear: 'SY 2026–2027', asOf: '2026-11-10' } });
    if (url.pathname.endsWith('/at-risk-prediction/options')) return json({ schoolYears: [{ value: '2026-2027', label: 'SY 2026–2027' }],
      gradeLevels: [{ value: 'all', label: 'All Grade Levels' }, { value: '8', label: 'Grade 8' }] });
    if (url.pathname.endsWith('/at-risk-prediction/preview')) return json({ students: modelStudents, unavailable: [],
      summary: { lowRisk: 1, mediumRisk: 1, highRisk: 1, total: 3, totalEnglish: 3, unavailable: 0 },
      distribution: { totalFlagged: 3, low: { count: 1 }, medium: { count: 1 }, high: { count: 1 } },
      gradeBreakdown: [{ grade: 'Grade 8', low: 1, medium: 1, high: 1 }] });
    return json([]);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'principal/student-monitoring?subject=1&term=T2&schoolYear=3&grade=8&section=7&page=2');
  for (const level of ['high', 'moderate', 'low', 'pending']) {
    const label = level === 'pending' ? 'records needed / review' : level;
    const card = page.getByRole('button', { name: `View ${label} learners`, exact: true });
    await card.waitFor();
    if (level === 'high') { await card.focus(); await page.keyboard.press('Enter'); } else await card.click();
    await page.waitForURL(url => url.searchParams.get('band') === level);
    await page.waitForFunction(level => document.querySelectorAll('.sm-table tbody tr').length === 1
      && document.querySelector('.sm-table tbody').textContent.includes(`Fixture ${level}`), level);
    const params = new URL(page.url()).searchParams;
    for (const [key, value] of Object.entries({ subject: '1', term: 'T2', schoolYear: '3', grade: '8', section: '7' })) assert.equal(params.get(key), value);
    assert.equal(params.has('page'), false);
    assert.equal(await page.locator('.sm-table tbody tr').count(), 1);
    assert((await page.locator('.sm-table tbody').textContent()).includes(`Fixture ${level}`));
    assert(await page.getByRole('heading', { name: 'Learner monitoring', exact: true }).evaluate(el => document.activeElement === el));
    assert(await page.getByRole('heading', { name: 'Learner monitoring', exact: true }).evaluate(el => el.getBoundingClientRect().top < innerHeight));
  }
  await page.screenshot({ path: join(artifacts, 'monitoring-shortcut.png'), fullPage: true });
  for (const level of ['low', 'medium', 'high', 'all']) {
    await page.goto(server.resolvedUrls.local[0] + 'principal/at-risk-students/prediction?term=T3&schoolYear=2026-2027&gradeLevel=8');
    const name = level === 'all' ? 'View all learners with predictions' : `View ${level} risk learners`;
    const link = page.getByRole('link', { name, exact: true });
    await link.waitFor();
    await link.click();
    await page.waitForURL(url => url.pathname.endsWith(`/learners/${level}`));
    const params = new URL(page.url()).searchParams;
    assert.equal(params.get('term'), 'T3');
    assert.equal(params.get('schoolYear'), '2026-2027');
    assert.equal(params.get('gradeLevel'), '8');
    await page.locator('.ar-learner-page .ar-student-name').first().waitFor();
    assert.equal(await page.locator('.ar-learner-page .ar-student-card').count(), level === 'all' ? 3 : 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(server.resolvedUrls.local[0] + 'principal/student-monitoring');
  await page.getByRole('button', { name: 'View high learners', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'monitoring-mobile.png'), fullPage: true });
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS Principal summary shortcuts, keyboard access, scoped filters, pending records, and mobile navigation');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
