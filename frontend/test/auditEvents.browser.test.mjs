// Synthetic API responses only. No requests reach school databases.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-audit-events-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
const base = { occurredAt: '2026-11-12T06:00:00Z', actorName: 'Fixture Account', actorRole: 'System Administrator',
  impact: 'Medium', schoolYear: '2026-2027', entityType: 'Record', entityId: '164', metadata: {} };
const grade = { ...base, id: '1', module: 'Grading', eventType: 'GRADE_SHEET_SUBMITTED', eventLabel: 'Grade Sheet Submitted',
  summary: 'Submitted fixture grades', section: 'Banana', subject: 'English', term: 'T1',
  beforeData: { workflow_status: 'DRAFT', grades: [{ grade_id: 7524, learner_name: 'Alex Santos', initial_grade: '71.00', term_grade: '73.00' }, { grade_id: 7525, learner_name: 'Rae Santos', initial_grade: 81, term_grade: 83, remarks: 'Passed' }] },
  afterData: { workflow_status: 'SUBMITTED', grades: [{ grade_id: 7524, learner_name: 'Alex Santos', initial_grade: 55.7, term_grade: 67, remarks: 'Failed' }, { grade_id: 7525, learner_name: 'Rae Santos', initial_grade: 81, term_grade: 83, remarks: 'Passed' }] } };
const reconciliation = { ...base, id: '20', module: 'Grading', eventType: 'GRADE_SHEET_DATA_RECONCILED', eventLabel: 'Grade Sheet Data Reconciled',
  summary: 'Reconciled fixture grades', beforeData: { initial_grade: 71 }, afterData: { initial_grade: 55.7 } };
const attendance = { ...base, id: '2', module: 'Attendance', eventType: 'ATTENDANCE_RECORDED', eventLabel: 'Attendance Recorded',
  summary: 'Recorded fixture attendance', beforeData: null, afterData: null,
  actorName: 'Jamie Teacher', actorRole: 'Subject Teacher', actingAs: 'Teacher — Demo Section (English)',
  target: 'Demo Section', section: 'Demo Section', subject: 'English',
  metadata: { attendance_date: '2026-11-12', attendance_scope: 'SUBJECT', section_id: 1 } };
const account = { ...base, id: '3', module: 'Account Management', eventType: 'USER_ACCOUNT_UPDATED', eventLabel: 'User Account Updated',
  summary: 'Updated fixture account', before_data: '{"last_name":"Previous"}', after_data: '{"last_name":"Updated"}' };
const nested = { ...base, id: '4', module: 'Attendance', eventType: 'ATTENDANCE_RECORDED', eventLabel: 'Attendance Recorded',
  summary: 'Recorded fixture attendance details', afterData: { statuses: { P: 2, A: 0 }, students: [101, 102], includesFutureDates: false } };
const future = { ...base, id: '5', module: 'Future Module', eventType: 'FIXTURE', eventLabel: 'Fixture Event',
  summary: 'Future fixture module', afterData: { result: 'Saved' } };
