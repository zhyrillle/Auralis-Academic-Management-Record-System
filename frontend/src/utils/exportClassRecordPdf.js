import { transmuteGrade, getGradeDescriptor } from "./depedTransmutation";

/**
 * Calculates and formats class record datasets for official DepEd Order No. 8, s. 2015 layout.
 */
export function formatClassRecordData({
  metadata = {},
  weights = { WW: 20, PT: 50, EX: 30, QA: 30 },
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  examConfig = {
    st1HPS: 25,
    st2HPS: 25,
    teHPS: 50,
    st1Weight: 30,
    st2Weight: 30,
    teWeight: 40,
  },
  quarterlyAssessmentHPS = 50,
  students = [],
  grades = {},
}) {
  const wwWeight = weights.WW !== undefined ? Number(weights.WW) : 20;
  const ptWeight = weights.PT !== undefined ? Number(weights.PT) : 50;
  const exWeight = weights.EX !== undefined ? Number(weights.EX) : (weights.QA !== undefined ? Number(weights.QA) : 30);

  // 1. Calculate Highest Possible Scores (HPS)
  const totalWWHps = writtenWorkColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0);
  const totalPTHps = performanceTaskColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0);

  const st1HPS = Number(examConfig?.st1HPS || 25);
  const st2HPS = Number(examConfig?.st2HPS || 25);
  const teHPS = Number(examConfig?.teHPS || quarterlyAssessmentHPS || 50);
  const st1Weight = Number(examConfig?.st1Weight || 30);
  const st2Weight = Number(examConfig?.st2Weight || 30);
  const teWeight = Number(examConfig?.teWeight || 40);

  // 2. Separate and sort students alphabetically by Last Name
  const sortStudents = (list) => {
    return [...list].sort((a, b) => {
      const lastA = (a.lastName || a.last_name || "").toUpperCase();
      const lastB = (b.lastName || b.last_name || "").toUpperCase();
      if (lastA !== lastB) return lastA.localeCompare(lastB);
      const firstA = (a.firstName || a.first_name || "").toUpperCase();
      const firstB = (b.firstName || b.first_name || "").toUpperCase();
      return firstA.localeCompare(firstB);
    });
  };

  const isMale = (s) => (s.sex || "M").toUpperCase().startsWith("M");
  const isFemale = (s) => (s.sex || "M").toUpperCase().startsWith("F");

  const maleStudents = sortStudents(students.filter(isMale));
  const femaleStudents = sortStudents(students.filter(isFemale));

  // 3. Process each student row
  const processStudentRow = (student, index) => {
    const studentId = String(student.id || student.student_id);
    const studentGrades = grades[studentId] || {};
    const ww = studentGrades.writtenWorks || {};
    const pt = studentGrades.performanceTasks || {};
    const ex = studentGrades.examinations || {
      st1: studentGrades.st1 || "",
      st2: studentGrades.st2 || "",
      te: studentGrades.te || studentGrades.quarterlyAssessment || "",
    };

    // WW scores & totals
    let wwTotalRaw = 0;
    let hasWwInput = false;
    const wwScores = writtenWorkColumns.map((col) => {
      const val = ww[col.id];
      if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
        const num = Number(val);
        wwTotalRaw += num;
        hasWwInput = true;
        return num;
      }
      return "";
    });

    const wwPS = totalWWHps > 0 ? parseFloat(((wwTotalRaw / totalWWHps) * 100).toFixed(2)) : 0;
    const wwWS = parseFloat((wwPS * (wwWeight / 100)).toFixed(2));
    const wwIsFailing = hasWwInput && wwPS < 60;

    // PT scores & totals
    let ptTotalRaw = 0;
    let hasPtInput = false;
    const ptScores = performanceTaskColumns.map((col) => {
      const val = pt[col.id];
      if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
        const num = Number(val);
        ptTotalRaw += num;
        hasPtInput = true;
        return num;
      }
      return "";
    });

    const ptPS = totalPTHps > 0 ? parseFloat(((ptTotalRaw / totalPTHps) * 100).toFixed(2)) : 0;
    const ptWS = parseFloat((ptPS * (ptWeight / 100)).toFixed(2));
    const ptIsFailing = hasPtInput && ptPS < 60;

    // Examinations: ST1, ST2, TE
    const rawST1 = ex.st1 !== undefined && ex.st1 !== null && ex.st1 !== "" && !isNaN(Number(ex.st1)) ? Number(ex.st1) : "";
    const rawST2 = ex.st2 !== undefined && ex.st2 !== null && ex.st2 !== "" && !isNaN(Number(ex.st2)) ? Number(ex.st2) : "";
    const rawTE = ex.te !== undefined && ex.te !== null && ex.te !== "" && !isNaN(Number(ex.te)) ? Number(ex.te) : "";

    const hasST1 = rawST1 !== "";
    const hasST2 = rawST2 !== "";
    const hasTE = rawTE !== "";
    const hasExInput = hasST1 || hasST2 || hasTE;

    const wsST1 = hasST1 && st1HPS > 0 ? parseFloat(((rawST1 / st1HPS) * st1Weight).toFixed(2)) : 0;
    const wsST2 = hasST2 && st2HPS > 0 ? parseFloat(((rawST2 / st2HPS) * st2Weight).toFixed(2)) : 0;
    const wsTE = hasTE && teHPS > 0 ? parseFloat(((rawTE / teHPS) * teWeight).toFixed(2)) : 0;

    const exPS = hasExInput ? parseFloat((wsST1 + wsST2 + wsTE).toFixed(2)) : 0;
    const exWS = hasExInput ? parseFloat((exPS * (exWeight / 100)).toFixed(2)) : 0;
    const exIsFailing = hasExInput && exPS < 60;

    // DepEd Initial Grade = WS_WW + WS_PT + WS_EX
    const hasAnyInput = hasWwInput || hasPtInput || hasExInput;
    const totalWS = parseFloat((wwWS + ptWS + exWS).toFixed(2));
    const initialGrade = hasAnyInput ? totalWS.toFixed(2) : "";
    const termGrade = hasAnyInput && initialGrade !== "" ? transmuteGrade(totalWS) : "";
    const descriptor = termGrade !== "" ? getGradeDescriptor(termGrade) : "";
    const isFailing = typeof termGrade === "number" && termGrade < 75;

    const lastName = (student.lastName || student.last_name || "").toUpperCase();
    const firstName = (student.firstName || student.first_name || "");
    const middleInitial = student.middleName || student.middle_name ? `${(student.middleName || student.middle_name)[0].toUpperCase()}.` : "";
    const fullName = `${lastName}, ${firstName} ${middleInitial}`.trim();

    return {
      index: index + 1,
      fullName,
      lastName,
      firstName,
      middleInitial,
      wwScores,
      wwTotalRaw: hasWwInput ? wwTotalRaw : "",
      wwPS: hasWwInput ? wwPS.toFixed(2) : "",
      wwWS: hasWwInput ? wwWS.toFixed(2) : "",
      wwIsFailing,
      ptScores,
      ptTotalRaw: hasPtInput ? ptTotalRaw : "",
      ptPS: hasPtInput ? ptPS.toFixed(2) : "",
      ptWS: hasPtInput ? ptWS.toFixed(2) : "",
      ptIsFailing,
      st1Score: rawST1,
      st2Score: rawST2,
      teScore: rawTE,
      wsST1: hasST1 ? wsST1.toFixed(2) : "",
      wsST2: hasST2 ? wsST2.toFixed(2) : "",
      wsTE: hasTE ? wsTE.toFixed(2) : "",
      exPS: hasExInput ? exPS.toFixed(2) : "",
      exWS: hasExInput ? exWS.toFixed(2) : "",
      exIsFailing,
      initialGrade,
      termGrade: termGrade !== null && termGrade !== undefined ? termGrade : "",
      quarterlyGrade: termGrade !== null && termGrade !== undefined ? termGrade : "",
      descriptor,
      isFailing,
    };
  };

  const processedMales = maleStudents.map((st, i) => processStudentRow(st, i));
  const processedFemales = femaleStudents.map((st, i) => processStudentRow(st, i));

  return {
    metadata: {
      region: metadata.region || "Region X",
      division: metadata.division || "GINGOOG",
      schoolName: metadata.schoolName || "GINGOOG CITY COMPREHENSIVE NHS",
      schoolId: metadata.schoolId || "304130",
      schoolYear: metadata.schoolYear || "2026-2027",
      termTitle: metadata.termTitle || "CLASS RECORD - TERM 1",
      termHeader: metadata.termHeader || "FIRST TERM",
      quarterLabel: metadata.quarterLabel || "FIRST QUARTER",
      gradeAndSection: metadata.gradeAndSection || "GRADE 10 - MAKAKALIKASAN",
      gradeLevelDisplay: metadata.gradeLevelDisplay || "10",
      teacherName: metadata.teacherName || "0",
      subjectName: metadata.subjectName || "0",
      section: metadata.section || "MAKAKALIKASAN",
      activeTerm: metadata.activeTerm || "T1",
    },
    weights: { WW: wwWeight, PT: ptWeight, EX: exWeight, QA: exWeight },
    writtenWorkColumns,
    performanceTaskColumns,
    examConfig: {
      st1HPS,
      st2HPS,
      teHPS,
      st1Weight,
      st2Weight,
      teWeight,
    },
    totalWWHps,
    totalPTHps,
    maleStudents: processedMales,
    femaleStudents: processedFemales,
  };
}

