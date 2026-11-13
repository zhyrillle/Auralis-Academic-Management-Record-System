// Real components and PHIL-IRI page. All school API traffic is intercepted.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
const artifacts = mkdtempSync(join(tmpdir(), 'auralis-adviser-risk-'));
const server = await createServer({ cacheDir: join(artifacts, 'vite'), server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'risk-test-entry', configureServer(server) {
    server.middlewares.use('/__risk-preview', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/__risk-preview', '<html><body style="margin:0"><div id="root"></div><script type="module" src="/test/fixtures/adviserRiskPreview.jsx"></script></body></html>'));
    });
  },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('user', JSON.stringify({ user_id: 10, role: 'adviser', first_name: 'Fixture' })));
  const writes = [], errors = [];
  let predictionBlocked = false;
  const overview = mode => ({ version: 'teacher-dashboard-risk-v2', mode, term: 'T2', sourceTerm: 'T2',
    predictionReady: !predictionBlocked, predictionSections: [{ sectionId: 7, sectionName: 'Demo Section',
      ready: !predictionBlocked, label: predictionBlocked ? 'Ongoing term' : '', reason: 'Predict becomes available after this term ends.' }],
    targetTerm: mode === 'prediction' ? 'T3' : null, schoolYear: '2026–2027', counts: { high: 1, medium: 1, low: 1 }, unavailableCount: 1,
    students: ['high', 'medium', 'low'].map((level, i) => ({ student_section_id: 501 + i, name: `Fixture ${level}`, section_id: 7,
      section_name: 'Demo Section', grade_level: 'G8', risk_level: level,
      subjects: [{ name: mode === 'prediction' ? 'English' : 'Mathematics', riskLevel: level, grade: 70 + i * 8 }] })) });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data), headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method() === 'OPTIONS') return json({});
    if (request.method() !== 'GET') { writes.push(url.pathname); return json({}); }
    if (url.pathname.endsWith('/dashboard/at-risk-students')) return json(overview(url.searchParams.get('mode')));
    // An old or fallback summary must not erase the dedicated risk counts.
    if (url.pathname.endsWith('/dashboard/summary')) return json({ activeTerm: 'T2', isAdviser: true, sectionAverage: '75%' });
    const students = [{ student_id: 41, student_section_id: 501, first_name: 'Alex', last_name: 'Fixture', sex: 'M' }];
    if (url.pathname.includes('/class-record/')) return json({ students, assessments: [], scores: [],
      class_context: { school_year_id: 3, section_name: 'Demo Section', grade_level_name: 'G8', school_year: '2026-2027' } });
    if (url.pathname.includes('/sections/7/students')) return json(students);
    if (url.pathname.includes('/phil-iri-screening')) return json({ records: [], config: { assessed_on: '2026-11-13', literal_max: 14, inferential_max: 12, critical_max: 14, score_threshold: 28 } });
    return json({ records: [] });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const base = server.resolvedUrls.local[0] + '__risk-preview';
  await page.goto(base);
  const selectors = page.locator('.risk-carousel__selector');
  await page.getByRole('button', { name: 'Show high-risk students' }).waitFor();
  assert.equal(await selectors.nth(0).getAttribute('aria-pressed'), 'true');
  // Browsers may scroll an overflow-hidden viewport when focus returns from a modal.
  await page.locator('.risk-carousel__slide').nth(2).locator('button').focus();
  for (const [i, band] of ['high', 'medium', 'low'].entries()) {
    await page.getByRole('button', { name: `Show ${band}-risk students` }).click();
    assert.equal(await selectors.nth(i).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.risk-carousel__announcement').textContent(), new RegExp(band, 'i'));
    await page.waitForTimeout(600);
    const position = await page.locator('.risk-carousel__viewport').evaluate((viewport, index) => {
      const slide = viewport.querySelectorAll('.risk-carousel__slide')[index];
      const box = slide.getBoundingClientRect(), frame = viewport.getBoundingClientRect();
      return { top: box.top - frame.top, height: box.height, viewport: frame.height };
    }, i);
    assert.ok(Math.abs(position.top) <= 1 && position.height === 96, `${band} slide is misaligned: ${JSON.stringify(position)}`);
  }
  await page.getByRole('button', { name: /View low-risk students/ }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText('Fixture low', { exact: true }).waitFor();
  await modal.getByRole('button', { name: 'High Risk 1', exact: true }).click();
  await modal.getByText('Fixture high', { exact: true }).waitFor();
  const modalHeight = await modal.evaluate(node => node.getBoundingClientRect().height);
  await modal.getByRole('button', { name: 'Filter section: All sections', exact: true }).click();
  await modal.getByRole('option', { name: 'Demo Section', exact: true }).click();
  assert.equal(await modal.getByRole('button', { name: 'Filter section: Demo Section', exact: true }).count(), 1);
  await modal.getByRole('textbox', { name: 'Search learners' }).fill('no matching person');
  const emptyTitle = modal.getByRole('heading', { name: 'No matching learners' });
  await emptyTitle.waitFor();
  assert.equal(await modal.evaluate(node => node.getBoundingClientRect().height), modalHeight);
  assert.equal(await emptyTitle.evaluate(node => getComputedStyle(node).fontSize), '14px');
  await modal.getByRole('textbox', { name: 'Search learners' }).fill('');
  await modal.getByRole('switch', { name: /Predict/ }).click();
  await modal.getByText(/English prediction · T3/).waitFor();
  assert.match(await modal.textContent(), /Submitted grade/);
  await page.screenshot({ path: join(artifacts, 'risk-modal-laptop.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '?zero');
  await selectors.nth(0).waitFor();
  await page.clock.install();
  await page.clock.fastForward(8000);
  assert.equal(await selectors.nth(0).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.risk-carousel__value').allTextContents().then(v => v.join(',')), '0,0,0');
  assert.equal(await page.locator('.risk-carousel__slides').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
  await page.getByRole('button', { name: 'Show medium-risk students' }).click();
  assert.equal(await selectors.nth(1).getAttribute('aria-pressed'), 'true');
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(base);
  await selectors.nth(0).waitFor();
  await page.mouse.move(0, 0);
  await page.clock.runFor(3600);
  assert.equal(await selectors.nth(1).getAttribute('aria-pressed'), 'true');
  await page.locator('.adviser-dashboard__stat-row > div').first().hover();
  await page.clock.runFor(8000);
  assert.equal(await selectors.nth(1).getAttribute('aria-pressed'), 'true');
  await page.mouse.move(0, 0);
  await page.clock.runFor(3600);
  assert.equal(await selectors.nth(2).getAttribute('aria-pressed'), 'true');
  await page.clock.resume();
  await page.goto(base + '?dashboard');
  await page.getByRole('button', { name: 'View high-risk students: 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show low-risk students', exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'View low-risk students: 1', exact: true }).click();
  await page.getByRole('dialog').getByText('Fixture low', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  predictionBlocked = true;
  await page.goto(base + '?dashboard');
  await page.getByRole('button', { name: 'View high-risk students: 1', exact: true }).click();
  const blocked = page.getByRole('dialog');
  await blocked.getByRole('heading', { name: 'Student Risk Overview' }).waitFor();
  assert.equal(await blocked.getByText('Ongoing term', { exact: true }).count(), 0);
  await blocked.locator('.risk-review__prediction-control').hover();
  await blocked.getByRole('tooltip').waitFor({ state: 'visible' });
  assert.match(await blocked.getByRole('tooltip').textContent(), /Predict next term/);
  assert.equal(await blocked.getByRole('switch', { name: /Predict/ }).isDisabled(), true);
  await page.keyboard.press('Escape');
  for (const width of [1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '?phil');
    await page.locator('.screening-table').waitFor();
    const checkWidth = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`);
    await checkWidth();
    assert.ok(await page.locator('.screening-tables').evaluate(node => node.scrollWidth >= node.clientWidth));
    await page.getByRole('tab', { name: 'Post-Test', exact: true }).click();
    await page.locator('.post-test-table-scroll table').waitFor();
    await checkWidth();
    assert.ok(await page.locator('.post-test-table-scroll').evaluate(node => node.scrollWidth >= node.clientWidth));
    await page.screenshot({ path: join(artifacts, `phil-iri-${width}.png`), fullPage: true });
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log('PASS carousel bands, zero counts, reduced motion, rotation, row hover pause, modal prediction and PHIL-IRI at 390/768/1024/1366px.');
  console.log(artifacts);
} finally { await browser?.close(); await server.close(); }
