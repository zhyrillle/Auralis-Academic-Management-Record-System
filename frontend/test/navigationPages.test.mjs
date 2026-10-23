// Render the real pages with in-memory sample payloads; never contact the database.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';

globalThis.localStorage = { getItem: () => null };
globalThis.window = { location: { origin: 'http://localhost' }, addEventListener: () => {},
  atob: globalThis.atob, btoa: globalThis.btoa, console };
globalThis.fetch = async () => ({ ok: false, status: 503 });
const server = await createServer({
  cacheDir: mkdtempSync(path.join(os.tmpdir(), 'auralis-navigation-render-')),
  // The report catalog doesn't mount a selected learner's browser-only PDF/export view.
  plugins: [{ name: 'skip-unmounted-report-export-view', enforce: 'pre', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/pages/adviser/StudentSF9Page.jsx')) {
      return 'export default function StudentSF9Page() { return null; }';
    }
  } }],
  server: { middlewareMode: true, ws: false }, appType: 'custom',
});
try {
  const { cacheKey, loadCached } = await server.ssrLoadModule('/src/services/navigationCache.js');
  const { principalCacheKey } = await server.ssrLoadModule('/src/services/principalData.js');
  const year = { value: '2026-2027', label: 'SY 2026–2027' };
  const years = [year, { value: '2025-2026', label: 'SY 2025–2026' }];
  const seed = (name, filters, data) => loadCached(name.startsWith('performance:') || name.startsWith('analytics:') || name === 'principal:school-years' ? principalCacheKey(name, filters) : cacheKey(name, filters), async () => data);
  await seed('principal:school-years', {}, years);
  const common = { term: 'overall', schoolYear: year, availableSchoolYears: years, availableGradeLevels: [] };
  await seed('performance:grades', { term: 'overall', schoolYear: year.value }, { ...common, gradeLevels: [], summary: {} });
  await seed('performance:subjects', { term: 'overall', schoolYear: year.value, gradeLevel: 'all' }, { ...common, subjects: [], summary: {} });
  await seed('performance:teachers', { term: 'overall', schoolYear: year.value }, { ...common, teachers: [], summary: {} });
  await seed('performance:lowest', { term: 'overall', schoolYear: year.value, gradeLevel: 'all' }, { ...common, gradeLevels: [], subjects: [], sections: [], summary: {} });
  await seed('performance:sections', { term: 'overall', schoolYear: year.value }, { ...common,
    summary: { averageGrade: 0, passRate: 0, failRate: 0, totalLearners: 0, needsAttention: 0 }, sections: [], bands: [] });
  await seed('analytics:historical', { term: 'overall', primarySchoolYear: year.value, comparisonSchoolYear: '2025-2026' },
    { ...common, primarySchoolYear: year, comparisonSchoolYear: years[1], subjects: [], totalStudents: 0,
      primaryTrend: [0, 0, 0], comparisonTrend: [0, 0, 0], primaryTrendGradeCounts: [0, 0, 0], comparisonTrendGradeCounts: [0, 0, 0], hasPrimaryData: false, hasComparisonData: false });
  await seed('analytics:subject-trend', { term: 'overall', schoolYear: year.value, gradeLevel: 'all' },
    { ...common, subjects: [], schoolWideAverages: [0, 0, 0], schoolWideGradeCounts: [0, 0, 0], totalLearners: 0 });
  await seed('reports:catalog', {}, { students: [], sections: [], enrollments: [], grades: [], years: [] });
  await seed('admin:account-summary', {}, { totalAccounts: 0, activeAccounts: 0, inactiveAccounts: 0, roles: {} });
  await seed('admin:audit-events', {}, []);
  await seed('admin:users', {}, []);
  await seed('admin:user-options', {}, { gradeLevels: [], sections: [], departments: [], subjectOfferings: [] });
  await seed('admin:students', {}, { students: [], programs: [] });
  await seed('admin:sections', {}, { sections: [], students: [], gradeLevels: [] });
  await seed('admin:weights', {}, { schoolYears: [], currentSchoolYear: { school_year_id: 1, starts_on: 2026, ends_on: 2027 }, configuration: { rows: [] } });
  await seed('admin:academic-period', { userId: 1, schoolYearId: 'current' }, {
    schoolYears: [], selectedSchoolYearId: '', terms: [], departmentsByTerm: {}, subjectsByTerm: {},
    gradeSheetRecordsByTerm: {}, reopeningRequests: [], activeReopenings: [],
    upcomingSchoolYear: null, upcomingPeriods: [], suggestedUpcomingPeriods: [],
  });
  const pages = [
    ...['PerformanceGradeLevels', 'PerformanceSections', 'PerformanceSubjects', 'PerformanceTeachers',
      'PerformanceLowest', 'HistoricalComparison', 'SubjectPerformanceTrend', 'PrincipalReports'].map(name => ['principal', name]),
    ...['AdminDashboard', 'ManageUsers', 'ManageStudents', 'StudentSectionManagement', 'WSConfig', 'AcademicPeriod'].map(name => ['system-admin', name]),
  ];
  for (const [folder, name] of pages) {
    const { default: Page } = await server.ssrLoadModule('/src/pages/'+folder+'/'+name+'.jsx');
    const html = renderToString(React.createElement(MemoryRouter, null, React.createElement(Page, { user: { user_id: 1 } })));
    assert(html.length > 100, name+' renders content');
    assert(!/pa-skeleton|mu-skeleton|grade-lock-skeleton|grading-period-skeleton|ws-config-skeleton/.test(html), name+' skips initial loading with cached data');
    process.stdout.write('PASS '+name+' loaded-view render\n');
  }

  // Exercise the actual adviser service/cache boundary, not a duplicate test implementation.
  const { clearNavigationCache, apiFetch } = await server.ssrLoadModule('/src/services/navigationCache.js');
  const { getSectionDetails } = await server.ssrLoadModule('/src/services/sectionDetailsService.js');
  let signedInUser = { user_id: 10, role: 'adviser' };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => key === 'user' ? JSON.stringify(signedInUser) : storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  clearNavigationCache();
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'PUT') return { ok: true };
    reads++;
    return { ok: true, json: async () => ({ version: reads, term: new URL(url).searchParams.get('term'),
      userId: options.headers['X-Auralis-User-Id'] }) };
  };
  try {
    const request = { assignmentType: 'advisory', assignmentId: 9, userId: 10, term: 'T1' };
    const [first, shared] = await Promise.all([getSectionDetails(request), getSectionDetails(request)]);
    assert.deepEqual(first, shared); assert.equal(reads, 1);
    await getSectionDetails({ ...request, term: 'T2' });
    assert.equal((await getSectionDetails(request)).version, first.version);
    assert.equal(reads, 2);
    process.stdout.write('PASS adviser concurrent reads and term navigation reuse cached records\n');

    assert.equal((await getSectionDetails({ ...request, force: true })).version, 3);
    assert.equal((await getSectionDetails(request)).version, 3);
    process.stdout.write('PASS adviser Refresh replaces the cached response\n');

    await apiFetch('/synthetic-grade-save', { method: 'PUT' });
    assert.equal((await getSectionDetails(request)).version, 4);
    signedInUser = { user_id: 20, role: 'adviser' };
    const otherUser = await getSectionDetails({ ...request, userId: 20 });
    assert.equal(otherUser.version, 5); assert.equal(otherUser.userId, '20');
    process.stdout.write('PASS grade saves and user changes invalidate adviser statuses\n');

    clearNavigationCache();
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ message: 'Service unavailable' }) });
    await assert.rejects(getSectionDetails({ ...request, userId: 20 }), /Service unavailable/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ recovered: true }) });
    assert.equal((await getSectionDetails({ ...request, userId: 20 })).recovered, true);
    process.stdout.write('PASS failed adviser reads remain retryable\n');

    const { getClassRecord } = await server.ssrLoadModule('/src/services/classRecordApi.js');
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).searchParams.get('read_only'), '1');
      assert.equal(options.headers['X-Auralis-User-Id'], '20');
      return new Response(JSON.stringify({ error: 'You can only review class records for your assigned department.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
    };
    await assert.rejects(getClassRecord(131, 'T2', 18, null, 3, { force: true, readOnly: true }),
      error => error.status === 403 && /assigned department/.test(error.message));
    process.stdout.write('PASS Class Record preserves the department access error instead of requesting another sign-in\n');
  } finally { globalThis.fetch = originalFetch; }
} finally { await server.close(); }
