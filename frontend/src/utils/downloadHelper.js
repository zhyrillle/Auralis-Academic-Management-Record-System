import ExcelJS from "exceljs/dist/exceljs.min.js";
import schoolLogoUrl from "../assets/gccnhs_logo.png";
import depedLogoUrl from "../assets/deped_logo.png";
import { getTransmutedGrade, getGradeDescriptor } from "./depedTransmutation";


/**
 * Utility to download the grading sheet as a CSV file.
 * 
 * @param {Object} activeSelectedClass - The currently active class metadata.
 * @param {Array} students - Roster of students in the class.
 * @param {Function} calculateFinalGrade - Helper to calculate averages.
 * @param {Function} getDescriptor - Helper to resolve grade descriptors.
 * @param {Function} getRemark - Helper to resolve pass/fail remarks.
 */
export function downloadGradingSheetCSV(
  activeSelectedClass,
  students,
  calculateFinalGrade,
  getDescriptor,
  getRemark,
  teacherName = "Teacher"
) {
  if (!activeSelectedClass || !students) return;

  // Construct CSV string
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += `Grade & Section: ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName},School Year: 2026-2027\r\n`;
  csvContent += `Teacher: ${teacherName},Subject: ${activeSelectedClass.subject}\r\n\r\n`;
  csvContent += "Learner's Name,Sex,LRN,Term 1,Term 2,Term 3,Final Grade,Descriptor,Remark\r\n";

  // Add males
  students
    .filter((s) => s.sex === "M")
    .forEach((s) => {
      const final = calculateFinalGrade(s.term1, s.term2, s.term3);
      csvContent += `"${s.lastName}, ${s.firstName} ${s.middleName ? s.middleName.charAt(0) + "." : ""
        }",Male,${s.lrn},${s.term1},${s.term2},${s.term3},${final},"${getDescriptor(final)}",${getRemark(final)}\r\n`;
    });

  // Add females
  students
    .filter((s) => s.sex === "F")
    .forEach((s) => {
      const final = calculateFinalGrade(s.term1, s.term2, s.term3);
      csvContent += `"${s.lastName}, ${s.firstName} ${s.middleName ? s.middleName.charAt(0) + "." : ""
        }",Female,${s.lrn},${s.term1},${s.term2},${s.term3},${final},"${getDescriptor(final)}",${getRemark(final)}\r\n`;
    });

  // Create virtual anchor link and trigger download
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `Grading_Sheet_${activeSelectedClass.gradeLevel}_${activeSelectedClass.sectionName}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Official DepEd JHS Class Record Excel Exporter (.xlsx)
 * Mirrors the exact web layout: merged metadata, stacked headers, 8-column EX breakdown, and 3 summary columns.
 */
export async function exportClassRecordExcel({
  metadata = {},
  weights = { WW: 20, PT: 50, EX: 30 },
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
  students = [],
  grades = {},
}) {
  const wwCols = writtenWorkColumns.length > 0 ? writtenWorkColumns : [
    { id: "ww1", label: "1", max_score: 25 },
    { id: "ww2", label: "2", max_score: 25 },
    { id: "ww3", label: "3", max_score: 25 },
    { id: "ww4", label: "4", max_score: 25 },
  ];
  const ptCols = performanceTaskColumns.length > 0 ? performanceTaskColumns : [
    { id: "pt1", label: "1", max_score: 50 },
    { id: "pt2", label: "2", max_score: 50 },
    { id: "pt3", label: "3", max_score: 50 },
  ];

  const wwWeight = Number(weights.WW || 20);
  const ptWeight = Number(weights.PT || 50);
  const exWeight = Number(weights.EX || weights.QA || 30);

  const st1HPS = Number(examConfig?.st1HPS || 25);
  const st2HPS = Number(examConfig?.st2HPS || 25);
  const teHPS = Number(examConfig?.teHPS || 50);
  const st1Weight = Number(examConfig?.st1Weight || 30);
  const st2Weight = Number(examConfig?.st2Weight || 30);
  const teWeight = Number(examConfig?.teWeight || 40);

  const region = metadata.region || "Region X";
  const division = metadata.division || "GINGOOG";
  const schoolId = metadata.schoolId || "304130";
  const schoolName = metadata.schoolName || "GINGOOG CITY COMPREHENSIVE NHS";
  const schoolYear = metadata.schoolYear || "2026-2027";
  const termTitle = metadata.termTitle || "CLASS RECORD - TERM 1";
  const termHeader = metadata.termHeader || "FIRST TERM";
  const gradeLevel = metadata.gradeLevelDisplay || "8";
  const teacherName = metadata.teacherName || "HARVEY BABIA";
  const subjectName = metadata.subjectName || "ENGLISH";
  const section = metadata.section || "Carrots";
  const activeTerm = metadata.activeTerm || "T1";

  const wwColsCount = wwCols.length + 3;
  const ptColsCount = ptCols.length + 3;
  const exColsCount = 8;
  const summaryColsCount = 3;
  const totalCols = 2 + wwColsCount + ptColsCount + exColsCount + summaryColsCount;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Auralis Academic Management Record System";
  workbook.lastModifiedBy = "DepEd Order No. 8, s. 2015 Standard Module";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(termTitle, {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const thinBorder = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };

  // Row 1: Title Header Banner
  worksheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = termTitle;
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FF0F2E53" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 28;

  // Row 2: Metadata Row 1 (REGION, DIVISION, SCHOOL ID)
  worksheet.getRow(2).height = 20;
  worksheet.getCell(2, 2).value = "REGION";
  worksheet.getCell(2, 2).font = { bold: true, size: 9 };
  worksheet.getCell(2, 2).alignment = { horizontal: "right", vertical: "middle" };

  worksheet.mergeCells(2, 3, 2, 6);
  worksheet.getCell(2, 3).value = region;
  worksheet.getCell(2, 3).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 3; c <= 6; c++) worksheet.getCell(2, c).border = thinBorder;

  worksheet.getCell(2, 8).value = "DIVISION";
  worksheet.getCell(2, 8).font = { bold: true, size: 9 };
  worksheet.getCell(2, 8).alignment = { horizontal: "right", vertical: "middle" };

  worksheet.mergeCells(2, 9, 2, 12);
  worksheet.getCell(2, 9).value = division;
  worksheet.getCell(2, 9).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 9; c <= 12; c++) worksheet.getCell(2, c).border = thinBorder;

  worksheet.getCell(2, 14).value = "SCHOOL ID";
  worksheet.getCell(2, 14).font = { bold: true, size: 9 };
  worksheet.getCell(2, 14).alignment = { horizontal: "right", vertical: "middle" };

  worksheet.mergeCells(2, 15, 2, 18);
  worksheet.getCell(2, 15).value = schoolId;
  worksheet.getCell(2, 15).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 15; c <= 18; c++) worksheet.getCell(2, c).border = thinBorder;

  // Row 3: Metadata Row 2 (SCHOOL NAME, SCHOOL YEAR)
  worksheet.getRow(3).height = 20;
  worksheet.getCell(3, 2).value = "SCHOOL NAME";
  worksheet.getCell(3, 2).font = { bold: true, size: 9 };
  worksheet.getCell(3, 2).alignment = { horizontal: "right", vertical: "middle" };

  worksheet.mergeCells(3, 3, 3, 12);
  worksheet.getCell(3, 3).value = schoolName;
  worksheet.getCell(3, 3).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 3; c <= 12; c++) worksheet.getCell(3, c).border = thinBorder;

  worksheet.getCell(3, 14).value = "SCHOOL YEAR";
  worksheet.getCell(3, 14).font = { bold: true, size: 9 };
  worksheet.getCell(3, 14).alignment = { horizontal: "right", vertical: "middle" };

  worksheet.mergeCells(3, 15, 3, 18);
  worksheet.getCell(3, 15).value = schoolYear;
  worksheet.getCell(3, 15).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 15; c <= 18; c++) worksheet.getCell(3, c).border = thinBorder;

  // Row 4: Navy Accent Bar
  worksheet.mergeCells(4, 1, 4, totalCols);
  worksheet.getCell(4, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2E53" } };
  worksheet.getRow(4).height = 8;

  // Header column splits
  const wwHalf1 = Math.max(1, Math.floor(wwColsCount / 2));
  const ptHalf1 = Math.max(1, Math.floor(ptColsCount / 2));
  const ptColStart = 3 + wwColsCount;
  const exColStart = 3 + wwColsCount + ptColsCount;
  const subjHalf1 = 3;

  // Row 5: Header Row 1
  worksheet.mergeCells(5, 1, 8, 2);
  const termColCell = worksheet.getCell(5, 1);
  termColCell.value = termHeader;
  termColCell.font = { name: "Arial", size: 13, bold: true };
  termColCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let r = 5; r <= 8; r++) {
    worksheet.getCell(r, 1).border = thinBorder;
    worksheet.getCell(r, 2).border = thinBorder;
  }

  // GRADE LEVEL
  worksheet.mergeCells(5, 3, 5, 2 + wwHalf1);
  const lblGrade = worksheet.getCell(5, 3);
  lblGrade.value = "GRADE LEVEL";
  lblGrade.font = { bold: true, size: 8 };
  lblGrade.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  for (let c = 3; c <= 2 + wwHalf1; c++) worksheet.getCell(5, c).border = thinBorder;

  worksheet.mergeCells(5, 3 + wwHalf1, 5, 2 + wwColsCount);
  const valGrade = worksheet.getCell(5, 3 + wwHalf1);
  valGrade.value = gradeLevel;
  valGrade.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 3 + wwHalf1; c <= 2 + wwColsCount; c++) worksheet.getCell(5, c).border = thinBorder;

  // TEACHER (Spans Rows 5 & 6)
  worksheet.mergeCells(5, ptColStart, 6, ptColStart + ptHalf1 - 1);
  const lblTeacher = worksheet.getCell(5, ptColStart);
  lblTeacher.value = "TEACHER";
  lblTeacher.font = { bold: true, size: 8 };
  lblTeacher.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  for (let r = 5; r <= 6; r++) {
    for (let c = ptColStart; c <= ptColStart + ptHalf1 - 1; c++) worksheet.getCell(r, c).border = thinBorder;
  }

  worksheet.mergeCells(5, ptColStart + ptHalf1, 6, 2 + wwColsCount + ptColsCount);
  const valTeacher = worksheet.getCell(5, ptColStart + ptHalf1);
  valTeacher.value = teacherName;
  valTeacher.font = { bold: true, size: 9 };
  valTeacher.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let r = 5; r <= 6; r++) {
    for (let c = ptColStart + ptHalf1; c <= 2 + wwColsCount + ptColsCount; c++) worksheet.getCell(r, c).border = thinBorder;
  }

  // SUBJECT (Spans Rows 5 & 6)
  worksheet.mergeCells(5, exColStart, 6, exColStart + subjHalf1 - 1);
  const lblSubj = worksheet.getCell(5, exColStart);
  lblSubj.value = "SUBJECT";
  lblSubj.font = { bold: true, size: 8 };
  lblSubj.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  for (let r = 5; r <= 6; r++) {
    for (let c = exColStart; c <= exColStart + subjHalf1 - 1; c++) worksheet.getCell(r, c).border = thinBorder;
  }

  worksheet.mergeCells(5, exColStart + subjHalf1, 6, totalCols);
  const valSubj = worksheet.getCell(5, exColStart + subjHalf1);
  valSubj.value = subjectName;
  valSubj.font = { bold: true, size: 9 };
  valSubj.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let r = 5; r <= 6; r++) {
    for (let c = exColStart + subjHalf1; c <= totalCols; c++) worksheet.getCell(r, c).border = thinBorder;
  }

  // Row 6: SECTION
  worksheet.mergeCells(6, 3, 6, 2 + wwHalf1);
  const lblSec = worksheet.getCell(6, 3);
  lblSec.value = "SECTION";
  lblSec.font = { bold: true, size: 8 };
  lblSec.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  for (let c = 3; c <= 2 + wwHalf1; c++) worksheet.getCell(6, c).border = thinBorder;

  worksheet.mergeCells(6, 3 + wwHalf1, 6, 2 + wwColsCount);
  const valSec = worksheet.getCell(6, 3 + wwHalf1);
  valSec.value = section;
  valSec.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 3 + wwHalf1; c <= 2 + wwColsCount; c++) worksheet.getCell(6, c).border = thinBorder;

  // Row 7: Category Headers & Summary Headers
  // WW
  worksheet.mergeCells(7, 3, 7, 2 + wwColsCount);
  const wwCompHeader = worksheet.getCell(7, 3);
  wwCompHeader.value = `WRITTEN / ORAL WORKS (WWs) (${wwWeight}%)`;
  wwCompHeader.font = { bold: true, size: 9 };
  wwCompHeader.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 3; c <= 2 + wwColsCount; c++) worksheet.getCell(7, c).border = thinBorder;

  // PT
  worksheet.mergeCells(7, ptColStart, 7, 2 + wwColsCount + ptColsCount);
  const ptCompHeader = worksheet.getCell(7, ptColStart);
  ptCompHeader.value = `PRODUCT / PERFORMANCE TASKS (PTs) (${ptWeight}%)`;
  ptCompHeader.font = { bold: true, size: 9 };
  ptCompHeader.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = ptColStart; c <= 2 + wwColsCount + ptColsCount; c++) worksheet.getCell(7, c).border = thinBorder;

  // EX
  worksheet.mergeCells(7, exColStart, 7, exColStart + 7);
  const exCompHeader = worksheet.getCell(7, exColStart);
  exCompHeader.value = `EXAMINATIONS (EXs) (${exWeight}%)`;
  exCompHeader.font = { bold: true, size: 9 };
  exCompHeader.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = exColStart; c <= exColStart + 7; c++) worksheet.getCell(7, c).border = thinBorder;

  // Summary Headers (Merged Rows 7 & 8)
  const initCol = exColStart + 8;
  worksheet.mergeCells(7, initCol, 8, initCol);
  const lblInit = worksheet.getCell(7, initCol);
  lblInit.value = "Initial\nGrade";
  lblInit.font = { bold: true, size: 8 };
  lblInit.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getCell(7, initCol).border = thinBorder;
  worksheet.getCell(8, initCol).border = thinBorder;

  const termCol = initCol + 1;
  worksheet.mergeCells(7, termCol, 8, termCol);
  const lblTerm = worksheet.getCell(7, termCol);
  lblTerm.value = "Term\nGrade";
  lblTerm.font = { bold: true, size: 8 };
  lblTerm.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getCell(7, termCol).border = thinBorder;
  worksheet.getCell(8, termCol).border = thinBorder;

  const descCol = initCol + 2;
  worksheet.mergeCells(7, descCol, 8, descCol);
  const lblDesc = worksheet.getCell(7, descCol);
  lblDesc.value = "Descriptor";
  lblDesc.font = { bold: true, size: 8 };
  lblDesc.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  worksheet.getCell(7, descCol).border = thinBorder;
  worksheet.getCell(8, descCol).border = thinBorder;

  // Row 8: Sub-headers
  let subColIdx = 3;
  wwCols.forEach((col, idx) => {
    const cell = worksheet.getCell(8, subColIdx++);
    cell.value = idx + 1;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  ["Total", "PS", "WS"].forEach((lbl) => {
    const cell = worksheet.getCell(8, subColIdx++);
    cell.value = lbl;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  ptCols.forEach((col, idx) => {
    const cell = worksheet.getCell(8, subColIdx++);
    cell.value = idx + 1;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  ["Total", "PS", "WS"].forEach((lbl) => {
    const cell = worksheet.getCell(8, subColIdx++);
    cell.value = lbl;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  ["ST1", "ST2", "TE", "WS ST1", "WS ST2", "WS TE", "PS", "WS"].forEach((lbl) => {
    const cell = worksheet.getCell(8, subColIdx++);
    cell.value = lbl;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  // Row 9: HIGHEST POSSIBLE SCORE
  worksheet.mergeCells(9, 1, 9, 2);
  const hpsTitleCell = worksheet.getCell(9, 1);
  hpsTitleCell.value = "HIGHEST POSSIBLE SCORE";
  hpsTitleCell.font = { bold: true, italic: true, size: 8 };
  hpsTitleCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  worksheet.getCell(9, 1).border = thinBorder;
  worksheet.getCell(9, 2).border = thinBorder;

  let hpsColIdx = 3;
  const totalWWHps = wwCols.reduce((sum, c) => sum + Number(c.max_score || 0), 0);
  wwCols.forEach((c) => {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = Number(c.max_score || 0);
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  [totalWWHps, 100, `${wwWeight}%`].forEach((val) => {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = val;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  const totalPTHps = ptCols.reduce((sum, c) => sum + Number(c.max_score || 0), 0);
  ptCols.forEach((c) => {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = Number(c.max_score || 0);
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  [totalPTHps, 100, `${ptWeight}%`].forEach((val) => {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = val;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  [st1HPS, st2HPS, teHPS, st1Weight, st2Weight, teWeight, 100, `${exWeight}%`].forEach((val) => {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = val;
    cell.font = { bold: true, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  for (let s = 0; s < 3; s++) {
    const cell = worksheet.getCell(9, hpsColIdx++);
    cell.value = "";
    cell.border = thinBorder;
  }

  // Row 10: LEARNERS' NAMES Banner
  worksheet.mergeCells(10, 1, 10, totalCols);
  const lnCell = worksheet.getCell(10, 1);
  lnCell.value = "LEARNERS' NAMES";
  lnCell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
  lnCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2E53" } };
  lnCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  worksheet.getRow(10).height = 18;

  // Student Grouping
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

  const males = sortStudents(students.filter(isMale));
  const females = sortStudents(students.filter(isFemale));

  let currentRowIdx = 11;

  const renderStudentGroup = (list, groupLabel) => {
    worksheet.mergeCells(currentRowIdx, 1, currentRowIdx, totalCols);
    const divRow = worksheet.getCell(currentRowIdx, 1);
    divRow.value = groupLabel;
    divRow.font = { bold: true, size: 8, color: { argb: "FF0F172A" } };
    divRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFCBD5E1" } };
    divRow.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    worksheet.getRow(currentRowIdx).height = 18;
    currentRowIdx++;

    list.forEach((st, idx) => {
      const stId = String(st.id || st.student_id);
      const stGrades = grades[stId] || {};
      const ww = stGrades.writtenWorks || {};
      const pt = stGrades.performanceTasks || {};
      const ex = stGrades.examinations || {
        st1: stGrades.st1 || "",
        st2: stGrades.st2 || "",
        te: stGrades.te || stGrades.quarterlyAssessment || "",
      };

      // WW
      let wwTotal = 0;
      let hasWw = false;
      const wwRowScores = wwCols.map((c) => {
        const val = ww[c.id];
        if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
          hasWw = true;
          const num = Number(val);
          wwTotal += num;
          return num;
        }
        return "";
      });
      const wwPS = hasWw && totalWWHps > 0 ? parseFloat(((wwTotal / totalWWHps) * 100).toFixed(2)) : 0;
      const wwWS = hasWw ? parseFloat((wwPS * (wwWeight / 100)).toFixed(2)) : 0;

      // PT
      let ptTotal = 0;
      let hasPt = false;
      const ptRowScores = ptCols.map((c) => {
        const val = pt[c.id];
        if (val !== undefined && val !== null && val !== "" && !isNaN(Number(val))) {
          hasPt = true;
          const num = Number(val);
          ptTotal += num;
          return num;
        }
        return "";
      });
      const ptPS = hasPt && totalPTHps > 0 ? parseFloat(((ptTotal / totalPTHps) * 100).toFixed(2)) : 0;
      const ptWS = hasPt ? parseFloat((ptPS * (ptWeight / 100)).toFixed(2)) : 0;

      // EX
      const rawST1 = ex.st1 !== undefined && ex.st1 !== null && ex.st1 !== "" && !isNaN(Number(ex.st1)) ? Number(ex.st1) : "";
      const rawST2 = ex.st2 !== undefined && ex.st2 !== null && ex.st2 !== "" && !isNaN(Number(ex.st2)) ? Number(ex.st2) : "";
      const rawTE = ex.te !== undefined && ex.te !== null && ex.te !== "" && !isNaN(Number(ex.te)) ? Number(ex.te) : "";

      const hasST1 = rawST1 !== "";
      const hasST2 = rawST2 !== "";
      const hasTE = rawTE !== "";
      const hasEx = hasST1 || hasST2 || hasTE;

      const wsST1 = hasST1 && st1HPS > 0 ? parseFloat(((rawST1 / st1HPS) * st1Weight).toFixed(2)) : 0;
      const wsST2 = hasST2 && st2HPS > 0 ? parseFloat(((rawST2 / st2HPS) * st2Weight).toFixed(2)) : 0;
      const wsTE = hasTE && teHPS > 0 ? parseFloat(((rawTE / teHPS) * teWeight).toFixed(2)) : 0;

      const exPS = hasEx ? parseFloat((wsST1 + wsST2 + wsTE).toFixed(2)) : 0;
      const exWS = hasEx ? parseFloat((exPS * (exWeight / 100)).toFixed(2)) : 0;

      // Initial Grade, Term Grade, Descriptor
      const hasAny = hasWw || hasPt || hasEx;
      const totalWS = parseFloat((wwWS + ptWS + exWS).toFixed(2));
      const initialGrade = hasAny ? totalWS.toFixed(2) : "-";
      const termGrade = hasAny ? getTransmutedGrade(totalWS) : "-";
      const descriptor = typeof termGrade === "number" ? getGradeDescriptor(termGrade) : "-";
      const isFailing = typeof termGrade === "number" && termGrade < 75;

      const lastName = (st.lastName || st.last_name || "").toUpperCase();
      const firstName = (st.firstName || st.first_name || "");
      const middleInitial = st.middleName || st.middle_name ? `${(st.middleName || st.middle_name)[0].toUpperCase()}.` : "";
      const fullName = `${lastName}, ${firstName} ${middleInitial}`.trim();

      const studentRowVals = [
        idx + 1,
        fullName,
        ...wwRowScores,
        hasWw ? wwTotal : "",
        hasWw ? wwPS.toFixed(2) : "",
        hasWw ? wwWS.toFixed(2) : "",
        ...ptRowScores,
        hasPt ? ptTotal : "",
        hasPt ? ptPS.toFixed(2) : "",
        hasPt ? ptWS.toFixed(2) : "",
        hasST1 ? rawST1 : "",
        hasST2 ? rawST2 : "",
        hasTE ? rawTE : "",
        hasST1 ? wsST1.toFixed(2) : "",
        hasST2 ? wsST2.toFixed(2) : "",
        hasTE ? wsTE.toFixed(2) : "",
        hasEx ? exPS.toFixed(2) : "",
        hasEx ? exWS.toFixed(2) : "",
        initialGrade,
        termGrade,
        descriptor,
      ];

      const rowObj = worksheet.addRow(studentRowVals);
      worksheet.getRow(currentRowIdx).height = 18;

      rowObj.eachCell({ includeEmpty: true }, (cell, cNum) => {
        cell.border = thinBorder;
        cell.font = { size: 8 };
        if (cNum === 1) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { bold: true, size: 8 };
        } else if (cNum === 2) {
          cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          cell.font = { bold: true, size: 8 };
        } else if (cNum === totalCols - 1) { // Term Grade
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { bold: true, size: 8, color: { argb: isFailing ? "FFB91C1C" : "FF000000" } };
          if (isFailing) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
          }
        } else if (cNum === totalCols) { // Descriptor
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.font = { italic: true, bold: true, size: 8 };
        } else {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });

      currentRowIdx++;
    });
  };

  renderStudentGroup(males, "MALE");
  renderStudentGroup(females, "FEMALE");

  // Apply explicit column widths
  worksheet.columns.forEach((column, colIdx) => {
    if (colIdx === 0) column.width = 5;
    else if (colIdx === 1) column.width = 28;
    else if (colIdx >= totalCols - 3 && colIdx < totalCols - 1) column.width = 9;
    else if (colIdx === totalCols - 1) column.width = 14;
    else column.width = 6.5;
  });

  const safeSec = (section || "Section").replace(/[^a-zA-Z0-9]/g, "_");
  const safeSubj = (subjectName || "Subject").replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Class_Record_${safeSubj}_${safeSec}_${activeTerm}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
