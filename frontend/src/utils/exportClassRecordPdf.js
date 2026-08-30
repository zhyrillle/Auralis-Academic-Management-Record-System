import { transmuteGrade } from "./depedTransmutation";

/**
 * Calculates and formats class record datasets for official DepEd Order No. 8, s. 2015 layout.
 */
export function formatClassRecordData({
  metadata = {},
  weights = { WW: 30, PT: 50, QA: 20 },
  writtenWorkColumns = [],
  performanceTaskColumns = [],
  quarterlyAssessmentHPS = 50,
  students = [],
  grades = {},
}) {
  const wwWeight = weights.WW !== undefined ? Number(weights.WW) : 30;
  const ptWeight = weights.PT !== undefined ? Number(weights.PT) : 50;
  const qaWeight = weights.QA !== undefined ? Number(weights.QA) : 20;

  // 1. Calculate Highest Possible Scores (HPS)
  const totalWWHps = writtenWorkColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0);
  const totalPTHps = performanceTaskColumns.reduce((sum, col) => sum + Number(col.max_score || 0), 0);
  const totalQAHps = Number(quarterlyAssessmentHPS || 50);

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
    const qa = studentGrades.quarterlyAssessment;

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

    // QA score & totals
    let qaScoreVal = "";
    let hasQaInput = false;
    if (qa !== undefined && qa !== null && qa !== "" && !isNaN(Number(qa))) {
      qaScoreVal = Number(qa);
      hasQaInput = true;
    }

    const qaPS = totalQAHps > 0 && hasQaInput ? parseFloat(((Number(qaScoreVal) / totalQAHps) * 100).toFixed(2)) : 0;
    const qaWS = parseFloat((qaPS * (qaWeight / 100)).toFixed(2));

    // DepEd Initial Grade = WS_WW + WS_PT + WS_QA
    const hasAnyInput = hasWwInput || hasPtInput || hasQaInput;
    const totalWS = parseFloat((wwWS + ptWS + qaWS).toFixed(2));
    const initialGrade = hasAnyInput ? totalWS.toFixed(2) : "";
    const quarterlyGrade = hasAnyInput && initialGrade !== "" ? transmuteGrade(totalWS) : "";
    const isFailing = typeof quarterlyGrade === "number" && quarterlyGrade < 75;

    const lastName = (student.lastName || student.last_name || "").toUpperCase();
    const firstName = (student.firstName || student.first_name || "");
    const middleInitial = student.middleName || student.middle_name ? `${(student.middleName || student.middle_name)[0].toUpperCase()}.` : "";
    const fullName = `${lastName}, ${firstName} ${middleInitial}`.trim();

    return {
      index: index + 1,
      lrn: student.lrn || student.LRN || "",
      fullName,
      lastName,
      firstName,
      middleInitial,
      wwScores,
      wwTotalRaw: hasWwInput ? wwTotalRaw : "",
      wwPS: hasWwInput ? wwPS.toFixed(2) : "",
      wwWS: hasWwInput ? wwWS.toFixed(2) : "",
      ptScores,
      ptTotalRaw: hasPtInput ? ptTotalRaw : "",
      ptPS: hasPtInput ? ptPS.toFixed(2) : "",
      ptWS: hasPtInput ? ptWS.toFixed(2) : "",
      qaScore: qaScoreVal,
      qaPS: hasQaInput ? qaPS.toFixed(2) : "",
      qaWS: hasQaInput ? qaWS.toFixed(2) : "",
      initialGrade,
      quarterlyGrade: quarterlyGrade !== null && quarterlyGrade !== undefined ? quarterlyGrade : "",
      isFailing,
    };
  };

  const processedMales = maleStudents.map((st, i) => processStudentRow(st, i));
  const processedFemales = femaleStudents.map((st, i) => processStudentRow(st, i));

  return {
    metadata: {
      region: metadata.region || "REGION X",
      division: metadata.division || "GINGOOG CITY",
      schoolName: metadata.schoolName || "GINGOOG CITY COMPREHENSIVE NHS",
      schoolId: metadata.schoolId || "304130",
      schoolYear: metadata.schoolYear || "2023-2024",
      quarterLabel: metadata.quarterLabel || "FIRST QUARTER",
      gradeAndSection: metadata.gradeAndSection || "GRADE 10 - MAKAKALIKASAN",
      teacherName: metadata.teacherName || "SUBJECT TEACHER",
      subjectName: metadata.subjectName || "MATHEMATICS",
      activeTerm: metadata.activeTerm || "T1",
    },
    weights: { WW: wwWeight, PT: ptWeight, QA: qaWeight },
    writtenWorkColumns,
    performanceTaskColumns,
    quarterlyAssessmentHPS: totalQAHps,
    totalWWHps,
    totalPTHps,
    totalQAHps,
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
  quarterlyAssessmentHPS,
  students,
  grades,
  depedLogoUrl,
}) {
  const formattedData = formatClassRecordData({
    metadata,
    weights,
    writtenWorkColumns,
    performanceTaskColumns,
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
    quarterLabel,
    gradeAndSection,
    teacherName,
    subjectName,
  } = formattedData.metadata;

  const wwCols = formattedData.writtenWorkColumns;
  const ptCols = formattedData.performanceTaskColumns;
  const totalCols = 3 + wwCols.length + 3 + ptCols.length + 3 + 1 + 2 + 2;

  // Construct table columns HTML
  const wwColsHeaders = wwCols.map((c, i) => `<th class="vertical-cell"><div class="v-text">${c.activity_name || (c.date ? String(c.date).slice(5) : String(i + 1))}</div></th>`).join("");
  const ptColsHeaders = ptCols.map((c, i) => `<th class="vertical-cell"><div class="v-text">${c.activity_name || (c.date ? String(c.date).slice(5) : String(i + 1))}</div></th>`).join("");

  const wwHpsCells = wwCols.map((c) => `<td>${c.max_score || 0}</td>`).join("");
  const ptHpsCells = ptCols.map((c) => `<td>${c.max_score || 0}</td>`).join("");

  const renderStudentRows = (list) => {
    return list.map((st) => {
      const wwCells = st.wwScores.map((score) => `<td>${score}</td>`).join("");
      const ptCells = st.ptScores.map((score) => `<td>${score}</td>`).join("");

      return `
        <tr>
          <td class="st-num">${st.index}</td>
          <td class="st-lrn">${st.lrn}</td>
          <td class="st-name">${st.fullName}</td>
          ${wwCells}
          <td class="total-cell">${st.wwTotalRaw}</td>
          <td class="ps-cell">${st.wwPS}</td>
          <td class="ws-cell">${st.wwWS}</td>
          ${ptCells}
          <td class="total-cell">${st.ptTotalRaw}</td>
          <td class="ps-cell">${st.ptPS}</td>
          <td class="ws-cell">${st.ptWS}</td>
          <td>${st.qaScore}</td>
          <td class="ps-cell">${st.qaPS}</td>
          <td class="ws-cell">${st.qaWS}</td>
          <td class="init-grade-cell">${st.initialGrade}</td>
          <td class="q-grade-cell ${st.isFailing ? 'failing-grade' : ''}">${st.quarterlyGrade}</td>
        </tr>
      `;
    }).join("");
  };

  const safeFilename = `Class_Record_${subjectName.replace(/[^a-zA-Z0-9]/g, '_')}_${gradeAndSection.replace(/[^a-zA-Z0-9]/g, '_')}_${quarterLabel.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeFilename}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 5mm 6mm 5mm 6mm;
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
      display: grid;
      grid-template-columns: 80px 1fr 140px;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .seal-logo {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }
    .header-center {
      text-align: center;
    }
    .title-main {
      font-size: 14pt;
      font-weight: bold;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .title-sub {
      font-size: 7.5pt;
      font-style: italic;
      margin-top: 1px;
      margin-bottom: 4px;
    }
    .meta-box-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
      font-size: 7.5pt;
    }
    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .meta-label {
      font-weight: bold;
      font-size: 7pt;
    }
    .meta-val-box {
      border: 1px solid #000;
      padding: 1px 6px;
      font-weight: bold;
      font-size: 7.5pt;
      min-height: 15px;
      display: inline-flex;
      align-items: center;
      background: #fff;
    }
    .deped-right-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .deped-logo-txt {
      font-size: 16pt;
      font-weight: 900;
      color: #0038a8;
      line-height: 1;
      letter-spacing: -0.5px;
    }
    .deped-logo-sub {
      font-size: 5pt;
      font-weight: bold;
      color: #0038a8;
      letter-spacing: 0.5px;
      text-align: center;
      margin-top: 1px;
    }
    .subhead-bar {
      display: grid;
      grid-template-columns: 160px 220px 240px 1fr;
      border: 1.5px solid #000;
      margin-bottom: 5px;
      background: #fff;
    }
    .subhead-cell {
      border-right: 1.5px solid #000;
      padding: 2px 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 7.5pt;
    }
    .subhead-cell:last-child {
      border-right: none;
    }
    .subhead-cell.q-cell {
      font-weight: bold;
      font-size: 8pt;
      justify-content: center;
      background: #f8fafc;
    }
    .sub-lbl {
      font-weight: bold;
      font-size: 7pt;
      white-space: nowrap;
    }
    .sub-val {
      font-weight: bold;
      font-size: 7.5pt;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7pt;
      border: 1.5px solid #000;
    }
    th, td {
      border: 1px solid #000;
      padding: 2px 1px;
      text-align: center;
      vertical-align: middle;
      box-sizing: border-box;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    thead tr:first-child th {
      font-weight: bold;
      font-size: 7.5pt;
      background: #fff;
      padding: 3px 1px;
    }
    thead tr:nth-child(2) th {
      font-size: 6.5pt;
      font-weight: bold;
      background: #fff;
    }
    .vertical-cell {
      height: 44px;
      vertical-align: bottom !important;
      padding: 2px 1px !important;
    }
    .v-text {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      white-space: nowrap;
      font-size: 6pt;
      font-weight: bold;
      display: inline-block;
      line-height: 1;
      max-height: 40px;
      margin: 0 auto;
    }
    .hps-row td, .hps-row th {
      font-weight: bold;
      font-size: 7pt;
      background: #f1f5f9;
    }
    .hps-lbl {
      text-align: right !important;
      padding-right: 6px !important;
      font-weight: bold;
    }
    .gender-hdr td {
      text-align: left !important;
      padding: 2px 6px !important;
      font-weight: bold;
      font-size: 7.5pt;
      background: #e2e8f0;
      letter-spacing: 0.5px;
    }
    .st-num {
      width: 20px;
      font-weight: bold;
    }
    .st-lrn {
      width: 80px;
      font-family: monospace, Arial, sans-serif;
      font-size: 6.5pt;
    }
    .st-name {
      text-align: left !important;
      padding-left: 4px !important;
      font-weight: bold;
      font-size: 7pt;
      width: 170px;
    }
    .ps-cell {
      color: #15803d;
      font-weight: bold;
    }
    .ws-cell {
      font-weight: 500;
    }
    .total-cell {
      font-weight: bold;
    }
    .init-grade-cell {
      font-weight: bold;
      font-size: 7.5pt;
      width: 44px;
    }
    .q-grade-cell {
      font-weight: bold;
      font-size: 8pt;
      width: 44px;
    }
    .failing-grade {
      color: #b91c1c;
      background-color: #fee2e2;
    }
  </style>
</head>
<body>
  <div class="print-page">
    <div class="header-grid">
      <div>
        ${depedLogoUrl ? `<img src="${depedLogoUrl}" class="seal-logo" alt="DepEd Seal" />` : '<div style="width:70px;height:70px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:8px;">SEAL</div>'}
      </div>
      <div class="header-center">
        <h1 class="title-main">Class Record</h1>
        <div class="title-sub">(Pursuant to DepEd Order 8 series of 2015)</div>
        <div class="meta-box-row">
          <div class="meta-item">
            <span class="meta-label">REGION</span>
            <span class="meta-val-box">${region}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">DIVISION</span>
            <span class="meta-val-box">${division}</span>
          </div>
        </div>
        <div class="meta-box-row">
          <div class="meta-item">
            <span class="meta-label">SCHOOL NAME</span>
            <span class="meta-val-box">${schoolName}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">SCHOOL ID</span>
            <span class="meta-val-box">${schoolId}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">SCHOOL YEAR</span>
            <span class="meta-val-box">${schoolYear}</span>
          </div>
        </div>
      </div>
      <div class="deped-right-brand">
        <div class="deped-logo-txt">DepED</div>
        <div class="deped-logo-sub">DEPARTMENT OF EDUCATION</div>
      </div>
    </div>

    <div class="subhead-bar">
      <div class="subhead-cell q-cell">${quarterLabel}</div>
      <div class="subhead-cell">
        <span class="sub-lbl">GRADE & SECTION:</span>
        <span class="sub-val">${gradeAndSection}</span>
      </div>
      <div class="subhead-cell">
        <span class="sub-lbl">TEACHER:</span>
        <span class="sub-val">${teacherName}</span>
      </div>
      <div class="subhead-cell">
        <span class="sub-lbl">SUBJECT:</span>
        <span class="sub-val">${subjectName}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th colspan="3" rowspan="2" style="width: 270px;">LEARNERS' NAMES</th>
          <th colspan="${wwCols.length + 3}">WRITTEN WORK (${formattedData.weights.WW}%)</th>
          <th colspan="${ptCols.length + 3}">PERFORMANCE TASKS (${formattedData.weights.PT}%)</th>
          <th colspan="3">QUARTERLY ASSESSMENT (${formattedData.weights.QA}%)</th>
          <th rowspan="2" style="width: 44px;">Initial Grade</th>
          <th rowspan="2" style="width: 44px;">Quarterly Grade</th>
        </tr>
        <tr>
          ${wwColsHeaders}
          <th style="width: 28px;">Total</th>
          <th style="width: 32px;">PS</th>
          <th style="width: 30px;">WS</th>
          ${ptColsHeaders}
          <th style="width: 28px;">Total</th>
          <th style="width: 32px;">PS</th>
          <th style="width: 30px;">WS</th>
          <th style="width: 28px;">1</th>
          <th style="width: 32px;">PS</th>
          <th style="width: 30px;">WS</th>
        </tr>
        <tr class="hps-row">
          <td colspan="3" class="hps-lbl">HIGHEST POSSIBLE SCORE</td>
          ${wwHpsCells}
          <td>${formattedData.totalWWHps}</td>
          <td>100.00</td>
          <td>${formattedData.weights.WW}%</td>
          ${ptHpsCells}
          <td>${formattedData.totalPTHps}</td>
          <td>100.00</td>
          <td>${formattedData.weights.PT}%</td>
          <td>${formattedData.totalQAHps}</td>
          <td>100.00</td>
          <td>${formattedData.weights.QA}%</td>
          <td>100</td>
          <td>100</td>
        </tr>
      </thead>
      <tbody>
        <tr class="gender-hdr">
          <td colspan="${totalCols}">MALE</td>
        </tr>
        ${renderStudentRows(formattedData.maleStudents)}
        <tr class="gender-hdr">
          <td colspan="${totalCols}">FEMALE</td>
        </tr>
        ${renderStudentRows(formattedData.femaleStudents)}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;

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
      document.body.removeChild(iframe);
    }, 2000);
  }, 350);
}
