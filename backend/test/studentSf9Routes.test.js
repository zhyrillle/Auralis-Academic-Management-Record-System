const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual route without creating a database connection.
function routeHarness({ missingEnrollment = false, attendanceSheets = [], attendanceRows = [] } = {}) {
  const calls = [];
  let handler;
  const router = {
    get: (path, route) => { if (path === '/student/:identifier') handler = route; },
    post: () => {},
  };
  const db = {
    execute: async (sql, params = []) => {
      calls.push({ sql, params: Array.from(params) });
      if (sql.includes('FROM STUDENT st')) return [[{
        student_id: 41, LRN: '100000000041', first_name: 'Test', last_name: 'Learner',
      }]];
      if (sql.includes('FROM STUDENT_SECTION ss')) return [missingEnrollment ? [] : [{
        student_section_id: 501, section_id: 7, school_year_id: 2,
        section_name: 'History', grade_level_name: 'Grade 8',
        starts_on: '2025-06-01', ends_on: '2026-03-31',
      }]];
      if (sql.includes('FROM ATTENDANCE_SHEET ash')) return [attendanceSheets];
      if (sql.includes('SELECT attendance_sheet_id, status FROM ATTENDANCE')) {
        return [attendanceRows.filter(row => params.slice(0, -1).includes(row.attendance_sheet_id))];
      }
      return [[]];
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/studentSf9Routes.js'), 'utf8'), {
    module: { exports: {} }, console,
    require: (name) => {
      if (name === 'express') return { Router: () => router };
      if (name === '../config/db') return db;
      if (name === '../services/MasterSheetService') return {};
      if (name === '../services/AttendanceSummaryService') return require('../services/AttendanceSummaryService');
      if (name === '../utils/encryption') return require('../utils/encryption');
      if (name === '../services/Sf9PdfService') return { generateSf9Pdf: async () => Buffer.from('%PDF-1.4') };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    calls,
    run: async (query = {}) => {
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; } };
      await handler({ params: { identifier: '41' }, query }, response);
      return response;
    },
  };
}

test('SF9 selected year scopes enrollment and MAPEH grades to that enrollment', async () => {
  const harness = routeHarness();
  const response = await harness.run({ schoolYearId: '2' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.studentProfile.section, 'History');
  const enrollment = harness.calls.find(({ sql }) => sql.includes('FROM STUDENT_SECTION ss'));
  assert.match(enrollment.sql, /ss\.school_year_id = \?/);
  assert.deepEqual(enrollment.params, [41, '2']);
  const grades = harness.calls.find(({ sql }) => sql.includes('FROM STUDENT_GRADE sg'));
  assert.match(grades.sql, /AND so\.school_year_id = \?/);
  assert.deepEqual(grades.params, [501, 41, '2']);
});

test('SF9 rejects an unrecognized selected year instead of falling back to latest enrollment', async () => {
  const harness = routeHarness({ missingEnrollment: true });
  const response = await harness.run({ schoolYearId: '2' });
  assert.equal(response.statusCode, 404);
  assert.equal(harness.calls.length, 2);
});

test('SF9 validates year input before issuing SQL', async () => {
  for (const schoolYearId of ['', '0', '-1', '2 OR 1=1', ['1'], ['1', '2']]) {
    const harness = routeHarness();
    const response = await harness.run({ schoolYearId });
    assert.equal(response.statusCode, 400);
    assert.equal(harness.calls.length, 0);
  }
});

test('SF9 existing callers without a selected year keep latest-enrollment behavior', async () => {
  const harness = routeHarness();
  const response = await harness.run();
  assert.equal(response.statusCode, 200);
  const enrollment = harness.calls.find(({ sql }) => sql.includes('FROM STUDENT_SECTION ss'));
  assert.doesNotMatch(enrollment.sql, /AND ss\.school_year_id/);
  assert.deepEqual(enrollment.params, [41]);
});

test('SF9 excludes holiday attendance and deducts duplicate-marked dates only once', async () => {
  const harness = routeHarness({ attendanceSheets: [
    { attendance_sheet_id: 1, attendance_date: '2025-06-12', no_class_reason: 'HOLIDAY' },
    { attendance_sheet_id: 2, attendance_date: '2025-06-12', no_class_reason: 'HOLIDAY' },
    { attendance_sheet_id: 3, attendance_date: '2025-06-13', no_class_reason: null },
  ], attendanceRows: [
    { attendance_sheet_id: 1, status: 'A' },
    { attendance_sheet_id: 2, status: 'P' },
    { attendance_sheet_id: 3, status: 'P' },
  ] });
  const response = await harness.run({ schoolYearId: '2' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.attendanceData.classDays[0], 20); // June 2025 has 21 weekdays.
  assert.equal(response.body.attendanceData.daysPresent[0], 1);
  assert.equal(response.body.attendanceData.daysAbsent[0], 0);
  const sheetQuery = harness.calls.find(({ sql }) => sql.includes('FROM ATTENDANCE_SHEET ash'));
  assert.deepEqual(sheetQuery.params, [7, 2]);
  assert.match(sheetQuery.sql, /school_year_id = \?/);
  assert.match(sheetQuery.sql, /attendance_scope = 'SECTION'/);
});

test('SF9 general UI response masks student LRN for data privacy', async () => {
  const harness = routeHarness();
  const response = await harness.run({ schoolYearId: '2' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.studentProfile.lrn, '100000******');
});

