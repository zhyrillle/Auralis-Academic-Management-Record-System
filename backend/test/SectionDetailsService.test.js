const test = require("node:test");
const assert = require("node:assert/strict");

const SectionDetailsService = require("../services/SectionDetailsService");

const assignment = {
  section_id: 7,
  section_name: "Mahogany",
  grade_level_name: "Grade 7",
  school_year_id: 3,
  starts_on: "2026-06-01",
  ends_on: "2027-03-31",
  school_year_status: "ONGOING",
  subject_offering_id: 101,
  subject_id: 1,
  subject_code: "ENG",
  subject_name: "English",
};

const termRows = [
  { term_id: 11, term_name: "Term 1", status: "ACTIVE" },
  { term_id: 12, term_name: "Term 2", status: "UPCOMING" },
  { term_id: 13, term_name: "Term 3", status: "UPCOMING" },
];

const studentRows = [
  {
    student_section_id: 501,
    student_id: 41,
    lrn: "100000000001",
    first_name: "Ana",
    middle_name: "Mae",
    last_name: "Cruz",
    extension_name: null,
  },
  {
    student_section_id: 502,
    student_id: 42,
    lrn: "100000000002",
    first_name: "Ben",
    middle_name: null,
    last_name: "Diaz",
    extension_name: null,
  },
];

const offeringRows = [
  { subject_offering_id: 101, subject_id: 1, subject_code: "ENG", subject_name: "English" },
  { subject_offering_id: 102, subject_id: 2, subject_code: "SCI", subject_name: "Science" },
];

const weightRows = [
  { subject_id: 1, component_type_id: 1, percentage: 100 },
  { subject_id: 2, component_type_id: 1, percentage: 100 },
];

const gradeRow = ({ sheetId, offeringId, subjectId, activityId, studentSectionId, rawScore, scoreId }) => ({
  grade_sheet_id: sheetId,
  subject_offering_id: offeringId,
  term_id: 11,
  subject_id: subjectId,
  activity_id: activityId,
  highest_possible_score: 100,
  activity_status: "ACTIVE",
  component_type_id: 1,
  score_id: scoreId,
  student_section_id: studentSectionId,
  raw_score: rawScore,
  score_status: "ENCODED",
});

test("advisory scope averages every complete subject and leaves incomplete learners unavailable", () => {
  const gradeRows = [
    gradeRow({ sheetId: 201, offeringId: 101, subjectId: 1, activityId: 301, studentSectionId: 501, rawScore: 84, scoreId: 401 }),
    gradeRow({ sheetId: 201, offeringId: 101, subjectId: 1, activityId: 301, studentSectionId: 502, rawScore: 84, scoreId: 402 }),
    gradeRow({ sheetId: 202, offeringId: 102, subjectId: 2, activityId: 302, studentSectionId: 501, rawScore: 92, scoreId: 403 }),
  ];

  const result = SectionDetailsService.buildResponse({
    assignmentType: "advisory",
    assignmentId: 9,
    termCode: "T1",
    assignment,
    termRows,
    offeringRows,
    studentRows,
    weightRows,
    gradeRows,
  });

  assert.equal(result.learners[0].termGrade, 93);
  assert.equal(result.learners[0].honorStatus, "WITH_HONORS");
  assert.equal(result.learners[0].performanceBand, "ADVANCING");
  assert.equal(result.learners[1].termGrade, null);
  assert.equal(result.learners[1].gradeState, "INCOMPLETE");
  assert.equal(result.learners[1].honorStatus, "UNAVAILABLE");
  assert.equal(result.summary.completeGradeCount, 1);
  assert.equal(result.summary.incompleteGradeCount, 1);
  assert.equal(result.summary.performanceBands.ADVANCING.count, 1);
  assert.equal(result.summary.atRiskCount, null);
  assert.equal(result.capabilities.atRiskAvailable, false);
  assert.ok(result.learners.every((learner) => learner.riskAssessment === null));
});

test("teaching scope returns the selected subject grade without honor standing", () => {
  const result = SectionDetailsService.buildResponse({
    assignmentType: "teaching",
    assignmentId: 12,
    termCode: "T1",
    assignment,
    termRows,
    offeringRows: [offeringRows[0]],
    studentRows: [studentRows[0]],
    weightRows,
    gradeRows: [
      gradeRow({ sheetId: 201, offeringId: 101, subjectId: 1, activityId: 301, studentSectionId: 501, rawScore: 84, scoreId: 401 }),
    ],
  });

  assert.equal(result.learners[0].termGrade, 90);
  assert.equal(result.learners[0].honorStatus, null);
  assert.deepEqual(result.context.subject, {
    id: 1,
    offeringId: 101,
    code: "ENG",
    name: "English",
  });
});

