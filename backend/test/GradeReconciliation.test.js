const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan } = require('../services/GradeReconciliationService');
const { TRANSMUTATION_TABLE } = require('../utils/depedTransmutation');

function snapshot() {
  const activities = [
    ['Written Work 1', 'WW', 20, 16], ['Performance Task 1', 'PT', 50, 43],
    ['Summative Test 1', 'EX', 30, 23], ['Summative Test 2', 'EX', 30, 26], ['Term Exam', 'EX', 40, 25],
  ];
  return {
    offerings: [{ subject_offering_id: 1, subject_id: 1, section_id: 1, school_year_id: 1,
      subject_code: 'ENG', subject_name: 'English', section_name: 'Banana', grade_level_name: 'G8' }],
    periods: [{ term_id: 1, school_year_id: 1, term_name: '1st' }],
    sheets: [{ grade_sheet_id: 1, subject_offering_id: 1, term_id: 1, workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED' }],
    enrollments: [{ student_section_id: 1, student_id: 1, section_id: 1, school_year_id: 1 }],
    activities: activities.map(([activity_name, component_code, highest_possible_score], i) => ({ activity_id: i + 1,
      grade_sheet_id: 1, weight_subject_id: 1, weight_year_id: 1, activity_name, component_code, highest_possible_score })),
    scores: activities.map(([, , , raw_score], i) => ({ activity_id: i + 1, student_section_id: 1, raw_score, score_status: 'ENCODED' })),
    weights: ['WW', 'PT', 'EX'].map((component_code, i) => ({ component_code, percentage: [30, 50, 20][i], subject_id: 1, school_year_id: 1 })),
    configs: [{ is_custom_enabled: 1, ranges_json: JSON.stringify(TRANSMUTATION_TABLE) }],
    grades: [{ student_grade_id: 1, subject_offering_id: 1, student_id: 1, student_section_id: 1,
      term: 'T1', mapeh_component: null, initial_grade: '92.00', quarterly_grade: '94.00', remarks: 'Passed' }],
  };
}

test('a repair plan derives both grades from existing scores without changing its inputs', () => {
  const input = snapshot(), before = structuredClone(input);
  const plan = buildPlan(input, { schoolYearId: 1 });
  assert.deepEqual(input, before);
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.skipped.length, 0);
  assert.deepEqual(plan.updates[0].after, { initial_grade: 81.8, quarterly_grade: 83, remarks: 'Passed' });
  assert.equal(plan.updates[0].before.quarterly_grade, '94.00');
  Object.assign(input.grades[0], plan.updates[0].after);
  const repeated = buildPlan(input, { schoolYearId: 1 });
  assert.equal(repeated.updates.length, 0);
  assert.equal(repeated.matching, 1);
});

test('matching final grades with incorrect initial grades are also repaired', () => {
  const input = snapshot(); input.grades[0].quarterly_grade = '83.00';
  assert.equal(buildPlan(input, { schoolYearId: 1 }).updates.length, 1);
});

test('incomplete, excused, ambiguous and incorrectly linked records cannot be repaired automatically', () => {
  for (const change of [
    data => { data.scores.pop(); },
    data => { data.scores[0].score_status = 'EXCUSED'; },
    data => { data.activities.pop(); data.activities.pop(); data.activities.pop(); },
    data => { data.sheets.push({ ...data.sheets[0], grade_sheet_id: 2 }); },
    data => { data.offerings.push({ ...data.offerings[0], subject_offering_id: 2 }); },
    data => { data.grades[0].student_section_id = 999; },
    data => { data.activities[0].weight_subject_id = 99; },
    data => { data.scores.push({ ...data.scores[0] }); },
    data => { data.scores[0].raw_score = 999; },
  ]) {
    const input = snapshot(); change(input);
    const plan = buildPlan(input, { schoolYearId: 1 });
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.skipped.length, 1);
  }
});

test('an explicit year limits the repair scope', () => {
  const input = snapshot();
  assert.throws(() => buildPlan(input, {}), /school year/);
  assert.equal(buildPlan(input, { schoolYearId: 2 }).updates.length, 0);
});

