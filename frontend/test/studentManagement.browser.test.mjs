// Actual application, isolated browser + synthetic API. Never connects to the school database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const artifacts = process.env.UI_ARTIFACT_DIR || mkdtempSync(join(tmpdir(), 'auralis-student-ui-'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
const user = { user_id: 90001, role: 'system_admin', first_name: 'Demo', last_name: 'Admin' };
const sections = [
  { section_id: 1, section_name: 'Banana', grade_level_id: 2, is_specialized: 0 },
  { section_id: 2, section_name: 'Carrots', grade_level_id: 2, is_specialized: 0 },
  { section_id: 3, section_name: 'Orion', grade_level_id: 1, is_specialized: 1, program_id: 1 },
  { section_id: 4, section_name: 'Willow', grade_level_id: 3, is_specialized: 1, program_id: 2 },
  { section_id: 5, section_name: 'Cedar', grade_level_id: 4, is_specialized: 0 },
  { section_id: 6, section_name: 'Clover', grade_level_id: 2, is_specialized: 0 },
].map(section => ({ ...section, status: 'Active' }));
const learner = (id, sectionId = null, grade = 2, program = 4) => ({ student_id: id, LRN: String(100000000000 + id), first_name: 'Demo',
  last_name: `${id >= 100 ? 'Unassigned' : 'Learner'} ${String(id).padStart(3, '0')}`, sex: id % 2 ? 'M' : 'F',
  birthdate: '2012-06-15', section_id: sectionId, grade_level_id: grade, program_id: program,
  status: 'Active', city: 'Gingoog City', province: 'Misamis Oriental', country: 'Philippines', postal_code: '9014' });
const students = [...Array.from({ length: 42 }, (_, index) => learner(index + 1, 1)), learner(43, 2), learner(44, 2),
  ...Array.from({ length: 14 }, (_, index) => learner(index + 101)), learner(201, null, 1, 1), learner(202, null, 2, 2), learner(203, null, 2, 3)];