/**
 * Triggers direct browser printing configured for DepEd landscape A4 class record format.
 */
export function triggerClassRecordPrint({
  metadata,
  weights,
  writtenWorkColumns,
  performanceTaskColumns,
  examConfig,
  quarterlyAssessmentHPS,
  students,
  grades,
  depedLogoUrl,
  depedWordmarkLogoUrl,
}) {
  const formattedData = formatClassRecordData({
    metadata,
    weights,
    writtenWorkColumns,
    performanceTaskColumns,
    examConfig,
    quarterlyAssessmentHPS,
    students,
    grades,
  });

  const {
    region,
    division,
    schoolName,
    schoolId,
    schoolYear,
    termTitle,
    termHeader,
    gradeLevelDisplay,
    teacherName,
    subjectName,
    section,
    activeTerm,
  } = formattedData.metadata;

  const wwCols = formattedData.writtenWorkColumns;
  const ptCols = formattedData.performanceTaskColumns;
  const exConf = formattedData.examConfig;
  const totalCols = 2 + wwCols.length + 3 + ptCols.length + 3 + 8 + 3;

  // Construct table columns HTML
  const wwColsHeaders = wwCols.map((c, i) => `<th>${c.label || String(i + 1)}</th>`).join("");
  const ptColsHeaders = ptCols.map((c, i) => `<th>${c.label || String(i + 1)}</th>`).join("");

    const wwHpsCells = wwCols.map((c) => `<td>${c.max_score || 0}</td>`).join("");
  const ptHpsCells = ptCols.map((c) => `<td>${c.max_score || 0}</td>`).join("");

  const renderStudentRows = (list) => {
    return list.map((st) => {
      const wwCells = st.wwScores.map((score) => `<td class="score-cell">${score}</td>`).join("");
      const ptCells = st.ptScores.map((score) => `<td class="score-cell">${score}</td>`).join("");

      return `
        <tr>
          <td class="st-num">${st.index}</td>
          <td class="st-name">${st.fullName}</td>
          ${wwCells}
          <td class="total-cell">${st.wwTotalRaw}</td>
          <td class="ps-cell">${st.wwPS}</td>
          <td class="ws-cell">${st.wwWS}</td>
          ${ptCells}
          <td class="total-cell">${st.ptTotalRaw}</td>
          <td class="ps-cell">${st.ptPS}</td>
          <td class="ws-cell">${st.ptWS}</td>
          <td class="score-cell">${st.st1Score}</td>
          <td class="score-cell">${st.st2Score}</td>
          <td class="score-cell">${st.teScore}</td>
          <td class="ws-cell">${st.wsST1}</td>
          <td class="ws-cell">${st.wsST2}</td>
          <td class="ws-cell">${st.wsTE}</td>
          <td class="ps-cell">${st.exPS}</td>
          <td class="ws-cell">${st.exWS}</td>
          <td class="init-grade-cell">${st.initialGrade}</td>
          <td class="term-grade-cell ${st.isFailing ? 'failing-grade' : ''}">${st.termGrade}</td>
          <td class="descriptor-cell">${st.descriptor}</td>
        </tr>
      `;
    }).join("");
  };

  const rawTerm = String(activeTerm || metadata?.activeTerm || "T1").trim().toLowerCase();
  let termCode = "t1";
  if (rawTerm.includes("4") || rawTerm.includes("t4") || rawTerm.includes("fourth")) termCode = "t4";
  else if (rawTerm.includes("3") || rawTerm.includes("t3") || rawTerm.includes("third")) termCode = "t3";
  else if (rawTerm.includes("2") || rawTerm.includes("t2") || rawTerm.includes("second")) termCode = "t2";
  else if (rawTerm.includes("1") || rawTerm.includes("t1") || rawTerm.includes("first")) termCode = "t1";

  const rawSec = String(section || metadata?.section || "section")
    .replace(/^grade\s*[a-z0-9]*\s*[-–]\s*/i, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safeSec = rawSec || "section";

  const rawSubj = String(subjectName || metadata?.subjectName || "subject")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safeSubj = rawSubj || "subject";

  const safeFilename = `class_record_${termCode}_${safeSec}_${safeSubj}`;

  const wwHalf1 = Math.max(1, Math.floor((wwCols.length + 3) / 2));
  const wwHalf2 = Math.max(1, (wwCols.length + 3) - wwHalf1);
  const ptHalf1 = Math.max(1, Math.floor((ptCols.length + 3) / 2));
  const ptHalf2 = Math.max(1, (ptCols.length + 3) - ptHalf1);
  const subjColsCount = 8 + 3; // 8 EX columns + 3 Summary columns = 11 columns
  const subjHalf1 = 3;
  const subjHalf2 = Math.max(1, subjColsCount - subjHalf1);

  const colGroupHtml = `
    <colgroup>
      <col style="width: 28px; min-width: 26px;" />
      <col style="width: 210px; min-width: 190px;" />
      ${wwCols.map(() => '<col style="width: 25px; min-width: 22px;" />').join("")}
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      ${ptCols.map(() => '<col style="width: 25px; min-width: 22px;" />').join("")}
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 25px; min-width: 22px;" />
      <col style="width: 25px; min-width: 22px;" />
      <col style="width: 25px; min-width: 22px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 30px; min-width: 28px;" />
      <col style="width: 38px; min-width: 35px;" />
      <col style="width: 38px; min-width: 35px;" />
      <col style="width: 115px; min-width: 100px;" />
    </colgroup>
  `;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeFilename}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 4mm 5mm 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 0;
      color: #000;
      background: #fff;
      font-size: 7.5pt;
    }
    .print-page {
      width: 100%;
      margin: 0 auto;
    }
    .header-grid {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 6px;
      padding: 0 4px;
    }
    .seal-logo {
      width: 65px;
      height: 65px;
      object-fit: contain;
    }
    .header-center {
      text-align: center;
      flex: 1;
    }
    .title-main {
      font-size: 15pt;
      font-weight: 800;
      margin: 0 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-box-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin-top: 3px;
      font-size: 7.5pt;
    }
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .meta-label {
      font-weight: 800;
      font-size: 7.5pt;
    }
    .meta-val-box {
      border: 1.5px solid #000;
      padding: 1px 8px;
      font-weight: 500;
      font-size: 7.5pt;
      min-height: 16px;
      display: inline-flex;
      align-items: center;
      background: #fff;
    }
    .deped-right-brand {
      width: 90px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }
    .deped-wordmark-img {
      height: 44px;
      max-width: 90px;
      object-fit: contain;
    }

    table, table.export-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7pt;
      border: 1.5px solid #000;
    }
    .export-table th, 
    .export-table td,
    table th,
    table td {
      border: 1px solid #000;
      padding: 2px 1px;
      text-align: center;
      vertical-align: middle;
      box-sizing: border-box;
      text-overflow: clip !important;
      overflow: visible !important;
      white-space: normal !important;
    }
    .navy-accent-bar {
      background: #0f2e53 !important;
      height: 8px;
      padding: 0 !important;
      border: 1px solid #000 !important;
    }
    .term-title-cell {
      font-size: 13pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: #fff;
      white-space: normal !important;
      line-height: 1.15;
      text-align: center;
      padding: 4px;
    }
    .info-label-cell {
      font-weight: 800;
      font-size: 7pt;
      text-align: left;
      padding-left: 4px;
    }
    .info-val-cell {
      font-weight: 500;
      font-size: 7.5pt;
    }
    .comp-header-row {
      height: 45px !important;
    }
    .comp-header-cell {
      font-weight: 800;
      font-size: 7pt;
      text-transform: uppercase;
      white-space: normal !important;
      word-break: break-word !important;
      line-height: 1.15 !important;
      padding: 3px 2px !important;
      vertical-align: middle !important;
    }
    .summary-header-cell {
      font-weight: 800;
      font-size: 7pt;
      white-space: normal !important;
      line-height: 1.1 !important;
      padding: 2px 1px !important;
    }
    .hps-row td {
      font-weight: bold;
      font-size: 7pt;
      background: #fff;
    }
    .hps-title-cell {
      font-style: italic;
      font-weight: 800;
      font-size: 7.5pt;
      text-align: right !important;
      padding-right: 8px !important;
      white-space: normal !important;
      line-height: 1.1 !important;
      word-break: break-word !important;
      vertical-align: middle !important;
    }
    .learners-names-row td {
      background: #0f2e53 !important;
      color: #fff !important;
      font-weight: 800;
      font-size: 7.5pt;
      text-align: left !important;
      padding-left: 6px !important;
      white-space: normal !important;
    }
    .gender-row td {
      background: #94a3b8 !important;
      color: #0f172a !important;
      font-weight: 800;
      font-size: 7pt;
      text-align: left !important;
      padding-left: 6px !important;
      white-space: normal !important;
    }
    .st-num {
      width: 28px !important;
      font-weight: 600;
      text-align: center !important;
      white-space: nowrap !important;
    }
    .st-name {
      text-align: left !important;
      padding-left: 6px !important;
      font-weight: 600;
      font-size: 7pt;
      white-space: normal !important;
      word-break: break-word !important;
      line-height: 1.15 !important;
    }
    .score-cell, .total-cell, .ps-cell, .ws-cell, .init-grade-cell, .term-grade-cell {
      white-space: nowrap !important;
    }
    .total-cell, .ps-cell, .ws-cell {
      font-weight: 600;
    }
    .init-grade-cell {
      font-weight: 600;
    }
    .term-grade-cell {
      font-weight: 800;
    }
    .descriptor-cell {
      font-style: italic;
      font-weight: 700;
      font-size: 6.5pt;
      text-align: center !important;
      white-space: normal !important;
      word-break: break-word !important;
      line-height: 1.1 !important;
      padding: 2px 3px !important;
    }
    .failing-grade {
      color: #b91c1c !important;
    }
  </style>
