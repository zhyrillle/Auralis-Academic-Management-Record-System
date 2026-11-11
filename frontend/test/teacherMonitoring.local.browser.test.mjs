// Explicit local-only smoke check. Only the real Section Details GET reaches the API.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSectionDetailsView, getSectionGrade, getSectionRisk } from '../src/utils/sectionDetailsPresentation.js';
import { TEACHER_RISK_VIEW_VERSION } from '../src/services/riskInputPolicy.js';

assert.equal(process.env.AURALIS_LOCAL_MONITORING_CHECK, '1', 'Explicit local-only opt-in required');
const require = createRequire(import.meta.url);
const db = require('../../backend/config/db.js');
assert.ok(['127.0.0.1', 'localhost', '::1'].includes(db.pool.config.connectionConfig.host));
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH));
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-teacher-live-'));
const api = 'http://localhost:5000/api', frontend = 'http://localhost:5173';
let browser;
try {
  const [assignments] = await db.execute(`SELECT ta.teacher_assignment_id AS assignmentId, ta.user_id AS userId,
    so.section_id AS sectionId, s.subject_code AS code, sec.section_name AS sectionName
    FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
    JOIN SUBJECT s ON s.subject_id = so.subject_id JOIN SECTION sec ON sec.section_id = so.section_id
    JOIN USER u ON u.user_id = ta.user_id
    WHERE LOWER(u.account_status) = 'active' AND UPPER(s.subject_code) IN ('ENG', 'MATH')
      AND EXISTS (SELECT 1 FROM STUDENT_SECTION ss WHERE ss.section_id = so.section_id AND ss.school_year_id = so.school_year_id)
    ORDER BY so.school_year_id DESC, ta.teacher_assignment_id`);
  const cases = [assignments.find(row => row.code === 'ENG' && row.sectionName === 'Banana'), assignments.find(row => row.code === 'MATH')];
  assert.ok(cases.every(Boolean), 'Local Banana English and Mathematics assignments required');
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  for (const assignment of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const reads = [], writes = [], errors = [];
    await context.addInitScript(userId => localStorage.setItem('user', JSON.stringify({ user_id: userId,
      role: 'subject_teacher', is_adviser: true, first_name: 'Local', last_name: 'Review' })), assignment.userId);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (![frontend, 'http://localhost:5000'].includes(url.origin)) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (request.method() === 'OPTIONS') return route.continue();
        if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
        if (url.pathname.startsWith('/api/section-details/')) { reads.push(url.href); return route.continue(); }
        return route.fulfill({ contentType: 'application/json', body: '[]', headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return url.origin === frontend ? route.continue() : route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    const initial = page.waitForResponse(response => response.url().startsWith(api + '/section-details/'));
    await page.goto(`${frontend}/adviser/sections/details?assignmentType=teaching&assignmentId=${assignment.assignmentId}&sectionId=${assignment.sectionId}`);
    const initialResponse = await initial;
    assert.equal(initialResponse.status(), 200);
    const data = await initialResponse.json();
    assert.equal(isSectionDetailsView(data, { assignmentType: 'teaching', assignmentId: assignment.assignmentId,
      term: 'T1', riskMode: 'monitoring' }), true);
    assert.equal(data.viewVersion, TEACHER_RISK_VIEW_VERSION, 'Running backend contract matches the running frontend');
    await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).waitFor();
    for (const learner of data.learners) {
      const row = page.locator('.section-data-table tbody tr').filter({ hasText: learner.name });
      const grade = getSectionGrade(learner, 'monitoring');
      assert.equal(await row.locator('td').nth(3).textContent(), Number.isFinite(grade) ? String(grade) : '—');
      assert.equal(await row.locator('.badge-rect').textContent(), getSectionRisk(learner, 'monitoring').label);
    }
    assert.equal(await page.locator('.section-status-detail').count(), 0);
    if (assignment.code === 'ENG') {
      const toggle = page.getByRole('switch', { name: 'Predict', exact: true });
      assert.equal(await toggle.isEnabled(), data.capabilities.predictionReady);
      if (data.capabilities.predictionReady) {
        const predicted = page.waitForResponse(response => response.url().includes('riskMode=prediction'));
        await toggle.click();
        const predictionResponse = await predicted;
        assert.equal(predictionResponse.status(), 200);
        const prediction = await predictionResponse.json();
        assert.equal(isSectionDetailsView(prediction, { assignmentType: 'teaching', assignmentId: assignment.assignmentId,
          term: 'T1', riskMode: 'prediction' }), true);
        await page.getByRole('columnheader', { name: /English.*Term 2/ }).waitFor();
        for (const learner of prediction.learners) {
          const row = page.locator('.section-data-table tbody tr').filter({ hasText: learner.name });
          assert.equal(await row.locator('td').nth(3).textContent(), Number.isFinite(learner.termGrade) ? String(learner.termGrade) : '—');
        }
        await toggle.click();
        await page.getByRole('columnheader', { name: 'At-risk Status', exact: true }).waitFor();
      }
      const nextTerm = page.waitForResponse(response => response.url().includes('/section-details/') && response.url().includes('term=T2'));
      await page.getByRole('button', { name: 'T2', exact: true }).click();
      const term2 = await (await nextTerm).json();
      await page.getByRole('columnheader', { name: 'Term 2 Grade', exact: true }).waitFor();
      assert.equal(term2.capabilities.predictionUnavailableLabel, 'Ongoing term');
      assert(await toggle.isDisabled());
      await page.locator('.section-predict-help').hover();
      await page.getByRole('tooltip').waitFor();
      assert(await page.getByRole('tooltip').getByText('Ongoing term', { exact: true }).isVisible());
      await page.screenshot({ path: join(artifacts, 'ENG-predict-unavailable.png'), fullPage: true, animations: 'disabled' });
      await page.mouse.move(0, 0);
    } else assert.equal(await page.getByRole('switch', { name: 'Predict', exact: true }).count(), 0);
    await page.screenshot({ path: join(artifacts, `${assignment.code}-monitoring.png`), fullPage: true, animations: 'disabled' });
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    console.log(`PASS running local ${assignment.code} page: ${data.learners.length} coherent risk/grade rows; ${reads.length} real Section Details reads.`);
    await context.close();
  }
  console.log('Local screenshots: ' + artifacts);
} finally {
  await browser?.close(); await db.end(); if (db.cloudPool) await db.cloudPool.end();
}
