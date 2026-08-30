/**
 * DepEd Order No. 8, s. 2015 Transmutation Table & Grade Calculation Helpers (Frontend)
 */

export const TRANSMUTATION_TABLE = [
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

export function transmuteGrade(initialGrade) {
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

export const DEFAULT_JHS_WEIGHTS = {
  WW: 30,
  PT: 50,
  QA: 20,
};

/**
 * Calculates row metrics and grades for a student row according to DepEd Order No. 8, s. 2015.
 * Intermediate values (Percentage Score) are rounded to 2 decimal places before computing Weighted Score.
 */
export function calculateStudentGrades({
  writtenWorks = {},
  performanceTasks = {},
  quarterlyAssessment = "",
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  quarterlyAssessmentHPS = 50,
  weights = DEFAULT_JHS_WEIGHTS,
}) {
  const wwWeight = weights.WW !== undefined ? Number(weights.WW) : DEFAULT_JHS_WEIGHTS.WW;
  const ptWeight = weights.PT !== undefined ? Number(weights.PT) : DEFAULT_JHS_WEIGHTS.PT;
  const qaWeight = weights.QA !== undefined ? Number(weights.QA) : DEFAULT_JHS_WEIGHTS.QA;

  // 1. Written Works
  let wwTotalRaw = 0;
  let wwTotalHps = 0;
  let wwHasInput = false;

  writtenWorkColumns.forEach((col) => {
    const maxScore = Number(col.max_score || 0);
    wwTotalHps += maxScore;

    const val = writtenWorks[col.id];
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) {
        wwTotalRaw += num;
        wwHasInput = true;
      }
    }
  });

  // DepEd E-Class Record Formula Rules:
  // PS = parseFloat(((Total Score / HPS) * 100).toFixed(2))
  const wwPS = wwTotalHps > 0 ? parseFloat(((wwTotalRaw / wwTotalHps) * 100).toFixed(2)) : 0;
  // WS = parseFloat((PS * (Weight Percentage / 100)).toFixed(2))
  const wwWS = parseFloat((wwPS * (wwWeight / 100)).toFixed(2));

  // 2. Performance Tasks
  let ptTotalRaw = 0;
  let ptTotalHps = 0;
  let ptHasInput = false;

  performanceTaskColumns.forEach((col) => {
    const maxScore = Number(col.max_score || 0);
    ptTotalHps += maxScore;

    const val = performanceTasks[col.id];
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) {
        ptTotalRaw += num;
        ptHasInput = true;
      }
    }
  });

  // PS = parseFloat(((Total Score / HPS) * 100).toFixed(2))
  const ptPS = ptTotalHps > 0 ? parseFloat(((ptTotalRaw / ptTotalHps) * 100).toFixed(2)) : 0;
  // WS = parseFloat((PS * (Weight Percentage / 100)).toFixed(2))
  const ptWS = parseFloat((ptPS * (ptWeight / 100)).toFixed(2));

  // 3. Quarterly Assessment
  let qaTotalRaw = 0;
  let qaTotalHps = Number(quarterlyAssessmentHPS) || 50;
  let qaHasInput = false;

  if (quarterlyAssessment !== undefined && quarterlyAssessment !== null && quarterlyAssessment !== "") {
    const num = Number(quarterlyAssessment);
    if (!isNaN(num)) {
      qaTotalRaw = num;
      qaHasInput = true;
    }
  }

  // PS = parseFloat(((Total Score / HPS) * 100).toFixed(2))
  const qaPS = qaTotalHps > 0 ? parseFloat(((qaTotalRaw / qaTotalHps) * 100).toFixed(2)) : 0;
  // WS = parseFloat((PS * (Weight Percentage / 100)).toFixed(2))
  const qaWS = parseFloat((qaPS * (qaWeight / 100)).toFixed(2));

  const hasAnyInput = wwHasInput || ptHasInput || qaHasInput;
  // Initial Grade = WS_WW + WS_PT + WS_QA
  const initialGrade = hasAnyInput ? parseFloat((wwWS + ptWS + qaWS).toFixed(2)) : null;
  const quarterlyGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;

  return {
    writtenWorks: {
      total: wwHasInput ? wwTotalRaw : "-",
      ps: wwHasInput ? wwPS.toFixed(2) : "-",
      ws: wwHasInput ? wwWS.toFixed(2) : "-",
      isFailing: wwHasInput && wwPS < 60,
    },
    performanceTasks: {
      total: ptHasInput ? ptTotalRaw : "-",
      ps: ptHasInput ? ptPS.toFixed(2) : "-",
      ws: ptHasInput ? ptWS.toFixed(2) : "-",
      isFailing: ptHasInput && ptPS < 60,
    },
    quarterlyAssessment: {
      ps: qaHasInput ? qaPS.toFixed(2) : "-",
      ws: qaHasInput ? qaWS.toFixed(2) : "-",
      isFailing: qaHasInput && qaPS < 60,
    },
    initialGrade: initialGrade !== null ? initialGrade.toFixed(2) : "-",
    quarterlyGrade: quarterlyGrade !== null ? quarterlyGrade : "-",
    isFailing: quarterlyGrade !== null && quarterlyGrade < 75,
    remarks: quarterlyGrade !== null ? (quarterlyGrade >= 75 ? "Passed" : "Failed") : "-",
  };
}

