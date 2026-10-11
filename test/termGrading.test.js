import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const backend = require('../backend/utils/depedTransmutation.js');
import * as frontend from '../frontend/src/utils/depedTransmutation.js';
const { TRANSMUTATION_TABLE, getTransmutedGrade, resolveComponentWeights,
  weightsFromRows, isProtectedGradeSheet, selectSavedSummary } = backend;

// Exercise the actual page-local mapping without importing React/JSX into Node.
const wsSource = readFileSync(new URL('../frontend/src/pages/system-admin/WSConfig.jsx', import.meta.url), 'utf8');
const mappingStart = wsSource.indexOf('// WS configuration mapping:');
const mappingEnd = wsSource.indexOf('const selectCurrentSchoolYear', mappingStart);
const validationStart = wsSource.indexOf('const getDisplayedWeight');
const validationEnd = wsSource.indexOf('export default function WSConfig', validationStart);
assert(mappingStart >= 0 && mappingEnd > mappingStart && validationStart >= 0 && validationEnd > validationStart);
const { mapConfigurationRows, getRowError } = new Function(
  wsSource.slice(mappingStart, mappingEnd) + wsSource.slice(validationStart, validationEnd)
    + '\nreturn { mapConfigurationRows, getRowError };',
)();

test('pre-ticket transmutation table is restored in both calculators', () => {
  assert.deepEqual(frontend.TRANSMUTATION_TABLE, TRANSMUTATION_TABLE);
  for (const tier of TRANSMUTATION_TABLE) {
    for (const value of [tier.min, tier.max]) {
      assert.equal(getTransmutedGrade(value), tier.grade);
      assert.equal(frontend.getTransmutedGrade(value), tier.grade);
    }
  }
  assert.equal(getTransmutedGrade(75), 77);
  assert.equal(getTransmutedGrade(85), 87);
  assert.equal(getTransmutedGrade(60), 70);
});

function pairedCalculation({ mapeh = false, weights = { WW: 20, PT: 50, EX: 30 }, shares = [30, 30, 40] } = {}) {
  const input = {
    writtenWorks: { 1: 80 }, performanceTasks: { 2: 80 },
    writtenWorkColumns: [{ id: 1, max_score: 100 }], performanceTaskColumns: [{ id: 2, max_score: 100 }],
    examinations: { st1: 25, st2: 25, te: 0 },
    examConfig: { st1HPS: 25, st2HPS: 25, teHPS: 50, st1Weight: shares[0], st2Weight: shares[1], teWeight: shares[2] },
    weights, isMapeh: mapeh,
  };
  const assessments = [
    { assessment_id: 1, component_code: 'WW', max_score: 100 },
    { assessment_id: 2, component_code: 'PT', max_score: 100 },
    ...['ST1', 'ST2', 'TE'].map((exam_key, i) => ({ assessment_id: i + 3, component_code: 'QA', activity_name: exam_key, exam_key, max_score: [25, 25, 50][i] })),
  ];
  const front = frontend.calculateStudentGrades(input);
  const back = backend.calculateStudentGrades({ assessments, scores: { 1: 80, 2: 80, 3: 25, 4: 25, 5: 0 }, weights, examConfig: input.examConfig, isMapeh: mapeh });
  assert.equal(Number(front.examinations.ps), back.components.QA.ps);
  assert.equal(Number(front.examinations.ws), back.components.QA.ws);
  assert.equal(front.initialGrade === '-' ? null : Number(front.initialGrade), back.initialGrade);
  assert.equal(front.termGrade === '-' ? null : front.termGrade, back.termGrade);
  return { front, back };
}

test('MAPEH retains raw-total pooling while ordinary subjects retain subweights', () => {
  const ordinary = pairedCalculation();
  assert.equal(Number(ordinary.front.examinations.ps), 60);
  const mapeh = pairedCalculation({ mapeh: true, weights: { WW: 20, PT: 60, EX: 20 } });
  assert.equal(Number(mapeh.front.examinations.ps), 50);
  assert.equal(Number(mapeh.front.examinations.ws), 10);
});

test('Class Record internal subweights are not forced to 30/30/40 by WS Config', () => {
  const result = pairedCalculation({ shares: [10, 20, 70] });
  assert.equal(Number(result.front.examinations.ps), 30);
  assert.equal(Number(result.front.examinations.ws), 9);
});

