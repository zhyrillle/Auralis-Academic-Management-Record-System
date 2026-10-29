const test = require('node:test');
const assert = require('node:assert/strict');
const Service = require('../services/SectionDetailsService');

const assignment = { assignment_id: 9, user_id: 10, section_id: 7, section_name: 'Demo',
  grade_level_name: 'Grade 7', school_year_id: 3, starts_on: '2026-06-01', ends_on: '2027-03-31',
  school_year_status: 'ONGOING', program_code: 'EBEC', subject_offering_id: 101,
  subject_id: 1, subject_code: 'ENG', subject_name: 'English' };
const termRows = [1, 2, 3].map(term => ({ term_id: 10 + term, term_name: `Term ${term}`, status: 'ACTIVE' }));
const studentRows = [1, 2].map(index => ({ student_section_id: 500 + index, student_id: 40 + index,
  first_name: `Learner ${index}`, last_name: 'Demo', lrn: `10000000000${index}` }));
const offeringRows = ['ENG', 'SCI', 'FIL', 'MATH', 'AP', 'TLE', 'MAPEH', 'ESP'].map((code, index) => ({
  subject_offering_id: 101 + index, subject_id: 1 + index, subject_code: code, subject_name: code === 'ENG' ? 'English' : code,
}));
const savedGrade = (offering, enrollment = 501, grade = 95, component = null) => ({
  student_grade_id: Number(`${enrollment}${offering.subject_offering_id}${component === 'MA' ? 1 : component === 'PEH' ? 2 : 0}`),
  subject_offering_id: offering.subject_offering_id, student_section_id: enrollment, saved_enrollment_id: enrollment,
  quarterly_grade: grade, mapeh_component: component, grade_sheet_id: 200 + offering.subject_id,
  workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED',
});
const completeGrades = (enrollment = 501, grade = 95) => offeringRows.flatMap(offering =>
  offering.subject_code === 'MAPEH' ? ['MA', 'PEH', null].map(component => savedGrade(offering, enrollment, grade, component))
    : [savedGrade(offering, enrollment, grade)]);
const response = (changes = {}) => Service.buildResponse({ assignmentType: 'advisory', assignmentId: 9, termCode: 'T1',
  assignment, termRows, offeringRows, studentRows, gradeRows: completeGrades(), ...changes });
const englishResponse = (changes = {}) => response({ assignmentType: 'teaching', offeringRows: [offeringRows[0]], ...changes });
const profile = (enrollment, changes = {}) => ({ studentSectionId: enrollment, sectionId: 7, schoolYearId: 3, ...changes });
const preview = (students = [], unavailable = [], sourceTerm = 'T1') => ({ sourceTerm,
  targetTerm: `T${Number(sourceTerm[1]) + 1}`, students, unavailable });

test('honor standing uses saved official grades once per learning area, not a second transmutation', () => {
  const result = response();
  assert.equal(result.learners[0].termGrade, 95);
  assert.equal(result.learners[0].honorStatus, 'WITH_HIGH_HONORS');
  assert.equal(result.learners[0].gradeSummary.requiredSubjects, 8);
  assert.equal(result.learners[0].gradeSummary.completeSubjects, 8);
  assert.equal(result.learners[1].termGrade, null);
  assert.equal(result.learners[1].honorStatus, 'AWAITING_GRADES');
  assert.equal(result.summary.completeGradeCount, 1);
  assert.equal(result.summary.incompleteGradeCount, 1);
});

test('a high average cannot award honors while any learning area has a failing grade', () => {
  const rows = completeGrades(501, 100);
  rows.find(row => row.subject_offering_id === 101).quarterly_grade = 74;
  const result = response({ gradeRows: rows });
  assert.equal(result.learners[0].termGrade, 97);
  assert.equal(result.learners[0].honorStatus, 'NONE');
});

test('missing subject setup and specialization cannot silently inflate honor standing', () => {
  const result = response({ offeringRows: [offeringRows[0]] });
  assert.equal(result.learners[0].termGrade, null);
  assert.equal(result.learners[0].honorStatus, 'NEEDS_REVIEW');
  assert.equal(result.learners[0].gradeSummary.requiredSubjects, 8);
  const ste = response({ assignment: { ...assignment, program_code: 'STE' } });
  assert.equal(ste.learners[0].gradeSummary.requiredSubjects, 9);
  assert.ok(ste.learners[0].gradeSummary.missingSubjects.some(row => row.subject === 'Research'));
});