test('the repaired seeder previews calculated grades and preserves existing work', async () => {
  const { seedEnglishTerm1 } = require('../scripts/seed-english-term1-assessments');
  const input = snapshot();
  input.grades = []; input.activities = []; input.scores = []; input.sheets = [];
  input.periods[0] = { ...input.periods[0], ends_at: new Date('2026-09-14T23:59:00Z'), status: 'completed' };
  input.weights.forEach((row, i) => { row.subj_comp_weight_id = i + 1; });
  const calls = [];
  const connection = {
    query: async sql => { calls.push(sql); assert.equal(sql, 'START TRANSACTION READ ONLY'); },
    execute: async sql => {
      calls.push(sql); assert.match(sql, /^SELECT/);
      const mapping = [['FROM SUBJECT_OFFERING', 'offerings'], ['FROM ACADEMIC_TERM', 'periods'], ['FROM GRADE_SHEET', 'sheets'],
        ['FROM STUDENT_SECTION', 'enrollments'], ['FROM GRADE_ACTIVITY', 'activities'], ['FROM SCORE', 'scores'],
        ['FROM SUBJECT_COMPONENT_WEIGHT', 'weights'], ['FROM GRADE_TRANSMUTATION_CONFIG', 'configs'], ['FROM STUDENT_GRADE', 'grades']];
      const match = mapping.find(([token]) => sql.includes(token)); assert.ok(match);
      return [input[match[1]]];
    }, rollback: async () => {}, release: () => {},
  };
  const pool = { pool: { config: { connectionConfig: { host: 'localhost' } } }, getConnection: async () => connection };
  const result = await seedEnglishTerm1(pool, { schoolYearId: 1 });
  assert.equal(result.created.length, 1);
  assert.equal(result.created[0].grades[0].initialGrade, 61.6);
  assert.equal(result.created[0].grades[0].termGrade, 70);
  input.sheets = snapshot().sheets; input.activities = snapshot().activities;
  assert.equal((await seedEnglishTerm1(pool, { schoolYearId: 1 })).created.length, 0);
  await assert.rejects(seedEnglishTerm1({ ...pool, cloudPool: {} }, { schoolYearId: 1, apply: true }), /Pause/);
  const remote = { pool: { config: { connectionConfig: { host: 'remote.example' } } } };
  await assert.rejects(seedEnglishTerm1(remote, { schoolYearId: 1 }), /Local/);
});

test('the write step updates only approved grade fields and records their audit history', async () => {
  const { applyPlan } = require('../services/GradeReconciliationService');
  const plan = buildPlan(snapshot(), { schoolYearId: 1 }), calls = [];
  const connection = { execute: async (sql, values) => {
    calls.push({ sql, values });
    assert.match(sql, /^(UPDATE STUDENT_GRADE|INSERT INTO AUDIT_EVENT)/);
    return [{ affectedRows: 1, insertId: 9 }];
  } };
  const audits = await applyPlan(connection, plan, { backupPath: 'reviewed-backup.json', source: 'test-reconciliation' });
  assert.deepEqual(audits, [9]);
  assert.deepEqual(calls[0].values, [81.8, 83, 'Passed', 1]);
  assert.equal(calls.length, 2);
});

test('shared repair rejects changed source data before any write', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { reconcileShared } = require('../scripts/reconcile-shared-grades');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-shared-repair-test-'));
  const previewPath = path.join(directory, 'approved.json');
  const input = snapshot();
  fs.writeFileSync(previewPath, JSON.stringify({ version: 1, target: 'shared', snapshot: input,
    plan: buildPlan(input, { schoolYearId: 1 }) }));
  input.scores[0].raw_score = 15;
  let rolledBack = false, committed = false;
  const connection = {
    beginTransaction: async () => {},
    execute: async sql => {
      assert.match(sql, /^SELECT/, 'No UPDATE is allowed after a stale preview');
      const tables = [['SUBJECT_OFFERING', 'offerings'], ['ACADEMIC_TERM', 'periods'], ['GRADE_SHEET', 'sheets'],
        ['STUDENT_SECTION', 'enrollments'], ['GRADE_ACTIVITY', 'activities'], ['SCORE', 'scores'],
        ['SUBJECT_COMPONENT_WEIGHT', 'weights'], ['GRADE_TRANSMUTATION_CONFIG', 'configs'], ['STUDENT_GRADE', 'grades']];
      const entry = tables.find(([table]) => sql.includes(`FROM ${table}`)); assert.ok(entry);
      return [structuredClone(input[entry[1]])];
    }, rollback: async () => { rolledBack = true; }, commit: async () => { committed = true; }, release: () => {},
  };
  const pool = { pool: { config: { connectionConfig: { host: 'shared.example' } } }, getConnection: async () => connection };
  try {
    await assert.rejects(reconcileShared(pool, previewPath), /Shared records changed since preview/);
    assert.equal(rolledBack, true); assert.equal(committed, false);
    await assert.rejects(reconcileShared(null, previewPath), /shared database connection/);
    await assert.rejects(reconcileShared({ pool: { config: { connectionConfig: { host: 'localhost' } } } }, previewPath), /shared database connection/);
  } finally {
    assert.equal(path.dirname(directory), os.tmpdir());
    fs.unlinkSync(previewPath); fs.rmdirSync(directory);
  }
});