const weights = { ...base, id: '6', module: 'WS Configuration', eventType: 'SUBJECT_WEIGHTS_UPDATED', eventLabel: 'Subject Weights Updated', summary: 'Updated fixture subject weights' };
const schedule = { ...base, id: '7', module: 'Grading Period', eventType: 'GRADING_PERIOD_TIMELINE_UPDATED', eventLabel: 'Grading Period Timeline Updated', summary: 'Updated fixture schedule' };
const reopening = { ...base, id: '8', module: 'Grading Period', eventType: 'GRADE_REOPEN_REQUEST_APPROVED', eventLabel: 'Grade Reopen Request Approved', summary: 'Approved fixture reopening' };
let events = [grade, reconciliation, attendance, weights, schedule, reopening];
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 92010, role: 'system_admin', first_name: 'Fixture', last_name: 'Admin' })));
  const writes = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value), headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (url.pathname === '/api/audit-logs') return json(events);
    if (url.pathname === '/api/audit-logs/summary') return json({ totalAccounts: 2, activeAccounts: 2, roles: { system_admin: 1 } });
    return json([]);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'system-admin/dashboard');
  await page.getByRole('heading', { name: 'Audit Events', exact: true }).waitFor();
  assert.equal(await page.getByRole('row', { name: 'View details for Reconciled fixture grades', exact: true }).count(), 0);
  await page.locator('.admin-dashboard-page').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await page.getByRole('button', { name: 'Filter by module: All modules', exact: true }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['All modules', 'Account Management', 'System', 'Class Record', 'Grade Reopening']);
  await page.getByRole('option', { name: 'Class Record', exact: true }).click();
  assert.equal(await page.locator('.audit-trail__table tbody tr').count(), 2);
  await page.getByRole('button', { name: /More Filters/ }).click();
  await page.getByRole('button', { name: 'Filter by event type: All event types' }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['All event types', 'Attendance Recorded', 'Grade Sheet Submitted']);
  await page.getByRole('option', { name: 'Grade Sheet Submitted', exact: true }).click();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await page.getByRole('button', { name: 'Filter by module: Class Record' }).click();
  await page.getByRole('option', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: /More Filters/ }).click();
  await page.getByRole('button', { name: 'Filter by event type: All event types' }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['All event types', 'Grading Period Timeline Updated', 'Subject Weights Updated']);
  await page.getByRole('option', { name: 'Subject Weights Updated', exact: true }).click();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await page.getByRole('button', { name: 'Filter by module: System' }).click();
  await page.getByRole('option', { name: 'Grade Reopening', exact: true }).click();
  assert.equal(await page.locator('.audit-trail__table tbody tr').count(), 1);
  await page.getByRole('button', { name: /More Filters/ }).click();
  await page.getByRole('button', { name: 'Filter by event type: All event types' }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['All event types', 'Grade Reopen Request Approved']);
  await page.getByRole('option', { name: 'Grade Reopen Request Approved', exact: true }).click();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await page.getByRole('button', { name: 'Filter by module: Grade Reopening' }).click();
  await page.getByRole('option', { name: 'All modules', exact: true }).click();
  await page.getByRole('button', { name: /More Filters/ }).click();
  await page.getByRole('button', { name: 'Filter by event type: Grade Reopen Request Approved' }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['All event types', 'Attendance Recorded', 'Grade Reopen Request Approved', 'Grade Sheet Submitted', 'Grading Period Timeline Updated', 'Subject Weights Updated']);
  await page.getByRole('option', { name: 'All event types', exact: true }).click();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await page.getByPlaceholder('Search user or activity').fill('No matching fixture');
  await page.getByText('No audit activity found', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('row', { name: 'View details for Submitted fixture grades', exact: true }).click();
  const drawer = page.locator('.audit-drawer[role="dialog"]');
  await page.getByRole('dialog', { name: 'Event Details', exact: true }).waitFor();
  await drawer.getByRole('heading', { name: 'Fixture Account', exact: true }).waitFor();
  assert.equal(await drawer.locator('.audit-drawer__header h2').innerText(), 'Event Details');
  assert.equal(await drawer.locator('.audit-drawer__header').getByText('Audit Event', { exact: true }).count(), 1);
  assert.equal(await drawer.locator('.audit-actor-role').innerText(), 'System Administrator');
  assert.equal(await drawer.locator('.audit-actor-role').evaluate(el => getComputedStyle(el).borderRadius), '999px');
  assert.equal(await drawer.locator('dt').getByText('Recorded module', { exact: true }).count(), 0);
  assert.equal(await drawer.locator('dt').getByText('Target:', { exact: true }).count(), 1);
  assert.equal(await drawer.locator('dt').getByText('Affected record', { exact: true }).count(), 1);
  assert(await drawer.getByRole('region', { name: 'Responsible user' }).getByRole('heading', { name: 'Fixture Account', exact: true }).isVisible());
  assert.equal(await drawer.locator('.audit-detail-grid').count(), 0);
  for (const label of ['What', 'When', 'Activity']) assert(await drawer.getByRole('heading', { name: label, exact: true }).isVisible());
  for (const detail of ['Grade Sheet Submitted', 'Banana', 'English', 'T1']) assert(await drawer.getByText(detail, { exact: true }).first().isVisible());
  await drawer.getByText('View submitted grades (2)', { exact: true }).click();
  await drawer.getByRole('heading', { name: 'Grades · Alex Santos · Grade record #7524', exact: true }).waitFor();
  assert(await drawer.getByRole('heading', { name: 'Grades · Rae Santos · Grade record #7525', exact: true }).isVisible(), 'unchanged saved grades are included in the submission');
  await drawer.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  const resize = drawer.getByRole('separator', { name: 'Resize audit details drawer' });
  const initialWidth = (await drawer.boundingBox()).width;
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 200, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  assert((await drawer.boundingBox()).width > initialWidth + 150, 'dragging left expands the drawer');
  await resize.focus();
  await page.keyboard.press('Home');
  assert(Math.abs((await drawer.boundingBox()).width - initialWidth) < 2, 'Home restores its default width');
  await page.keyboard.press('ArrowLeft');
  assert((await drawer.boundingBox()).width > initialWidth + 20, 'keyboard can widen the drawer');
  for (const label of ['Initial grade', 'Term grade', 'Remarks']) assert(await drawer.getByText(label, { exact: true }).first().isVisible());
  assert(!/[{}]/.test((await drawer.locator('.audit-change-groups').allInnerTexts()).join(' ')));
  assert(await drawer.getByText('67', { exact: true }).isVisible());
  await page.screenshot({ path: join(artifacts, 'grade-changes-desktop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.getByRole('row', { name: 'View details for Recorded fixture attendance', exact: true }).click();
  assert(Math.abs((await drawer.boundingBox()).width - initialWidth) < 2, 'closing and reopening resets the width');
  await drawer.getByRole('heading', { name: 'Jamie Teacher', exact: true }).waitFor();
  assert(await drawer.getByText('Acting as: Teacher — Demo Section (English)', { exact: true }).isVisible());
  for (const label of ['Section', 'Subject', 'Attendance scope', 'Section ID', 'Attendance date']) {
    assert(await drawer.locator('dt').getByText(label, { exact: true }).isVisible());
  }
  assert.equal(await drawer.getByRole('heading', { name: 'Who', exact: true }).count(), 0);
  await drawer.getByText('This event does not include before-and-after details.', { exact: true }).waitFor();
  await drawer.getByRole('button', { name: 'Close audit details' }).click();

  events = [grade, reconciliation, attendance, account, nested, future, weights, schedule, reopening];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('row', { name: 'View details for Updated fixture account', exact: true }).click();
  await drawer.getByText('Last name', { exact: true }).waitFor();
  assert(await drawer.getByText('Previous', { exact: true }).isVisible());
  assert(await drawer.getByText('Updated', { exact: true }).isVisible());
  await drawer.getByRole('button', { name: 'Close audit details' }).click();
  await page.getByRole('button', { name: 'Filter by module: All modules', exact: true }).click();
  await page.getByRole('option', { name: 'System', exact: true }).click();
  assert.equal(await page.locator('.audit-trail__table tbody tr').count(), 3);
  await page.getByRole('row', { name: 'View details for Future fixture module', exact: true }).click();
  assert(await drawer.getByText('Future Module', { exact: true }).isVisible());
  await drawer.getByRole('button', { name: 'Close audit details' }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('row', { name: 'View details for Recorded fixture attendance details', exact: true }).click();
  await drawer.getByRole('heading', { name: 'Recorded details', exact: true }).waitFor();
  assert.equal(await drawer.getByText('Before', { exact: true }).count(), 0);
  assert(await drawer.getByText('No', { exact: true }).isVisible());
  assert(!/[{}]/.test((await drawer.locator('.audit-change-groups').allInnerTexts()).join(' ')));
  await page.setViewportSize({ width: 390, height: 844 });
  await drawer.getByRole('heading', { name: 'Recorded details', exact: true }).scrollIntoViewIfNeeded();
  assert(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: join(artifacts, 'recorded-details-mobile.png'), animations: 'disabled' });
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  // A full class stays searchable and paged without dropping any submitted learner.
  await drawer.getByRole('button', { name: 'Close audit details' }).click();
  await page.setViewportSize({ width: 1366, height: 900 });
  const fortyGrades = Array.from({ length: 40 }, (_, index) => ({ grade_id: 8000 + index,
    learner_name: `Learner ${String(index + 1).padStart(2, '0')}`, initial_grade: 81, term_grade: 83, remarks: 'Passed' }));
  events = [{ ...grade, id: '401', summary: 'Submitted forty fixture grades', afterData: { ...grade.afterData, grades: fortyGrades } }];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('row', { name: 'View details for Submitted forty fixture grades', exact: true }).click();
  await drawer.getByText('View submitted grades (40)', { exact: true }).click();
  const submitted = drawer.locator('.audit-submitted-grades');
  const seen = [];
  for (let pageNumber = 0; pageNumber < 8; pageNumber++) {
    assert.equal(await submitted.locator('.audit-change-group').count(), 5);
    seen.push(...await submitted.locator('.audit-change-group h4').allTextContents());
    if (pageNumber < 7) await submitted.getByRole('button', { name: 'Next submitted grades', exact: true }).click();
  }
  assert.equal(seen.length, 40);
  assert.equal(new Set(seen).size, 40);
  assert(seen[39].includes('Learner 40'));
  assert(await submitted.getByRole('button', { name: 'Next submitted grades', exact: true }).isDisabled());
  await submitted.getByRole('searchbox', { name: 'Search submitted grades', exact: true }).fill('Learner 40');
  assert.equal(await submitted.locator('.audit-change-group').count(), 1);
  await submitted.getByText('1–1 of 1 records', { exact: true }).waitFor();
  await submitted.getByRole('searchbox', { name: 'Search submitted grades', exact: true }).fill('Nobody matches');
  await submitted.getByText('No matching records.', { exact: true }).waitFor();
  assert(await submitted.getByRole('button', { name: 'Previous submitted grades', exact: true }).isDisabled());
  await submitted.getByRole('searchbox', { name: 'Search submitted grades', exact: true }).fill('');
  await submitted.getByText('1–5 of 40 records', { exact: true }).waitFor();
  await submitted.screenshot({ path: join(artifacts, 'submitted-grades-compact.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('row', { name: 'View details for Submitted forty fixture grades', exact: true }).click();
  assert.equal(await drawer.locator('.audit-submitted-grades[open]').count(), 0, 'grade details close when the drawer is reopened');
  await drawer.getByText('View submitted grades (40)', { exact: true }).click();
  await drawer.getByText('1–5 of 40 records', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await drawer.locator('.audit-drawer__body').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  if (process.env.AUDIT_PREVIEW_EVENTS) {
    events = JSON.parse(readFileSync(process.env.AUDIT_PREVIEW_EVENTS, 'utf8'));
    const previewDir = process.env.AUDIT_PREVIEW_DIR || artifacts;
    mkdirSync(previewDir, { recursive: true });
    const files = [];
    await drawer.getByRole('button', { name: 'Close audit details' }).click();
    await page.setViewportSize({ width: 1366, height: 1500 });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    for (const [i, event] of events.entries()) {
      await page.getByRole('row', { name: `View details for ${event.summary}`, exact: true }).click();
      await drawer.locator('.audit-change-groups').first().waitFor();
      await drawer.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      assert(!/[{}]/.test((await drawer.locator('.audit-change-groups').allInnerTexts()).join(' ')));
      assert(!/Score key|Weight key|Assignment key/.test(await drawer.innerText()));
      if (event.module === 'Attendance') {
        assert(await drawer.getByText('Subject Teacher', { exact: true }).isVisible());
        assert(await drawer.getByText('Absent', { exact: true }).isVisible());
        assert(await drawer.getByText('Present', { exact: true }).isVisible());
      }
      if (event.module === 'WS Configuration') assert(await drawer.getByText('40%', { exact: true }).first().isVisible());
      const name = `${i + 1}-${event.module.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
      const bounds = await drawer.boundingBox();
      const contentHeight = await drawer.evaluate(el => el.querySelector('.audit-drawer__body').lastElementChild.getBoundingClientRect().bottom - el.getBoundingClientRect().top + 36);
      await page.screenshot({ path: join(previewDir, name), animations: 'disabled', clip: {
        x: bounds.x, y: bounds.y, width: bounds.width, height: Math.min(contentHeight, bounds.height) } });
      files.push({ name, title: event.module, summary: event.summary });
      await drawer.getByRole('button', { name: 'Close audit details' }).click();
    }
    const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
    writeFileSync(join(previewDir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AURALIS audit event previews</title><style>body{margin:0;padding:32px;font:15px system-ui;background:#f5f7fa;color:#17376d}h1{font-size:26px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;align-items:start}article{background:white;border:1px solid #e5ebf3;border-radius:14px;overflow:hidden}h2,p{padding:0 20px}img{width:100%;display:block}a{color:inherit}</style><h1>AURALIS — detailed audit events</h1><p>Illustrative events captured through the audit writer using isolated test records. These examples were not added to school audit history.</p><main>${files.map(file => `<article><h2>${escape(file.title)}</h2><p>${escape(file.summary)}</p><a href="${file.name}"><img src="${file.name}" alt="${escape(file.title)} event drawer"></a></article>`).join('')}</main></html>`);
    console.log('Preview gallery: ' + join(previewDir, 'index.html'));
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  }
  console.log('PASS deployed module filtering, refresh, grouped grades, account changes, historical missing details, nested records, mobile and keyboard close');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
