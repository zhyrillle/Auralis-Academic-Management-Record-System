const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computeTermGrade,
  transmuteInitialGrade,
} = require("../services/GradeComputationService");

const weights = [
  { component_type_id: 1, percentage: 30 },
  { component_type_id: 2, percentage: 50 },
  { component_type_id: 3, percentage: 20 },
];

const activity = (id, componentTypeId, highestPossibleScore, score) => ({
  activity_id: id,
  component_type_id: componentTypeId,
  highest_possible_score: highestPossibleScore,
  status: "ACTIVE",
  scores: [{ student_section_id: 10, ...score }],
});

test("transmutes official DepEd boundary values", () => {
  assert.equal(transmuteInitialGrade(100), 100);
  assert.equal(transmuteInitialGrade(98.4), 99);
  assert.equal(transmuteInitialGrade(60), 75);
  assert.equal(transmuteInitialGrade(3.99), 60);
});

test("computes a complete weighted term grade", () => {
  const result = computeTermGrade({
    weights,
    studentSectionId: 10,
    activities: [
      activity(1, 1, 20, { raw_score: 18, score_status: "ENCODED" }),
      activity(2, 2, 50, { raw_score: 40, score_status: "ENCODED" }),
      activity(3, 3, 25, { raw_score: 20, score_status: "ENCODED" }),
    ],
  });

  assert.equal(result.complete, true);
  assert.equal(result.initialGrade, 83);
  assert.equal(result.termGrade, 89);
});

test("counts MISSING as zero and removes EXCUSED from both totals", () => {
  const result = computeTermGrade({
    weights,
    studentSectionId: 10,
    activities: [
      activity(1, 1, 20, { raw_score: null, score_status: "MISSING" }),
      activity(2, 1, 20, { raw_score: 20, score_status: "EXCUSED" }),
      activity(3, 2, 20, { raw_score: 20, score_status: "ENCODED" }),
      activity(4, 3, 20, { raw_score: 20, score_status: "ENCODED" }),
    ],
  });

  assert.equal(result.complete, true);
  assert.equal(result.initialGrade, 70);
  assert.equal(result.termGrade, 81);
});

test("leaves incomplete grades blank for not encoded and duplicate scores", () => {
  const notEncoded = computeTermGrade({
    weights,
    studentSectionId: 10,
    activities: [
      activity(1, 1, 20, { raw_score: null, score_status: "NOT_ENCODED" }),
      activity(2, 2, 20, { raw_score: 20, score_status: "ENCODED" }),
      activity(3, 3, 20, { raw_score: 20, score_status: "ENCODED" }),
    ],
  });
  assert.equal(notEncoded.complete, false);
  assert.equal(notEncoded.reason, "SCORE_NOT_ENCODED");

  const duplicateActivity = activity(1, 1, 20, {
    raw_score: 10,
    score_status: "ENCODED",
  });
  duplicateActivity.scores.push({
    student_section_id: 10,
    raw_score: 11,
    score_status: "ENCODED",
  });
  const duplicate = computeTermGrade({
    weights,
    studentSectionId: 10,
    activities: [
      duplicateActivity,
      activity(2, 2, 20, { raw_score: 20, score_status: "ENCODED" }),
      activity(3, 3, 20, { raw_score: 20, score_status: "ENCODED" }),
    ],
  });
  assert.equal(duplicate.complete, false);
  assert.equal(duplicate.reason, "DUPLICATE_SCORES");
});

test("rejects incomplete and invalid weight configurations", () => {
  const result = computeTermGrade({
    weights: [
      { component_type_id: 1, percentage: 30 },
      { component_type_id: 2, percentage: 50 },
    ],
    studentSectionId: 10,
    activities: [],
  });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "INVALID_WEIGHT_TOTAL");
});