test('saved custom main weights remain authoritative for MAPEH', () => {
  const result = pairedCalculation({ mapeh: true, weights: { WW: 25, PT: 50, QA: 25 } });
  assert.equal(Number(result.front.writtenWorks.ws), 20);
  assert.equal(Number(result.front.performanceTasks.ws), 40);
  assert.equal(Number(result.front.examinations.ws), 12.5);
});

test('weight aliases, fractional storage and invalid totals retain configuration safeguards', () => {
  for (const code of ['EX', 'QA', 'STE']) {
    assert.equal(resolveComponentWeights({ WW: 20, PT: 50, [code]: 30 }).error, null);
    assert.deepEqual(frontend.resolveComponentWeights({ WW: 20, PT: 50, [code]: 30 }), resolveComponentWeights({ WW: 20, PT: 50, [code]: 30 }));
  }
  assert.equal(resolveComponentWeights({ WW: 30, PT: 50, EX: 30 }).error, 'INVALID_WEIGHT_TOTAL');
  assert.equal(resolveComponentWeights({ WW: 20, PT: 60, EX: 30, QA: 20 }).error, 'CONFLICTING_EXAM_WEIGHTS');
  assert.equal(resolveComponentWeights(weightsFromRows([])).error, 'INVALID_COMPONENT_WEIGHTS');
  assert.equal(weightsFromRows([{ component_code: 'WW', percentage: 0.2 }, { component_code: 'PT', percentage: 0.5 }, { component_code: 'QA', percentage: 0.3 }]).EX, 30);
  const result = pairedCalculation({ weights: { WW: 30, PT: 50, EX: 30 } });
  assert.equal(result.front.termGrade, '-');
  assert.equal(result.back.termGrade, null);
});

const rows = (code = 'QA', percentages = [20, 50, 30]) => ['WW', 'PT', code].map((component_code, i) => ({
  subject_id: 1, subject_name: 'English', subject_code: 'ENG', component_type_id: i + 1,
  component_code, percentage: percentages[i],
}));

test('WS Config preserves saved values and IDs and rejects incomplete or 110% configuration', () => {
  for (const code of ['QA', 'STE', 'EX']) {
    const mapped = mapConfigurationRows(rows(code, [30, 50, 20]))[0];
    assert.equal(mapped.writtenWork, 30);
    assert.equal(mapped.assessment, 20);
    assert.equal(mapped.componentTypeIds.assessment, 3);
    assert.equal(getRowError(mapped), '');
  }
  const suggested = mapConfigurationRows(rows('EX', [null, null, null]))[0];
  assert.equal(suggested.writtenWork, 20);
  assert.equal(suggested.assessment, 30);
  assert.equal(suggested.needsInitialization, true);
  const partial = mapConfigurationRows(rows('QA', [25, null, null]))[0];
  assert.equal(partial.performanceTasks, '');
  assert.equal(getRowError(partial), 'All component weights are required.');
  assert.equal(getRowError(mapConfigurationRows(rows('QA', [30, 50, 30]))[0]), 'Component weights must total 100%.');
  const fractional = mapConfigurationRows(rows('QA', [0.2, 0.5, 0.3]))[0];
  assert.equal(fractional.performanceTasks, 50);
  const duplicates = [...rows(), { ...rows()[2], component_type_id: 4, component_code: 'EX' }];
  assert.match(mapConfigurationRows(duplicates)[0].configurationError, /Duplicate/);
});

test('STs-TE rename preserves current and historical saved weights without adding internal controls', () => {
  const before = mapConfigurationRows(rows('QA', [25, 50, 25]))[0];
  const after = mapConfigurationRows(rows('STE', [25, 50, 25]))[0];
  assert.deepEqual(after, before);
  assert.deepEqual(
    mapConfigurationRows(rows('STE', [30, 50, 20]), { useDefaults: false }),
    mapConfigurationRows(rows('QA', [30, 50, 20]), { useDefaults: false }),
  );
  assert.equal((wsSource.match(/Summative Tests and Term Examination \(STs–TE\)/g) || []).length, 2);
  assert.doesNotMatch(wsSource, /st1Weight|st2Weight|teWeight/);
});

