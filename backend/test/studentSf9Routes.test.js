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
  assert.equal(response.body.attendanceData.daysAbsent[0], 19);
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

test('SF9 counts blank cells on recorded attendance days as absent', async () => {
  const harness = routeHarness({ attendanceSheets: [
    { attendance_sheet_id: 1, attendance_date: '2025-06-13', no_class_reason: null },
    { attendance_sheet_id: 2, attendance_date: '2025-06-16', no_class_reason: null },
    { attendance_sheet_id: 3, attendance_date: '2025-06-17', no_class_reason: null },
  ], attendanceRows: [
    { attendance_sheet_id: 1, status: 'P' },
    // Sheet 2 has no attendance row (blank / unmarked cell)
    { attendance_sheet_id: 3, status: 'BLANK' }, // Sheet 3 has BLANK status
  ] });
  const response = await harness.run({ schoolYearId: '2' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.attendanceData.daysPresent[0], 1);
  assert.equal(response.body.attendanceData.daysAbsent[0], 20); // 21 weekdays - 1 present = 20 absent
});

test('POST /section/:sectionId/export-pdf-zip batches queries and returns a valid ZIP of all learners', async () => {
  const { createZipBuffer } = require('../services/Sf9PdfService');
  const calls = [];
  let batchHandler;
  let masterSheetCalls = 0;
  let capturedBatchItems = null;

  const router = {
    get: () => {},
    post: (routePath, route) => {
      if (routePath === '/section/:sectionId/export-pdf-zip') batchHandler = route;
    },
  };

  const db = {
    execute: async (sql, params = []) => {
      calls.push({ sql, params: Array.from(params) });
      if (sql.includes('FROM SECTION sec')) {
        return [[{
          section_id: 7, section_name: 'Rizal', program_id: 1,
          program_code: 'EBEC', program_name: 'Enhanced Basic Education Curriculum',
          grade_level_name: 'Grade 9', school_year_id: 2,
          starts_on: '2025-06-01', ends_on: '2026-03-31',
        }]];
      }
      if (sql.includes('FROM STUDENT_SECTION ss')) {
        return [[
          { student_section_id: 501, section_id: 7, school_year_id: 2, student_id: 41, LRN: '100000000041', first_name: 'Juan', last_name: 'Dela Cruz', sex: 'M' },
          { student_section_id: 502, section_id: 7, school_year_id: 2, student_id: 42, LRN: '100000000042', first_name: 'Maria', last_name: 'Santos', sex: 'F' },
        ]];
      }
      if (sql.includes('FROM SECTION_ADVISER_ASSIGNMENT')) {
        return [[{ adviser_assignment_id: 90, user_id: 10, first_name: 'Ana', last_name: 'Reyes' }]];
      }
      if (sql.includes("WHERE role IN ('1', 'principal', '5')")) {
        return [[{ first_name: 'Jose', last_name: 'Cruz' }]];
      }
      return [[]];
    },
  };

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/studentSf9Routes.js'), 'utf8'), {
    module: { exports: {} }, console,
    require: (name) => {
      if (name === 'express') return { Router: () => router };
      if (name === '../config/db') return db;
      if (name === '../services/MasterSheetService') {
        return {
          getMasterSheet: async () => {
            masterSheetCalls += 1;
            return { students: [] };
          },
        };
      }
      if (name === '../services/AttendanceSummaryService') return require('../services/AttendanceSummaryService');
      if (name === '../utils/encryption') return require('../utils/encryption');
      if (name === '../services/Sf9PdfService') {
        return {
          generateSf9Pdf: async () => Buffer.from('%PDF-1.4'),
          generateSf9PdfBatch: async (items) => {
            capturedBatchItems = items;
            return items.map((item) => ({
              fileName: item.fileName,
              buffer: Buffer.from(`%PDF-1.4 ${item.options.studentProfile.name}`),
            }));
          },
          createZipBuffer,
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  const headers = {};
  const response = {
    statusCode: 200,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(buf) { this.buffer = buf; return this; },
  };

  await batchHandler({ params: { sectionId: '7' }, query: { schoolYearId: '2' }, body: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(headers['Content-Type'], 'application/zip');
  assert.equal(headers['X-Sf9-Count'], '2');
  assert.equal(masterSheetCalls, 1, 'MasterSheetService should run once for the entire section');
  assert.equal(capturedBatchItems.length, 2);
  assert.equal(capturedBatchItems[0].fileName, 'DELACRUZ_JUAN_SF9.pdf');
  assert.equal(capturedBatchItems[1].fileName, 'SANTOS_MARIA_SF9.pdf');
  assert.ok(Buffer.isBuffer(response.buffer), 'ZIP response should be a Buffer');
  assert.equal(response.buffer.readUInt32LE(0), 0x04034b50, 'ZIP should start with PK local header signature');
});

test('Sf9PdfService default performance descriptors mark Developing and Emerging as Failed', () => {
  const { buildSf9Html } = require('../services/Sf9PdfService');
  const html = buildSf9Html({ studentProfile: { name: 'TEST, STUDENT' } });
  assert.match(html, /65-74[\s\S]*?Developing[\s\S]*?Failed/);
  assert.match(html, /0-64[\s\S]*?Emerging[\s\S]*?Failed/);
  assert.doesNotMatch(html, /Developing[\s\S]{0,200}Passed/);
  assert.doesNotMatch(html, /Emerging[\s\S]{0,200}Passed/);
});


