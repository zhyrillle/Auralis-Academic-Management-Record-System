// Real IndexedDB regression tests in an isolated browser profile. No school DB/API is contacted.
// Requires Playwright (or PLAYWRIGHT_MODULE_PATH pointing to its index.mjs) and Chromium/Edge.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false },
  plugins: [{ name: 'isolated-cache-test-page',
    resolveId(id) { if (id === '/__academic_mount__.js') return id; },
    load(id) {
      if (id === '/__academic_mount__.js') return `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import AcademicPeriod from '/src/pages/system-admin/AcademicPeriod.jsx';
        export function mount(user) {
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(AcademicPeriod, { user }));
          return root;
        }
      `;
    },
    configureServer(server) {
    server.middlewares.use('/__cache_test__', async (_request, response, next) => {
      try {
        const html = await server.transformIndexHtml('/__cache_test__',
          '<!doctype html><html><head><title>Cache tests</title></head><body><div id="root"></div></body></html>');
        response.setHeader('Content-Type', 'text/html');
        response.end(html);
      } catch (error) { next(error); }
    });
  } }] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  // Fail closed: test modules can load locally, but tests cannot reach any real backend.
  await context.route('**/*', route => route.request().url().startsWith(server.resolvedUrls.local[0])
    ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + '__cache_test__');
  const results = await page.evaluate(async () => {
    const { db } = await import('/src/offline/db.js');
    const sync = await import('/src/offline/syncManager.js');
    const nav = await import('/src/services/navigationCache.js');
    const auth = await import('/src/utils/auth.js');
    const scoresApi = await import('/src/services/classRecordApi.js');
    const passed = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const test = async (name, run) => { await run(); passed.push(name); };
    const originalFetch = window.fetch;
    const accountA = { user_id: 101, role: 'teacher' };
    const accountB = { user_id: 202, role: 'teacher' };
    const signIn = async account => { auth.setStoredUser(account); await sync.resetOfflineSession(); };
    const clearEdits = () => db.transaction('rw', db.outbox, db.offlineScores, async () => {
      await db.outbox.clear(); await db.offlineScores.clear();
    });
    const scorePayload = raw_score => ({ subject_offering_id: 1, term: 'T1',
      scores: [{ student_id: 11, student_section_id: 12, assessment_id: 13, raw_score }], apiUrl: '/fake/scores/batch' });
    const success = () => new Response('{"success":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });

    await test('v2 migration preserves ownerless edits for review and clears only old cached reads', async () => {
      const legacy = new db.constructor('AuralisOfflineDB');
      legacy.version(2).stores({ cache: 'key, updatedAt, expiresAt', outbox: '++id, endpoint, method, timestamp, status',
        syncMeta: 'key', offlineScores: '++id, [subject_offering_id+term], student_id, assessment_id, timestamp, status' });
      await legacy.cache.put({ key: 'legacy-cache', data: 'private' });
      await legacy.outbox.add({ url: '/legacy', status: 'pending' });
      await legacy.offlineScores.add({ subject_offering_id: 1, term: 'T1', raw_score: 7, status: 'pending' });
      legacy.close();
      await db.open();
      check(await db.cache.count() === 0, 'legacy cache retained');
      check((await db.outbox.toArray())[0].status === 'requires-review', 'legacy edit not quarantined');
      check(await db.offlineScores.count() === 1, 'legacy score deleted');
      await signIn(accountA);
      let calls = 0; window.fetch = async () => { calls++; return success(); };
      await sync.processOutbox();
      check(calls === 0 && (await sync.getPendingOfflineScores(1, 'T1')).length === 0, 'unowned work was adopted');
      await clearEdits();
    });

    await test('logout clears both page caches but preserves only the original account’s offline edits', async () => {
      await nav.loadCached('learners', async () => ['A-only']);
      await sync.saveOfflineScores(scorePayload(8));
      const scope = sync.getSessionScope();
      localStorage.setItem('harmless-preference', 'compact');
      await auth.removeStoredUser();
      check(nav.getCachedData('learners') === undefined && await db.cache.count() === 0, 'logout left cached reads');
      check(await db.outbox.count() === 1 && await db.offlineScores.count() === 1, 'logout lost unsent work');
      check(localStorage.getItem('harmless-preference') === 'compact', 'logout erased preferences');
      await signIn(accountB);
      check(await sync.getPersistentCache('learners') === undefined, 'account B read A cache');
      check((await sync.getPendingOfflineScores(1, 'T1')).length === 0, 'account B read A draft');
      let calls = 0; window.fetch = async () => { calls++; return success(); };
      await sync.processOutbox();
      check(calls === 0, 'account B sent A work');
      await sync.setPersistentCache('late', 'old-response', undefined, scope);
      check(await db.cache.count() === 0, 'late response recreated old cache');
      await signIn(accountA);
      check((await sync.getPendingOfflineScores(1, 'T1'))[0].raw_score === 8, 'original owner cannot recover work');
      await sync.processOutbox();
      check(calls === 1 && await db.outbox.count() === 0 && await db.offlineScores.count() === 0, 'owner sync failed');
    });

    await test('expired persistent data is deleted instead of silently renewed', async () => {
      await sync.setPersistentCache('expired', ['old'], -1);
      check(await sync.getPersistentCache('expired') === undefined, 'expired data returned');
      check(await db.cache.count() === 0, 'expired data retained');
    });

    await test('session identifiers also work on HTTP LAN browsers without randomUUID', async () => {
      const original = crypto.randomUUID;
      crypto.randomUUID = undefined;
      try {
        await sync.resetOfflineSession();
        check(Boolean(sync.getSessionScope().sessionId), 'session identifier missing');
      } finally { crypto.randomUUID = original; }
    });

    await test('persistent hydration publishes the fresh response and clears the pending request', async () => {
      await sync.setPersistentCache('hydrate', ['disk']);
      const values = [];
      const unsubscribe = nav.subscribeNavigationCache(() => values.push(nav.getCachedData('hydrate')?.[0]));
      await nav.loadCached('hydrate', async () => ['fresh']);
      unsubscribe();
      check(values.includes('disk') && values.includes('fresh'), 'hydration or refresh not published');
      check(nav.getNavigationSnapshot('hydrate').pending === null, 'request stuck pending');
      check((await sync.getPersistentCache('hydrate'))[0] === 'fresh', 'disk cache not updated');
    });

    await test('network failures use cached data, but HTTP rejection does not', async () => {
      await nav.loadCached('offline', async () => ['available']);
      const data = await nav.loadCached('offline', async () => { throw new TypeError('Failed to fetch'); }, { force: true });
      check(data[0] === 'available', 'offline fallback failed');
      let rejected = false;
      window.fetch = async () => new Response('{}', { status: 403 });
      try { await nav.loadCached('offline', () => nav.apiFetch('/denied'), { force: true }); }
      catch (error) { rejected = error.status === 403; }
      check(rejected && nav.getCachedData('offline') === undefined, '403 was hidden by fallback');
      check(await sync.getPersistentCache('offline') === undefined, '403 left an offline copy accessible');
    });

    await test('save invalidation prevents a stale in-flight read from repopulating disk or memory', async () => {
      let finish, started, calls = 0;
      const ready = new Promise(resolve => { started = resolve; });
      const pending = nav.loadCached('racing', () => ++calls === 1
        ? new Promise(resolve => { finish = resolve; started(); }) : Promise.resolve('new'));
      await ready;
      await nav.clearNavigationCache();
      finish('old');
      check(await pending === 'new' && await sync.getPersistentCache('racing') === 'new', 'stale read won race');
    });

    await test('an account change during a failed save never queues the former account’s request for the new account', async () => {
      let fail;
      window.fetch = () => new Promise((_resolve, reject) => { fail = reject; });
      const saving = nav.apiFetch('/fake/save', { method: 'POST', body: '{}' }).catch(error => error);
      await signIn(accountB);
      fail(new TypeError('Failed to fetch'));
      check((await saving).code === 'SESSION_CHANGED' && await db.outbox.count() === 0, 'late save queued to wrong account');
      check((await saving).name === 'AbortError', 'obsolete request was not a cancellation');
      await signIn(accountA);
    });

    await test('a failed local write is an error, never a false saved-success response', async () => {
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      const originalAdd = db.outbox.add;
      db.outbox.add = async () => { throw new Error('Quota exceeded'); };
      let rejected = false;
      try { await nav.apiFetch('/fake/save', { method: 'POST', body: '{}' }); } catch { rejected = true; }
      finally { db.outbox.add = originalAdd; }
      check(rejected && await db.outbox.count() === 0, 'storage failure reported as success');
    });

    await test('score overlay and outbox are atomic, even when connectivity drops during a save', async () => {
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      const saved = await scoresApi.saveScoresBatch(scorePayload(9));
      check(saved.offline && await db.outbox.count() === 1, 'score was not queued exactly once');
      check((await sync.getPendingOfflineScores(1, 'T1'))[0].raw_score === 9, 'offline score overlay missing');
      await clearEdits();
      window.fetch = async () => new Response('{"error":"Locked"}', { status: 409 });
      let rejected = false;
      try { await scoresApi.saveScoresBatch(scorePayload(10)); } catch (error) { rejected = error.status === 409; }
      check(rejected && await db.outbox.count() === 0, 'rejected score was queued as offline success');
    });

    await test('queued headers preserve one content type and partial score-storage failures roll back', async () => {
      await sync.enqueueMutation({ url: '/headers', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      check(new Headers((await db.outbox.toArray())[0].headers).get('content-type') === 'application/json', 'duplicated content-type');
      await clearEdits();
      const originalAdd = db.offlineScores.add;
      db.offlineScores.add = async () => { throw new Error('Disk full'); };
      let rejected = false;
      try { await sync.saveOfflineScores(scorePayload(10)); } catch { rejected = true; }
      finally { db.offlineScores.add = originalAdd; }
      check(rejected && await db.outbox.count() === 0 && await db.offlineScores.count() === 0, 'partial offline save committed');
    });

    await test('old queued score drafts replay with exactly one matching owner header', async () => {
      await sync.saveOfflineScores(scorePayload(10));
      const queued = (await db.outbox.toArray())[0];
      await db.outbox.update(queued.id, { headers: { 'content-type': 'application/json', 'x-auralis-user-id': 'outdated' } });
      let owner;
      window.fetch = async (_url, options) => { owner = new Headers(options.headers).get('x-auralis-user-id'); return success(); };
      await sync.processOutbox();
      check(owner === String(accountA.user_id), 'owner header duplicated, missing, or copied from another account');
      check(await db.offlineScores.count() === 0, 'confirmed original-owner draft did not sync');
    });

    await test('HTTP 409 retains the rejected edit and its overlay, and stops later writes', async () => {
      await sync.saveOfflineScores(scorePayload(10));
      await sync.enqueueMutation({ url: '/later', body: '{}' });
      let calls = 0;
      window.fetch = async () => { calls++; return new Response('Grade sheet locked', { status: 409 }); };
      await sync.processOutbox();
      check(await db.outbox.count() === 2 && await db.offlineScores.count() === 1, 'rejection discarded work');
      check((await sync.getSyncSnapshot()).failedCount === 1 && calls === 1, 'rejection not reported');
      await sync.processOutbox();
      check(calls === 1, 'later edit bypassed unresolved rejection');
      await clearEdits();
    });

    await test('syncing an old score never deletes a newer pending edit to that cell', async () => {
      await sync.saveOfflineScores(scorePayload(10));
      let finish, started;
      const ready = new Promise(resolve => { started = resolve; });
      window.fetch = () => new Promise(resolve => { finish = resolve; started(); });
      const sending = sync.processOutbox();
      await ready;
      await sync.saveOfflineScores(scorePayload(12));
      finish(success());
      await sending;
      check(await db.outbox.count() === 1, 'newer mutation removed');
      check((await sync.getPendingOfflineScores(1, 'T1'))[0].raw_score === 12, 'newer overlay removed');
      await clearEdits();
    });

    await test('logout aborts an active sync and preserves its unconfirmed work', async () => {
      await sync.enqueueMutation({ url: '/slow', body: '{}' });
      let started;
      const ready = new Promise(resolve => { started = resolve; });
      window.fetch = (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        started();
      });
      const sending = sync.processOutbox();
      await ready;
      await auth.removeStoredUser();
      await sending;
      check(await db.outbox.count() === 1, 'unconfirmed work deleted');
      await signIn(accountA);
      await clearEdits();
    });

    await test('logout saves registered in-memory drafts first and stays signed in if that fails', async () => {
      let unregister = sync.registerLogoutDraftSaver(() => sync.saveOfflineScores(scorePayload(14)));
      await auth.removeStoredUser();
      unregister();
      check(await db.outbox.count() === 1 && !auth.getStoredUser(), 'logout lost in-memory draft');
      await signIn(accountA);
      unregister = sync.registerLogoutDraftSaver(() => { throw new Error('Disk full'); });
      let rejected = false;
      try { await auth.removeStoredUser(); } catch { rejected = true; }
      unregister();
      check(rejected && auth.getStoredUser().user_id === accountA.user_id, 'logout proceeded after draft loss');
      await clearEdits();
    });

    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

    await test('JSON page reads reuse data, preserve filters and give each caller an independent response', async () => {
      await nav.clearNavigationCache();
      let calls = 0;
      window.fetch = async () => json({ version: ++calls });
      const [first, second] = await Promise.all([
        nav.cachedApiFetch('/page?term=T1&year=1'), nav.cachedApiFetch('/page?year=1&term=T1'),
      ]);
      check((await first.json()).version === 1 && (await second.json()).version === 1 && calls === 1, 'shared read failed');
      await nav.cachedApiFetch('/page?term=T2&year=1');
      await nav.cachedApiFetch('/page?term=T1&year=2');
      check(calls === 3, 'term or school year mixed');
    });

    await test('explicit page refresh also refreshes its underlying cached HTTP reads', async () => {
      await nav.clearNavigationCache();
      let calls = 0;
      window.fetch = async () => json({ version: ++calls });
      const load = async () => (await nav.cachedApiFetch('/refresh')).json();
      await nav.loadCached('refresh-page', load);
      await nav.loadCached('refresh-page', load);
      check(calls === 1, 'revisit fetched again');
      check((await nav.loadCached('refresh-page', load, { force: true })).version === 2, 'refresh reused stale HTTP response');
    });

    await test('successful writes refresh page records and rejected writes do not masquerade as saved', async () => {
      await nav.clearNavigationCache();
      let reads = 0;
      window.fetch = async (_url, options) => options.method === 'PUT' ? success() : json({ version: ++reads });
      await nav.cachedApiFetch('/editable');
      await nav.cachedApiFetch('/editable', { method: 'PUT', body: '{}' });
      check((await (await nav.cachedApiFetch('/editable')).json()).version === 2, 'save did not invalidate read');
      window.fetch = async () => new Response('Locked', { status: 409 });
      check((await nav.cachedApiFetch('/editable', { method: 'PUT', body: '{}' })).status === 409, 'rejection hidden');
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      let rejected = false;
      try { await nav.cachedApiFetch('/native-write', { method: 'POST', body: '{}', queueOffline: false }); } catch { rejected = true; }
      check(rejected && await db.outbox.count() === 0, 'formerly online-only write started queueing offline');
    });

    await test('page reads use unexpired browser copies offline and reject expired copies', async () => {
      await nav.clearNavigationCache();
      window.fetch = async () => json({ marker: 'saved-copy' });
      await nav.cachedApiFetch('/offline-page');
      nav.clearNavigationCache({ persistent: false });
      window.fetch = async () => { throw new TypeError('Failed to fetch'); };
      check((await (await nav.cachedApiFetch('/offline-page')).json()).marker === 'saved-copy', 'offline copy not restored');
      await db.cache.filter(row => row.data?.body === '{"marker":"saved-copy"}').modify({ expiresAt: Date.now() - 1 });
      nav.clearNavigationCache({ persistent: false });
      let rejected = false;
      try { await nav.cachedApiFetch('/offline-page'); } catch { rejected = true; }
      check(rejected, 'expired data reused');
    });

    await test('HTTP errors and file downloads keep their original behavior and are never cached as page data', async () => {
      await nav.clearNavigationCache();
      let calls = 0;
      window.fetch = async () => { calls++; return new Response('Missing', { status: 404 }); };
      check((await nav.cachedApiFetch('/missing')).status === 404, '404 status changed');
      await nav.cachedApiFetch('/missing');
      check(calls === 2, 'HTTP rejection cached');
      window.fetch = async () => { calls++; return new Response(new Uint8Array([1, 2, 255]),
        { headers: { 'Content-Type': 'application/octet-stream' } }); };
      check(new Uint8Array(await (await nav.cachedApiFetch('/download')).arrayBuffer())[2] === 255, 'download corrupted');
      await nav.cachedApiFetch('/download');
      check(calls === 4, 'file download cached');
    });

    await test('one component cancelling a shared read does not cancel the other component', async () => {
      await nav.clearNavigationCache();
      let finish, started, nativeSignal, calls = 0;
      const ready = new Promise(resolve => { started = resolve; });
      window.fetch = (_url, options) => new Promise(resolve => {
        calls++; nativeSignal = options.signal; finish = resolve; started();
      });
      const controller = new AbortController();
      const first = nav.cachedApiFetch('/shared-read', { signal: controller.signal }).catch(error => error);
      const second = nav.cachedApiFetch('/shared-read');
      await ready;
      controller.abort();
      check((await first).name === 'AbortError' && !nativeSignal.aborted, 'shared network request was aborted');
      finish(json({ intact: true }));
      check((await (await second).json()).intact && calls === 1, 'other consumer lost its response');
    });

    await test('logout actually aborts a pending page request and keeps the cancellation out of page data', async () => {
      await nav.clearNavigationCache();
      let started, nativeSignal;
      const ready = new Promise(resolve => { started = resolve; });
      window.fetch = (_url, options) => new Promise((_resolve, reject) => {
        nativeSignal = options.signal;
        nativeSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        started();
      });
      const loading = nav.cachedApiFetch('/slow-page').catch(error => error);
      await ready;
      await auth.removeStoredUser();
      check(nativeSignal.aborted && (await loading).code === 'SESSION_CHANGED', 'logout did not abort page loading');
      await signIn(accountA);
    });

    await test('remaining role services reuse the same cache for repeat visits', async () => {
      const cases = [
        ['adviser dashboard', '/src/services/adviserDashboardService.js', 'getAdviserSummary', [101]],
        ['department dashboard', '/src/services/dashboardApi.js', 'getDashboardStats', [{ schoolYear: '2026', gradeLevel: '8', quarter: 'T1' }]],
        ['department records', '/src/services/deptHeadClassRecordApi.js', 'getDeptClassRecord', [{ sectionId: 1, schoolYearId: 1, userId: 101 }]],
        ['section catalog', '/src/services/sectionService.js', 'getAdviserSections', [101]],
        ['section learners', '/src/services/sectionDetailsService.js', 'getSectionDetails', [{ assignmentType: 'teaching', assignmentId: 1, term: 'T1', userId: 101 }]],
        ['class record', '/src/services/classRecordApi.js', 'getClassRecord', [1, 'T1', 1]],
        ['Master Sheet', '/src/services/masterSheetService.js', 'getMasterSheet', [1, 101]],
        ['SF9', '/src/services/studentSf9Service.js', 'getStudentSF9Details', [11, { schoolYearId: 1 }]],
        ['SF10', '/src/services/reportService.js', 'getStudentSF10Details', [11]],
        ['notifications', '/src/services/notificationApi.js', 'fetchDeptHeadNotifications', [101]],
        ['principal feedback', '/src/services/principalFeedbackService.js', 'getTeacherFeedbackSummary', ['2026-2027']],
        ['PHIL-IRI screening', '/src/services/philIriScreeningApi.js', 'getScreeningRecords', [1, 1]],
        ['PHIL-IRI Post-Test', '/src/services/philIriApi.js', 'getPhilIriRecords', [1, 'POST_TEST', 1, 1]],
        ['profile', '/src/services/userService.js', 'getUserProfile', [101]],
        ['transmutation settings', '/src/services/gradeTransmutationService.js', 'getGradeTransmutationConfig', []],
      ];
      for (const [name, modulePath, method, args] of cases) {
        await nav.clearNavigationCache();
        let calls = 0;
        window.fetch = async url => { calls++; return json(String(url).includes('/principal/feedback/summary') ? { recordsVersion: 2, totalResponses: 0, overallRating: 0, totalComments: 0, belowTargetCount: 0 }
          : String(url).includes('/sections/adviser/') || String(url).endsWith('/users') ? []
          : { tableReady: true, records: [], assignments: [], sections: [], subjects: [], notifications: { today: [], yesterday: [] } }); };
        const api = await import(modulePath);
        await api[method](...args);
        const firstCount = calls;
        check(firstCount > 0, name + ' did not request server data on first visit');
        await api[method](...args);
        check(calls === firstCount, name + ' fetched again on revisit');
      }
    });

    window.fetch = originalFetch;
    return passed;
  });
  results.forEach(name => console.log('PASS ' + name));
  assert.equal(results.length, 24);

  const otherTab = await page.context().newPage();
  await otherTab.goto(server.resolvedUrls.local[0] + '__cache_test__');
  await otherTab.evaluate(async () => {
    window.cacheTest = await import('/src/services/navigationCache.js');
    await window.cacheTest.loadCached('other-tab', async () => ['private']);
  });
  await page.evaluate(async () => {
    const auth = await import('/src/utils/auth.js');
    await auth.removeStoredUser();
  });
  await otherTab.waitForFunction(() => window.cacheTest.getCachedData('other-tab') === undefined);
  console.log('PASS logging out also clears cached reads in another open tab');

  // Mount the actual application and check recovery without a navigation/reload.
  const uiPage = await context.newPage();
  await uiPage.goto(server.resolvedUrls.local[0] + '__cache_test__');
  await uiPage.evaluate(async () => {
    const auth = await import('/src/utils/auth.js');
    auth.setStoredUser({ user_id: 301, role: 'system_admin', is_adviser: false, first_name: 'First', last_name: 'Admin' });
    history.replaceState({}, '', '/system-admin/dashboard');
    let held = false;
    window.fetch = async url => {
      const user = auth.getStoredUser();
      const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (String(url).endsWith('/audit-logs/summary')) {
        if (!held) {
          held = true;
          return new Promise(resolve => { window.finishOldSummary = () => resolve(json({ totalAccounts: 999 })); });
        }
        return json({ totalAccounts: user.user_id === 302 ? 21 : 7 });
      }
      if (String(url).includes('/profile')) return json(user);
      return json([]);
    };
    await import('/src/main.jsx');
  });
  await uiPage.waitForFunction(() => typeof window.finishOldSummary === 'function');
  await uiPage.evaluate(async () => {
    // Exercise recovery when a request is the first to notice the account change.
    localStorage.setItem('user', JSON.stringify({ user_id: 302, role: 'system_admin', is_adviser: false,
      first_name: 'Second', last_name: 'Admin' }));
    window.finishOldSummary();
  });
  await uiPage.getByText('Second Admin', { exact: true }).first().waitFor();
  await uiPage.getByText('21', { exact: true }).first().waitFor();
  const text = await uiPage.locator('body').innerText();
  assert(!text.includes('reopen this page') && !text.includes('Obsolete session request') && !text.includes('999'));
  assert(new URL(uiPage.url()).pathname === '/system-admin/dashboard');
  console.log('PASS the actual dashboard loads the current account automatically and hides cancelled old-session requests');

  await uiPage.evaluate(() => {
    history.pushState({ usr: null, key: 'shared-profile', idx: 1 }, '', '/profile');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await uiPage.locator('.profile-page').waitFor();
  await uiPage.evaluate(async () => {
    const auth = await import('/src/utils/auth.js');
    window.attendanceReads = 0;
    window.fetch = async url => {
      const path = new URL(String(url), location.origin).pathname;
      const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      if (path.includes('/attendance')) window.attendanceReads++;
      if (path.includes('/section-adviser-assignments/')) return json([{ adviser_assignment_id: 1, section_id: 1, user_id: 101, school_year_id: 1 }]);
      if (path.endsWith('/sections/1/students')) return json([{ student_section_id: 12, student_id: 11, first_name: 'Demo', last_name: 'Learner', sex: 'M' }]);
      if (path.endsWith('/sections/1')) return json({ section_id: 1, section_name: 'Cache Test Section', grade_level_name: 'Grade 8' });
      if (path.includes('/profile')) return json({ ...auth.getStoredUser(), email: 'demo@example.test' });
      return json([]);
    };
    window.visitAttendance = () => {
      history.pushState({ usr: { activeClass: { section_id: 1, section_name: 'Cache Test Section', school_year_id: 1 } },
        key: 'attendance-' + Date.now(), idx: 0 }, '', '/adviser/attendance');
      dispatchEvent(new PopStateEvent('popstate'));
    };
    auth.setStoredUser({ user_id: 101, role: 'adviser', is_adviser: true, first_name: 'Demo', last_name: 'Adviser' });
  });
  await uiPage.waitForFunction(() => document.body.innerText.includes('demo@example.test'));
  await uiPage.evaluate(() => window.visitAttendance());
  await uiPage.waitForFunction(() => document.body.innerText.includes('Learner'));
  const attendanceReads = await uiPage.evaluate(() => window.attendanceReads);
  assert(attendanceReads > 0);
  await uiPage.evaluate(() => {
    history.pushState({ usr: null, key: 'profile', idx: 1 }, '', '/profile');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await uiPage.waitForFunction(() => location.pathname === '/profile' && document.body.innerText.includes('demo@example.test'));
  await uiPage.evaluate(() => window.visitAttendance());
  await uiPage.waitForFunction(() => document.body.innerText.includes('Learner'));
  assert.equal(await uiPage.evaluate(() => window.attendanceReads), attendanceReads);
  console.log('PASS navigating from Attendance to Profile and back displays the learner without re-fetching attendance');

  // Exercise the actual Academic Period page across browser reloads, without a live API.
  const academicContext = await browser.newContext();
  await academicContext.route('**/*', route => route.request().url().startsWith(server.resolvedUrls.local[0])
    ? route.continue() : route.abort());
  const academicPage = await academicContext.newPage();
  const academicErrors = [];
  academicPage.on('pageerror', error => academicErrors.push(error.message));
  const mountAcademicPage = async ({ mode = 'hold' } = {}) => academicPage.evaluate(async ({ mode }) => {
    const auth = await import('/src/utils/auth.js');
    const nav = await import('/src/services/navigationCache.js');
    const sync = await import('/src/offline/syncManager.js');
    const { db } = await import('/src/offline/db.js');
    const { mount } = await import('/__academic_mount__.js');
    const user = { user_id: 401, role: 'system_admin' };
    if (!auth.getStoredUser()) auth.setStoredUser(user);
    const json = (body, status = 200) => new Response(JSON.stringify(body),
      { status, headers: { 'Content-Type': 'application/json' } });
    window.academicTest = { mode, reads: 0, writes: [], held: [], nav, sync, db };
    const state = window.academicTest;
    state.payload = (yearId = '1', deadlineDay = 12) => {
      const year = yearId === '2' ? 2025 : 2026;
      return {
        schoolYears: [
          { school_year_id: 1, starts_on: 2026, ends_on: 2027, status: 'active' },
          { school_year_id: 2, starts_on: 2025, ends_on: 2026, status: 'closed' },
        ],
        selectedSchoolYearId: yearId,
        terms: [1, 2, 3].map(number => ({
          term_id: Number(yearId) * 10 + number, school_year_id: yearId, term_name: `Term ${number}`,
          starts_at: `${year}-10-01T00:00:00Z`, ends_at: `${year}-11-10T00:00:00Z`,
          grade_submission_deadline_at: `${year}-11-${deadlineDay}T15:59:00Z`,
          computed_status: yearId === '2' ? 'finalized' : 'open', total_grade_sheets: 1,
        })),
        departmentsByTerm: {}, subjectsByTerm: {}, gradeSheetRecordsByTerm: {},
        reopeningRequests: [], activeReopenings: [],
      };
    };
    window.fetch = async (url, options = {}) => {
      const parsed = new URL(String(url), location.origin);
      if (options.method === 'PATCH') {
        const payload = JSON.parse(options.body);
        state.writes.push({ url: parsed.pathname, payload });
        state.savedDeadline = payload.grade_submission_deadline_at;
        state.savedTermId = Number(parsed.pathname.match(/terms\/(\d+)/)[1]);
        return json({ success: true });
      }
      if (!parsed.pathname.endsWith('/grading-periods/context')) throw new Error('Unexpected test request: ' + parsed.pathname);
      state.reads++;
      const yearId = parsed.searchParams.get('school_year_id') || '1';
      const payload = state.payload(yearId, 20);
      if (state.savedDeadline) payload.terms.find(term => term.term_id === state.savedTermId)
        .grade_submission_deadline_at = state.savedDeadline;
      if (state.mode === 'offline') throw new TypeError('Failed to fetch');
      if (state.mode === 'denied') return json({ message: 'Academic period access denied.' }, 403);
      if (state.mode === 'immediate') return json(payload);
      return new Promise(resolve => state.held.push({ yearId,
        finish: (body = state.payload(yearId)) => resolve(json(body)) }));
    };
    state.root = mount(user);
  }, { mode });
  const academicCards = academicPage.locator('.term-card-grid');
  const academicSkeleton = academicPage.locator('.grading-period-overview-skeleton');
  await academicPage.goto(server.resolvedUrls.local[0] + '__cache_test__');
  await mountAcademicPage();
  await academicPage.waitForFunction(() => window.academicTest.held.length === 1);
  assert.equal(await academicSkeleton.count(), 1);
  assert.equal(await academicCards.count(), 0);
  await academicPage.evaluate(() => window.academicTest.held.shift().finish());
  await academicCards.getByText('Nov 12, 2026', { exact: true }).first().waitFor();
  await academicPage.waitForFunction(async () => Boolean(await window.academicTest.sync.getPersistentCache(
    window.academicTest.nav.cacheKey('admin:academic-period', { userId: 401, schoolYearId: 'current' }))));
  console.log('PASS Academic Periods shows a skeleton only when no saved records are available');

  await academicPage.reload();
  await mountAcademicPage();
  await academicPage.waitForFunction(() => window.academicTest.held.length === 1);
  await academicCards.getByText('Nov 12, 2026', { exact: true }).first().waitFor();
  assert.equal(await academicSkeleton.count(), 0);
  assert.equal(await academicPage.locator('.grade-lock-content-frame').getAttribute('aria-busy'), 'true');
  await academicPage.evaluate(() => {
    const state = window.academicTest;
    state.held.shift().finish(state.payload('1', 20));
  });
  await academicCards.getByText('Nov 20, 2026', { exact: true }).first().waitFor();
  await academicPage.waitForFunction(() => document.querySelector('.grade-lock-content-frame')?.getAttribute('aria-busy') === 'false');
  await academicPage.waitForFunction(async () => (await window.academicTest.sync.getPersistentCache(
    window.academicTest.nav.cacheKey('admin:academic-period', { userId: 401, schoolYearId: 'current' })))
      ?.terms[0].deadlineDate === '2026-11-20');
  console.log('PASS a full browser reload displays saved Academic Period records before the held server response, then updates them');

  await academicPage.reload();
  await mountAcademicPage({ mode: 'offline' });
  await academicCards.getByText('Nov 20, 2026', { exact: true }).first().waitFor();
  await academicPage.waitForFunction(() => document.querySelector('.grade-lock-content-frame')?.getAttribute('aria-busy') === 'false');
  assert.equal(await academicSkeleton.count(), 0);
  assert.equal(await academicPage.locator('.grade-lock-feedback--error').count(), 0);
  await academicPage.evaluate(() => { window.academicTest.mode = 'hold'; });
  console.log('PASS Academic Periods retains valid saved records when its background request fails offline');

  await academicPage.getByRole('button', { name: 'Filter by school year' }).click();
  await academicPage.getByRole('option', { name: 'SY 2025–2026' }).click();
  await academicPage.waitForFunction(() => window.academicTest.held.length === 1);
  assert.equal(await academicSkeleton.count(), 0);
  assert.equal(await academicCards.getByText('Nov 20, 2026', { exact: true }).count(), 3);
  assert.equal(await academicPage.locator('.grade-lock-year-change-overlay').count(), 1);
  await academicPage.evaluate(() => window.academicTest.held.shift().finish());
  await academicCards.getByText('Nov 12, 2025', { exact: true }).first().waitFor();
  await academicPage.getByRole('button', { name: 'Filter by school year' }).click();
  await academicPage.getByRole('option', { name: 'SY 2026–2027' }).click();
  await academicPage.waitForFunction(() => window.academicTest.held.length === 1);
  await academicPage.evaluate(() => window.academicTest.held.shift().finish());
  await academicCards.getByText('Nov 12, 2026', { exact: true }).first().waitFor();
  const beforeRevisit = await academicPage.evaluate(() => window.academicTest.reads);
  await academicPage.getByRole('button', { name: 'Filter by school year' }).click();
  await academicPage.getByRole('option', { name: 'SY 2025–2026' }).click();
  await academicCards.getByText('Nov 12, 2025', { exact: true }).first().waitFor();
  assert.equal(await academicPage.evaluate(() => window.academicTest.reads), beforeRevisit);
  await academicPage.getByRole('button', { name: 'Filter by school year' }).click();
  await academicPage.getByRole('option', { name: 'SY 2026–2027' }).click();
  await academicCards.getByText('Nov 12, 2026', { exact: true }).first().waitFor();
  console.log('PASS school-year changes keep the previous view under its loading overlay and reuse each year’s cached records');

  await academicPage.getByRole('article', { name: 'Select Term 2' }).click();
  await academicPage.getByRole('button', { name: 'Timeline & Settings', exact: true }).click();
  await academicPage.locator('.academic-period-list').getByRole('button', { name: /Term 3/ }).click();
  const deadlineInput = academicPage.locator('input[type="date"]').nth(2);
  await deadlineInput.fill('2026-11-29');
  await academicPage.evaluate(() => { window.academicTest.mode = 'immediate'; });
  const beforeSave = await academicPage.evaluate(() => window.academicTest.reads);
  await academicPage.getByRole('button', { name: 'Save Term', exact: true }).click();
  await academicPage.waitForFunction(beforeSave => document.querySelectorAll('input[type="date"]')[2]?.value === '2026-11-29'
    && document.querySelector('.academic-period-editor__heading h3')?.textContent === 'Term 3'
    && window.academicTest.writes.length === 1 && window.academicTest.reads > beforeSave, beforeSave);
  assert((await academicPage.evaluate(() => window.academicTest.reads)) > beforeSave);
  assert((await academicPage.evaluate(() => window.academicTest.writes[0].url)).endsWith('/terms/13/timeline'));
  await academicPage.getByRole('button', { name: 'Overview', exact: true }).click();
  await academicCards.getByText('Nov 29, 2026', { exact: true }).first().waitFor();
  console.log('PASS saving a deadline requests fresh records, keeps the selected term and updates the overview');

  await academicPage.evaluate(async () => {
    await window.academicTest.db.cache.toCollection().modify({ expiresAt: Date.now() - 1 });
  });
  await academicPage.reload();
  await mountAcademicPage();
  await academicPage.waitForFunction(() => window.academicTest.held.length === 1);
  assert.equal(await academicSkeleton.count(), 1);
  assert.equal(await academicCards.count(), 0);
  await academicPage.evaluate(() => window.academicTest.held.shift().finish());
  await academicCards.getByText('Nov 12, 2026', { exact: true }).first().waitFor();
  await academicPage.waitForFunction(() => document.querySelector('.grade-lock-content-frame')?.getAttribute('aria-busy') === 'false');
  console.log('PASS expired Academic Period copies are not rendered as usable records');

  await academicPage.reload();
  await mountAcademicPage({ mode: 'denied' });
  await academicPage.getByText('You no longer have access to this data. Please sign in again.', { exact: true }).waitFor();
  assert.equal(await academicCards.count(), 0);
  await academicPage.evaluate(() => { window.academicTest.mode = 'immediate'; });
  await academicPage.getByRole('button', { name: 'Retry', exact: true }).click();
  await academicCards.getByText('Nov 20, 2026', { exact: true }).first().waitFor();
  assert.deepEqual(academicErrors, []);
  console.log('PASS denied Academic Period reads hide saved records and Retry loads an allowed fresh response');
  await academicContext.close();
} finally {
  await browser?.close();
  await server.close();
}