test('MAPEH requires both components, counts once, and rejects a stale combined grade', () => {
  const rows = completeGrades();
  const ma = rows.find(row => row.mapeh_component === 'MA');
  ma.quarterly_grade = 91;
  assert.equal(response({ gradeRows: rows }).learners[0].honorStatus, 'NEEDS_REVIEW');
  const all = rows.find(row => row.subject_offering_id === ma.subject_offering_id && row.mapeh_component === null);
  all.quarterly_grade = 93;
  assert.equal(response({ gradeRows: rows }).learners[0].termGrade, 95);
  assert.equal(response({ gradeRows: rows.filter(row => row !== ma) }).learners[0].honorStatus, 'AWAITING_GRADES');
});

test('unsubmitted or reopened saved grades cannot produce a complete standing', () => {
  for (const change of [{ workflow_status: 'DRAFT', lock_status: 'EDITABLE' }, { lock_status: 'TEMPORARILY_REOPENED' }, { quarterly_grade: null }]) {
    const rows = completeGrades(); Object.assign(rows[0], change);
    const result = response({ gradeRows: rows });
    assert.equal(result.learners[0].termGrade, null);
    assert.equal(result.learners[0].honorStatus, 'AWAITING_GRADES');
  }
  const rows = completeGrades(); rows[0].lock_status = 'EDITABLE';
  assert.equal(response({ gradeRows: rows }).learners[0].termGrade, 95); // submitted is official for this view
});

test('duplicate sheets, saved grades and equivalent subject offerings need review', () => {
  const rows = completeGrades();
  for (const extra of [{ ...rows[0], grade_sheet_id: 999 }, { ...rows[0], student_grade_id: 999 }]) {
    assert.equal(response({ gradeRows: [...rows, extra] }).learners[0].honorStatus, 'NEEDS_REVIEW');
  }
  assert.equal(response({ offeringRows: [...offeringRows, { ...offeringRows[0], subject_id: 999, subject_offering_id: 999 }] }).learners[0].honorStatus, 'NEEDS_REVIEW');
});

test('saved grades tied to another enrollment never leak into this learner; legacy null remains scoped', () => {
  const rows = completeGrades(); rows[0].saved_enrollment_id = 888;
  assert.equal(response({ gradeRows: rows }).learners[0].termGrade, null);
  rows[0].saved_enrollment_id = null;
  assert.equal(response({ gradeRows: rows }).learners[0].termGrade, 95);
});

test('teaching scope returns saved subject grade and never applies advisory honors', () => {
  const result = response({ assignmentType: 'teaching', offeringRows: [offeringRows[0]], gradeRows: [savedGrade(offeringRows[0], 501, 84)] });
  assert.equal(result.learners[0].termGrade, 84);
  assert.equal(result.learners[0].honorStatus, null);
});

test('honor and performance boundary values remain distinct', () => {
  assert.equal(Service.getPerformanceBand(89), 'BENCHMARKING');
  assert.equal(Service.getPerformanceBand(null), null);
  for (const [grade, expected] of [[89, 'NONE'], [90, 'WITH_HONORS'], [95, 'WITH_HIGH_HONORS'], [98, 'WITH_HIGHEST_HONORS']]) {
    assert.equal(Service.getHonorStatus(grade, true), expected);
  }
  assert.equal(Service.getHonorStatus(null, true), 'AWAITING_GRADES');
  assert.equal(Service.getHonorStatus(98, false), null);
});