test("duplicate subject offerings make advisory grades incomplete and produce a warning", () => {
  const result = SectionDetailsService.buildResponse({
    assignmentType: "advisory",
    assignmentId: 9,
    termCode: "T1",
    assignment,
    termRows,
    offeringRows: [
      offeringRows[0],
      { ...offeringRows[0], subject_offering_id: 103 },
    ],
    studentRows: [studentRows[0]],
    weightRows,
    gradeRows: [],
  });

  assert.equal(result.learners[0].gradeState, "INCOMPLETE");
  assert.ok(result.warnings.some((warning) => warning.includes("duplicate subject offerings")));
});

test("duplicate official sheets make grades incomplete and produce a warning", () => {
  const result = SectionDetailsService.buildResponse({
    assignmentType: "teaching",
    assignmentId: 12,
    termCode: "T1",
    assignment,
    termRows,
    offeringRows: [offeringRows[0]],
    studentRows: [studentRows[0]],
    weightRows,
    gradeRows: [
      gradeRow({ sheetId: 201, offeringId: 101, subjectId: 1, activityId: 301, studentSectionId: 501, rawScore: 84, scoreId: 401 }),
      gradeRow({ sheetId: 202, offeringId: 101, subjectId: 1, activityId: 302, studentSectionId: 501, rawScore: 84, scoreId: 402 }),
    ],
  });

  assert.equal(result.learners[0].gradeState, "INCOMPLETE");
  assert.ok(result.warnings.some((warning) => warning.includes("duplicate official sheets")));
});

test("request validation uses stable error codes", () => {
  assert.throws(
    () => SectionDetailsService.validateRequest({ assignmentType: "other", assignmentId: 1, userId: 2, term: "T1" }),
    (error) => error.code === "INVALID_ASSIGNMENT_TYPE" && error.statusCode === 400,
  );
  assert.throws(
    () => SectionDetailsService.validateRequest({ assignmentType: "advisory", assignmentId: 1, userId: 2, term: "T4" }),
    (error) => error.code === "INVALID_TERM" && error.statusCode === 400,
  );
});

test("assignment ownership is enforced before Section Details is returned", async () => {
  const database = {
    execute: async () => [[{ ...assignment, assignment_id: 9, user_id: 99 }]],
  };

  await assert.rejects(
    SectionDetailsService.resolveAssignment({
      assignmentType: "advisory",
      assignmentId: 9,
      userId: 10,
    }, database),
    (error) => error.code === "SECTION_DETAILS_FORBIDDEN" && error.statusCode === 403,
  );
});

test("performance bands and advisory honor thresholds use the documented boundaries", () => {
  assert.equal(SectionDetailsService.getPerformanceBand(90), "ADVANCING");
  assert.equal(SectionDetailsService.getPerformanceBand(89), "BENCHMARKING");
  assert.equal(SectionDetailsService.getPerformanceBand(79), "CONNECTING");
  assert.equal(SectionDetailsService.getPerformanceBand(74), "DEVELOPING");
  assert.equal(SectionDetailsService.getPerformanceBand(64), "EMERGING");
  assert.equal(SectionDetailsService.getPerformanceBand(null), null);

  assert.equal(SectionDetailsService.getHonorStatus(90, true), "WITH_HONORS");
  assert.equal(SectionDetailsService.getHonorStatus(95, true), "WITH_HIGH_HONORS");
  assert.equal(SectionDetailsService.getHonorStatus(98, true), "WITH_HIGHEST_HONORS");
  assert.equal(SectionDetailsService.getHonorStatus(89, true), "NONE");
  assert.equal(SectionDetailsService.getHonorStatus(null, true), "UNAVAILABLE");
  assert.equal(SectionDetailsService.getHonorStatus(98, false), null);
});

test("official-grade query accepts submitted or locked sheets and excludes temporary reopening", async () => {
  let callIndex = 0;
  let officialGradeSql = "";
  const database = {
    execute: async (sql) => {
      callIndex += 1;
      if (callIndex === 1) return [[{ ...assignment, assignment_id: 9, user_id: 10 }]];
      if (callIndex === 2) return [termRows];
      if (callIndex === 3) return [[offeringRows[0]]];
      if (callIndex === 4) return [[]];
      if (callIndex === 5) return [weightRows];
      officialGradeSql = sql;
      return [[]];
    },
  };

  const result = await SectionDetailsService.getSectionDetails({
    assignmentType: "advisory",
    assignmentId: 9,
    userId: 10,
    term: "T1",
  }, database);

  assert.match(officialGradeSql, /workflow_status = 'SUBMITTED'/);
  assert.match(officialGradeSql, /lock_status = 'TERM_LOCKED'/);
  assert.match(officialGradeSql, /lock_status <> 'TEMPORARILY_REOPENED'/);
  assert.equal(result.summary.learnerCount, 0);
});
