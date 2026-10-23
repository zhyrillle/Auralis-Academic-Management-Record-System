// Real Principal pages + intercepted synthetic HTTP; no school DB or API calls.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { performance, trend, historical, feedbackSummary, feedbackLikert, feedbackComments, rawYears } from './fixtures/principalRecords.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-principal-ui-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser, activePage;
const navigate = (page, path) => page.evaluate(path => { history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify({ user_id: 92000, role: 'principal', first_name: 'Fixture', last_name: 'Principal' }));
  });
  const reads = [], writes = [], errors = [];
  let empty = false, feedbackEmpty = false, missing = 'comparison', failure = '', malformed = false, networkDown = false, noYears = false;
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace(/^\/api/, '');
    if (!url.pathname.startsWith('/api/')) return req.url().startsWith(server.resolvedUrls.local[0]) || url.protocol === 'blob:' ? route.continue() : route.abort();
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (req.method() === 'OPTIONS') return json({});
    if (req.method() !== 'GET') { writes.push(path); return json({}); }
    reads.push({ path, params: Object.fromEntries(url.searchParams) });
    if (networkDown) return route.abort('failed');
    if (path.includes(failure) && failure) return json({ error: 'Synthetic failure' }, 500);
    if (path === '/school-years') return json(noYears ? [] : rawYears);
    const params = Object.fromEntries(url.searchParams);
    if (path.startsWith('/principal/performance/')) return json(malformed ? { recordsVersion: 2 } : performance(path.split('/').at(-1), params, empty));
    if (path === '/principal/analytics/subject-trend') return json(trend(params, empty));
    if (path === '/principal/analytics/historical-comparison') return json(historical(params, missing));
    if (path === '/principal/feedback/summary') return json(feedbackSummary(feedbackEmpty));
    if (path === '/principal/feedback/likert-results') return json(feedbackLikert(feedbackEmpty));
    if (path === '/principal/feedback/comments') return json(feedbackComments(feedbackEmpty));
    if (path === '/principal/at-risk-prediction/options') return json({ schoolYears: [{ value: '2026-2027', label: 'SY 2026–2027' }], gradeLevels: [{ value: 'all', label: 'All Grade Levels' }, { value: '7', label: 'Grade 7' }] });
    if (path === '/principal/at-risk-prediction/preview') return json({
      summary: { lowRisk: 1, mediumRisk: 1, highRisk: 1, total: 3, unavailable: 0, totalEnglish: 3 },
      students: ['low', 'medium', 'high'].map((riskLevel, i) => ({ id: String(i), studentId: i + 1, studentSectionId: i + 10, name: 'Fixture Learner ' + i, grade: 7, section: 'Fixture', adviser: 'Fixture Adviser', riskLevel, riskScore: 10, flags: [] })),
      unavailable: [], distribution: { totalFlagged: 3, low: { count: 1 }, medium: { count: 1 }, high: { count: 1 } }, gradeBreakdown: [{ grade: 'Grade 7', low: 1, medium: 1, high: 1 }],
    });
    return json([]);
  });
  const page = await ctx.newPage();
  activePage = page;
  page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  const go = async path => { await navigate(page, path); };
  const clear = async () => {
    await page.waitForFunction(() => !document.querySelector('.is-busy, .pa-skeleton'));
    await page.evaluate(async () => (await import('/src/services/navigationCache.js')).clearNavigationCache());
  };
  const screenshot = name => page.screenshot({ path: join(artifacts, name + '.png'), fullPage: true, animations: 'disabled' });
  await page.goto(server.resolvedUrls.local[0] + 'principal/performance-level/grade-levels');
  await page.getByRole('heading', { name: 'Grade-Level Breakdown', exact: true }).waitFor();
  assert.equal(await page.getByText('Preview data', { exact: true }).count(), 0);
  assert.equal(await page.locator('main .filter-toolbar').count(), 1);
  assert.equal(await page.locator('.pp-inline-progress .progress-bar__fill').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(18, 48, 98)');
  assert.equal(await page.locator('.bar-chart__axis-label').count(), 4);
  await screenshot('grades-laptop');
  await page.getByRole('tab', { name: 'Term 1', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.pa-content.is-busy'));
  assert(reads.some(read => read.path.endsWith('/grade-levels') && read.params.term === 'term-1'));
  await go('/principal/performance-level/sections');
  await page.getByRole('heading', { name: 'Sections by Performance Band', exact: true }).waitFor();
  const bandColors = await page.locator('.pp-ranked-list .progress-bar__fill').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
  assert.deepEqual(bandColors, ['rgb(198, 40, 40)', 'rgb(194, 124, 32)', 'rgb(22, 132, 73)', 'rgb(18, 48, 98)']);
  await go('/principal/performance-level/subjects');
  await page.getByRole('heading', { name: 'Subject Performance Ranking', exact: true }).waitFor();
  const overviewSizes = await page.locator('.pa-stat-card__value').evaluateAll(values => values.map(value => ({ text: value.classList.contains('pa-stat-card__value--text'), size: parseFloat(getComputedStyle(value).fontSize) })));
  assert(overviewSizes.filter(value => value.text).every(value => value.size <= 21), 'laptop text values stay compact');
  assert(overviewSizes.filter(value => !value.text).every(value => value.size >= 26), 'numeric overview totals retain their readable size');
  await page.waitForFunction(() => {
    const panel = document.querySelector('.pp-subject-chart-panel'), svg = panel?.querySelector('svg.bar-chart__svg');
    return svg && svg.getBoundingClientRect().height > panel.getBoundingClientRect().height * .7;
  });
  await page.locator('.bar-chart__bar').first().focus();
  assert.equal(await page.locator('.bar-chart__bar').first().getAttribute('fill'), '#C27C20');
  await screenshot('subjects-laptop');
  await page.getByRole('button', { name: 'Grade level: All grade levels' }).click();
  await page.getByRole('option', { name: 'Grade 7', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.pa-content.is-busy'));
  assert(reads.some(read => read.path.endsWith('/subjects') && read.params.gradeLevel === '7'));
  await go('/principal/performance-level/teachers');
  await page.getByRole('heading', { name: 'Class Average by Teacher', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Fixture Teacher 1, Term 1: 0, 2 learners', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Fixture Teacher 1, Term 2:/ }).count(), 0);
  assert(await page.locator('.line-chart svg').getByText('0', { exact: true }).count());
  assert.equal(await page.locator('.pp-teacher-legend .pa-legend-swatch').count(), 4);
  const teacherColors = await page.locator('.line-chart__point').evaluateAll(points => [...new Set(points.map(point => point.getAttribute('fill')))]);
  assert.equal(teacherColors.length, 4, 'each teacher has a distinct muted color');
  assert.equal(await page.locator('.line-chart__line--patterned').count(), 0, 'teacher lines stay solid');
  assert.equal(await page.locator('circle.line-chart__point').count(), await page.locator('.line-chart__point').count(), 'teacher markers stay round');
  const teacherOneColor = await page.getByRole('button', { name: 'Fixture Teacher 1, Term 1: 0, 2 learners', exact: true }).getAttribute('fill');
  await page.locator('.line-chart').scrollIntoViewIfNeeded();
  await screenshot('teachers-laptop');
  await page.locator('.pp-teacher-legend').getByRole('button', { name: 'None', exact: true }).click();
  assert.equal(await page.locator('.line-chart__point').count(), 0);
  await page.locator('.pp-teacher-legend').getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Fixture Teacher 1, Term 1: 0, 2 learners', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Fixture Teacher 1, Term 1: 0, 2 learners', exact: true }).getAttribute('fill'), teacherOneColor, 'legend toggles preserve teacher colors');
  await page.getByRole('searchbox', { name: 'Search class-average teachers' }).fill('Teacher 1');
  assert.equal(await page.getByRole('button', { name: 'Fixture Teacher 1, Term 1: 0, 2 learners', exact: true }).getAttribute('fill'), teacherOneColor, 'search does not recolor a teacher');
  await page.getByRole('searchbox', { name: 'Search class-average teachers' }).fill('no-match');
  await page.getByText('No data available yet.', { exact: true }).last().waitFor();
  await go('/principal/analytics/subject-trend');
  await page.getByRole('heading', { name: 'All Subjects', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /English, Term 2:/ }).count(), 0);
  const subjectPanel = page.locator('.pa-panel').filter({ has: page.getByRole('heading', { name: 'All Subjects', exact: true }) });
  assert.equal(await subjectPanel.locator('.line-chart__line--patterned').count(), 0);
  assert.equal(await subjectPanel.locator('circle.line-chart__point').count(), await subjectPanel.locator('.line-chart__point').count());
  const subjectColor = await subjectPanel.getByRole('button', { name: 'English, Term 1: 0, 2 learners', exact: true }).getAttribute('fill');
  await subjectPanel.getByRole('button', { name: 'None', exact: true }).click();
  assert.equal(await subjectPanel.locator('.line-chart__point').count(), 0);
  await subjectPanel.getByRole('button', { name: 'All', exact: true }).click();
  assert.equal(await subjectPanel.getByRole('button', { name: 'English, Term 1: 0, 2 learners', exact: true }).getAttribute('fill'), subjectColor);
  await page.getByRole('tab', { name: 'Ranking', exact: true }).click();
  await page.getByRole('tab', { name: 'T2', exact: true }).click();
  await page.getByText('No recorded grades for this term', { exact: true }).waitFor();
  await go('/principal/analytics/historical-comparison');
  await page.getByText(/No recorded grades for SY 2025/).waitFor();
  await page.locator('.pa-comparison-table').getByText('Unavailable', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: /SY 2025.*Term [123]:/ }).count(), 0);
  await screenshot('historical-laptop');
  missing = 'primary'; await clear();
  await page.getByText(/No recorded grades for SY 2026/).waitFor();
  await page.getByRole('button', { name: /SY 2025.*Term 1: 80/ }).waitFor();
  missing = 'both'; await clear();
  await page.getByText('No comparison data found', { exact: true }).waitFor();
  await go('/principal/feedback');
  await page.getByRole('heading', { name: 'Comment Explorer', exact: true }).waitFor();
  await page.getByText('4.125', { exact: true }).waitFor();
  assert.equal(await page.locator('.pa-stat-card').count(), 4);
  await page.getByRole('textbox', { name: 'Search comments' }).fill('positive');
  assert.equal(await page.locator('.tf-comment').count(), 1);
  assert.match(await page.locator('.tf-comment').textContent(), /positive comment/);
  await page.getByRole('textbox', { name: 'Search comments' }).fill('');
  assert((await page.getByRole('button', { name: 'Comment category: All categories' }).boundingBox()).height >= 36);
  const category = page.getByRole('button', { name: 'Comment category: All categories' });
  await category.click(); await page.getByRole('option', { name: 'Areas for Improvement', exact: true }).click();
  assert.equal(await page.locator('.tf-comment').count(), 1);
  await screenshot('feedback-laptop');
  feedbackEmpty = true; await clear();
  await page.getByText('No feedback yet', { exact: true }).waitFor();
  assert(await page.getByText('Not rated', { exact: true }).count() >= 2);
  for (const endpoint of ['summary', 'likert-results', 'comments']) {
    failure = '/principal/feedback/' + endpoint; await clear();
    await page.getByText('Unable to load feedback', { exact: true }).waitFor();
    assert.equal(await page.getByText('No feedback yet', { exact: true }).count(), 0);
    failure = ''; await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('No feedback yet', { exact: true }).waitFor();
  }
  await go('/principal/at-risk-students/prediction');
  await page.getByRole('group', { name: 'Overall risk distribution', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Prediction period: Predicting Term 2', exact: true }).count(), 1);
  for (const [risk, color] of [['Low', '#168449'], ['Medium', '#C27C20'], ['High', '#C62828']]) {
    const badge = page.getByRole('button', { name: risk + ' Risk percentage: ' + (risk === 'Low' ? 34 : 33) + '%', exact: true });
    await badge.focus();
    assert.equal(await page.locator('.ar-donut-connector.is-active').getAttribute('stroke'), color);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.ar-donut-connector.is-active').count(), 0);
  }
  await page.getByRole('button', { name: 'Medium Risk percentage: 33%', exact: true }).hover();
  const badgeDistance = await page.locator('.ar-svg-badge').first().evaluate(badge => {
    const rect = badge.querySelector('rect');
    return Math.hypot(Number(rect.getAttribute('x')) + 23 - 210, Number(rect.getAttribute('y')) + 12 - 180);
  });
  assert(badgeDistance > 155, 'percentage pills keep a larger gap from the donut');
  const riskCard = page.locator('.ar-risk-distribution');
  const readPills = () => page.locator('.ar-svg-badge rect').evaluateAll(elements => elements.map(element => ({
    x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
  })));
  const restPills = await readPills();
  const riskBounds = await riskCard.boundingBox();
  await page.mouse.move(riskBounds.x + riskBounds.width * .9, riskBounds.y + riskBounds.height * .8);
  assert.deepEqual(await readPills(), restPills, 'reduced motion disables pill drift');
  await page.mouse.move(riskBounds.x - 8, riskBounds.y + riskBounds.height / 2);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const samplePills = milliseconds => riskCard.evaluate((card, duration) => new Promise(resolve => {
    const samples = [];
    const started = performance.now();
    const sample = () => {
      samples.push([...card.querySelectorAll('.ar-svg-badge rect')].map(element => ({
        x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
      })));
      if (performance.now() - started >= duration) resolve(samples);
      else requestAnimationFrame(sample);
    };
    sample();
  }), milliseconds);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  await page.mouse.move(riskBounds.x + riskBounds.width * .15, riskBounds.y + riskBounds.height * .3);
  const hoverOnly = await samplePills(200);
  assert(hoverOnly.every(points => points.every((point, i) => distance(point, restPills[i]) === 0)), 'stationary hover does not start autonomous movement');
  const immediate = await riskCard.evaluate(card => {
    const read = () => [...card.querySelectorAll('.ar-svg-badge rect')].map(element => ({
      x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
    }));
    const bounds = card.getBoundingClientRect(), before = read();
    card.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerType: 'mouse',
      clientX: bounds.x + bounds.width * .15 + 20, clientY: bounds.y + bounds.height * .3,
    }));
    return { before, after: read() };
  });
  assert.deepEqual(immediate.after, immediate.before, 'cursor movement eases toward a target without an immediate jump');
  await page.mouse.move(riskBounds.x + riskBounds.width * .85, riskBounds.y + riskBounds.height * .7, { steps: 16 });
  const entry = await samplePills(350);
  assert(entry.at(-1).some((point, i) => distance(point, restPills[i]) > 4), 'cursor movement activates independent paths');
  const stationary = await samplePills(900);
  const settled = stationary.at(-1);
  assert(stationary.slice(-5).every(points => points.every((point, i) => distance(point, settled[i]) === 0)), 'pills stop completely after a short settle when the cursor rests');
  const vectors = settled.map((point, i) => ({ x: point.x - restPills[i].x, y: point.y - restPills[i].y }));
  assert(distance(vectors[0], vectors[1]) > .5 && distance(vectors[1], vectors[2]) > .5, 'pills have independent paths instead of one cursor translation: ' + JSON.stringify(vectors));
  const crossing = [...entry];
  for (const fraction of [.15, .85, .15, .85]) {
    await page.mouse.move(riskBounds.x + riskBounds.width * fraction, riskBounds.y + riskBounds.height * .5, { steps: 16 });
    crossing.push(...await samplePills(200));
  }
  assert(crossing.some(points => points.some((point, i) => distance(point, restPills[i]) > 12)), 'cursor-driven paths have a wider movement area');
  assert(crossing.every(points => points.every((point, i) => distance(point, restPills[i]) < 26)), 'pills stay near their own anchors, not the cursor');
  assert(crossing.every(points => points.every(point => point.x >= 7 && point.x <= 367 && point.y >= 8 && point.y <= 328)), 'wider paths keep the full pills inside the SVG');
  const connectorGap = await riskCard.evaluate(card => {
    const line = card.querySelector('.ar-donut-connector'), rect = card.querySelector('.ar-svg-badge rect');
    return Math.abs(line.points.getItem(line.points.numberOfItems - 1).x - Number(rect.getAttribute('x')) - 23);
  });
  assert(connectorGap < .01, 'connector endpoint follows the moving pill');
  // Observe the real pointer exit within the browser, before protocol latency
  // can advance the animation between the initial and immediate samples.
  await riskCard.evaluate((card, rest) => {
    const read = () => [...card.querySelectorAll('.ar-svg-badge rect')].map(element => ({
      x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
    }));
    window.__pillExitMotion = new Promise((resolve, reject) => {
      let frame;
      const cleanup = () => {
        clearTimeout(timeout);
        card.removeEventListener('pointerout', onExit, true);
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Pills did not finish returning to their anchors after pointer exit.'));
      }, 4000);
      const onExit = event => {
        if (event.relatedTarget instanceof Node && card.contains(event.relatedTarget)) return;
        card.removeEventListener('pointerout', onExit, true);
        const before = read();
        queueMicrotask(() => {
          const immediate = read(), samples = [];
          const sample = () => {
            const points = read(); samples.push(points);
            if (points.every((point, i) => point.x === rest[i].x && point.y === rest[i].y)) {
              cleanup(); resolve({ before, immediate, samples });
            } else frame = requestAnimationFrame(sample);
          };
          frame = requestAnimationFrame(sample);
        });
      };
      card.addEventListener('pointerout', onExit, true);
    });
  }, restPills);
  await page.mouse.move(riskBounds.x - 8, riskBounds.y + riskBounds.height / 2);
  const exitMotion = await page.evaluate(async () => {
    const motion = await window.__pillExitMotion;
    delete window.__pillExitMotion;
    return motion;
  });
  assert.deepEqual(exitMotion.immediate, exitMotion.before, 'exit begins at the current position without a synchronous jump');
  const movingPills = exitMotion.before.map((point, i) => distance(point, restPills[i]) > .5 ? i : -1).filter(i => i >= 0);
  assert(movingPills.length > 0, 'leaving does not instantly reset the pills');
  for (const index of movingPills) {
    const initialDistance = distance(exitMotion.before[index], restPills[index]);
    assert(exitMotion.samples.some(points => {
      const remaining = distance(points[index], restPills[index]);
      return remaining > .01 && remaining < initialDistance - .01;
    }), 'each moving pill has intermediate animation frames before reaching its anchor');
    assert(exitMotion.samples.every(points => distance(points[index], restPills[index]) <= initialDistance + .05), 'exit stays within its starting distance from the anchor');
  }
  assert.deepEqual(exitMotion.samples.at(-1), restPills, 'exit finishes exactly at the anchors');
  const idle = await samplePills(180);
  assert(idle.every(points => points.every((point, i) => distance(point, restPills[i]) === 0)), 'drift stops and settles at the anchors outside the card');
  await riskCard.dispatchEvent('pointermove', { pointerType: 'touch', clientX: riskBounds.x + riskBounds.width, clientY: riskBounds.y });
  assert.deepEqual(await readPills(), restPills, 'touch input does not trigger drift');
  const connectorTransition = await page.locator('.ar-donut-connector').first().evaluate(element => ({ property: getComputedStyle(element).transitionProperty, duration: getComputedStyle(element).transitionDuration }));
  assert.match(connectorTransition.property, /stroke-dashoffset/); assert.match(connectorTransition.duration, /0\.26s/);
  // Cursor input can still ease the pills briefly; target the current position.
  await page.getByRole('button', { name: 'Medium Risk percentage: 33%', exact: true }).hover({ force: true });
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.ar-donut-connector.is-active')).strokeDashoffset) < 0.05);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(rest => [...document.querySelectorAll('.ar-svg-badge rect')].every((element, i) => Number(element.getAttribute('x')) === rest[i].x && Number(element.getAttribute('y')) === rest[i].y), restPills);
  await screenshot('risk-laptop');
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/principal/performance-level/subjects', '/principal/performance-level/teachers', '/principal/analytics/subject-trend', '/principal/feedback', '/principal/at-risk-students/prediction']) {
      await go(path);
      await page.waitForFunction(() => !document.querySelector('.pa-skeleton, .ar-skeleton-ring'));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), path + ' does not overflow the viewport');
    }
    if (viewport.width === 390) assert((await page.locator('.ar-review-navigation .filter-toolbar').boundingBox()).height < 220, 'narrow filter fields must not grow empty vertical space');
    await screenshot(viewport.width === 390 ? 'risk-narrow' : 'risk-desktop');
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  empty = true; await clear(); await go('/principal/performance-level/subjects');
  await page.getByText('No subject results', { exact: true }).waitFor();
  malformed = true; await clear();
  await page.getByText('Subject performance is unavailable', { exact: true }).waitFor();
  malformed = false; empty = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('heading', { name: 'Subject Performance Ranking', exact: true }).waitFor();
  // Warm verified records, then verify offline persistence without clearing any drafts/outbox.
  await page.evaluate(async () => {
    const nav = await import('/src/services/navigationCache.js'), sync = await import('/src/offline/syncManager.js'), { db } = await import('/src/offline/db.js');
    await nav.loadCached(nav.cacheKey('performance:subjects', { term: 'overall', schoolYear: '2026-2027', gradeLevel: 'all' }), async () => ({ subjects: [{ label: 'OLD SAMPLE MUST NOT DISPLAY' }] }));
    await sync.setPersistentCache('unrelated:cached-records', { saved: 17 });
    await db.outbox.add({ ownerId: 'other-fixture-owner', status: 'requires-review', url: '/never-send', body: '{}' });
    localStorage.setItem('fixture-unsent-draft', 'retain this draft');
  });
  networkDown = true;
  await page.reload();
  await page.getByRole('heading', { name: 'Subject Performance Ranking', exact: true }).waitFor();
  assert.equal(await page.getByText('OLD SAMPLE MUST NOT DISPLAY').count(), 0);
  const preserved = await page.evaluate(async () => {
    const sync = await import('/src/offline/syncManager.js'), { db } = await import('/src/offline/db.js');
    return { unrelated: await sync.getPersistentCacheEntry('unrelated:cached-records'), outbox: await db.outbox.count(), draft: localStorage.getItem('fixture-unsent-draft') };
  });
  assert.equal(preserved.unrelated.data.saved, 17); assert.equal(preserved.outbox, 1); assert.equal(preserved.draft, 'retain this draft');
  networkDown = false; noYears = true; await clear(); await page.reload();
  await page.getByText('No school years are configured yet.', { exact: true }).waitFor();
  assert(reads.filter(read => read.path.startsWith('/principal/performance/') || read.path.startsWith('/principal/analytics/') || read.path.startsWith('/principal/feedback/') || read.path === '/school-years').every(read => read.params.recordsVersion === '2'));
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS Principal browser: records, retries, gaps/zero, chart sizing, filters, keyboard, three viewports, offline cache and unsent-work preservation');
  console.log('Screenshots: ' + artifacts);
  await ctx.close();
} catch (error) {
  if (activePage) {
    console.error((await activePage.locator('body').innerText()).slice(-6500));
    await activePage.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true, animations: 'disabled' });
    console.error('Failure screenshot: ' + artifacts);
  }
  throw error;
} finally { await browser?.close(); await server.close(); }