test('English teaching risk reuses the owned offering/section/year pipeline, matches enrollment, exposes labels only', async () => {
  let call;
  const predictionService = { getPreview: async (filters, options) => {
    call = { filters, options };
    return preview([profile(501, { riskLevel: 'medium', riskScore: 62, score: .62, modelInputs: { previous_final_grade: 95 } }),
      profile(502, { sectionId: 88, riskLevel: 'high' })], [profile(502, { reason: 'English scores are incomplete.' })]);
  } };
  const database = {};
  const result = await Service.attachPredictions(englishResponse(), assignment, database, predictionService);
  assert.deepEqual(call.filters, { schoolYear: '2026-2027', term: 'T2' });
  assert.deepEqual(call.options.scope, { sectionId: 7, schoolYearId: 3, subjectOfferingId: 101 });
  assert.equal(call.options.database, database);
  assert.deepEqual(result.learners[0].riskAssessment, { status: 'available', riskLevel: 'medium', label: 'Medium Risk', targetTerm: 'T2' });
  assert.equal(result.learners[1].riskAssessment.label, 'Awaiting records');
  assert.equal(result.summary.atRiskCount, 1);
  assert.deepEqual(result.summary.riskCounts, { low: 0, medium: 1, high: 0, awaiting: 1 });
});

test('insufficient attendance and screening propagate to class details without risk labels', async () => {
  const result = await Service.attachPredictions(englishResponse(), assignment, {}, {
    getPreview: async () => preview([], [
      profile(501, { status: 'insufficient_data', missingSources: ['attendance'], reason: 'Attendance needed: 3 weekdays missing.' }),
      profile(502, { status: 'insufficient_data', missingSources: ['attendance', 'phil_iri'], reason: 'Attendance and PHIL-IRI needed.' }),
    ]),
  });
  assert.equal(result.learners[0].riskAssessment.status, 'insufficient_data');
  assert.equal(result.learners[0].riskAssessment.label, 'Insufficient data');
  assert.deepEqual(result.learners[0].riskAssessment.missingSources, ['attendance']);
  assert.match(result.learners[0].riskAssessment.reason, /3 weekdays/);
  assert.deepEqual(result.learners[1].riskAssessment.missingSources, ['attendance', 'phil_iri']);
  assert.ok(result.learners.every(row => row.riskAssessment.riskLevel === undefined));
  assert.deepEqual(result.summary.riskCounts, { low: 0, medium: 0, high: 0, awaiting: 2 });
  assert.equal(result.summary.atRiskCount, 0);
  assert.equal(result.learners[0].termGrade, 95);
});

test('all-subject advisory standing does not request or expose an English risk count', async () => {
  let calls = 0;
  const result = await Service.attachPredictions(response(), assignment, {}, {
    getPreview: async () => { calls++; throw new Error('Advisory must not invoke the model'); },
  });
  assert.equal(calls, 0);
  assert.equal(result.capabilities.atRiskApplicable, false);
  assert.equal(result.capabilities.atRiskAvailable, false);
  assert.equal(result.summary.atRiskCount, null);
  assert.equal(result.summary.riskCounts, undefined);
  assert.equal(result.learners[0].honorStatus, 'WITH_HIGH_HONORS');
  assert.equal(result.learners[0].termGrade, 95);
  assert.ok(result.learners.every(learner => learner.riskAssessment.status === 'not_applicable'));
});

test('Term 2 predicts Term 3, Term 3 never invents a current-term or next-year prediction', async () => {
  let calls = 0;
  const predictionService = { getPreview: async filters => { calls++; assert.equal(filters.term, 'T3'); return preview([], [], 'T2'); } };
  const t2 = await Service.attachPredictions(englishResponse({ termCode: 'T2' }), assignment, {}, predictionService);
  assert.equal(t2.riskContext.targetTerm, 'T3');
  const t3 = await Service.attachPredictions(englishResponse({ termCode: 'T3' }), assignment, {}, predictionService);
  assert.equal(t3.learners[0].riskAssessment.label, 'No next term');
  assert.equal(t3.summary.atRiskCount, null);
  assert.equal(calls, 1);
});

test('non-English teaching assignments do not access English records; English teaching is offering-scoped', async () => {
  const predictionService = { getPreview: async (_filters, options) => {
    assert.equal(options.scope.subjectOfferingId, 101); return preview();
  } };
  const english = response({ assignmentType: 'teaching', offeringRows: [offeringRows[0]] });
  await Service.attachPredictions(english, assignment, {}, predictionService);
  assert.equal(english.capabilities.atRiskApplicable, true);
  const scienceAssignment = { ...assignment, subject_code: 'SCI', subject_name: 'Science' };
  const science = await Service.attachPredictions(response({ assignmentType: 'teaching', assignment: scienceAssignment }), scienceAssignment, {}, {
    getPreview: async () => { throw new Error('Must not run'); },
  });
  assert.equal(science.learners[0].riskAssessment.label, 'English only');
  assert.equal(science.capabilities.atRiskApplicable, false);
});

