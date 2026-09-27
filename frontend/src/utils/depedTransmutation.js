/**
 * DepEd MATATAG (SY 2026-2027) Transmutation Table & Grade Calculation Helpers (Frontend)
 */

export const TRANSMUTATION_TABLE = [
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
 * Converts an Initial Grade (0.00 to 100.00) into a Transmuted/Term Grade (60 to 100).
 * Accepts decimal precision up to 2 places without premature integer truncation.
 * @param {number|string|null} initialGrade
 * @returns {number|null}
 */
export function getTransmutedGrade(initialGrade) {
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

export const transmuteGrade = getTransmutedGrade;

export const DEFAULT_JHS_WEIGHTS = {
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
export function getGradeDescriptor(grade, style = "matatag") {
  if (grade === null || grade === undefined || grade === "" || grade === "-") {
    return "-";
  }
  const numericGrade = Number(grade);
  if (isNaN(numericGrade)) return "-";

  if (style === "outstanding") {
    if (numericGrade >= 90) return "Outstanding";
    if (numericGrade >= 85) return "Very Satisfactory";
    if (numericGrade >= 80) return "Satisfactory";
    if (numericGrade >= 75) return "Fairly Satisfactory";
    return "Did Not Meet Expectations";
  }

  if (style === "both") {
    if (numericGrade >= 90) return "Outstanding / Advancing";
    if (numericGrade >= 80) return "Satisfactory / Benchmarking";
    if (numericGrade >= 75) return "Fairly Satisfactory / Connecting";
    if (numericGrade >= 65) return "Did Not Meet Expectations / Developing";
    return "Emerging";
  }

  // Official DepEd MATATAG Descriptors (mandated for SY 2026-2027)
  if (numericGrade >= 90) return "Advancing";
  if (numericGrade >= 80) return "Benchmarking";
  if (numericGrade >= 75) return "Connecting";
  if (numericGrade >= 65) return "Developing";
  return "Emerging";
}

/**
 * Calculates row metrics and grades for a student row according to DepEd Order No. 8, s. 2015.
 * Intermediate values (Percentage Score) are rounded to 2 decimal places before computing Weighted Score.
 */
export function calculateStudentGrades({
  writtenWorks = {},
  performanceTasks = {},
  examinations = {},
  quarterlyAssessment = "",
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  quarterlyAssessmentHPS = 50,
  examConfig = {
    st1HPS: 25,
    st2HPS: 25,
    teHPS: 50,
    st1Weight: 30,
    st2Weight: 30,
    teWeight: 40,
  },
  weights = DEFAULT_JHS_WEIGHTS,
  isMapeh = false,
  isMapehSubject = false,
}) {
  const effectiveIsMapeh = Boolean(
    isMapeh ||
    isMapehSubject ||
    examConfig?.isMapeh ||
    (weights?.PT !== undefined && Number(weights.PT) === 60) ||
    (weights?.EX !== undefined && Number(weights.EX) === 20 && weights?.WW !== undefined && Number(weights.WW) === 20)
  );

  const wwWeight = effectiveIsMapeh ? 20 : (weights?.WW !== undefined ? Number(weights.WW) : DEFAULT_JHS_WEIGHTS.WW);
  const ptWeight = effectiveIsMapeh ? 60 : (weights?.PT !== undefined ? Number(weights.PT) : DEFAULT_JHS_WEIGHTS.PT);
  const exWeight = effectiveIsMapeh ? 20 : (weights?.EX !== undefined
    ? Number(weights.EX)
    : weights?.QA !== undefined
    ? Number(weights.QA)
    : DEFAULT_JHS_WEIGHTS.EX);

  // 1. Written Works (Weight = 20%)
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

  // DepEd E-Class Record Formula:
  // PS = parseFloat(((Total Score / HPS) * 100).toFixed(2))
  const wwPS = wwTotalHps > 0 ? parseFloat(((wwTotalRaw / wwTotalHps) * 100).toFixed(2)) : 0;
  // WS = parseFloat((PS * (Weight Percentage / 100)).toFixed(2))
  const wwWS = parseFloat((wwPS * (wwWeight / 100)).toFixed(2));

  // 2. Performance Tasks (Weight = 50% or 60% for MAPEH)
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

  const ptPS = ptTotalHps > 0 ? parseFloat(((ptTotalRaw / ptTotalHps) * 100).toFixed(2)) : 0;
  const ptWS = parseFloat((ptPS * (ptWeight / 100)).toFixed(2));

  // 3. Dynamic & Customizable Examinations (EXs - Weight = 30% or 20% for MAPEH)
  // Sub-assessments: ST1 (Summative Test 1), ST2 (Summative Test 2), TE (Term Exam)
  const st1HPS = Number(examConfig?.st1HPS || (effectiveIsMapeh ? 25 : 30));
  const st2HPS = Number(examConfig?.st2HPS || (effectiveIsMapeh ? 25 : 30));
  const teHPS = Number(examConfig?.teHPS || (effectiveIsMapeh ? 25 : 40));

  let st1Weight;
  let st2Weight;
  let teWeight;

  if (effectiveIsMapeh) {
    const totalExamHps = st1HPS + st2HPS + teHPS;
    if (totalExamHps > 0) {
      st1Weight = parseFloat(((st1HPS / totalExamHps) * exWeight).toFixed(2));
      st2Weight = parseFloat(((st2HPS / totalExamHps) * exWeight).toFixed(2));
      teWeight = parseFloat((exWeight - (st1Weight + st2Weight)).toFixed(2));
    } else {
      st1Weight = 6.67;
      st2Weight = 6.67;
      teWeight = 6.66;
    }
  } else {
    st1Weight = Number(examConfig?.st1Weight !== undefined ? examConfig.st1Weight : 30);
    st2Weight = Number(examConfig?.st2Weight !== undefined ? examConfig.st2Weight : 30);
    teWeight = Number(examConfig?.teWeight !== undefined ? examConfig.teWeight : 40);
    if (st1Weight === 20 && st2Weight === 20 && teWeight === 60) {
      st1Weight = 30;
      st2Weight = 30;
      teWeight = 40;
    }
  }

  // Extract student scores for ST1, ST2, and TE
  const rawST1 = examinations?.st1 !== undefined ? examinations.st1 : examinations?.ST1;
  const rawST2 = examinations?.st2 !== undefined ? examinations.st2 : examinations?.ST2;
  const rawTE = examinations?.te !== undefined ? examinations.te : (examinations?.TE !== undefined ? examinations.TE : quarterlyAssessment);

  let hasST1 = false;
  let hasST2 = false;
  let hasTE = false;
  let numST1 = 0;
  let numST2 = 0;
  let numTE = 0;

  if (rawST1 !== undefined && rawST1 !== null && rawST1 !== "") {
    const n = Number(rawST1);
    if (!isNaN(n)) {
      numST1 = n;
      hasST1 = true;
    }
  }

  if (rawST2 !== undefined && rawST2 !== null && rawST2 !== "") {
    const n = Number(rawST2);
    if (!isNaN(n)) {
      numST2 = n;
      hasST2 = true;
    }
  }

  if (rawTE !== undefined && rawTE !== null && rawTE !== "") {
    const n = Number(rawTE);
    if (!isNaN(n)) {
      numTE = n;
      hasTE = true;
    }
  }

  // Compute individual weighted sub-scores:
  // WS ST1 = (Score_ST1 / HPS_ST1) * Weight_ST1
  // WS ST2 = (Score_ST2 / HPS_ST2) * Weight_ST2
  // WS TE  = (Score_TE  / HPS_TE ) * Weight_TE
  const wsST1 = hasST1 && st1HPS > 0 ? parseFloat(((numST1 / st1HPS) * st1Weight).toFixed(2)) : null;
  const wsST2 = hasST2 && st2HPS > 0 ? parseFloat(((numST2 / st2HPS) * st2Weight).toFixed(2)) : null;
  const wsTE  = hasTE  && teHPS  > 0 ? parseFloat(((numTE  / teHPS ) * teWeight ).toFixed(2)) : null;

  const exHasInput = hasST1 || hasST2 || hasTE;

  let exPS = 0;
  let exWS = 0;

  if (effectiveIsMapeh) {
    // MAPEH Examination formula: sum of ST1 + ST2 + TE raw scores over total HPS (75) times 20%
    const exTotalRaw = numST1 + numST2 + numTE;
    const exTotalHps = st1HPS + st2HPS + teHPS;
    exPS = exHasInput && exTotalHps > 0
      ? parseFloat(((exTotalRaw / exTotalHps) * 100).toFixed(2))
      : 0;
    exWS = exHasInput ? parseFloat((exPS * (exWeight / 100)).toFixed(2)) : 0;
  } else {
    // Standard JHS specialized examinations logic with ST1, ST2, TE sub-weights
    exPS = exHasInput
      ? parseFloat((((wsST1 || 0) + (wsST2 || 0) + (wsTE || 0))).toFixed(2))
      : 0;
    exWS = exHasInput ? parseFloat((exPS * (exWeight / 100)).toFixed(2)) : 0;
  }

  const hasAnyInput = wwHasInput || ptHasInput || exHasInput;

  // Initial Grade = WS_WW + WS_PT + WS_EX
  const initialGrade = hasAnyInput ? parseFloat((wwWS + ptWS + exWS).toFixed(2)) : null;
  const termGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;
  const descriptor = termGrade !== null ? getGradeDescriptor(termGrade) : "-";

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
    examinations: {
      st1: {
        score: hasST1 ? numST1 : "",
        ws: wsST1 !== null ? (Number.isInteger(wsST1) ? String(wsST1) : wsST1.toFixed(2)) : "-",
      },
      st2: {
        score: hasST2 ? numST2 : "",
        ws: wsST2 !== null ? (Number.isInteger(wsST2) ? String(wsST2) : wsST2.toFixed(2)) : "-",
      },
      te: {
        score: hasTE ? numTE : "",
        ws: wsTE !== null ? (Number.isInteger(wsTE) ? String(wsTE) : wsTE.toFixed(2)) : "-",
      },
      totalRaw: exHasInput ? (numST1 + numST2 + numTE) : "-",
      ps: exHasInput ? (Number.isInteger(exPS) ? String(exPS) : exPS.toFixed(2)) : "-",
      ws: exHasInput ? (Number.isInteger(exWS) ? String(exWS) : exWS.toFixed(2)) : "-",
      isFailing: exHasInput && exPS < 60,
    },
    // Backwards-compatibility alias for quarterlyAssessment
    quarterlyAssessment: {
      ps: exHasInput ? (Number.isInteger(exPS) ? String(exPS) : exPS.toFixed(2)) : "-",
      ws: exHasInput ? (Number.isInteger(exWS) ? String(exWS) : exWS.toFixed(2)) : "-",
      isFailing: exHasInput && exPS < 60,
    },
    initialGrade: initialGrade !== null ? initialGrade.toFixed(2) : "-",
    termGrade: termGrade !== null ? termGrade : "-",
    quarterlyGrade: termGrade !== null ? termGrade : "-",
    descriptor,
    isFailing: termGrade !== null && termGrade < 75,
    remarks: termGrade !== null ? (termGrade >= 75 ? "Passed" : "Failed") : "-",
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
  const writtenWS = parseFloat((writtenPS * 0.2).toFixed(2)); // 20% for Written Work

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
  const qaWS = parseFloat((qaPS * 0.3).toFixed(2)); // 30% for Examinations / QA

  const hasAnyInput = hasWrittenInput || hasPtInput || hasQaInput;
  const totalWS = writtenWS + ptWS + qaWS;
  const initialGrade = hasAnyInput ? parseFloat(totalWS.toFixed(2)) : null;
  const quarterlyGrade = initialGrade !== null ? transmuteGrade(initialGrade) : null;
  const descriptor = quarterlyGrade !== null ? getGradeDescriptor(quarterlyGrade) : "-";

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
    termGrade: quarterlyGrade !== null ? quarterlyGrade : "-",
    descriptor,
  };
}