const programs = ['STE', 'SPJ', 'SPA', 'EBEC'].map((code, index) => ({ program_id: index + 1, program_code: code, program_name: ['Science Technology and Engineering', 'Special Program in Journalism', 'Special Program in Arts', 'Enhanced Basic Education Curriculum'][index] }));
const personnel = [
  { user_id: 70001, first_name: 'Alex', last_name: 'Teacher', email: 'alex@example.test', role: 'subject teacher', department_id: 1, account_status: 'active',
    teaching_assignments: [{ grade_level_id: 2, grade_level_name: 'G8', section_id: 2, section_name: 'Carrots', subject_offering_id: 501, subject_name: 'English', subject_code: 'ENG' }] },
  { user_id: 70002, first_name: 'Harvey', last_name: 'Adviser', email: 'harvey@example.test', role: 'subject teacher', is_adviser: true, department_id: 1, account_status: 'active', adviser_section_id: 1, teaching_assignments: [] }
];
let holdUserDetails = false;
let userDetailStarted;
let releaseUserDetails;
let rejectUserSave = false;
let sectionReloadGate = null;
let sectionReloadStarted;
let releaseSectionReload;
const auditEvents = [{ id: 9001, occurredAt: "2026-10-17T09:11:00.000Z", actorName: "Demo Admin", actorRole: "System Administrator", module: "Grade Transmutation", eventType: "GRADE_TRANSMUTATION_UPDATED", summary: "Grade Transmutation Updated on Grade Transmutation Config with detailed assessment conversion rules and rounding settings.", target: "Grade Transmutation Config for Junior High School Academic Records", impact: "Medium" }, { id: 9002, occurredAt: "2026-10-16T09:11:00.000Z", actorName: "Demo Admin", actorRole: "System Administrator", module: "Attendance", eventType: "ATTENDANCE_RECORDED", summary: "Recorded attendance.", target: "Banana", impact: "Low" }];
const writes = [];
const reads = new Map();
let rejectDelete = false;
const name = student => `${student.first_name} ${student.last_name}`;
const fullStudents = () => students.map(student => {
  const section = sections.find(item => item.section_id === Number(student.section_id));
  const program = programs.find(item => item.program_id === Number(student.program_id));
  return { ...student, name: name(student), section: section?.section_name || 'Unassigned', grade_level_name: student.grade_level_id ? `G${Number(student.grade_level_id) + 6}` : null,
    program_code: program?.program_code || 'EBEC', program_name: program?.program_name, is_specialized: student.program_id !== 4 ? 1 : 0,
    student_section_id: student.section_id ? student.student_id + 1000 : null };
});
const navigate = (page, path) => page.evaluate(path => { history.pushState({ usr: null, key: path, idx: 1 }, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path);

try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript(user => localStorage.setItem('user', JSON.stringify(user)), user);
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, '');
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' } });
    if (!url.pathname.startsWith('/api/')) return request.url().startsWith(server.resolvedUrls.local[0]) ? route.continue() : route.abort();
    const method = request.method(); const payload = request.postDataJSON();
    if (method === 'OPTIONS') return json({});
    if (method !== 'GET' && method !== 'OPTIONS') writes.push({ path, method, payload });
    if (method === 'GET') reads.set(path, (reads.get(path) || 0) + 1);
    if (method === 'GET' && sectionReloadGate && ['/sections', '/students', '/student-sections', '/grade-levels'].includes(path)) {
      sectionReloadStarted?.();
      await sectionReloadGate;
    }
    if (path === '/audit-logs') return json(auditEvents);
    if (path.includes('/profile')) return json({ ...user, email: 'demo@example.test' });
    if (path === '/users/management-options') return json({
      gradeLevels: [7, 8, 9, 10].map((grade, index) => ({ grade_level_id: index + 1, grade_level_name: `G${grade}` })),
      sections, departments: [{ department_id: 1, department_name: 'English' }],
      subjectOfferings: [{ subject_offering_id: 501, section_id: 2, subject_name: 'English', subject_code: 'ENG' }]
    });
    if (path === '/users' && method === 'GET') return json(personnel);
    if (path === '/users' && method === 'POST') {
      const next = { ...payload, user_id: 70003 }; personnel.push(next); return json(next);
    }
    if (/^\/users\/\d+$/.test(path)) {
      const account = personnel.find(account => account.user_id === Number(path.split('/').at(-1)));
      if (method === 'GET') {
        if (holdUserDetails) { userDetailStarted?.(); await new Promise(resolve => { releaseUserDetails = resolve; }); }
        return json(account);
      }
      if (method === 'PUT') {
        if (rejectUserSave) return json({ error: 'This email is already registered.' }, 409);
        Object.assign(account, payload); return json({ success: true });
      }
      if (method === 'DELETE') { personnel.splice(personnel.indexOf(account), 1); return json({ success: true }); }
    }
    if (path === '/students/programs') return json(programs);
    if (path === '/students' && method === 'GET') return json(fullStudents());
    if (path === '/students' && method === 'POST') { const next = { ...payload, student_id: Math.max(...students.map(student => student.student_id)) + 1, section_id: null }; students.push(next); return json(next); }
    if (/^\/students\/\d+$/.test(path)) {
      const id = Number(path.split('/').at(-1)); const student = students.find(student => student.student_id === id);
      if (method === 'PUT') { Object.assign(student, payload, { student_id: id }); return json({ success: true }); }
      if (method === 'DELETE') { if (rejectDelete) return json({ message: 'This student has linked academic records.' }, 409); students.splice(students.indexOf(student), 1); return json({ success: true }); }
    }
    if (path === '/grade-levels') return json([7, 8, 9, 10].map((grade, index) => ({ grade_level_id: index + 1, grade_level_name: `G${grade}` })));
    if (path === '/sections' && method === 'GET') return json(sections);
    if (path === '/sections' && method === 'POST') { sections.push({ ...payload, section_id: 7, status: 'Active' }); return json({ success: true }); }
    if (/^\/sections\/\d+$/.test(path) && method === 'PUT') { Object.assign(sections.find(section => section.section_id === Number(path.split('/').at(-1))), payload); return json({ success: true }); }
    if (/^\/sections\/\d+$/.test(path) && method === 'DELETE') { const index = sections.findIndex(section => section.section_id === Number(path.split('/').at(-1))); sections.splice(index, 1); return json({ success: true }); }
    if (path === '/student-sections') return json(students.filter(student => student.section_id).map(student => ({ student_section_id: student.student_id + 1000, student_id: student.student_id, section_id: student.section_id })));
    if (path === '/student-sections/bulk-assign') { payload.student_ids.forEach(id => { students.find(student => student.student_id === id).section_id = Number(payload.section_id); }); return json({ success: true }); }
    if (path === '/student-sections/unassign') { students.find(student => student.student_id === payload.student_id).section_id = null; return json({ success: true }); }
    if (path.endsWith('/audit-logs/summary')) return json({ totalAccounts: 6, activeAccounts: 5, inactiveAccounts: 1, roles: {} });
    return json([]);
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0] + 'system-admin/student-section-management');
  await page.getByRole('heading', { name: 'Banana', exact: true }).waitFor();
  const footerMetrics = () => page.locator('.sidebar-container').evaluate(sidebar => {
    const box = sidebar.getBoundingClientRect();
    const footer = sidebar.querySelector('.sidebar-footer').getBoundingClientRect();
    const profile = sidebar.querySelector('.profile-card-link').getBoundingClientRect();
    const logout = sidebar.querySelector('.logout-btn').getBoundingClientRect();
    const avatar = sidebar.querySelector('.profile-avatar').getBoundingClientRect();
    return { height: footer.height, profileHeight: profile.height, logoutHeight: logout.height,
      avatarWidth: avatar.width, fits: footer.right <= box.right + 1 && footer.bottom <= innerHeight + 1,
      separate: logout.top >= profile.bottom + 5 };
  });
  const compactFooter = await footerMetrics();
  assert(compactFooter.height <= 120);
  assert(compactFooter.profileHeight >= 44 && compactFooter.logoutHeight >= 40);
  assert.equal(compactFooter.avatarWidth, 34);
  assert(compactFooter.fits && compactFooter.separate);
  await page.locator('.sidebar-container').screenshot({ path: join(artifacts, 'sidebar-laptop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1366, height: 640 });
  assert((await footerMetrics()).fits);
  await page.getByRole('button', { name: 'Collapse navigation sidebar', exact: true }).click();
  await page.locator('.sidebar-container.collapsed').waitFor();
  assert((await footerMetrics()).fits);
  assert(await page.locator('.sidebar-container .logout-btn').isVisible());
  await page.locator('.sidebar-container').screenshot({ path: join(artifacts, 'sidebar-collapsed.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Collapse navigation sidebar', exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  assert((await footerMetrics()).height > compactFooter.height + 20);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.locator('.sidebar-container.mobile-open').waitFor();
  const mobileFooter = await footerMetrics();
  assert(mobileFooter.fits && mobileFooter.profileHeight >= 44 && mobileFooter.logoutHeight >= 40);
  await page.getByRole('link', { name: 'Manage Sections', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  console.log('PASS compact shared sidebar footer, distinct profile/logout targets, short laptop, collapsed and mobile layouts');
  assert.equal(await page.locator('.section-card').count(), 6);
  assert.equal(await page.locator('.section-assignment-table').count(), 0);
  const heights = await page.locator('.student-admin-toolbar').evaluate(element => [element.querySelector('.dropdown-select__trigger').getBoundingClientRect().height, element.querySelector('.search-input').getBoundingClientRect().height]);
  assert.equal(heights[0], heights[1]); assert.equal(heights[0], 42);
  assert.equal(await page.locator('.student-admin-toolbar .search-input').evaluate(element => getComputedStyle(element).fontSize), '13px');
  assert.equal(await page.getByRole('button', { name: 'Sections', exact: true }).evaluate(element => getComputedStyle(element).fontSize), '12px');
  assert((await page.getByRole('heading', { name: 'Student Sections', exact: true, level: 1 }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))) <= 28);
  assert.equal(await page.getByRole('progressbar', { name: '42 students; target capacity 40 to 45' }).getAttribute('aria-valuenow'), String(42 / 45 * 100));
  assert.equal(await page.getByText(/Below target|Within target|Over target/).count(), 0);
  const gradeBadges = await page.locator('.section-card__grade').evaluateAll(elements => elements.map(element => ({ text: element.textContent, grade: element.dataset.gradeLevel, color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor })));
  assert(gradeBadges.every(badge => /^G(7|8|9|10)$/.test(badge.text)));
  assert.equal(new Set(gradeBadges.map(badge => badge.color + badge.background)).size, 4);
  for (const grade of ['1', '2', '3', '4']) {
    assert.equal(new Set(gradeBadges.filter(badge => badge.grade === grade).map(badge => badge.color + badge.background)).size, 1);
  }
  assert.equal(await page.locator('.section-capacity').first().locator('span').first().evaluate(element => getComputedStyle(element).color), 'rgb(83, 98, 123)');
  assert.equal(await page.getByRole('button', { name: 'Sections', exact: true }).evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(18, 48, 98)');
  assert.equal(await page.locator('.section-capacity--target .section-capacity__bar > span').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(234, 179, 8)');
  assert.equal(await page.locator('.section-capacity--available .section-capacity__bar > span').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(22, 163, 74)');
  const search = page.getByRole('textbox', { name: 'Search sections by name…', exact: true });
  await search.focus();
  const searchBounds = await search.evaluate(element => {
    const input = element.getBoundingClientRect();
    const icon = element.parentElement.querySelector('.icon-container').getBoundingClientRect();
    return { top: icon.top - input.top, bottom: input.bottom - icon.bottom };
  });
  assert.equal(searchBounds.top, 1); assert.equal(searchBounds.bottom, 1);
  await page.screenshot({ path: join(artifacts, 'sections-laptop.png'), animations: 'disabled' });
  console.log('PASS separate section view, shared equal-height controls, visual grade/program identifiers and 40–45 capacity guide');

  await page.getByRole('button', { name: 'Create Section', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create Section', exact: true });
  await create.getByLabel('Specialized program', { exact: true }).check();
  await create.getByRole('button', { name: /^Specialization:/ }).click();
  await page.keyboard.press('Escape');
  assert(await create.isVisible()); assert.equal(await create.getByRole('listbox').count(), 0);
  await create.getByRole('button', { name: /^Specialization:/ }).click();
  await create.getByRole('option', { name: /Journalism/ }).click();
  await create.getByLabel(/^Section name/).fill('Mock New');
  await create.getByRole('button', { name: 'Create section', exact: true }).click();
  await create.waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Mock New', exact: true }).waitFor();
  assert.equal(writes.find(write => write.path === '/sections').payload.program_id, '2');
  console.log('PASS reusable specialization dropdown, Escape closes only its menu, and Create Section submits the original API fields');

  const banana = page.getByRole('article', { name: 'Banana, Grade 8' });
  await banana.getByRole('button', { name: /^Manage / }).click();
  const drawer = page.locator('.section-management-drawer[open]');
  await drawer.waitFor();
  const box = await drawer.locator('.app-overlay__panel').boundingBox();
  assert.equal(Math.round(box.height), 768);
  const drawerBodyTop = (await drawer.locator('.app-overlay__body').boundingBox()).y;
  await drawer.getByLabel(/^Section name/).fill('Banana Updated');
  assert.equal(await drawer.getByLabel(/^Section name/).evaluate(element => getComputedStyle(element).outlineOffset), '-2px');
  await page.screenshot({ path: join(artifacts, 'section-field-focus.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
  await drawer.getByRole('status').getByText('Section details updated.', { exact: true }).waitFor();
  assert.equal(await drawer.locator('.app-overlay__body .app-toast').count(), 0);
  assert.equal((await drawer.locator('.app-overlay__body').boundingBox()).y, drawerBodyTop);
  const notificationBox = await drawer.locator('.app-overlay__notification-tray').boundingBox();
  const drawerFooter = await drawer.locator('.app-overlay__footer').boundingBox();
  assert(notificationBox.y + notificationBox.height <= drawerFooter.y);
  await page.screenshot({ path: join(artifacts, 'section-success-tray.png'), animations: 'disabled' });
  await drawer.getByRole('heading', { name: 'Banana Updated', exact: true }).waitFor();
  await drawer.getByRole('button', { name: 'Add students', exact: true }).click();
  assert((await drawer.locator('.section-student-row').count()) <= 4);
  await drawer.getByRole('textbox', { name: 'Search name or LRN…', exact: true }).fill('Demo Unassigned 101');
  await drawer.getByRole('checkbox', { name: 'Select Demo Unassigned 101', exact: true }).check();
  await drawer.evaluate(element => {
    window.drawerCapacitySnapshots = [];
    window.drawerCapacityObserver = new MutationObserver(() => {
      const label = element.querySelector('[role=progressbar]')?.getAttribute('aria-label');
      if (label) window.drawerCapacitySnapshots.push(label);
    });
    window.drawerCapacityObserver.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'] });
  });
  sectionReloadGate = new Promise(resolve => { releaseSectionReload = resolve; });
  const reloadStarted = new Promise(resolve => { sectionReloadStarted = resolve; });
  await drawer.getByRole('button', { name: 'Add selected', exact: true }).click();
  await reloadStarted;
  const addingButton = drawer.getByRole('button', { name: 'Adding…', exact: true });
  assert(await addingButton.isDisabled());
  assert.equal(await addingButton.getAttribute('aria-busy'), 'true');
  assert.equal(await addingButton.locator('.student-admin-spinner').count(), 1);
  await drawer.getByText('Adding student…', { exact: true }).waitFor();
  assert(await drawer.getByRole('progressbar', { name: '42 students; target capacity 40 to 45' }).isVisible());
  assert.equal(await drawer.getByText('No eligible students found', { exact: true }).count(), 0);
  assert.equal(await drawer.getByText('1 student added to Banana Updated.', { exact: true }).count(), 0);
  await page.screenshot({ path: join(artifacts, 'section-save-refresh-held.png'), animations: 'disabled' });
  sectionReloadGate = null;
  releaseSectionReload();
  await drawer.getByRole('progressbar', { name: '43 students; target capacity 40 to 45' }).waitFor();
  await drawer.getByRole('status').getByText('1 student added to Banana Updated.', { exact: true }).waitFor();
  const capacitySnapshots = await page.evaluate(() => { window.drawerCapacityObserver.disconnect(); return window.drawerCapacitySnapshots; });
  assert(capacitySnapshots.every(label => !label.startsWith('0 students')));
  console.log('PASS delayed post-save refresh retains drawer records and does not flash zero counts or an empty eligible list');
  await drawer.getByRole('button', { name: 'Current students', exact: true }).click();
  await drawer.getByRole('textbox', { name: 'Search name or LRN…', exact: true }).fill('Demo Unassigned 101');
  await drawer.getByRole('button', { name: 'Remove Demo Unassigned 101', exact: true }).click();
  const remove = page.getByRole('dialog', { name: 'Remove student from section?', exact: true });
  await remove.getByRole('button', { name: 'Remove student', exact: true }).click();
  await remove.waitFor({ state: 'hidden' });
  await drawer.getByRole('progressbar', { name: '42 students; target capacity 40 to 45' }).waitFor();
  assert(students.some(student => student.student_id === 101 && student.section_id === null));
  await drawer.getByRole('button', { name: 'Add students', exact: true }).click();
  await drawer.getByRole('textbox', { name: 'Search name or LRN…', exact: true }).fill('Demo Unassigned 102');
  sectionReloadGate = new Promise(resolve => { releaseSectionReload = resolve; });
  const singleReloadStarted = new Promise(resolve => { sectionReloadStarted = resolve; });
  const addOne = drawer.getByRole('button', { name: 'Add Demo Unassigned 102', exact: true });
  await addOne.click();
  await singleReloadStarted;
  assert.equal(await addOne.getAttribute('aria-busy'), 'true');
  assert.equal(await addOne.locator('.student-admin-spinner').count(), 1);
  assert.equal(await addOne.locator('.student-admin-spinner').evaluate(element => getComputedStyle(element).animationName), 'student-admin-spin');
  await drawer.getByText('Adding student…', { exact: true }).waitFor();
  await page.screenshot({ path: join(artifacts, 'section-add-student-spinner.png'), animations: 'disabled' });
  sectionReloadGate = null;
  releaseSectionReload();
  await drawer.getByRole('progressbar', { name: '43 students; target capacity 40 to 45' }).waitFor();
  await drawer.getByRole('status').getByText('1 student added to Banana Updated.', { exact: true }).waitFor();
  assert.equal(await drawer.locator('.student-admin-spinner').count(), 0);
  await drawer.getByRole('button', { name: 'Current students', exact: true }).click();
  await drawer.getByRole('textbox', { name: 'Search name or LRN…', exact: true }).fill('Demo Unassigned 102');
  await drawer.getByRole('button', { name: 'Remove Demo Unassigned 102', exact: true }).click();
  await remove.getByRole('button', { name: 'Remove student', exact: true }).click();
  await remove.waitFor({ state: 'hidden' });
  await drawer.getByRole('progressbar', { name: '42 students; target capacity 40 to 45' }).waitFor();
  console.log('PASS individual and bulk student additions show spinners until refreshed records arrive and clear the loading state afterward');
  await drawer.getByRole('button', { name: 'Details', exact: true }).click();
  await drawer.getByRole('button', { name: 'Details', exact: true }).evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await drawer.locator('.section-drawer-content').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: join(artifacts, 'section-drawer-laptop.png'), animations: 'disabled' });
  await drawer.getByRole('button', { name: 'Close Banana Updated', exact: true }).click();
  assert(await drawer.evaluate(element => element.classList.contains('is-closing') && element.open));
  await drawer.waitFor({ state: 'hidden' });
  console.log('PASS combined section drawer edits, paginated add/remove areas, preserved learner profiles, and animated dismissal');

  await page.getByRole('button', { name: 'Assign Students', exact: true }).click();
  assert.equal(await page.locator('.section-card-grid').count(), 0);
  const table = page.locator('.section-assignment-table');
  const assignmentLrn = table.locator('tbody tr').first().locator('.masked-lrn-wrapper');
  assert.equal(await assignmentLrn.locator('.lrn-screen-val').innerText(), '100000******');
  assert.equal(await assignmentLrn.getByRole('button', { name: 'Copy full LRN', exact: true }).count(), 1);
  await assignmentLrn.getByRole('button', { name: 'Reveal full LRN', exact: true }).click();
  assert.equal(await assignmentLrn.locator('.lrn-screen-val').innerText(), '100000000001');
  await assignmentLrn.getByRole('button', { name: 'Hide LRN', exact: true }).click();
  assert.equal(await assignmentLrn.locator('.lrn-screen-val').innerText(), '100000******');
  assert.equal(await table.locator('.student-admin-status').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(230, 247, 241)');
  assert.equal(await table.locator('.student-admin-status__dot').first().count(), 1);
  assert.equal(await table.locator('.student-admin-program').first().getAttribute('class'), 'badge badge--program-ebec student-admin-program');
  assert.equal(await table.locator('.student-admin-program').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(237, 241, 247)');
  assert.notEqual(await table.locator('.student-admin-program').first().evaluate(element => getComputedStyle(element).backgroundColor), await table.locator('.student-admin-status').first().evaluate(element => getComputedStyle(element).backgroundColor));
  await table.getByRole('checkbox', { name: 'Select Demo Learner 001', exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await table.getByRole('checkbox', { name: 'Select Demo Learner 011', exact: true }).check();
  const tray = page.getByRole('complementary', { name: 'Selected students', exact: true });
  await tray.getByRole('button', { name: 'Review selection', exact: true }).click();
  assert(await tray.getByText('Demo Learner 001', { exact: true }).isVisible());
  assert(await tray.getByText('Demo Learner 011', { exact: true }).isVisible());
  await page.screenshot({ path: join(artifacts, 'selection-tray-laptop.png'), animations: 'disabled' });
  await tray.getByRole('button', { name: 'Deselect Demo Learner 001', exact: true }).click();
  await tray.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await tray.count(), 0);
  await page.getByRole('textbox', { name: 'Search student name or LRN…', exact: true }).fill('Demo Unassigned 101');
  const plus = table.getByRole('button', { name: 'Assign Demo Unassigned 101', exact: true });
  assert.equal(await plus.innerText(), '');
  assert.equal(await plus.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(18, 48, 98)');
  await table.getByRole('checkbox', { name: 'Select Demo Unassigned 101', exact: true }).check();
  await tray.getByRole('button', { name: 'Assign selected', exact: true }).click();
  const assign = page.getByRole('dialog', { name: 'Assign students to a section', exact: true });
  const sectionSearch = assign.getByRole('textbox', { name: 'Search sections by name, grade, or program…', exact: true });
  await sectionSearch.fill('No such section');
  await assign.getByText('No sections match your search.', { exact: true }).waitFor();
  assert(await assign.getByRole('button', { name: 'Confirm assignment', exact: true }).isDisabled());
  await sectionSearch.fill('Grade 8');
  await assign.getByRole('button', { name: /^Destination section:/ }).click();
  assert.equal(await assign.getByRole('option', { name: /Grade 7/ }).count(), 0);
  await page.keyboard.press('Escape');
  await sectionSearch.fill('Carrots');
  await assign.getByRole('button', { name: /^Destination section:/ }).click();
  assert.equal(await assign.getByRole('option').count(), 1);
  const assignmentBounds = await assign.evaluate(element => {
    const body = element.querySelector('.app-overlay__body').getBoundingClientRect();
    const form = element.querySelector('form').getBoundingClientRect();
    const search = element.querySelector('.search-bar-container').getBoundingClientRect();
    const option = element.querySelector('[role=option]').getBoundingClientRect();
    return { searchFits: search.width <= form.width, optionFits: option.bottom <= body.bottom };
  });
  assert.deepEqual(assignmentBounds, { searchFits: true, optionFits: true });
  await page.screenshot({ path: join(artifacts, 'assignment-search-laptop.png'), animations: 'disabled' });
  await assign.getByRole('option', { name: /Carrots/ }).click();
  await assign.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await assign.waitFor({ state: 'hidden' });
  assert.equal(students.find(student => student.student_id === 101).section_id, 2);
  assert.equal(await tray.count(), 0);
  await page.screenshot({ path: join(artifacts, 'assign-students-laptop.png'), animations: 'disabled' });
  console.log('PASS separate assignment page, icon-only assign action, cross-page selection review/deselection/clear and bulk assignment');

  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'Delete section Mock New', exact: true }).click();
  const deleteSectionDialog = page.getByRole('dialog', { name: 'Remove section?', exact: true });
  await deleteSectionDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await deleteSectionDialog.waitFor({ state: 'hidden' });
  assert(sections.some(section => section.section_name === 'Mock New'));
  await page.getByRole('article', { name: 'Mock New, Grade 7' }).getByRole('button', { name: /^Manage / }).click();
  await drawer.getByRole('button', { name: 'Remove section', exact: true }).click();
  await deleteSectionDialog.getByRole('button', { name: 'Remove section', exact: true }).click();
  await deleteSectionDialog.waitFor({ state: 'hidden' });
  await drawer.waitFor({ state: 'hidden' });
  assert(!sections.some(section => section.section_name === 'Mock New'));
  console.log('PASS section removal remains available in its own confirmation, with cancellation leaving the section intact');
  await page.getByRole('button', { name: 'View students in Banana Updated', exact: true }).click();
  await page.locator('.section-assignment-table').waitFor();
  assert.equal(await page.locator('.section-card-grid').count(), 0);
  assert((await page.getByRole('button', { name: /^Section:/ }).innerText()).includes('Banana Updated'));
  assert.equal(await page.locator('.page-content-area').evaluate(element => element.scrollTop), 0);
  console.log('PASS View Students switches to the filtered assignment page instead of scrolling down to another panel');

  await navigate(page, '/system-admin/manage-students');
  await page.getByRole('heading', { name: 'Manage Students', exact: true, level: 1 }).waitFor();
  await page.locator('.student-directory-table').waitFor();
  const directoryLrn = page.locator('.student-directory-table tbody tr').first().locator('.masked-lrn-wrapper');
  assert.equal(await directoryLrn.locator('.lrn-screen-val').innerText(), '100000******');
  await directoryLrn.getByRole('button', { name: 'Reveal full LRN', exact: true }).click();
  assert.equal(await directoryLrn.locator('.lrn-screen-val').innerText(), '100000000001');
  assert.equal(await page.getByRole('dialog', { name: 'Student profile', exact: true }).count(), 0);
  await directoryLrn.getByRole('button', { name: 'Hide LRN', exact: true }).click();
  assert.equal(await page.locator('.student-overview-grid .summary-stat-card').count(), 5);
  assert.equal(await page.locator('.grade-filter-tabs').count(), 0);
  await page.getByRole('button', { name: /^Grade level:/ }).click();
  await page.getByRole('option', { name: 'Grade 8', exact: true }).click();
  await page.getByRole('button', { name: /^Program:/ }).click();
  await page.getByRole('option', { name: 'EBEC', exact: true }).click();
  assert((await page.locator('.student-directory-table tbody tr').count()) > 0);
  await page.getByRole('button', { name: /^Grade level:/ }).click();
  await page.getByRole('option', { name: 'All grade levels', exact: true }).click();
  await page.getByRole('button', { name: /^Program:/ }).click();
  await page.getByRole('option', { name: 'All programs', exact: true }).click();
  const programPillColors = [];
  for (const code of ['STE', 'SPJ', 'SPA', 'EBEC']) {
    await page.getByRole('button', { name: /^Program:/ }).click();
    await page.getByRole('option', { name: code, exact: true }).click();
    const programPill = page.locator('.student-directory-table .student-admin-program').first();
    await programPill.waitFor();
    assert.equal(await programPill.innerText(), code);
    programPillColors.push(await programPill.evaluate(element => getComputedStyle(element).backgroundColor));
  }
  assert.equal(new Set(programPillColors).size, 4);
  await page.getByRole('button', { name: /^Program:/ }).click();
  await page.getByRole('option', { name: 'All programs', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'student-directory-laptop.png'), animations: 'disabled' });
  console.log('PASS student directory includes regular and specialized learners, shared overview cards and adjacent grade/program dropdowns');

  await page.getByRole('button', { name: 'Add Student', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Add student', exact: true });
  for (let index = 0; index < 20; index++) await page.keyboard.press('Tab');
  assert(await form.evaluate(element => element.contains(document.activeElement)));
  assert.equal(await form.getByRole('group', { name: 'Student form areas' }).count(), 0);
  assert.equal(await form.getByRole('heading', { name: 'Residential address' }).count(), 1);
  await form.getByRole('button', { name: 'Save student', exact: true }).click();
  await form.getByText('Enter a 12-digit LRN.', { exact: true }).waitFor();
  await form.getByLabel(/^Learner Reference Number/).fill('987654321098');
  await form.getByLabel(/^First name/).fill('New');
  await form.getByLabel(/^Last name/).fill('Mock');
  await page.screenshot({ path: join(artifacts, 'student-form-laptop.png'), animations: 'disabled' });
  await form.getByLabel('Street / Purok', { exact: true }).fill('Demo Street');
  await page.screenshot({ path: join(artifacts, 'student-address-laptop.png'), animations: 'disabled' });
  await form.getByRole('button', { name: 'Save student', exact: true }).click();
  await form.waitFor({ state: 'hidden' });
  assert.equal(students.at(-1).street, 'Demo Street');
  assert.equal(students.at(-1).program_id, 4);
  await page.getByRole('textbox', { name: 'Search name, LRN, or section…', exact: true }).fill('New Mock');
  const profileRow = page.getByRole('row', { name: 'View profile for New Mock', exact: true });
  assert.equal(await profileRow.getByRole('button', { name: 'View New Mock', exact: true }).count(), 0);
  await profileRow.click();
  const profile = page.getByRole('dialog', { name: 'Student profile', exact: true });
  await profile.getByText(/Demo Street/).waitFor();
  assert.equal(await profile.locator('dl > div').filter({ has: page.locator('dt', { hasText: /^Grade level$/ }) }).locator('dd').innerText(), 'Unassigned');
  assert.equal(await profile.locator('dd').first().evaluate(element => getComputedStyle(element).fontSize), '13px');
  const profileHeader = await profile.locator('.app-overlay__header').boundingBox();
  const identityBox = await profile.locator('.student-profile-identity').boundingBox();
  assert(identityBox.y - profileHeader.y - profileHeader.height <= 13);
  await profile.getByRole('button', { name: 'Close', exact: true }).click();
  await profile.waitFor({ state: 'hidden' });
  await profileRow.focus();
  await page.keyboard.press('Enter');
  await profile.waitFor();
  await page.screenshot({ path: join(artifacts, 'student-profile-laptop.png'), animations: 'disabled' });
  await profile.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit student', exact: true });
  await edit.getByLabel(/^Last name/).fill('Updated');
  await edit.getByRole('button', { name: 'Update student', exact: true }).click();
  await edit.waitFor({ state: 'hidden' });
  await page.getByRole('textbox', { name: 'Search name, LRN, or section…', exact: true }).fill('New Updated');
  await page.getByRole('button', { name: 'Edit New Updated', exact: true }).click();
  await edit.waitFor();
  assert.equal(await profile.count(), 0);
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
  await edit.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Delete New Updated', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Delete student', exact: true });
  rejectDelete = true;
  await deletion.getByRole('button', { name: 'Delete student', exact: true }).click();
  await deletion.getByText('This student has linked academic records.', { exact: true }).waitFor();
  assert(students.some(student => student.LRN === '987654321098'));
  await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await deletion.waitFor({ state: 'hidden' });
  rejectDelete = false;
  await page.getByRole('button', { name: 'Delete New Updated', exact: true }).click();
  await deletion.getByRole('button', { name: 'Delete student', exact: true }).click();
  await deletion.waitFor({ state: 'hidden' });
  assert(!students.some(student => student.LRN === '987654321098'));
  console.log('PASS add/view/edit/delete drawers, required-field validation, address preservation, original payloads and visible rejection handling');

  await navigate(page, '/system-admin/manage-users');
  await page.getByRole('heading', { name: 'User Management', exact: true, level: 1 }).waitFor();
  const userRows = page.locator('.users-table tbody tr[data-user-row]');
  await userRows.first().waitFor();
  assert.equal(await page.locator('.action-btn--view').count(), 0);
  const userProfile = page.getByRole('dialog', { name: 'User Profile', exact: true });
  const detailStarted = new Promise(resolve => { userDetailStarted = resolve; });
  holdUserDetails = true;
  const alexRow = page.getByRole('row', { name: 'View profile for Alex Teacher', exact: true });
  await alexRow.click();
  await detailStarted;
  await userProfile.getByRole('button', { name: 'Close', exact: true }).click();
  await userProfile.waitFor({ state: 'hidden' });
  const finishedDetail = page.waitForResponse(response => response.url().endsWith('/users/70001'));
  holdUserDetails = false;
  releaseUserDetails();
  await finishedDetail;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await userProfile.count(), 0);

  await alexRow.focus();
  await page.keyboard.press('Enter');
  await userProfile.waitFor();
  await userProfile.getByText('English', { exact: true }).first().waitFor();
  await userProfile.locator('.app-overlay__panel').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const trayBox = await userProfile.locator('.app-overlay__panel').boundingBox();
  assert(trayBox.width <= 560 && trayBox.height >= 220 && trayBox.height < 700);
  assert(trayBox.y + trayBox.height >= 740 && trayBox.y + trayBox.height <= 750);
  for (let index = 0; index < 20; index++) await page.keyboard.press('Tab');
  assert(await userProfile.evaluate(element => element.contains(document.activeElement)));
  await page.screenshot({ path: join(artifacts, 'user-profile-bottom-tray.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await userProfile.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Add User', exact: true }).click();
  const userForm = page.getByRole('dialog', { name: 'Add New User', exact: true });
  await userForm.getByLabel(/^First Name/).waitFor();
  const userFormBox = await userForm.locator('.app-overlay__panel').boundingBox();
  assert.equal(Math.round(userFormBox.height), 768);
  assert.equal(Math.round(userFormBox.x + userFormBox.width), 1366);
  await userForm.getByRole('button', { name: 'Create User', exact: true }).click();
  await userForm.getByText('Please fill in all required fields.', { exact: true }).waitFor();
  await userForm.getByLabel(/^First Name/).fill('Demo');
  await userForm.getByLabel(/^Last Name/).fill('Account');
  await userForm.getByLabel(/^Email/).fill('account@example.test');
  await userForm.getByLabel(/^Password/).fill('synthetic-test-password');
  await userForm.getByRole('button', { name: /^Role:/ }).click();
  await page.keyboard.press('Escape');
  assert(await userForm.isVisible());
  await userForm.getByRole('button', { name: /^Role:/ }).click();
  await userForm.getByRole('option', { name: 'Adviser', exact: true }).click();
  await userForm.getByRole('button', { name: /^Department \/ Assigned Area:/ }).click();
  await userForm.getByRole('option', { name: 'English', exact: true }).click();
  await userForm.getByRole('button', { name: /^Advisory Grade Level:/ }).click();
  await userForm.getByRole('option', { name: 'G8', exact: true }).click();
  await userForm.getByRole('button', { name: /^Advisory Section:/ }).click();
  assert.equal(await userForm.getByRole('option', { name: 'Banana Updated', exact: true }).count(), 0);
  await userForm.getByRole('option', { name: 'Carrots', exact: true }).click();
  await userForm.getByRole('button', { name: 'Add Subject Class', exact: true }).click();
  await userForm.getByRole('button', { name: /^Grade Level:/ }).click();
  await userForm.getByRole('option', { name: 'G8', exact: true }).click();
  await userForm.getByRole('button', { name: /^Section:/ }).click();
  await userForm.getByRole('option', { name: 'Carrots', exact: true }).click();
  await userForm.getByRole('button', { name: /^Subject:/ }).click();
  await userForm.getByRole('option', { name: 'English (ENG)', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'add-user-drawer.png'), animations: 'disabled' });
  await userForm.getByRole('button', { name: 'Create User', exact: true }).click();
  await userForm.waitFor({ state: 'hidden' });
  const addedUser = personnel.find(account => account.email === 'account@example.test');
  assert.equal(addedUser.role, 'subject teacher');
  assert.equal(addedUser.adviser_section_id, '2');
  assert.equal(addedUser.teaching_assignments[0].subject_offering_id, '501');

  await page.getByRole('button', { name: 'Edit Demo Account', exact: true }).click();
  const userEdit = page.getByRole('dialog', { name: 'Edit User', exact: true });
  await userEdit.getByLabel(/^First Name/).waitFor();
  assert.equal(await userProfile.count(), 0);
  await userEdit.getByLabel(/^First Name/).fill('Revised');
  rejectUserSave = true;
  await userEdit.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await userEdit.getByText('This email is already registered.', { exact: true }).waitFor();
  rejectUserSave = false;
  await userEdit.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await userEdit.waitFor({ state: 'hidden' });
  await page.getByRole('row', { name: 'View profile for Revised Account', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Delete Revised Account', exact: true }).click();
  assert.equal(await userProfile.count(), 0);
  await page.locator('.delete-modal').getByRole('button', { name: 'Close', exact: true }).click();
  assert(personnel.some(account => account.first_name === 'Revised'));
  console.log('PASS User Management row/keyboard profile tray, delayed-close safety, add/edit drawers, original adviser/teaching assignments and isolated table actions');

  await alexRow.click();
  await userProfile.waitFor();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await userProfile.locator('.app-overlay__panel').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const desktopProfileBox = await userProfile.locator('.app-overlay__panel').boundingBox();
  assert.equal(Math.round(desktopProfileBox.y + desktopProfileBox.height), 1060);
  await page.screenshot({ path: join(artifacts, 'user-profile-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await userProfile.locator('.app-overlay__panel').evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: join(artifacts, 'user-profile-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await userProfile.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Add User', exact: true }).click();
  await userForm.getByLabel(/^First Name/).waitFor();
  assert(await userForm.locator('.app-overlay__panel').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.screenshot({ path: join(artifacts, 'add-user-mobile.png'), animations: 'disabled' });
  await userForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await userForm.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1366, height: 768 });
  await navigate(page, '/system-admin/manage-students');
  await page.locator('.student-directory-table').waitFor();

  await navigate(page, '/system-admin/dashboard');
  await page.locator('.audit-event-row').first().waitFor();
  const auditLong = page.locator('.audit-trail__action .hover-scroll-text').first();
  await page.waitForFunction(() => document.querySelector('.audit-trail__action .hover-scroll-text')?.dataset.overflow === 'true');
  assert.equal(await auditLong.evaluate(element => getComputedStyle(element).whiteSpace), 'nowrap');
  assert(await page.locator('.audit-event-row').first().locator('td').nth(3).evaluate(cell => {
    const badge = cell.querySelector('.badge');
    return badge.getBoundingClientRect().right <= cell.getBoundingClientRect().right && badge.title === 'Grade Transmutation';
  }));
  const auditRowHeight = (await page.locator('.audit-event-row').first().boundingBox()).height;
  assert(auditRowHeight <= 70);
  await auditLong.hover();
  const movingContent = auditLong.locator('.hover-scroll-text__content');
  assert.equal(await movingContent.evaluate(element => getComputedStyle(element).animationName), 'hover-scroll-left');
  const scrollTiming = await auditLong.evaluate(element => ({
    distance: Math.abs(parseFloat(element.style.getPropertyValue('--hover-scroll-distance'))),
    duration: parseFloat(getComputedStyle(element.querySelector('.hover-scroll-text__content')).animationDuration)
  }));
  assert(Math.abs(scrollTiming.duration - Math.max(4, scrollTiming.distance / 60 + 1)) < .02);
  assert(scrollTiming.duration < Math.max(8, scrollTiming.distance / 28 + 2));
  const shortActivity = page.locator('.audit-event-row').nth(1).locator('.hover-scroll-text').first();
  assert.equal(await shortActivity.getAttribute('data-overflow'), 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await movingContent.evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.screenshot({ path: join(artifacts, 'audit-activity-hover.png'), animations: 'disabled' });
  console.log('PASS audit activities stay on one line, long text scrolls slowly on hover, short text remains still, and reduced-motion is respected');
  await navigate(page, '/system-admin/manage-students');
  await page.locator('.student-directory-table').waitFor();

  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const directoryBox = await page.locator('.student-admin-page').boundingBox();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await navigate(page, '/system-admin/dashboard');
    await page.locator('.admin-dashboard-page').waitFor();
    const dashboardBox = await page.locator('.admin-dashboard-page').boundingBox();
    assert(Math.abs(directoryBox.x - dashboardBox.x) < 1);
    assert(Math.abs(directoryBox.width - dashboardBox.width) < 1);
    await navigate(page, '/system-admin/student-section-management');
    await page.getByRole('heading', { name: 'Banana Updated', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const sectionBox = await page.locator('.student-admin-page').boundingBox();
    assert(Math.abs(sectionBox.x - dashboardBox.x) < 1);
    assert(Math.abs(sectionBox.width - dashboardBox.width) < 1);
    await page.screenshot({ path: join(artifacts, `sections-${viewport.width}.png`), animations: 'disabled' });
    await navigate(page, '/system-admin/manage-students');
    await page.locator('.student-directory-table').waitFor();
    await page.locator('.page-content-area').evaluate(element => element.scrollTo({ top: 0 }));
    await page.screenshot({ path: join(artifacts, `directory-${viewport.width}.png`), animations: 'disabled' });
  }
  assert.deepEqual(errors, []);
  console.log('PASS laptop and large-monitor layouts match System Admin dashboard margins with no page overflow');
  console.log('Screenshots: ' + artifacts);
} finally { await browser?.close(); await server.close(); }
