const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(responses = []) {
  const calls = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/PhilIriScreening.js'), 'utf8'), {
    module, require: name => {
      assert.equal(name, '../config/db');
      return { execute: async (sql, params) => { calls.push({ sql, params }); return [responses.shift() || []]; } };
    },
  });
  return { ...module.exports, calls };
}
const config = { literal_max: 14, inferential_max: 12, critical_max: 14, score_threshold: 28, assessed_on: '2026-06-15', test_level: 'Grade 7' };
const body = overrides => ({ sectionId: 2, schoolYearId: 3, config, records: [{ student_section_id: 4, test_taken: 1, literal_score: 0, inferential_score: null, critical_score: 2 }], ...overrides });
const user = { user_id: 5, normalized_role: 'subject_teacher' };

test('screening drafts preserve a real zero and an unrecorded score separately', () => {
  const normalized = harness().normalizeBatch(body());
  assert.equal(normalized.records[0][8], 0);
  assert.equal(normalized.records[0][9], null);
  assert.equal(normalized.records[0][10], 2);
});

test('test level is saved as assessment metadata, and an editable score threshold is preserved per document', () => {
  const normalized = harness().normalizeBatch(body({ config: { ...config, score_threshold: 24 } }));
  assert.equal(normalized.records[0][2], 'Grade 7');
  assert.equal(normalized.records[0][6], 24);
});

test('clearing a screening row retains nulls, not zero scores', () => {
  const normalized = harness().normalizeBatch(body({ records: [{ student_section_id: 4, test_taken: null }] }));
  assert.equal(normalized.records[0][7], null);
  assert.ok(normalized.records[0].slice(8).every(value => value === null));
});

test('scores outside declared maxima and scores for untested learners are rejected', () => {
  const { normalizeBatch } = harness();
  for (const row of [
    { student_section_id: 4, test_taken: 1, literal_score: 15 },
    { student_section_id: 4, test_taken: 1, literal_score: -1 },
    { student_section_id: 4, test_taken: 1, literal_score: 2.5 },
    { student_section_id: 4, test_taken: 0, literal_score: 0 },
  ]) assert.throws(() => normalizeBatch(body({ records: [row] })), error => error.status === 400);
});

test('duplicate learners, impossible dates and invalid score thresholds are rejected', () => {
  const { normalizeBatch } = harness();
  assert.throws(() => normalizeBatch(body({ records: [body().records[0], body().records[0]] })), /duplicate/);
  assert.throws(() => normalizeBatch(body({ config: { ...config, assessed_on: '2026-02-30' } })), /date/);
  assert.throws(() => normalizeBatch(body({ config: { ...config, score_threshold: 41 } })), /range/);
});

test('saving checks section/year membership and takes recorder identity from the resolved user', async () => {
  const h = harness([[{ allowed: 1 }], [{ student_section_id: 4 }], { affectedRows: 1 }]);
  await h.PhilIriScreening.saveBatch(body({ user_id: 999 }), user);
  assert.deepEqual(Array.from(h.calls[1].params), [2, 3]);
  assert.equal(h.calls[2].params[11], 5);
  assert.equal(h.calls[2].params[8], 0);
  assert.equal(h.calls[2].params[9], null);
  const wrongSection = harness([[{ allowed: 1 }], [{ student_section_id: 99 }]]);
  await assert.rejects(wrongSection.PhilIriScreening.saveBatch(body(), user), /does not belong/);
  assert.equal(wrongSection.calls.length, 2);
});

test('unassigned teachers and unrelated roles cannot read or save a section', async () => {
  const unassigned = harness([[]]);
  await assert.rejects(unassigned.PhilIriScreening.findBySection(2, 3, user), error => error.status === 403);
  const otherRole = harness();
  await assert.rejects(otherRole.PhilIriScreening.saveBatch(body(), { ...user, normalized_role: 'principal' }), error => error.status === 403);
  assert.equal(otherRole.calls.length, 0);
});
