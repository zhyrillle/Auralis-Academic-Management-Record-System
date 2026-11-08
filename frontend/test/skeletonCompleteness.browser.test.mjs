// Exercise complete loading regions against fixture responses; block all writes.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-skeleton-completeness-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0, open: false } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const options = { defaultSchoolYearId: 3, gradeSheets: [{ grade_sheet_id: 91, section_id: 18, subject_id: 1,
  term_id: 1, school_year_id: 3, section_name: 'Fixture', subject_name: 'English', grade_level_name: 'G8',
  school_year_starts_on: 2026, school_year_ends_on: 2027, term_name: '1st', eligible: true }] };
const request = id => ({ request_id: id, grade_sheet_id: 91, status: 'PENDING', subject_name: 'English',
  section_name: 'Fixture', term_name: '1st', requested_at: '2026-11-06T08:00:00Z', reason: 'Fixture history' });
let browser;
const writes = [], errors = [];
async function open(role, path, handler) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(role => localStorage.setItem('user', JSON.stringify({ user_id: 92015, role, first_name: 'Fixture', last_name: 'User' })), role);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (!url.pathname.startsWith('/api/')) return url.href.startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (req.method() === 'OPTIONS') return json({});
    if (req.method() !== 'GET') { writes.push(url.pathname); return route.abort(); }
    if (await handler(url.pathname, json)) return;
    return json(url.pathname.includes('notifications') ? { notifications: { today: [], yesterday: [] } } : []);
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + path);
  return { page, context };
}
const navigate = (page, path) => page.evaluate(path => {
  history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate'));
}, path);
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  let optionGate = deferred(), historyGate = deferred(), started = deferred(), fail = false, history = [request(1)];
  const handleRequest = async (path, json) => {
    if (path === '/api/grading-periods/grade-sheets/reopening-options') {
      started.resolve(); await optionGate.promise;
      await json(fail ? { error: 'Fixture reopening failure' } : options, fail ? 503 : 200); return true;
    }
    if (path === '/api/reopen-requests/user/92015') { await historyGate.promise; await json(history); return true; }
    return false;
  };
  let { page, context } = await open('adviser', 'adviser/request', handleRequest);
  await page.getByRole('status', { name: 'Loading request history', exact: true }).waitFor();
  assert.equal(await page.locator('.grr-stat-value').count(), 0);
  optionGate.resolve();
  await page.getByRole('status', { name: 'Loading request form', exact: true }).waitFor();
  assert.equal(await page.getByText('No reopen requests submitted yet.', { exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'request-loading.png'), fullPage: true });
  historyGate.resolve();
  await page.waitForFunction(() => document.querySelector('.grr-stat-value')?.textContent === '1');
  const textarea = page.getByPlaceholder('Type your explanation here...');
  await textarea.fill('Keep this explanation');
  await page.locator('#reopening-section').click();
  await page.getByRole('option', { name: 'G8 Fixture', exact: true }).click();
  await page.locator('#reopening-subject').click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.locator('#reopening-term').click();
  await page.getByRole('option', { name: '1st Term', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Submit Request', exact: true }).isEnabled(), true, 'selection and form eligibility still work');
  await page.clock.install();
  await page.clock.fastForward(3000);
  await navigate(page, '/adviser/sections');
  await page.getByRole('heading', { name: 'Assigned Classes', exact: true }).waitFor();
  optionGate = deferred(); historyGate = deferred(); started = deferred();
  await navigate(page, '/adviser/request');
  await started.promise;
  assert.equal(await page.locator('.grr-container .app-skeleton-block').count(), 0, 'usable cached data renders immediately');
  await textarea.fill('Preserve during background updates');
  history = [request(1), request(2)]; optionGate.resolve(); historyGate.resolve();
  await page.waitForFunction(() => document.querySelector('.grr-stat-value')?.textContent === '2');
  assert.equal(await textarea.inputValue(), 'Preserve during background updates');
  await navigate(page, '/adviser/request?gradeSheetId=91');
  await page.waitForFunction(() => document.querySelector('#reopening-term')?.textContent.includes('1st Term'));
  assert.match(await page.locator('#reopening-section').innerText(), /G8 Fixture/);
  await navigate(page, '/adviser/request?gradeSheetId=999');
  await page.getByText('Linked grade sheet unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Submit Request', exact: true }).isEnabled(), false);
  await context.close();

  // A failed initial read must not masquerade as an empty request history.
  fail = true; history = []; optionGate = deferred(); historyGate = deferred();
  ({ page, context } = await open('adviser', 'adviser/request', handleRequest));
  optionGate.resolve(); historyGate.resolve();
  await page.getByRole('heading', { name: 'Unable to load reopening requests', exact: true }).waitFor();
  assert.equal(await page.locator('.grr-stat-value, .grr-container .app-skeleton-block').count(), 0);
  fail = false; optionGate = deferred(); historyGate = deferred();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('status', { name: 'Loading request summary', exact: true }).waitFor();
  optionGate.resolve(); historyGate.resolve();
  await page.getByText('No reopen requests submitted yet.', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.grr-stat-value').allTextContents(), ['0', '0', '0', '0']);
  await context.close();

  // Context can finish before the Department Head's actual section directory.
  const directoryGate = deferred();
  ({ page, context } = await open('department_head', 'department-head/class-records', async (path, json) => {
    if (path.endsWith('/monitoring/context')) { await json({ department: { name: 'English' }, subject: { name: 'English' },
      schoolYears: [{ id: 3, label: '2026-2027', isCurrent: true }], gradeLevels: [], canViewPhilIri: true }); return true; }
    if (path.endsWith('/monitoring/sections')) { await directoryGate.promise; await json({ sections: [] }); return true; }
    return false;
  }));
  await page.getByRole('status', { name: 'Loading section count', exact: true }).waitFor();
  assert.equal((await page.getByLabel('Section count', { exact: true }).innerText()).trim(), '');
  directoryGate.resolve();
  await page.getByText('No sections found', { exact: true }).waitFor();
  assert.match(await page.getByLabel('Section count', { exact: true }).innerText(), /0\s+sections/);
  await context.close();

  let settingsFail = true;
  const settingsGate = deferred();
  ({ page, context } = await open('system_admin', 'system-admin/grade-transmutation', async (path, json) => {
    if (path === '/api/grade-transmutation') {
      if (!settingsFail) await settingsGate.promise;
      await json(settingsFail ? { error: 'Fixture settings failure' } : { is_custom_enabled: true,
        ranges: [{ id: 'fixture', min: 0, max: 100, transmuted: 75 }] }, settingsFail ? 503 : 200);
      return true;
    }
    return false;
  }));
  await page.getByRole('heading', { name: 'Transmutation settings are unavailable', exact: true }).waitFor();
  assert.equal(await page.getByText('OFF', { exact: true }).count(), 0);
  settingsFail = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('status', { name: 'Loading transmutation settings', exact: true }).waitFor();
  settingsGate.resolve();
  await page.getByRole('switch', { name: 'Custom Transmutation', exact: true }).waitFor();
  assert.equal(await page.getByRole('switch', { name: 'Custom Transmutation', exact: true }).getAttribute('aria-checked'), 'true');
  await context.close();

  // Notification failures show retry, rather than a successful empty state.
  for (const [role, route] of [['adviser', 'adviser'], ['subject_teacher', 'teacher'], ['department_head', 'department-head']]) {
    let failing = true;
    ({ page, context } = await open(role, route + '/notifications', async (path, json) => {
      if (/\/notifications\/(adviser|department-head)$/.test(path)) {
        await json(failing ? { error: 'Fixture notification failure' } : { notifications: { today: [], yesterday: [] } }, failing ? 503 : 200); return true;
      }
      return false;
    }));
    await page.locator('.notifications-load-error').waitFor();
    assert.equal(await page.getByText('No notifications available.', { exact: true }).count(), 0);
    failing = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('No notifications available.', { exact: true }).waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log('PASS complete request loading, valid form selection, cached revisit, quiet changed-data refresh, preserved input, failure/retry/empty states, department counts and role notifications');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
