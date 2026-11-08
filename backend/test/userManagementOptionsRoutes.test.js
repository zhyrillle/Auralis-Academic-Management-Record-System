const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the route against a schema without the legacy SECTION.user_id column.
function routeHarness(sections) {
  const routes = new Map();
  const calls = [];
  const schoolYear = { school_year_id: 2, status: 'ACTIVE' };
  const gradeLevels = [{ grade_level_id: 8, grade_level_name: 'Grade 8' }];
  const router = {
    get: (url, handler) => routes.set(url, handler),
    post() {}, put() {}, delete() {},
  };
  const db = {
    execute: async (sql, params) => {
      calls.push(sql);
      if (sql.includes('FROM SCHOOL_YEAR WHERE school_year_id = ?')) return [[{...schoolYear,school_year_id:params[0]}]];
      if (/\bsec\.user_id\b/i.test(sql)) {
        throw new Error("Unknown column 'sec.user_id' in 'field list'");
      }
      if (sql.includes('FROM SECTION sec')) return [sections];
      if (sql.includes('FROM GRADE_LEVEL')) return [gradeLevels];
      if (sql.includes('FROM DEPARTMENT d') || sql.includes('FROM PROGRAM') ||
          sql.includes('FROM SUBJECT_OFFERING so')) return [[]];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const unusedDependencies = new Set([
    '../models/User', '../models/AuditEvent', '../services/otpStore',
    '../services/emailService', '../utils/passwordUtils',
    '../services/profilePictureStorage',
  ]);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes/userRoutes.js'), 'utf8'), {
    module: { exports: {} }, console: { error() {} },
    require: name => {
      if (name === 'express') return { Router: () => router };
      if (name === 'crypto') return require('node:crypto');
      if (name === '../config/db') return db;
      if (name === '../models/UserManagementOptions') {
        return { getActiveSchoolYear: async () => schoolYear, getSchoolYears: async () => [schoolYear] };
      }
      if (name === '../services/UserClassAssignments') return {};
      if (unusedDependencies.has(name)) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    calls, gradeLevels, schoolYear,
    run: async (query = {}) => {
      const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await routes.get('/management-options')({query}, response);
      return response;
    },
  };
}

test('management options load assigned advisers without SECTION.user_id', async () => {
  const sections = [{ section_id: 7, section_name: 'Carrots', grade_level_id: 8, adviser_user_id: 41 }];
  const harness = routeHarness(sections);
  const response = await harness.run();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.sections, sections);
  assert.deepEqual(response.body.gradeLevels, harness.gradeLevels);
  assert.deepEqual(response.body.schoolYear, harness.schoolYear);
  assert.deepEqual(response.body.departments, []);
  assert.deepEqual(response.body.programs, []);
  assert.deepEqual(response.body.subjectOfferings, []);
  const sql = harness.calls.find(query => query.includes('FROM SECTION sec'));
  assert.match(sql, /FROM SECTION_ADVISER_ASSIGNMENT saa/);
  assert.match(sql, /WHERE saa\.section_id = sec\.section_id/);
  assert.match(sql, /saa\.school_year_id = \?/);
  assert.match(sql, /ORDER BY saa\.adviser_assignment_id DESC\s+LIMIT 1/);
  assert.match(sql, /\) AS adviser_user_id/);
  assert.doesNotMatch(sql, /\bsec\.user_id\b/i);
});

test('management options preserve sections with no assigned adviser', async () => {
  const sections = [{ section_id: 8, section_name: 'Banana', grade_level_id: 8, adviser_user_id: null }];
  const harness = routeHarness(sections);
  const response = await harness.run();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.sections, sections);
  assert.equal(response.body.sections[0].adviser_user_id, null);
  const subjectSql = harness.calls.find(query => query.includes('FROM SUBJECT_OFFERING so'));
  assert.match(subjectSql, /FROM TEACHER_ASSIGNMENT ta/);
  assert.match(subjectSql, /WHERE ta\.subject_offering_id = so\.subject_offering_id/);
  assert.match(subjectSql, /\) AS teacher_user_id/);
  assert.match(subjectSql, /WHERE so\.school_year_id = \?/);
  assert.deepEqual(response.body.schoolYears, [harness.schoolYear]);
});

test('management options can select an upcoming year explicitly', async () => {
  const harness = routeHarness([]);
  const response = await harness.run({school_year_id:'9'});
  assert.equal(response.statusCode,200);
  assert.equal(response.body.schoolYear.school_year_id,9);
});

test('invalid school-year selections fail before assignment-option queries', async () => {
  for (const year of ['-1','abc','1 OR 1=1']) {
    const harness=routeHarness([]);
    const response=await harness.run({school_year_id:year});
    assert.equal(response.statusCode,400);
    assert.equal(harness.calls.length,0);
  }
});
