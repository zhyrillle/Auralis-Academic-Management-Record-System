/**
 * DepEd Order No. 8, s. 2015 Transmutation Table & Grade Calculation Helpers
 * Standard classroom assessment guidelines for Junior High School (Grades 7 to 10).
 */

const TRANSMUTATION_TABLE = [
  { min: 100.0, max: 100.0, grade: 100, transmuted: 100 },
  { min: 99.60, max: 99.99, grade: 99, transmuted: 99 },
  { min: 99.20, max: 99.59, grade: 98, transmuted: 98 },
  { min: 98.40, max: 99.19, grade: 97, transmuted: 97 },
  { min: 97.60, max: 98.39, grade: 96, transmuted: 96 },
  { min: 96.00, max: 97.59, grade: 95, transmuted: 95 },
  { min: 94.40, max: 95.99, grade: 94, transmuted: 94 },
  { min: 92.80, max: 94.39, grade: 93, transmuted: 93 },
  { min: 91.20, max: 92.79, grade: 92, transmuted: 92 },
  { min: 89.60, max: 91.19, grade: 91, transmuted: 91 },
  // Corrected Transmutation Range Entry for 90 (covers Initial Grade 88.76 -> Term Grade 90)
  { min: 88.00, max: 89.59, grade: 90, transmuted: 90 },
  { min: 86.40, max: 87.99, grade: 89, transmuted: 89 },
  { min: 84.80, max: 86.39, grade: 88, transmuted: 88 },
  { min: 83.20, max: 84.79, grade: 87, transmuted: 87 },
  { min: 81.60, max: 83.19, grade: 86, transmuted: 86 },
  { min: 80.00, max: 81.59, grade: 85, transmuted: 85 },
  { min: 78.40, max: 79.99, grade: 84, transmuted: 84 },
  { min: 76.80, max: 78.39, grade: 83, transmuted: 83 },
  { min: 75.20, max: 76.79, grade: 82, transmuted: 82 },
  { min: 73.60, max: 75.19, grade: 81, transmuted: 81 },
  { min: 72.00, max: 73.59, grade: 80, transmuted: 80 },
  { min: 70.40, max: 71.99, grade: 79, transmuted: 79 },
  { min: 68.80, max: 70.39, grade: 78, transmuted: 78 },
  { min: 67.20, max: 68.79, grade: 77, transmuted: 77 },
  { min: 65.60, max: 67.19, grade: 76, transmuted: 76 },
  { min: 60.00, max: 65.59, grade: 75, transmuted: 75 },
  { min: 56.0, max: 59.99, grade: 74, transmuted: 74 },
  { min: 52.0, max: 55.99, grade: 73, transmuted: 73 },
  { min: 48.0, max: 51.99, grade: 72, transmuted: 72 },
  { min: 44.0, max: 47.99, grade: 71, transmuted: 71 },
  { min: 40.0, max: 43.99, grade: 70, transmuted: 70 },
  { min: 36.0, max: 39.99, grade: 69, transmuted: 69 },
  { min: 32.0, max: 35.99, grade: 68, transmuted: 68 },
  { min: 28.0, max: 31.99, grade: 67, transmuted: 67 },
  { min: 24.0, max: 27.99, grade: 66, transmuted: 66 },
  { min: 20.0, max: 23.99, grade: 65, transmuted: 65 },
  { min: 16.0, max: 19.99, grade: 64, transmuted: 64 },
  { min: 12.0, max: 15.99, grade: 63, transmuted: 63 },
  { min: 8.0, max: 11.99, grade: 62, transmuted: 62 },
  { min: 4.0, max: 7.99, grade: 61, transmuted: 61 },
  { min: 0.0, max: 3.99, grade: 60, transmuted: 60 },
];

/**
 * Converts an Initial Grade (0.00 to 100.00) into a Transmuted/Term Grade (60 to 100)
 * based on DepEd Order No. 8, s. 2015.
 * Accepts decimal precision up to 2 places without premature integer truncation.
 * @param {number|string|null} initialGrade
 * @returns {number|null}
 */
function getTransmutedGrade(initialGrade) {
  if (initialGrade === null || initialGrade === undefined || initialGrade === "") {
    return null;
  }

  const numericGrade = Number(initialGrade);
  if (isNaN(numericGrade)) return null;

  if (numericGrade >= 100) return 100;
  if (numericGrade <= 0) return 60;

  // Preserve decimal precision up to 2 places without premature truncation
  const roundedInitial = Math.round(numericGrade * 100) / 100;

  for (const tier of TRANSMUTATION_TABLE) {
    if (roundedInitial >= tier.min && roundedInitial <= tier.max) {
      return tier.transmuted !== undefined ? tier.transmuted : tier.grade;
    }
  }

  return 60;
}

const transmuteGrade = getTransmutedGrade;

const DEFAULT_JHS_WEIGHTS = {
  WW: 20,
  PT: 50,
  EX: 30,
  QA: 30,
};

/**
 * Maps a final Term Grade (transmuted 60-100) to its official DepEd Grading Descriptor.
 * Default style returns "Advancing" matching the official template.
 * @param {number|string} grade
 * @param {'advancing'|'outstanding'|'both'} style
 * @returns {string}
 */