</head>
<body>
  <div class="print-page">
    <div class="header-grid">
      <div>
        ${depedLogoUrl ? `<img src="${depedLogoUrl}" class="seal-logo" alt="DepEd Seal" />` : '<div style="width:65px;height:65px;border:1px solid #000;display:flex;align-items:center;justify-content:center;font-size:8px;">SEAL</div>'}
      </div>

      <div class="header-center">
        <h1 class="title-main">${termTitle}</h1>

        <div class="meta-box-row">
          <div class="meta-item">
            <span class="meta-label">REGION</span>
            <span class="meta-val-box">${region}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">DIVISION</span>
            <span class="meta-val-box">${division}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">SCHOOL ID</span>
            <span class="meta-val-box">${schoolId}</span>
          </div>
        </div>

        <div class="meta-box-row">
          <div class="meta-item">
            <span class="meta-label">SCHOOL NAME</span>
            <span class="meta-val-box">${schoolName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">SCHOOL YEAR</span>
            <span class="meta-val-box">${schoolYear}</span>
          </div>
        </div>
      </div>

      <div class="deped-right-brand">
        ${depedWordmarkLogoUrl ? `<img src="${depedWordmarkLogoUrl}" class="deped-wordmark-img" alt="Department of Education" />` : ''}
      </div>
    </div>

    <table class="export-table">
      ${colGroupHtml}
      <thead>
        <tr>
          <th colspan="${totalCols}" class="navy-accent-bar"></th>
        </tr>
        <tr>
          <th rowspan="4" colspan="2" class="term-title-cell">${termHeader}</th>
          <th colspan="${wwHalf1}" class="info-label-cell">GRADE LEVEL</th>
          <th colspan="${wwHalf2}" class="info-val-cell">${gradeLevelDisplay}</th>
          <th rowspan="2" colspan="${ptHalf1}" class="info-label-cell">TEACHER</th>
          <th rowspan="2" colspan="${ptHalf2}" class="info-val-cell">${teacherName}</th>
          <th rowspan="2" colspan="${subjHalf1}" class="info-label-cell">SUBJECT</th>
          <th rowspan="2" colspan="${subjHalf2}" class="info-val-cell">${subjectName}</th>
        </tr>
        <tr>
          <th colspan="${wwHalf1}" class="info-label-cell">SECTION</th>
          <th colspan="${wwHalf2}" class="info-val-cell">${section}</th>
        </tr>
        <tr class="comp-header-row" style="height: 45px;">
          <th colspan="${wwCols.length + 3}" class="comp-header-cell">WRITTEN / ORAL WORKS (WWs) (${formattedData.weights.WW}%)</th>
          <th colspan="${ptCols.length + 3}" class="comp-header-cell">PRODUCT / PERFORMANCE TASKS (PTs) (${formattedData.weights.PT}%)</th>
          <th colspan="8" class="comp-header-cell">EXAMINATIONS (EXs) (${formattedData.weights.EX}%)</th>
          <th rowspan="2" class="summary-header-cell" style="width: 38px;">Initial<br/>Grade</th>
          <th rowspan="2" class="summary-header-cell" style="width: 38px;">Term<br/>Grade</th>
          <th rowspan="2" class="summary-header-cell" style="width: 115px;">Descriptor</th>
        </tr>
        <tr>
          ${wwColsHeaders}
          <th style="width: 30px;">Total</th>
          <th style="width: 30px;">PS</th>
          <th style="width: 30px;">WS</th>
          ${ptColsHeaders}
          <th style="width: 30px;">Total</th>
          <th style="width: 30px;">PS</th>
          <th style="width: 30px;">WS</th>
          <th style="width: 25px;">ST1</th>
          <th style="width: 25px;">ST2</th>
          <th style="width: 25px;">TE</th>
          <th style="width: 30px;">WS ST1</th>
          <th style="width: 30px;">WS ST2</th>
          <th style="width: 30px;">WS TE</th>
          <th style="width: 30px;">PS</th>
          <th style="width: 30px;">WS</th>
        </tr>
        <tr class="hps-row">
          <td colspan="2" class="hps-title-cell">HIGHEST POSSIBLE SCORE</td>
          ${wwHpsCells}
          <td class="total-cell">${formattedData.totalWWHps}</td>
          <td class="ps-cell">100</td>
          <td class="ws-cell">${formattedData.weights.WW}%</td>
          ${ptHpsCells}
          <td class="total-cell">${formattedData.totalPTHps}</td>
          <td class="ps-cell">100</td>
          <td class="ws-cell">${formattedData.weights.PT}%</td>
          <td class="score-cell">${exConf.st1HPS}</td>
          <td class="score-cell">${exConf.st2HPS}</td>
          <td class="score-cell">${exConf.teHPS}</td>
          <td class="ws-cell">${exConf.st1Weight}</td>
          <td class="ws-cell">${exConf.st2Weight}</td>
          <td class="ws-cell">${exConf.teWeight}</td>
          <td class="ps-cell">100</td>
          <td class="ws-cell">${formattedData.weights.EX}%</td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </thead>
      <tbody>
        <tr class="learners-names-row">
          <td colspan="${totalCols}">LEARNERS' NAMES</td>
        </tr>
        <tr class="gender-row">
          <td colspan="${totalCols}">MALE</td>
        </tr>
        ${renderStudentRows(formattedData.maleStudents)}
        <tr class="gender-row">
          <td colspan="${totalCols}">FEMALE</td>
        </tr>
        ${renderStudentRows(formattedData.femaleStudents)}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;

  // Update top window title so browser Save As PDF dialog uses safeFilename
  const originalTitle = document.title;
  document.title = safeFilename;

  // Open clean print window / iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(htmlContent);
  doc.close();

  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => {
      document.title = originalTitle;
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 4000);
  }, 350);
}

