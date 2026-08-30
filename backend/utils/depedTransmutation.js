/**
 * DepEd Order No. 8, s. 2015 Transmutation Table & Grade Calculation Helpers
 * Standard classroom assessment guidelines for Junior High School (Grades 7 to 10).
 */

const TRANSMUTATION_TABLE = [
  { min: 100.0, max: 100.0, grade: 100 },
  { min: 98.4, max: 99.99, grade: 99 },
  { min: 96.8, max: 98.39, grade: 98 },
  { min: 95.2, max: 96.79, grade: 97 },
  { min: 93.6, max: 95.19, grade: 96 },
  { min: 92.0, max: 93.59, grade: 95 },
  { min: 90.4, max: 91.99, grade: 94 },
  { min: 88.8, max: 90.39, grade: 93 },
  { min: 87.2, max: 88.79, grade: 92 },
  { min: 85.6, max: 87.19, grade: 91 },
  { min: 84.0, max: 85.59, grade: 90 },
  { min: 82.4, max: 83.99, grade: 89 },
  { min: 80.8, max: 82.39, grade: 88 },
  { min: 79.2, max: 80.79, grade: 87 },
  { min: 77.6, max: 79.19, grade: 86 },
  { min: 76.0, max: 77.59, grade: 85 },
  { min: 74.4, max: 75.99, grade: 84 },
  { min: 72.8, max: 74.39, grade: 83 },
  { min: 71.2, max: 72.79, grade: 82 },
  { min: 69.6, max: 71.19, grade: 81 },
  { min: 68.0, max: 69.59, grade: 80 },
  { min: 66.4, max: 67.99, grade: 79 },
  { min: 64.8, max: 66.39, grade: 78 },
  { min: 63.2, max: 64.79, grade: 77 },
  { min: 61.6, max: 63.19, grade: 76 },
  { min: 60.0, max: 61.59, grade: 75 },
  { min: 56.0, max: 59.99, grade: 74 },
  { min: 52.0, max: 55.99, grade: 73 },
  { min: 48.0, max: 51.99, grade: 72 },
  { min: 44.0, max: 47.99, grade: 71 },
  { min: 40.0, max: 43.99, grade: 70 },
  { min: 36.0, max: 39.99, grade: 69 },
  { min: 32.0, max: 35.99, grade: 68 },
  { min: 28.0, max: 31.99, grade: 67 },
  { min: 24.0, max: 27.99, grade: 66 },
  { min: 20.0, max: 23.99, grade: 65 },
  { min: 16.0, max: 19.99, grade: 64 },
  { min: 12.0, max: 15.99, grade: 63 },
  { min: 8.0, max: 11.99, grade: 62 },
  { min: 4.0, max: 7.99, grade: 61 },
  { min: 0.0, max: 3.99, grade: 60 },
];

/**
 * Converts an Initial Grade (0.00 to 100.00) into a Transmuted/Quarterly Grade (60 to 100)
 * based on DepEd Order No. 8, s. 2015.
 * @param {number|string|null} initialGrade
 * @returns {number|null}
 */
function transmuteGrade(initialGrade) {
  if (initialGrade === null || initialGrade === undefined || initialGrade === "") {
    return null;
  }

  const numericGrade = Number(initialGrade);
  if (isNaN(numericGrade)) return null;

  if (numericGrade >= 100) return 100;
  if (numericGrade <= 0) return 60;

  const roundedInitial = Math.round(numericGrade * 100) / 100;

  for (const tier of TRANSMUTATION_TABLE) {
    if (roundedInitial >= tier.min && roundedInitial <= tier.max) {
      return tier.grade;
    }
  }

  return 60;
}

const DEFAULT_JHS_WEIGHTS = {
  WW: 30,
  PT: 50,
  QA: 20,
};

/**
 * Calculates student score statistics and grades for a single student across all components.
 * Conforms to DepEd Order No. 8, s. 2015 standards.
 * @param {Object} params
 * @param {Array} params.assessments - list of active assessments [{ assessment_id, component_code, max_score }]
 * @param {Object} params.scores - map of assessment_id -> raw_score for this student
 * @param {Object} params.weights - component weights { WW: 30, PT: 50, QA: 20 }
 */
function calculateStudentGrades({ assessments = [], scores = {}, weights = {} }) {
  const componentWeights = {
    WW: weights.WW !== undefined ? Number(weights.WW) : DEFAULT_JHS_WEIGHTS.WW,
    PT: weights.PT !== undefined ? Number(weights.PT) : DEFAULT_JHS_WEIGHTS.PT,
    QA: weights.QA !== undefined ? Number(weights.QA) : (weights.STE !== undefined ? Number(weights.STE) : DEFAULT_JHS_WEIGHTS.QA),
  };

  const components = {
    WW: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
    PT: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
    QA: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
  };

  (assessments || []).forEach((assessment) => {
    let compCode = assessment.component_code;
    if (compCode === 'STE') compCode = 'QA';
    if (!components[compCode]) {
      components[compCode] = { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false };
    }

    const maxScore = Number(assessment.max_score || assessment.highest_possible_score || 0);
    components[compCode].totalHps += maxScore;

    const raw = scores[assessment.assessment_id || assessment.activity_id];
    if (raw !== undefined && raw !== null && raw !== '') {
      const numRaw = Number(raw);
      if (!isNaN(numRaw)) {
        components[compCode].totalRaw += numRaw;
        components[compCode].hasInput = true;
      }
    }
  });

  let totalWS = 0;
  let hasAnyInput = false;

  ['WW', 'PT', 'QA'].forEach((code) => {
    const comp = components[code];
    const weightPct = componentWeights[code] !== undefined ? componentWeights[code] : 0;

    // DepEd E-Class Record Formula Rules:
    // PS = parseFloat(((Total Score / HPS) * 100).toFixed(2))
    if (comp.totalHps > 0) {
      comp.ps = parseFloat(((comp.totalRaw / comp.totalHps) * 100).toFixed(2));
    } else {
      comp.ps = 0;
    }

    // WS = parseFloat((PS * (Weight Percentage / 100)).toFixed(2))
    comp.ws = parseFloat((comp.ps * (weightPct / 100)).toFixed(2));
    totalWS += comp.ws;

    if (comp.hasInput) {
      hasAnyInput = true;
      comp.isFailing = comp.ps < 60;
    }
  });

  // Initial Grade = WS_WW + WS_PT + WS_QA
  const initialGrade = hasAnyInput ? parseFloat(totalWS.toFixed(2)) : null;
  const quarterlyGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;
  const isFailing = quarterlyGrade !== null && quarterlyGrade < 75;

  return {
    components,
    initialGrade,
    quarterlyGrade,
    isFailing,
    remarks: quarterlyGrade !== null ? (quarterlyGrade >= 75 ? 'Passed' : 'Failed') : null,
  };
}

const calculateStudentSummary = calculateStudentGrades;

module.exports = {
  TRANSMUTATION_TABLE,
  DEFAULT_JHS_WEIGHTS,
  transmuteGrade,
  calculateStudentGrades,
  calculateStudentSummary,
};