test('model failures keep English grades usable and do not become a zero risk count', async () => {
  const result = await Service.attachPredictions(englishResponse(), assignment, {}, { getPreview: async () => { throw new Error('Model unavailable'); } });
  assert.equal(result.learners[0].termGrade, 95);
  assert.equal(result.learners[0].riskAssessment.status, 'unavailable');
  assert.equal(result.summary.atRiskCount, null);
  assert.equal(result.capabilities.atRiskAvailable, false);
});

test('conflicting or duplicate predictions are review states, never a valid Low label', async () => {
  const result = await Service.attachPredictions(englishResponse(), assignment, {}, { getPreview: async () => preview([
    profile(501, { riskLevel: 'low' }), profile(501, { riskLevel: 'high' }), profile(502, { riskLevel: 'low' }),
  ], [profile(502, { reason: 'Duplicate English records.' })]) });
  assert.ok(result.learners.every(row => row.riskAssessment.status === 'needs_review'));
  assert.equal(result.summary.riskCounts.low, 0);
});

test('missing or duplicate target terms never invoke a model on an ambiguous calendar', async () => {
  for (const terms of [termRows.filter(row => row.term_id !== 12), [...termRows, { ...termRows[1], term_id: 99 }]]) {
    const result = await Service.attachPredictions(englishResponse({ termRows: terms }), assignment, {}, {
      getPreview: async () => { throw new Error('Must not run'); },
    });
    assert.equal(result.riskContext.status, 'needs_review');
    assert.equal(result.summary.atRiskCount, null);
  }
});

test('authorization runs before any grades or prediction reads', async () => {
  let reads = 0, predictionCalls = 0;
  const database = { execute: async () => { reads++; return [[{ ...assignment, user_id: 99 }]]; } };
  await assert.rejects(Service.getSectionDetails({ assignmentType: 'advisory', assignmentId: 9, userId: 10, term: 'T1' }, database,
    { predictionService: { getPreview: async () => { predictionCalls++; } } }), error => error.code === 'SECTION_DETAILS_FORBIDDEN');
  assert.equal(reads, 1); assert.equal(predictionCalls, 0);
});

test('section-grade read is bounded by term, year, section and enrollment, without recalculation/DDL', async () => {
  const calls = [];
  const database = { execute: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM SECTION_ADVISER_ASSIGNMENT')) return [[assignment]];
    if (sql.includes('FROM ACADEMIC_TERM')) return [termRows];
    if (sql.includes('FROM SUBJECT_OFFERING')) return [offeringRows];
    if (sql.includes('FROM STUDENT_SECTION')) return [studentRows];
    if (sql.includes('FROM STUDENT_GRADE')) return [completeGrades()];
    throw new Error('Unexpected query');
  } };
  const result = await Service.getSectionDetails({ assignmentType: 'advisory', assignmentId: 9, userId: 10, term: 'T1' }, database,
    { predictionService: { getPreview: async () => preview() } });
  const gradeRead = calls.find(call => call.sql.includes('FROM STUDENT_GRADE'));
  assert.deepEqual(gradeRead.params, [11, 7, 3, 'T1']);
  assert.match(gradeRead.sql, /sg\.student_section_id = ss\.student_section_id OR sg\.student_section_id IS NULL/);
  assert.ok(calls.every(call => /^\s*SELECT/.test(call.sql)));
  assert.equal(result.learners[0].termGrade, 95);
});

test('bad requests have stable errors and ambiguous selected terms do not award honors', () => {
  assert.throws(() => Service.validateRequest({ assignmentType: 'other', assignmentId: 1, userId: 2, term: 'T1' }), error => error.code === 'INVALID_ASSIGNMENT_TYPE');
  assert.throws(() => Service.validateRequest({ assignmentType: 'advisory', assignmentId: 1, userId: 2, term: 'T4' }), error => error.code === 'INVALID_TERM');
  assert.equal(response({ termRows: [...termRows, { ...termRows[0], term_id: 99 }] }).learners[0].honorStatus, 'NEEDS_REVIEW');
});
