const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the actual SF10 handler with SELECT-only substitutes. Never connect to
// the school database, import its config, or start the application server.
function routeHarness({ missingStudent = false, enrollmentIdentifier = false, failOn = '' } = {}) {
  const calls = [];
  const handlers = new Map();
  const student = {
    student_id: 41, LRN: 'encrypted-fixture-lrn', first_name: 'Test',
    last_name: 'Learner', middle_name: '', sex: 'F', program_code: 'REG',
    birthdate: '2012-01-01',
  };
  const enrollment = {
    student_id: 41, student_section_id: 501, section_id: 7, school_year_id: 2,
    section_name: 'Fixture Section', grade_level_id: 2, grade_level_name: 'Grade 8',
    starts_on: '2025-06-01', ends_on: '2026-03-31',
  };
  const db = { execute: async (sql, params = []) => {
    assert.match(sql, /^\s*SELECT\b/i, 'SF10 verification must not write records');
    calls.push({ sql, params: Array.from(params) });
    if (failOn && sql.includes(failOn)) throw new Error('Synthetic database failure');
    if (sql.includes('FROM STUDENT st')) return [missingStudent || enrollmentIdentifier ? [] : [{ ...student }]];
    if (sql.includes('WHERE ss.student_section_id = ?')) return [missingStudent ? [] : [{ ...student }]];
    if (sql.includes('FROM SCHOOL LIMIT 1')) return [[{ schoolID: 'fixture-school', school_name: 'Fixture School' }]];
    if (sql.includes('FROM USER WHERE role')) return [[{ first_name: 'Test', last_name: 'Principal', extension_name: '' }]];
    if (sql.includes('FROM STUDENT_SECTION ss')) return [[{ ...enrollment }]];
    if (sql.includes('FROM STUDENT_GRADE sg')) return [[81, 85, 89].map((grade, i) => ({
      ...enrollment, student_grade_id: i + 1, subject_offering_id: 12,
      subject_id: 1, subject_code: 'ENG', subject_name: 'English',
      term: 'T' + (i + 1), mapeh_component: null, quarterly_grade: grade,
    }))];
    throw new Error('Unexpected SQL in SF10 test: ' + sql);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/reportRoutes.js'), 'utf8'), {
    module: { exports: {} }, console: { error() {}, warn() {} },
    require(name) {
      if (name === 'express') return { Router: () => ({ get: (route, handler) => handlers.set(route, handler) }) };
      if (name === '../config/db') return db;
      if (name === '../services/MasterSheetService') return {
        getMasterSheet() { throw new Error('Unexpected MasterSheet lookup in isolated SF10 fixture'); },
      };
      if (name === '../utils/encryption') return {
        hashLrn: value => 'fixture-hash:' + value,
        decryptLrn: value => {
          assert.equal(value, 'encrypted-fixture-lrn');
          return '100000000041';
        },
      };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return { calls, async run(identifier = '41') {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlers.get('/sf10/:studentId')({ params: { studentId: identifier } }, response);
    return { status: response.statusCode, body: JSON.parse(JSON.stringify(response.body)) };
  } };
}

test('SF10 uses its imported database and returns the existing official record structure', async () => {
  const harness = routeHarness();
  const response = await harness.run();
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.learner.student_id, 41);
  assert.equal(response.body.learner.lrn, '100000000041');
  assert.equal(response.body.school.school_name, 'Fixture School');
  assert.equal(response.body.scholastic_records.length, 4);
  const record = response.body.scholastic_records.find(row => row.grade_level === '8');
  assert.equal(record.section_name, 'Fixture Section');
  assert.equal(record.school_year, '2025 - 2026');
  const english = record.grades.find(row => row.code === 'eng');
  assert.deepEqual([english.t1, english.t2, english.t3, english.final], [81, 85, 89, 85]);
  assert.equal(english.remarks, 'Passed');
  assert.equal(record.grades.find(row => row.code === 'math').t1, '');
  assert.equal(harness.calls.length, 5);
  assert.deepEqual(harness.calls[0].params, ['41', '41', 'fixture-hash:41']);
});

test('SF10 preserves enrollment-identifier lookup', async () => {
  const harness = routeHarness({ enrollmentIdentifier: true });
  const response = await harness.run('501');
  assert.equal(response.status, 200);
  assert.equal(response.body.learner.student_id, 41);
  assert.deepEqual(harness.calls[1].params, ['501']);
});

test('SF10 keeps an unknown learner as 404 instead of inventing a record', async () => {
  const harness = routeHarness({ missingStudent: true });
  const response = await harness.run('missing-fixture');
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'Student record not found');
  assert.equal(harness.calls.length, 2);
});

test('SF10 database failures remain unsuccessful rather than returning a partial document', async () => {
  const harness = routeHarness({ failOn: 'FROM SCHOOL LIMIT 1' });
  const response = await harness.run();
  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'Failed to generate SF10 record');
  assert.equal(response.body.message, 'Synthetic database failure');
  assert.equal(response.body.scholastic_records, undefined);
});
