const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require('node:fs');
const vm = require('node:vm');
const moduleFixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../services/MasterSheetService'), 'utf8'), {
  module: moduleFixture, Set, Map, Date, require(name) {
    if (name === '../config/db') return { execute() { throw Error('School database access forbidden'); } };
    if (name === '../utils/encryption') return { decryptLrn: value => value };
    throw Error('Unexpected dependency: ' + name);
  },
});
const MasterSheetService = moduleFixture.exports;
const build = data => JSON.parse(JSON.stringify(MasterSheetService.buildResponse(data)));

const input = () => ({
  assignment: {
    adviser_assignment_id: 23, user_id: 3, section_id: 19,
    school_year_id: 1, section_name: "Banana", grade_level_name: "G8",
    starts_on: "2026-06-01", ends_on: "2027-03-31",
  },
  termRows: [1, 2, 3].map(position => ({ term_id: position, term_name: `Term ${position}` })),
  offeringRows: [{ subject_offering_id: 130, subject_id: 2, subject_code: "ENG", subject_name: "English" }],
  studentRows: [{ student_section_id: 501, student_id: 41, lrn: "100000000001", first_name: "Example", last_name: "Learner", sex: "M" }],
  weightRows: [{ subject_id: 2, component_type_id: 1, percentage: 100 }],
  gradeSheetRows: [], savedGradeRows: [],
});

const gradeRow = (term, sheetId = term) => ({ grade_sheet_id: sheetId, subject_offering_id: 130, term_id: term,
  workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED', submitted_at: '2026-10-04T12:00:00Z' });
const saved = (term, value) => ({ subject_offering_id: 130, student_id: 41, student_section_id: 501,
  term: `T${term}`, initial_grade: value, quarterly_grade: value, mapeh_component: null });
test("one configured subject produces ten setup notices, not ten data warnings", () => {
  const result = build(input());
  assert.deepEqual(result.warnings, []);
  assert.equal(result.subjectSetup.configuredSubjectCount, 1);
  assert.equal(result.subjectSetup.templateSubjectCount, 11);
  assert.equal(result.subjectSetup.notOfferedSubjects.length, 10);
  assert.ok(!result.subjectSetup.notOfferedSubjects.includes("English"));
  assert.equal(result.subjects.length, 11, "Keep the existing report template");
  assert.equal(result.completeness.expectedTermGrades, 33, "Keep existing completeness semantics");
  assert.deepEqual(result.students[0].grades.filipino, { terms: [null, null, null], finalGrade: null });
  assert.equal(result.students[0].generalAverage, null);
});

test("missing setup notices never remove duplicate-record or learner-profile warnings", () => {
  const data = input();
  data.termRows.push({ term_id: 4, term_name: "Term 1" });
  data.offeringRows.push({ ...data.offeringRows[0], subject_offering_id: 131 });
  data.studentRows[0].sex = null;
  const result = build(data);
  assert.deepEqual(result.warnings, [
    "Term 1 has duplicate academic-period records.",
    "English has duplicate subject offerings.",
    "Some learners have no recognized sex value and appear after the female group.",
  ]);
  assert.equal(result.subjectSetup.configuredSubjectCount, 1);
  assert.equal(result.subjects.find(subject => subject.key === "english").available, false);
  assert.deepEqual(result.students[0].grades.english.terms, [null, null, null]);
});

test("duplicate official grade sheets remain an explicit warning and blank grade", () => {
  const data = input();
  data.gradeSheetRows = [gradeRow(1), gradeRow(1, 4)];
  const result = build(data);
  assert.deepEqual(result.warnings, ["English Term 1 has duplicate official grade sheets."]);
  assert.equal(result.students[0].grades.english.terms[0], null);
});

test("accepted grades are copied without recalculation; final/completeness policies stay unchanged", () => {
  const data = input();
  data.gradeSheetRows = [1, 2, 3].map(term => gradeRow(term));
  data.savedGradeRows = [1, 2, 3].map(term => saved(term, 98));
  const expected = 98;
  const result = build(data);
  assert.deepEqual(result.students[0].grades.english, { terms: [expected, expected, expected], finalGrade: expected });
  assert.equal(result.completeness.completedTermGrades, 3);
  assert.equal(result.completeness.completedSubjectFinals, 1);
  assert.equal(result.students[0].generalAverage, null, "Do not compute an average from a partial subject set");
});

test("empty subject setup stays explicit without fabricating grades or warnings", () => {
  const data = input();
  data.offeringRows = [];
  const result = build(data);
  assert.equal(result.subjectSetup.configuredSubjectCount, 0);
  assert.equal(result.subjectSetup.notOfferedSubjects.length, 11);
  assert.equal(result.completeness.completedTermGrades, 0);
  assert.deepEqual(result.warnings, []);
});

test('a term-locked draft is not published', () => {
  const data = input();
  data.gradeSheetRows = [{ ...gradeRow(1), workflow_status: 'DRAFT', submitted_at: null }];
  data.savedGradeRows = [saved(1, 100)];
  assert.equal(build(data).students[0].grades.english.terms[0], null);
});

test('reopening and draft edits retain the previous accepted grade until resubmission', () => {
  const data = input();
  data.gradeSheetRows = [{ ...gradeRow(1), workflow_status: 'DRAFT', lock_status: 'TEMPORARILY_REOPENED' }];
  data.savedGradeRows = [saved(1, 98)];
  assert.equal(build(data).students[0].grades.english.terms[0], 98);
  const beforeRevision = build(data).submissionRevision;
  data.savedGradeRows = [saved(1, 99)];
  data.gradeSheetRows[0].workflow_status = 'SUBMITTED';
  data.gradeSheetRows[0].submitted_at = '2026-10-23T06:00:00Z';
  assert.equal(build(data).students[0].grades.english.terms[0], 99);
  assert.notEqual(build(data).submissionRevision, beforeRevision);
});

test('legacy accepted quarterly grades remain as saved even when their old initial grade is invalid', () => {
  const data = input();
  data.gradeSheetRows = [gradeRow(1)]; data.savedGradeRows = [{ ...saved(1, 98), initial_grade: 102.92 }];
  assert.equal(build(data).students[0].grades.english.terms[0], 98);
  data.gradeSheetRows[0].workflow_status = 'DRAFT';
  assert.equal(build(data).students[0].grades.english.terms[0], 98, 'Corrections retain the last accepted value');
});

test('wrong enrollment, duplicate saved values, and invalid grades never become published numbers', () => {
  const data = input(); data.gradeSheetRows = [gradeRow(1)];
  for (const savedGradeRows of [[{ ...saved(1, 98), student_section_id: 999 }], [saved(1, 98), saved(1, 99)], [saved(1, null)], [saved(1, 101)]]) {
    assert.equal(build({ ...data, savedGradeRows }).students[0].grades.english.terms[0], null);
  }
  data.savedGradeRows = [saved(1, 0)];
  assert.equal(build(data).students[0].grades.english.terms[0], 0, 'A genuine zero is a recorded grade');
  data.savedGradeRows[0].student_section_id = 999;
  assert.equal(build(data).students[0].grades.english.terms[0], null);
});