function getGradeDescriptor(grade, style = 'advancing') {
  if (grade === null || grade === undefined || grade === '' || grade === '-') {
    return '-';
  }
  const numericGrade = Number(grade);
  if (isNaN(numericGrade)) return '-';

  if (numericGrade >= 90) {
    if (style === 'both') return 'Outstanding / Advancing';
    if (style === 'outstanding') return 'Outstanding';
    return 'Advancing';
  }
  if (numericGrade >= 85) return 'Very Satisfactory';
  if (numericGrade >= 80) return 'Satisfactory';
  if (numericGrade >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
}

/**
 * Calculates student score statistics and grades for a single student across all components.
 * Conforms to DepEd Order No. 8, s. 2015 standards.
 * @param {Object} params
 * @param {Array} params.assessments - list of active assessments [{ assessment_id, component_code, max_score, activity_name }]
 * @param {Object} params.scores - map of assessment_id -> raw_score for this student
 * @param {Object} params.weights - component weights { WW: 20, PT: 50, EX: 30 }
 */
function calculateStudentGrades({ assessments = [], scores = {}, weights = {} }) {
  const componentWeights = {
    WW: weights.WW !== undefined ? Number(weights.WW) : DEFAULT_JHS_WEIGHTS.WW,
    PT: weights.PT !== undefined ? Number(weights.PT) : DEFAULT_JHS_WEIGHTS.PT,
    QA: weights.EX !== undefined
      ? Number(weights.EX)
      : weights.QA !== undefined
      ? Number(weights.QA)
      : (weights.STE !== undefined ? Number(weights.STE) : DEFAULT_JHS_WEIGHTS.EX),
  };

  const components = {
    WW: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
    PT: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
    QA: { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false },
  };

  // Check for examination sub-components: ST1, ST2, TE
  const examItems = [];

  (assessments || []).forEach((assessment) => {
    let compCode = assessment.component_code;
    if (compCode === 'STE' || compCode === 'EX') compCode = 'QA';

    const actName = String(assessment.activity_name || assessment.title || '').toUpperCase();
    const isST1 = actName.includes('ST1') || actName.includes('SUMMATIVE TEST 1') || actName.includes('SUMMATIVE 1');
    const isST2 = actName.includes('ST2') || actName.includes('SUMMATIVE TEST 2') || actName.includes('SUMMATIVE 2');
    const isTE = actName.includes('TE') || actName.includes('TERM EXAM') || actName.includes('QUARTERLY ASSESSMENT');

    if (!components[compCode]) {
      components[compCode] = { totalRaw: 0, totalHps: 0, ps: 0, ws: 0, hasInput: false, isFailing: false };
    }

    const maxScore = Number(assessment.max_score || assessment.highest_possible_score || 0);
    components[compCode].totalHps += maxScore;

    const raw = scores[assessment.assessment_id || assessment.activity_id];
    let hasVal = false;
    let numRaw = 0;
    if (raw !== undefined && raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (!isNaN(parsed)) {
        numRaw = parsed;
        hasVal = true;
        components[compCode].totalRaw += numRaw;
        components[compCode].hasInput = true;
      }
    }

    if (compCode === 'QA' && (isST1 || isST2 || isTE)) {
      examItems.push({
        type: isST1 ? 'ST1' : isST2 ? 'ST2' : 'TE',
        raw: numRaw,
        hasVal,
        maxScore,
        weight: isST1 ? 30 : isST2 ? 30 : 40,
      });
    }
  });

  let totalWS = 0;
  let hasAnyInput = false;

  ['WW', 'PT', 'QA'].forEach((code) => {
    const comp = components[code];
    const weightPct = componentWeights[code] !== undefined ? componentWeights[code] : 0;

    if (code === 'QA' && examItems.length > 0) {
      // Specialized Examinations logic with ST1 (30), ST2 (30), TE (40) sub-weights
      let sumExamWS = 0;
      let anyExamInput = false;
      examItems.forEach((item) => {
        if (item.hasVal && item.maxScore > 0) {
          const subWS = parseFloat(((item.raw / item.maxScore) * item.weight).toFixed(2));
          sumExamWS += subWS;
          anyExamInput = true;
        }
      });

      if (anyExamInput) {
        comp.ps = parseFloat(sumExamWS.toFixed(2));
        comp.ws = parseFloat((comp.ps * (weightPct / 100)).toFixed(2));
        comp.hasInput = true;
      } else {
        comp.ps = 0;
        comp.ws = 0;
      }
    } else {
      // Standard formula
      if (comp.totalHps > 0) {
        comp.ps = parseFloat(((comp.totalRaw / comp.totalHps) * 100).toFixed(2));
      } else {
        comp.ps = 0;
      }
      comp.ws = parseFloat((comp.ps * (weightPct / 100)).toFixed(2));
    }

    totalWS += comp.ws;

    if (comp.hasInput) {
      hasAnyInput = true;
      comp.isFailing = comp.ps < 60;
    }
  });

  // Initial Grade = WS_WW + WS_PT + WS_QA/EX
  const initialGrade = hasAnyInput ? parseFloat(totalWS.toFixed(2)) : null;
  const quarterlyGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;
  const termGrade = quarterlyGrade;
  const descriptor = termGrade !== null ? getGradeDescriptor(termGrade) : '-';
  const isFailing = quarterlyGrade !== null && quarterlyGrade < 75;

  return {
    components,
    initialGrade,
    quarterlyGrade,
    termGrade,
    descriptor,
    isFailing,
    remarks: quarterlyGrade !== null ? (quarterlyGrade >= 75 ? 'Passed' : 'Failed') : null,
  };
}

const calculateStudentSummary = calculateStudentGrades;

module.exports = {
  TRANSMUTATION_TABLE,
  DEFAULT_JHS_WEIGHTS,
  getGradeDescriptor,
  getTransmutedGrade,
  transmuteGrade,
  calculateStudentGrades,
  calculateStudentSummary,
};

