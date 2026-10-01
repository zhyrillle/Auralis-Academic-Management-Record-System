import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import depedLogoUrl from "../assets/deped_logo.png";
import depedGifLogoUrl from "../assets/deped-logo.gif";

/**
 * Helper to format student name as: First Name Middle Initial Last Name
 */
function formatExcelStudentName(student) {
  const first = (student.firstName || student.first_name || "").trim();
  const middleInitial = student.middleName || student.middle_name ? (student.middleName || student.middle_name).trim().charAt(0) + "." : "";
  const last = (student.lastName || student.last_name || "").trim();
  return [first, middleInitial, last].filter(Boolean).join(" ");
}

/**
 * Landscape PDF Generator & Printer for Grading Sheet.
 * Correctly calculates totalCols (8 for Standard/Single Term, 14 for MAPEH Combined All Terms)
 * to ensure 100% full-width coverage on Navy Blue Banner and Group Headers without any cutoffs.
 */
export async function exportGradingSheetPdf({
  activeSelectedClass,
  students = [],
  calculateFinalGrade,
  getDescriptor,
  getRemark,
  teacherName = "Teacher",
  isMapeh = false,
  activeMapehTab = "MA",
  combinedTermFilter = "T1",
  isPrintMode = false,
}) {
  if (!activeSelectedClass || !students) return;

  const sectionName = activeSelectedClass.sectionName || activeSelectedClass.name || activeSelectedClass.section_name || "Mahogany";
  const rawGradeLevel = activeSelectedClass.gradeLevel || activeSelectedClass.grade_level_name || "G7";
  const gradeLevel = rawGradeLevel.toLowerCase().startsWith("grade")
    ? rawGradeLevel.replace(/^grade\s*/i, "G")
    : rawGradeLevel;
  const region = "Region X";
  const division = "GINGOOG";
  const schoolId = "304130";
  const schoolName = "GINGOOG CITY COMPREHENSIVE NHS";
  const schoolYear = activeSelectedClass.schoolYear || activeSelectedClass.school_year || activeSelectedClass.school_year_name || "2026-2027";

  let displaySubjectName = activeSelectedClass.subject || activeSelectedClass.subject_name || "Mathematics";
  if (isMapeh) {
    if (activeMapehTab === "MA") displaySubjectName = "MAPEH (Music & Arts)";
    else if (activeMapehTab === "PEH") displaySubjectName = "MAPEH (PE & Health)";
    else displaySubjectName = "MAPEH";
  }

  const resolveStudentGrades = (s) => {
    if (!isMapeh) {
      const final = calculateFinalGrade ? calculateFinalGrade(s.term1, s.term2, s.term3) : "";
      return {
        t1: s.term1 !== undefined && s.term1 !== null ? s.term1 : "",
        t2: s.term2 !== undefined && s.term2 !== null ? s.term2 : "",
        t3: s.term3 !== undefined && s.term3 !== null ? s.term3 : "",
        final,
        descriptor: getDescriptor ? getDescriptor(final) : "",
        remark: getRemark ? getRemark(final) : "",
      };
    }

    const getMaVal = (termKey, maKey) => {
      if (s[maKey] !== undefined && s[maKey] !== null && s[maKey] !== "") return Number(s[maKey]);
      if (activeMapehTab === "MA" && s[termKey] !== undefined && s[termKey] !== null && s[termKey] !== "") return Number(s[termKey]);
      return "";
    };

    const getPehVal = (termKey, pehKey) => {
      if (s[pehKey] !== undefined && s[pehKey] !== null && s[pehKey] !== "") return Number(s[pehKey]);
      if (activeMapehTab === "PEH" && s[termKey] !== undefined && s[termKey] !== null && s[termKey] !== "") return Number(s[termKey]);
      return "";
    };

    const ma1 = getMaVal("term1", "term1_ma");
    const ma2 = getMaVal("term2", "term2_ma");
    const ma3 = getMaVal("term3", "term3_ma");

    const peh1 = getPehVal("term1", "term1_peh");
    const peh2 = getPehVal("term2", "term2_peh");
    const peh3 = getPehVal("term3", "term3_peh");

    const computeCombinedTerm = (maVal, pehVal, overallVal) => {
      const hasMa = typeof maVal === "number" && !isNaN(maVal);
      const hasPeh = typeof pehVal === "number" && !isNaN(pehVal);
      if (hasMa && hasPeh) return Math.round((maVal + pehVal) / 2);
      if (hasMa) return maVal;
      if (hasPeh) return pehVal;
      if (overallVal !== undefined && overallVal !== null && overallVal !== "" && !isNaN(Number(overallVal))) {
        return Number(overallVal);
      }
      return "";
    };

    const combined1 = computeCombinedTerm(ma1, peh1, s.term1);
    const combined2 = computeCombinedTerm(ma2, peh2, s.term2);
    const combined3 = computeCombinedTerm(ma3, peh3, s.term3);

    if (activeMapehTab === "MA") {
      const final = calculateFinalGrade ? calculateFinalGrade(ma1, ma2, ma3) : "";
      return { t1: ma1, t2: ma2, t3: ma3, final, descriptor: getDescriptor ? getDescriptor(final) : "", remark: getRemark ? getRemark(final) : "" };
    }

    if (activeMapehTab === "PEH") {
      const final = calculateFinalGrade ? calculateFinalGrade(peh1, peh2, peh3) : "";
      return { t1: ma1, t2: peh1, t3: peh3, final, descriptor: getDescriptor ? getDescriptor(final) : "", remark: getRemark ? getRemark(final) : "" };
    }

    const final = calculateFinalGrade ? calculateFinalGrade(combined1, combined2, combined3) : "";

    return {
      t1_ma: ma1,
      t1_peh: peh1,
      t1_combined: combined1,

      t2_ma: ma2,
      t2_peh: peh2,
      t2_combined: combined2,

      t3_ma: ma3,
      t3_peh: peh3,
      t3_combined: combined3,

      final,
      descriptor: getDescriptor ? getDescriptor(final) : "",
      remark: getRemark ? getRemark(final) : "",
    };
  };

  const males = students.filter((s) => (s.sex || "M").toUpperCase().startsWith("M"));
  const females = students.filter((s) => (s.sex || "M").toUpperCase().startsWith("F"));

  const isCombinedMapeh = isMapeh && activeMapehTab === "COMBINED";
  const isCombinedSingleTerm = isCombinedMapeh && combinedTermFilter !== "All";

  // Total Columns count: 14 for MAPEH Combined All Terms summary view; 8 for all single term/standard views
  const totalCols = isCombinedMapeh && combinedTermFilter === "All" ? 14 : 8;

  // Metadata Grid HTML (Row 2 to Row 6) depending on totalCols count
  let metaRowsHtml = "";
  if (totalCols === 14) {
    metaRowsHtml = `
      <tr>
        <td colspan="2" class="meta-lbl-right">REGION</td>
        <td colspan="4" class="meta-val-box">${region}</td>
        <td colspan="2" class="meta-lbl-right">DIVISION</td>
        <td colspan="2" class="meta-val-box">${division}</td>
        <td colspan="2" class="meta-lbl-right">SCHOOL ID</td>
        <td colspan="2" class="meta-val-box">${schoolId}</td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-right">SCHOOL NAME</td>
        <td colspan="8" class="meta-val-box">${schoolName}</td>
        <td colspan="2" class="meta-lbl-right">SCHOOL YEAR</td>
        <td colspan="2" class="meta-val-box">${schoolYear}</td>
      </tr>
      <tr class="navy-divider-row">
        <td colspan="${totalCols}"></td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-left">GRADE LEVEL</td>
        <td colspan="4" class="meta-val-box">${gradeLevel}</td>
        <td colspan="2" class="meta-lbl-center">SUBJECT</td>
        <td colspan="6" class="meta-val-box">${displaySubjectName}</td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-left">SECTION</td>
        <td colspan="4" class="meta-val-box">${sectionName}</td>
        <td colspan="2" class="meta-lbl-center">TEACHER</td>
        <td colspan="6" class="meta-val-box">${teacherName}</td>
      </tr>
    `;
  } else {
    metaRowsHtml = `
      <tr>
        <td colspan="2" class="meta-lbl-right">REGION</td>
        <td colspan="2" class="meta-val-box">${region}</td>
        <td class="meta-lbl-right">DIVISION</td>
        <td class="meta-val-box">${division}</td>
        <td class="meta-lbl-right">SCHOOL ID</td>
        <td class="meta-val-box">${schoolId}</td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-right">SCHOOL NAME</td>
        <td colspan="4" class="meta-val-box">${schoolName}</td>
        <td class="meta-lbl-right">SCHOOL YEAR</td>
        <td class="meta-val-box">${schoolYear}</td>
      </tr>
      <tr class="navy-divider-row">
        <td colspan="${totalCols}"></td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-left">GRADE LEVEL</td>
        <td colspan="2" class="meta-val-box">${gradeLevel}</td>
        <td class="meta-lbl-center">SUBJECT</td>
        <td colspan="3" class="meta-val-box">${displaySubjectName}</td>
      </tr>
      <tr>
        <td colspan="2" class="meta-lbl-left">SECTION</td>
        <td colspan="2" class="meta-val-box">${sectionName}</td>
        <td class="meta-lbl-center">TEACHER</td>
        <td colspan="3" class="meta-val-box">${teacherName}</td>
      </tr>
    `;
  }

  // Multi-level Table Headers HTML
  let tableHeaderHtml = "";
  if (isCombinedSingleTerm) {
    const termLabel = combinedTermFilter === "T1" ? "TERM 1" : combinedTermFilter === "T2" ? "TERM 2" : "TERM 3";
    tableHeaderHtml = `
      <tr>
        <th rowspan="2" class="th-empty"></th>
        <th rowspan="2" class="th-centered">LEARNERS' NAMES</th>
        <th colspan="3" class="th-centered">TERM GRADES (${termLabel})</th>
        <th rowspan="2" class="th-centered">FINAL GRADE</th>
        <th rowspan="2" class="th-centered">DESCRIPTOR</th>
        <th rowspan="2" class="th-centered">REMARK</th>
      </tr>
      <tr>
        <th class="th-sub-term">M&amp;A</th>
        <th class="th-sub-term">PE&amp;H</th>
        <th class="th-sub-term highlight-sub-col">MAPEH</th>
      </tr>
    `;
  } else if (isCombinedMapeh && combinedTermFilter === "All") {
    tableHeaderHtml = `
      <tr>
        <th rowspan="2" class="th-empty"></th>
        <th rowspan="2" class="th-centered">LEARNERS' NAMES</th>
        <th colspan="3" class="th-centered">TERM 1</th>
        <th colspan="3" class="th-centered">TERM 2</th>
        <th colspan="3" class="th-centered">TERM 3</th>
        <th rowspan="2" class="th-centered">FINAL GRADE</th>
        <th rowspan="2" class="th-centered">DESCRIPTOR</th>
        <th rowspan="2" class="th-centered">REMARK</th>
      </tr>
      <tr>
        <th class="th-sub-term">M&amp;A</th>
        <th class="th-sub-term">PE&amp;H</th>
        <th class="th-sub-term highlight-sub-col">MAPEH</th>

        <th class="th-sub-term">M&amp;A</th>
        <th class="th-sub-term">PE&amp;H</th>
        <th class="th-sub-term highlight-sub-col">MAPEH</th>

        <th class="th-sub-term">M&amp;A</th>
        <th class="th-sub-term">PE&amp;H</th>
        <th class="th-sub-term highlight-sub-col">MAPEH</th>
      </tr>
    `;
  } else {
    tableHeaderHtml = `
      <tr>
        <th rowspan="2" class="th-empty"></th>
        <th rowspan="2" class="th-centered">LEARNERS' NAMES</th>
        <th colspan="3" class="th-centered">TERM GRADES</th>
        <th rowspan="2" class="th-centered">FINAL GRADE</th>
        <th rowspan="2" class="th-centered">DESCRIPTOR</th>
        <th rowspan="2" class="th-centered">REMARK</th>
      </tr>
      <tr>
        <th class="th-sub-term">TERM 1</th>
        <th class="th-sub-term">TERM 2</th>
        <th class="th-sub-term">TERM 3</th>
      </tr>
    `;
  }

  const renderStudentRows = (list) => {
    if (list.length === 0) {
      return `
        <tr>
          <td colspan="${totalCols}" class="empty-row-msg">
            No students matching criteria
          </td>
        </tr>
      `;
    }

    return list.map((stud, idx) => {
      const grades = resolveStudentGrades(stud);
      const fullName = formatExcelStudentName(stud);
      const indexNum = idx + 1;

      if (isCombinedSingleTerm) {
        const termNum = combinedTermFilter;
        const maVal = termNum === "T1" ? grades.t1_ma : termNum === "T2" ? grades.t2_ma : grades.t3_ma;
        const pehVal = termNum === "T1" ? grades.t1_peh : termNum === "T2" ? grades.t2_peh : grades.t3_peh;
        const combinedVal = termNum === "T1" ? grades.t1_combined : termNum === "T2" ? grades.t2_combined : grades.t3_combined;
        const descriptor = getDescriptor ? getDescriptor(combinedVal) : "";
        const remark = getRemark ? getRemark(combinedVal) : "";

        return `
          <tr>
            <td class="col-learner-num">${indexNum}</td>
            <td class="col-learner-name">${fullName}</td>
            <td class="col-val-centered">${maVal !== undefined && maVal !== null ? maVal : ""}</td>
            <td class="col-val-centered">${pehVal !== undefined && pehVal !== null ? pehVal : ""}</td>
            <td class="col-val-centered highlight-val">${combinedVal !== undefined && combinedVal !== null ? combinedVal : ""}</td>
            <td class="col-final-grade">${combinedVal !== undefined && combinedVal !== null ? combinedVal : ""}</td>
            <td class="col-descriptor">${descriptor || ""}</td>
            <td class="col-remark">${remark || ""}</td>
          </tr>
        `;
      }

      if (isCombinedMapeh && combinedTermFilter === "All") {
        return `
          <tr>
            <td class="col-learner-num">${indexNum}</td>
            <td class="col-learner-name">${fullName}</td>
            <td class="col-val-centered">${grades.t1_ma !== undefined && grades.t1_ma !== null ? grades.t1_ma : ""}</td>
            <td class="col-val-centered">${grades.t1_peh !== undefined && grades.t1_peh !== null ? grades.t1_peh : ""}</td>
            <td class="col-val-centered highlight-val">${grades.t1_combined !== undefined && grades.t1_combined !== null ? grades.t1_combined : ""}</td>

            <td class="col-val-centered">${grades.t2_ma !== undefined && grades.t2_ma !== null ? grades.t2_ma : ""}</td>
            <td class="col-val-centered">${grades.t2_peh !== undefined && grades.t2_peh !== null ? grades.t2_peh : ""}</td>
            <td class="col-val-centered highlight-val">${grades.t2_combined !== undefined && grades.t2_combined !== null ? grades.t2_combined : ""}</td>

            <td class="col-val-centered">${grades.t3_ma !== undefined && grades.t3_ma !== null ? grades.t3_ma : ""}</td>
            <td class="col-val-centered">${grades.t3_peh !== undefined && grades.t3_peh !== null ? grades.t3_peh : ""}</td>
            <td class="col-val-centered highlight-val">${grades.t3_combined !== undefined && grades.t3_combined !== null ? grades.t3_combined : ""}</td>

            <td class="col-final-grade">${grades.final !== undefined && grades.final !== null ? grades.final : ""}</td>
            <td class="col-descriptor">${grades.descriptor || ""}</td>
            <td class="col-remark">${grades.remark || ""}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td class="col-learner-num">${indexNum}</td>
          <td class="col-learner-name">${fullName}</td>
          <td class="col-val-centered">${grades.t1 !== undefined && grades.t1 !== null ? grades.t1 : ""}</td>
          <td class="col-val-centered">${grades.t2 !== undefined && grades.t2 !== null ? grades.t2 : ""}</td>
          <td class="col-val-centered">${grades.t3 !== undefined && grades.t3 !== null ? grades.t3 : ""}</td>
          <td class="col-final-grade">${grades.final !== undefined && grades.final !== null ? grades.final : ""}</td>
          <td class="col-descriptor">${grades.descriptor || ""}</td>
          <td class="col-remark">${grades.remark || ""}</td>
        </tr>
      `;
    }).join("");
  };

  const sectionClean = String(sectionName).trim().replace(/\s+/g, "_");
  const fileName = `Grading_Sheet_${sectionClean}.pdf`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${fileName}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 0.5in;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Calibri', Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 0;
      color: #000000;
      background: #ffffff;
      font-size: 10pt;
    }
    .sheet-container {
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      padding: 0;
    }

    /* Top Logo & Title Block */
    .header-top-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      position: relative;
    }
    .logo-left {
      height: 56px;
      width: 56px;
      object-fit: contain;
    }
    .title-main {
      flex: 1;
      text-align: center;
      font-size: 20pt;
      font-weight: bold;
      color: #000000;
      margin: 0;
    }
    .logo-right {
      height: 44px;
      width: 90px;
      object-fit: contain;
    }

    /* Table Grid System */
    table.grading-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      table-layout: fixed;
    }
    table.grading-grid th,
    table.grading-grid td {
      border: 1px solid #000000;
      padding: 5px 6px;
      vertical-align: middle;
      color: #000000;
    }

    /* Metadata Row Styling */
    .meta-lbl-right {
      font-weight: bold;
      text-align: right;
      border: none !important;
      background-color: #ffffff;
    }
    .meta-val-box {
      text-align: center;
      font-weight: normal;
      border: 1px solid #000000 !important;
      background-color: #ffffff;
    }
    .meta-lbl-left {
      font-weight: bold;
      text-align: left;
      border: 1px solid #000000 !important;
      background-color: #ffffff;
    }
    .meta-lbl-center {
      font-weight: bold;
      text-align: center;
      border: 1px solid #000000 !important;
      background-color: #ffffff;
    }

    /* Navy Divider Bar (#002060, height 8-10pt) */
    .navy-divider-row td {
      background-color: #002060 !important;
      height: 9pt;
      padding: 0 !important;
      border: 1px solid #000000 !important;
    }

    /* Multi-level Headers (Rows 7-8) */
    .th-empty {
      width: 38px;
      background-color: #ffffff;
      border: 1px solid #000000 !important;
    }
    .th-centered {
      font-weight: bold;
      text-align: center;
      font-size: 10.5pt;
      background-color: #ffffff;
      border: 1px solid #000000 !important;
    }
    .th-sub-term {
      font-weight: bold;
      text-align: center;
      font-size: 10pt;
      background-color: #ffffff;
      border: 1px solid #000000 !important;
    }
    .highlight-sub-col {
      background-color: #d9e1f2 !important;
    }

    /* Section Banners (MALE / FEMALE) */
    .banner-group-row td {
      background-color: #595959 !important;
      color: #ffffff !important;
      font-weight: bold;
      font-size: 10.5pt;
      text-align: left;
      padding-left: 8px;
      height: 22px;
      border: 1px solid #000000 !important;
    }

    /* Data Table Row Cells */
    .col-learner-num {
      text-align: center;
      font-weight: bold;
      background-color: #d9e1f2 !important; /* Soft light blue fill */
      width: 38px;
      border: 1px solid #000000 !important;
    }
    .col-learner-name {
      text-align: left;
      padding-left: 8px;
      font-weight: normal;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border: 1px solid #000000 !important;
    }
    .col-val-centered {
      text-align: center;
      font-weight: normal;
      border: 1px solid #000000 !important;
    }
    .highlight-val {
      font-weight: bold;
      background-color: #eff6ff;
    }
    .col-final-grade {
      text-align: center;
      font-weight: bold;
      font-style: italic;
      border: 1px solid #000000 !important;
    }
    .col-descriptor {
      text-align: center;
      font-style: italic;
      border: 1px solid #000000 !important;
    }
    .col-remark {
      text-align: center;
      font-weight: normal;
      border: 1px solid #000000 !important;
    }
    .empty-row-msg {
      text-align: center;
      color: #757575;
      font-style: italic;
      padding: 10px;
    }
  </style>
