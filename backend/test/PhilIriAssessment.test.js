const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const calls = [], module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/PhilIriAssessment.js'), 'utf8'), {
    module, require: name => {
      assert.equal(name, '../config/db');
      return { execute: async (sql, params) => { calls.push({ sql, params }); return [[]]; } };
    },
  });
  return { model: module.exports, calls };
}

test('Post-Test retrieval is scoped to the current enrollment year and English offering', async () => {
  const { model, calls } = harness();
  await model.findBySection(2, 'POST_TEST', 20, 3);
  assert.deepEqual(Array.from(calls[0].params), [2, 'POST_TEST', 3, 20]);
  assert.match(calls[0].sql, /ss\.school_year_id = \?/);
  assert.match(calls[0].sql, /pia\.test_type = \?/);
});

test('Post-Test saves use the deployed recorder column and never overwrite historical Pre-Test rows', async () => {
  const { model, calls } = harness();
  await model.upsertBatch([{ student_section_id: 4, test_type: 'POST_TEST', user_id: 5 }]);
  assert.equal(calls[0].params[2], 'POST_TEST');
  assert.equal(calls[0].params[12], 5);
  assert.match(calls[0].sql, /user_id\s*\) VALUES/);
  assert.doesNotMatch(calls[0].sql, /recorded_by/);
  const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261005_create_phil_iri_assessment.sql'), 'utf8');
  assert.match(migration, /user_id BIGINT NULL/);
  assert.match(migration, /UNIQUE KEY uq_student_section_test \(student_section_id, test_type\)/);
  assert.match(migration, /ENUM\('PRE_TEST', 'POST_TEST'\)/);
});