export const calculateStudentRow = calculateStudentGrades;

export function computeStudentGrades(
  studentGrades = {},
  writtenCols = [],
  ptCols = [],
  quarterlyAssessmentHPS = 0
) {
  const wwScores = studentGrades.writtenWork || {};
  const ptScores = studentGrades.performanceTask || {};
  const qaScore = studentGrades.quarterlyAssessment;

  let writtenTotal = 0;
  let writtenTotalHps = 0;
  let hasWrittenInput = false;

  writtenCols.forEach((col) => {
    const max = Number(col.maxScore || 0);
    writtenTotalHps += max;
    const val = wwScores[col.key];
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) {
        writtenTotal += num;
        hasWrittenInput = true;
      }
    }
  });

  const writtenPS = writtenTotalHps > 0 ? parseFloat(((writtenTotal / writtenTotalHps) * 100).toFixed(2)) : 0;
  const writtenWS = parseFloat((writtenPS * 0.3).toFixed(2)); // 30% for Written Work

  let ptTotal = 0;
  let ptTotalHps = 0;
  let hasPtInput = false;

  ptCols.forEach((col) => {
    const max = Number(col.maxScore || 0);
    ptTotalHps += max;
    const val = ptScores[col.key];
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) {
        ptTotal += num;
        hasPtInput = true;
      }
    }
  });

  const ptPS = ptTotalHps > 0 ? parseFloat(((ptTotal / ptTotalHps) * 100).toFixed(2)) : 0;
  const ptWS = parseFloat((ptPS * 0.5).toFixed(2)); // 50% for Performance Tasks

  let qaTotal = 0;
  const qaTotalHps = Number(quarterlyAssessmentHPS) || 0;
  let hasQaInput = false;

  if (qaScore !== undefined && qaScore !== null && qaScore !== "") {
    const num = Number(qaScore);
    if (!isNaN(num)) {
      qaTotal = num;
      hasQaInput = true;
    }
  }

  const qaPS = qaTotalHps > 0 ? parseFloat(((qaTotal / qaTotalHps) * 100).toFixed(2)) : 0;
  const qaWS = parseFloat((qaPS * 0.2).toFixed(2)); // 20% for Quarterly Assessment

  const hasAnyInput = hasWrittenInput || hasPtInput || hasQaInput;
  const totalWS = writtenWS + ptWS + qaWS;
  const initialGrade = hasAnyInput ? parseFloat(totalWS.toFixed(2)) : null;
  const quarterlyGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;

  return {
    writtenTotal: hasWrittenInput ? writtenTotal : 0,
    writtenPS: hasWrittenInput ? writtenPS.toFixed(2) : "-",
    writtenWS: hasWrittenInput ? writtenWS.toFixed(2) : "-",
    ptTotal: hasPtInput ? ptTotal : 0,
    ptPS: hasPtInput ? ptPS.toFixed(2) : "-",
    ptWS: hasPtInput ? ptWS.toFixed(2) : "-",
    qaPS: hasQaInput ? qaPS.toFixed(2) : "-",
    qaWS: hasQaInput ? qaWS.toFixed(2) : "-",
    initialGrade: initialGrade !== null ? initialGrade.toFixed(2) : "-",
    quarterlyGrade: quarterlyGrade !== null ? quarterlyGrade : "-",
  };
}
