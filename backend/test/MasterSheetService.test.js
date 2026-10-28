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
test("a regular class keeps core subject setup notices without unrelated specializations", () => {
  const result = build(input());
  assert.deepEqual(result.warnings, []);
  assert.equal(result.subjectSetup.configuredSubjectCount, 1);
  assert.equal(result.subjectSetup.templateSubjectCount, 8);
  assert.equal(result.subjectSetup.notOfferedSubjects.length, 7);
  assert.ok(!result.subjectSetup.notOfferedSubjects.includes("English"));
  assert.equal(result.subjects.length, 8);
  assert.equal(result.completeness.expectedTermGrades, 24);
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
  assert.equal(result.subjectSetup.notOfferedSubjects.length, 8);
  assert.equal(result.completeness.completedTermGrades, 0);
  assert.deepEqual(result.warnings, []);
});

for (const [program, specialization] of [['STE', 'research'], ['SPJ', 'journalism'], ['SPA', 'spa_spec']]) {
  test(`${program} includes only its own specialized subject even when other offerings exist`, () => {
    const data = input();
    data.assignment.program_code = program;
    data.offeringRows = MasterSheetService.SUBJECT_DEFINITIONS.map((subject, index) => ({
      subject_offering_id: 130 + index, subject_id: index + 1,
      subject_code: subject.code, subject_name: subject.label,
    }));
    const result = build(data);
    const specializedKeys = ['research', 'journalism', 'spa_spec'];
    assert.deepEqual(result.subjects.filter(subject => specializedKeys.includes(subject.key)).map(subject => subject.key), [specialization]);
    assert.equal(result.subjects.length, 9);
    assert.equal(result.subjectSetup.configuredSubjectCount, 9);
    assert.deepEqual(result.subjectSetup.notOfferedSubjects, []);
    assert.equal(result.completeness.expectedTermGrades, 27);
    assert.equal(result.completeness.expectedSubjectFinals, 9);
    assert.deepEqual(Object.keys(result.students[0].grades), result.subjects.map(subject => subject.key));
  });

  test(`${program} keeps a missing required specialization visible as a setup notice`, () => {
    const data = input();
    data.assignment.program_code = program;
    const result = build(data);
    const subject = result.subjects.find(subject => subject.key === specialization);
    assert.equal(subject.available, false);
    assert(result.subjectSetup.notOfferedSubjects.includes(subject.label));
    assert.equal(result.subjectSetup.notOfferedSubjects.length, 8);
  });
}

for (const [program, specialization] of [['EBEC', null], ['STE', 'research'], ['SPJ', 'journalism'], ['SPA', 'spa_spec']]) {
  test(`${program} averages and completeness use only the class's required subjects`, () => {
    const data = input();
    data.assignment.program_code = program;
    const specializedKeys = ['research', 'journalism', 'spa_spec'];
    data.offeringRows = MasterSheetService.SUBJECT_DEFINITIONS.map((subject, index) => ({
      subject_offering_id: 130 + index, subject_code: subject.code, subject_name: subject.label,
    }));
    data.gradeSheetRows = data.offeringRows.flatMap(offering => [1, 2, 3].map(term => ({
      ...gradeRow(term), grade_sheet_id: offering.subject_offering_id * 10 + term,
      subject_offering_id: offering.subject_offering_id,
    })));
    data.savedGradeRows = data.offeringRows.flatMap((offering, index) => [1, 2, 3].map(term => ({
      ...saved(term, 80), subject_offering_id: offering.subject_offering_id,
      quarterly_grade: specializedKeys.includes(MasterSheetService.SUBJECT_DEFINITIONS[index].key)
        ? MasterSheetService.SUBJECT_DEFINITIONS[index].key === specialization ? 98 : null : 80,
    })));
    const result = build(data);
    const count = specialization ? 9 : 8;
    assert.equal(result.students[0].generalAverage, specialization ? 82 : 80);
    assert.equal(result.completeness.completedTermGrades, count * 3);
    assert.equal(result.completeness.completedSubjectFinals, count);
    assert.equal(result.completeness.completedGeneralAverages, 1);
  });
}

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
