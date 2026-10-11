const test = require("node:test");
const assert = require("node:assert/strict");
const MasterSheetService = require("../services/MasterSheetService");
const GradeComputationService = require("../services/GradeComputationService");

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
  gradeRows: [],
});

const gradeRow = (term, sheetId = term) => ({
  grade_sheet_id: sheetId, subject_offering_id: 130, subject_id: 2, term_id: term,
  activity_id: sheetId, component_type_id: 1, highest_possible_score: 100,
  activity_status: "ACTIVE", score_id: sheetId, student_section_id: 501,
  raw_score: 84, score_status: "ENCODED",
});

test("one configured subject produces ten setup notices, not ten data warnings", () => {
  const result = MasterSheetService.buildResponse(input());
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
  const result = MasterSheetService.buildResponse(data);
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
  data.gradeRows = [gradeRow(1), gradeRow(1, 4)];
  const result = MasterSheetService.buildResponse(data);
  assert.deepEqual(result.warnings, ["English Term 1 has duplicate official grade sheets."]);
  assert.equal(result.students[0].grades.english.terms[0], null);
});

test("classifying absent subjects does not change calculated grades or general-average policy", () => {
  const data = input();
  data.gradeRows = [1, 2, 3].map(term => gradeRow(term));
  const expected = GradeComputationService.computeTermGrade({
    weights: data.weightRows,
    activities: [{ activity_id: 1, component_type_id: 1, highest_possible_score: 100,
      status: "ACTIVE", scores: [{ student_section_id: 501, raw_score: 84, score_status: "ENCODED" }] }],
    studentSectionId: 501,
  }).termGrade;
  const result = MasterSheetService.buildResponse(data);
  assert.deepEqual(result.students[0].grades.english, { terms: [expected, expected, expected], finalGrade: expected });
  assert.equal(result.completeness.completedTermGrades, 3);
  assert.equal(result.completeness.completedSubjectFinals, 1);
  assert.equal(result.students[0].generalAverage, null, "Do not compute an average from a partial subject set");
});

test("empty subject setup stays explicit without fabricating grades or warnings", () => {
  const data = input();
  data.offeringRows = [];
  const result = MasterSheetService.buildResponse(data);
  assert.equal(result.subjectSetup.configuredSubjectCount, 0);
  assert.equal(result.subjectSetup.notOfferedSubjects.length, 11);
  assert.equal(result.completeness.completedTermGrades, 0);
  assert.deepEqual(result.warnings, []);
});