</head>
<body>
  <div class="sheet-container" id="excel-pdf-export-root">
    <!-- Top Header & Logos -->
    <div class="header-top-block">
      <img src="${depedLogoUrl}" class="logo-left" alt="DepEd Logo Upper Left" />
      <h1 class="title-main">CLASS RECORD - FINAL GRADES</h1>
      <img src="${depedGifLogoUrl}" class="logo-right" alt="DepEd Logo Upper Right" />
    </div>

    <table class="grading-grid">
      ${totalCols === 14 ? `
        <colgroup>
          <col style="width: 35px;" />
          <col style="width: 210px;" />
          <col style="width: 50px;" />
          <col style="width: 50px;" />
          <col style="width: 55px;" />
          <col style="width: 50px;" />
          <col style="width: 50px;" />
          <col style="width: 55px;" />
          <col style="width: 50px;" />
          <col style="width: 50px;" />
          <col style="width: 55px;" />
          <col style="width: 75px;" />
          <col style="width: 105px;" />
          <col style="width: 70px;" />
        </colgroup>
      ` : `
        <colgroup>
          <col style="width: 38px;" />
          <col style="width: 260px;" />
          <col style="width: 75px;" />
          <col style="width: 75px;" />
          <col style="width: 75px;" />
          <col style="width: 95px;" />
          <col style="width: 125px;" />
          <col style="width: 90px;" />
        </colgroup>
      `}

      <!-- Rows 2–6: Metadata Key-Value pairs & Divider Bar -->
      ${metaRowsHtml}

      <!-- Rows 7–8: Multi-level Table Headers -->
      ${tableHeaderHtml}

      <!-- Data Table: MALE Banner & Student Rows -->
      <tr class="banner-group-row">
        <td colspan="${totalCols}">MALE</td>
      </tr>
      ${renderStudentRows(males)}

      <!-- Data Table: FEMALE Banner & Student Rows -->
      <tr class="banner-group-row">
        <td colspan="${totalCols}">FEMALE</td>
      </tr>
      ${renderStudentRows(females)}
    </table>
  </div>
</body>
</html>
  `;

  if (isPrintMode) {
    // PRINT BUTTON: Open browser print preview window
    const originalTitle = document.title;
    document.title = fileName;

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
      }, 3000);
    }, 300);
  } else {
    // DOWNLOAD PDF BUTTON: Render exact layout and save via jsPDF + html2canvas
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "1020px";
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
      const element = container.querySelector("#excel-pdf-export-root") || container;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 36; // 0.5 in margins = 36 pt

      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, Math.min(imgHeight, pdfHeight - margin * 2));
      pdf.save(fileName);
    } catch (err) {
      console.error("Error exporting PDF:", err);
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }
}
