/**
 * DepEd MATATAG (SY 2026-2027) Transmutation Table & Grade Calculation Helpers
 * Standard classroom assessment guidelines for Junior High School.
 */

const TRANSMUTATION_TABLE = [
  { min: 99.50, max: 100.00, grade: 100, transmuted: 100 },
  { min: 97.50, max: 99.49, grade: 99, transmuted: 99 },
  { min: 96.00, max: 97.49, grade: 98, transmuted: 98 },
  { min: 95.00, max: 95.99, grade: 97, transmuted: 97 },
  { min: 94.00, max: 94.99, grade: 96, transmuted: 96 },
  { min: 93.00, max: 93.99, grade: 95, transmuted: 95 },
  { min: 92.00, max: 92.99, grade: 94, transmuted: 94 },
  { min: 91.00, max: 91.99, grade: 93, transmuted: 93 },
  { min: 90.00, max: 90.99, grade: 92, transmuted: 92 },
  { min: 89.00, max: 89.99, grade: 91, transmuted: 91 },
  { min: 88.00, max: 88.99, grade: 90, transmuted: 90 },
  { min: 87.00, max: 87.99, grade: 89, transmuted: 89 },
  { min: 86.00, max: 86.99, grade: 88, transmuted: 88 },
  { min: 85.00, max: 85.99, grade: 87, transmuted: 87 },
  { min: 84.00, max: 84.99, grade: 86, transmuted: 86 },
  { min: 83.00, max: 83.99, grade: 85, transmuted: 85 },
  { min: 82.00, max: 82.99, grade: 84, transmuted: 84 },
  { min: 81.00, max: 81.99, grade: 83, transmuted: 83 },
  { min: 80.00, max: 80.99, grade: 82, transmuted: 82 },
  { min: 79.00, max: 79.99, grade: 81, transmuted: 81 },
  { min: 78.00, max: 78.99, grade: 80, transmuted: 80 },
  { min: 77.00, max: 77.99, grade: 79, transmuted: 79 },
  { min: 76.00, max: 76.99, grade: 78, transmuted: 78 },
  { min: 75.00, max: 75.99, grade: 77, transmuted: 77 },
  { min: 73.00, max: 74.99, grade: 76, transmuted: 76 },
  { min: 70.00, max: 72.99, grade: 75, transmuted: 75 },
  { min: 68.00, max: 69.99, grade: 74, transmuted: 74 },
  { min: 66.00, max: 67.99, grade: 73, transmuted: 73 },
  { min: 64.00, max: 65.99, grade: 72, transmuted: 72 },
  { min: 62.00, max: 63.99, grade: 71, transmuted: 71 },
  { min: 60.00, max: 61.99, grade: 70, transmuted: 70 },
  { min: 58.00, max: 59.99, grade: 69, transmuted: 69 },
  { min: 56.00, max: 57.99, grade: 68, transmuted: 68 },
  { min: 54.00, max: 55.99, grade: 67, transmuted: 67 },
  { min: 52.00, max: 53.99, grade: 66, transmuted: 66 },
  { min: 50.00, max: 51.99, grade: 65, transmuted: 65 },
  { min: 48.00, max: 49.99, grade: 64, transmuted: 64 },
  { min: 46.00, max: 47.99, grade: 63, transmuted: 63 },
  { min: 43.00, max: 45.99, grade: 62, transmuted: 62 },
  { min: 40.00, max: 42.99, grade: 61, transmuted: 61 },
  { min: 0.00, max: 39.99, grade: 60, transmuted: 60 },
];

/**
 * Converts an Initial Grade (0.00 to 100.00) into a Transmuted/Term Grade (60 to 100)
 * based on DepEd MATATAG (SY 2026-2027) standards.
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
 * Default style returns MATATAG standard descriptors (Advancing, Benchmarking, Connecting, Developing, Emerging).
 * @param {number|string} grade
 * @param {'matatag'|'advancing'|'outstanding'|'both'} style
 * @returns {string}
 */
function getGradeDescriptor(grade, style = 'matatag') {
  if (grade === null || grade === undefined || grade === '' || grade === '-') {
    return '-';
  }
  const numericGrade = Number(grade);
  if (isNaN(numericGrade)) return '-';

  if (style === 'outstanding') {
    if (numericGrade >= 90) return 'Outstanding';
    if (numericGrade >= 85) return 'Very Satisfactory';
    if (numericGrade >= 80) return 'Satisfactory';
    if (numericGrade >= 75) return 'Fairly Satisfactory';
    return 'Did Not Meet Expectations';
  }

  if (style === 'both') {
    if (numericGrade >= 90) return 'Outstanding / Advancing';
    if (numericGrade >= 80) return 'Satisfactory / Benchmarking';
    if (numericGrade >= 75) return 'Fairly Satisfactory / Connecting';
    if (numericGrade >= 65) return 'Did Not Meet Expectations / Developing';
    return 'Emerging';
  }

  // Official DepEd MATATAG Descriptors (mandated for SY 2026-2027)
  if (numericGrade >= 90) return 'Advancing';
  if (numericGrade >= 80) return 'Benchmarking';
  if (numericGrade >= 75) return 'Connecting';
  if (numericGrade >= 65) return 'Developing';
  return 'Emerging';
}