test('examination metadata migration is guarded and does not change IDs, weights or grades', () => {
  const migration = readFileSync(new URL('../backend/migrations/20261003_rename_examination_component.sql', import.meta.url), 'utf8');
  const statements = migration.replace(/--[^\n]*/g, '');
  assert.match(statements, /START TRANSACTION/);
  assert.match(statements, /FOR UPDATE/);
  assert.match(statements, /AND @exam_component_count = 1/);
  assert.match(statements, /REVIEW_REQUIRED/);
  assert.match(statements, /SET component_code = 'STE'/);
  assert.equal((statements.match(/^\s*UPDATE COMPONENT_TYPE/gm) || []).length, 1);
  assert.doesNotMatch(statements, /\b(INSERT|DELETE|ALTER)\b|SET\s+component_type_id/i);
});

test('legacy and renamed examination requests use the existing component ID and activity count', async () => {
  const routePath = require.resolve('../backend/routes/classRecordRoutes.js');
  for (const requestCode of ['QA', 'STE', 'EX']) {
    const handlers = new Map();
    const router = {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      router[method] = (path, handler) => handlers.set(`${method} ${path}`, handler);
    }
    const db = { execute: async (sql, params) => {
      if (sql.includes('FROM SUBJECT_OFFERING so')) return [[{ subject_id: 1, section_id: 1, school_year_id: 1, subject_code: 'ENG', subject_name: 'English' }]];
      if (sql.includes('FROM ACADEMIC_TERM')) return [[{ term_id: 1, term_name: '1st Term', status: 'ongoing' }]];
      if (sql.includes('FROM GRADE_SHEET gs')) return [[{ grade_sheet_id: 1, term_id: 1, lock_status: 'EDITABLE', workflow_status: 'DRAFT' }]];
      if (sql.includes('FROM COMPONENT_TYPE')) {
        assert.deepEqual(params.slice(0, 3), ['QA', 'STE', 'EX']);
        return [[{ component_type_id: 3 }]];
      }
      if (sql.includes('FROM SUBJECT_COMPONENT_WEIGHT')) {
        assert.deepEqual(params, [1, 3, 1]);
        return [[{ subj_comp_weight_id: 103 }]];
      }
      if (sql.includes('SELECT COUNT(*) AS total')) {
        assert.match(sql, /UPPER\(ct.component_code\) IN \(\?,\?,\?\)/);
        assert.deepEqual(params.slice(1, 4), ['QA', 'STE', 'EX']);
        assert.equal((sql.match(/\?/g) || []).length, params.length);
        return [[{ total: 2 }]];
      }
      if (sql.includes('INSERT INTO GRADE_ACTIVITY')) {
        assert.equal(params[1], 103);
        assert.equal(params[3], 'Examinations 3');
        return [{ insertId: 33 }];
      }
      if (sql.includes('FROM GRADE_ACTIVITY ga')) return [[{ component_code: 'STE', max_score: 25 }]];
      throw new Error(`Unexpected query: ${sql}`);
    } };
    delete require.cache[routePath];
    const originalLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (parent?.filename === routePath) {
        if (request === 'express') return { Router: () => router };
        if (request === '../config/db') return db;
        if (['../models/StudentGrade', '../models/AuditEvent', '../services/GradingSheetWorkbookService'].includes(request)) return {};
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try { require(routePath); } finally { Module._load = originalLoad; }
    let status = 200;
    let payload;
    const res = { status(code) { status = code; return this; }, json(value) { payload = value; } };
    await handlers.get('post /assessments')({ body: { subject_offering_id: 1, component_code: requestCode, max_score: 25 } }, res);
    assert.equal(status, 201, JSON.stringify(payload));
    assert.equal(payload.assessment.component_type_id, 3);
    assert.equal(payload.assessment.activity_number, 3);
    assert.equal(payload.total_highest_possible_scores.QA, 25);
  }
});

test('protected grade summaries stay saved, not recalculated after policy rollback', () => {
  assert.equal(isProtectedGradeSheet({ workflowStatus: 'SUBMITTED', lockStatus: 'EDITABLE' }), true);
  assert.equal(isProtectedGradeSheet({ workflowStatus: 'DRAFT', lockStatus: 'TERM_LOCKED' }), true);
  assert.equal(isProtectedGradeSheet({ workflowStatus: 'DRAFT', lockStatus: 'TEMPORARILY_REOPENED' }), false);
  const saved = selectSavedSummary({ initial_grade: 75, quarterly_grade: 79, remarks: 'Passed' });
  assert.equal(frontend.calculateStudentGrades({ savedSummary: saved }).termGrade, 79);
  assert.equal(selectSavedSummary(null).calculationError, 'SAVED_GRADE_REVIEW_REQUIRED');
  assert.equal(frontend.calculateStudentGrades({ savedSummary: selectSavedSummary(null) }).termGrade, '-');
});


async function protectedRead({ lock = 'TERM_LOCKED', workflow = 'DRAFT', missing = false, mapeh = false } = {}) {
  const handlers = new Map();
  const queries = [];
  const router = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (path, handler) => handlers.set(`${method} ${path}`, handler);
  }
  const db = { execute: async (sql) => {
    queries.push(sql);
    assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i, 'Protected GET attempted a mutation');
    if (sql.includes('FROM SUBJECT_OFFERING so')) return [[{ subject_offering_id: 1, subject_id: 1,
      section_id: 1, school_year_id: 1, subject_name: mapeh ? 'MAPEH' : 'English', subject_code: mapeh ? 'MAPEH' : 'ENG' }]];
    if (sql.includes('FROM ACADEMIC_TERM')) return [[{ term_id: 1, term_name: '1st Term', status: 'ongoing',
      grade_submission_deadline_at: '2099-12-31' }]];
    if (sql.includes('FROM GRADE_SHEET gs')) return [[{ grade_sheet_id: 1, term_id: 1, lock_status: lock,
      workflow_status: workflow, grade_submission_deadline_at: '2099-12-31' }]];
    if (sql.includes('FROM SUBJECT_COMPONENT_WEIGHT scw')) return [rows().map((row) => ({ ...row, weight_percentage: row.percentage }))];
    if (sql.includes('FROM GRADE_ACTIVITY ga')) return [[]];
    if (sql.includes('FROM STUDENT_SECTION ss')) return [[{ student_id: 100, student_section_id: 10,
      first_name: 'Example', last_name: 'Learner', sex: 'M' }]];
    throw new Error(`Unexpected database query: ${sql}`);
  } };
  const studentGrade = { findByOfferingAndTerm: async (_offering, _term, component) => missing ? [] : [{
    student_id: 100, initial_grade: 75, quarterly_grade: mapeh && component === null ? 78 : 77, remarks: 'Passed',
  }] };
  const routePath = require.resolve('../backend/routes/classRecordRoutes.js');
  delete require.cache[routePath];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === routePath) {
      if (request === 'express') return { Router: () => router };
      if (request === '../config/db') return db;
      if (request === '../models/StudentGrade') return studentGrade;
      if (request === '../models/AuditEvent' || request === '../services/GradingSheetWorkbookService') return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try { require(routePath); } finally { Module._load = originalLoad; }
  let status = 200;
  let payload;
  const response = { status(code) { status = code; return this; }, json(value) { payload = value; } };
  await handlers.get('get /class-record/:subject_offering_id')({ params: { subject_offering_id: '1' }, query: { term: 'T1' } }, response);
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.is_editable, false);
  assert.equal(payload.is_locked, true);
  return { payload, queries };
}

test('protected Class Record reads retain grades without activity, grade or lock writes', async () => {
  for (const state of [{ lock: 'TERM_LOCKED' }, { lock: 'EDITABLE', workflow: 'SUBMITTED' }]) {
    const { payload } = await protectedRead(state);
    assert.equal(payload.students[0].quarterly_grade, 77);
    assert.equal(payload.students[0].saved_summary.termGrade, 77);
    assert.equal(payload.students[0].calculation_review, null);
  }
  const { payload } = await protectedRead({ missing: true });
  assert.equal(payload.students[0].quarterly_grade, null);
  assert.equal(payload.students[0].calculation_review, 'SAVED_GRADE_REVIEW_REQUIRED');
});

test('protected MAPEH reads retain the saved combined result rather than averaging again', async () => {
  const { payload } = await protectedRead({ mapeh: true });
  assert.equal(payload.students[0].quarterly_grade, 77);
  assert.equal(payload.students[0].final_mapeh_quarterly_grade, 78);
});