/**
 * Calculates student score statistics and grades for a single student across all components.
 * Conforms to DepEd Order No. 8, s. 2015 standards.
 * @param {Object} params
 * @param {Array} params.assessments - list of active assessments [{ assessment_id, component_code, max_score, activity_name }]
 * @param {Object} params.scores - map of assessment_id -> raw_score for this student
 * @param {Object} params.weights - component weights { WW: 20, PT: 50, EX: 30 }
 * @param {Object} [params.examConfig] - optional examination sub-weights & HPS { st1Weight, st2Weight, teWeight }
 */
function calculateStudentGrades({ assessments = [], scores = {}, weights = {}, examConfig = {}, isMapeh = false, isMapehSubject: isMapehSubjectProp = false }) {
  const isMapehSubject = Boolean(
    isMapeh ||
    isMapehSubjectProp ||
    examConfig?.isMapeh ||
    (weights.PT !== undefined && Number(weights.PT) === 60) ||
    (weights.EX !== undefined && Number(weights.EX) === 20 && weights.WW !== undefined && Number(weights.WW) === 20)
  );

  const componentWeights = isMapehSubject
    ? { WW: 20, PT: 60, QA: 20 }
    : {
        WW: weights.WW !== undefined ? Number(weights.WW) : DEFAULT_JHS_WEIGHTS.WW,
        PT: weights.PT !== undefined ? Number(weights.PT) : DEFAULT_JHS_WEIGHTS.PT,
        QA: weights.EX !== undefined
          ? Number(weights.EX)
          : weights.QA !== undefined
          ? Number(weights.QA)
          : (weights.STE !== undefined ? Number(weights.STE) : DEFAULT_JHS_WEIGHTS.EX),
      };

  const defaultExamConfig = isMapehSubject
    ? { st1Weight: 25, st2Weight: 25, teWeight: 25 }
    : { st1Weight: 30, st2Weight: 30, teWeight: 40 };

  const effectiveExamConfig = { ...defaultExamConfig, ...(examConfig || {}) };
  if (
    !isMapehSubject &&
    Number(effectiveExamConfig.st1Weight) === 20 &&
    Number(effectiveExamConfig.st2Weight) === 20 &&
    Number(effectiveExamConfig.teWeight) === 60
  ) {
    effectiveExamConfig.st1Weight = 30;
    effectiveExamConfig.st2Weight = 30;
    effectiveExamConfig.teWeight = 40;
  }

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
    const isST1 = /\b(ST1|SUMMATIVE\s*TEST\s*1|SUMMATIVE\s*1)\b/i.test(actName);
    const isST2 = /\b(ST2|SUMMATIVE\s*TEST\s*2|SUMMATIVE\s*2)\b/i.test(actName);
    const isTE = /\b(TE|TERM\s*EXAM|QUARTERLY\s*ASSESSMENT|QUARTERLY)\b/i.test(actName);

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
      const subWeight = isST1
        ? Number(effectiveExamConfig.st1Weight !== undefined ? effectiveExamConfig.st1Weight : 30)
        : isST2
        ? Number(effectiveExamConfig.st2Weight !== undefined ? effectiveExamConfig.st2Weight : 30)
        : Number(effectiveExamConfig.teWeight !== undefined ? effectiveExamConfig.teWeight : 40);

      examItems.push({
        type: isST1 ? 'ST1' : isST2 ? 'ST2' : 'TE',
        raw: numRaw,
        hasVal,
        maxScore,
        weight: subWeight,
      });
    }
  });

  let totalWS = 0;
  let hasAnyInput = false;

  ['WW', 'PT', 'QA'].forEach((code) => {
    const comp = components[code];
    const weightPct = componentWeights[code] !== undefined ? componentWeights[code] : 0;

    if (code === 'QA' && isMapehSubject) {
      // MAPEH Examination formula: sum of ST1 + ST2 + TE raw scores over total HPS (75) times 20%
      if (comp.totalHps > 0) {
        comp.ps = parseFloat(((comp.totalRaw / comp.totalHps) * 100).toFixed(2));
      } else {
        comp.ps = 0;
      }
      comp.ws = parseFloat((comp.ps * (weightPct / 100)).toFixed(2));
    } else if (code === 'QA' && examItems.length > 0) {
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

