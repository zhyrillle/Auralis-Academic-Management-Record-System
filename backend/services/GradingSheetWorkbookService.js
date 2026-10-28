const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const ASSET_DIRECTORY = path.join(__dirname, "..", "..", "frontend", "src", "assets");
const SCHOOL_LOGO_PATH = path.join(ASSET_DIRECTORY, "deped_logo.png");
const DEPED_LOGO_PATH = path.join(ASSET_DIRECTORY, "deped-logo.gif");

const COLORS = {
  headerBanner: "002060", // Dark blue banner bar
  groupHeader: "595959",   // Dark grey for MALE / FEMALE group headers
  white: "FFFFFF",
  black: "000000",
  lightGrey: "F2F2F2",
};

const thinBorder = {
  top: { style: "thin", color: { argb: COLORS.black } },
  left: { style: "thin", color: { argb: COLORS.black } },
  bottom: { style: "thin", color: { argb: COLORS.black } },
  right: { style: "thin", color: { argb: COLORS.black } },
};

function getDescriptor(finalGrade) {
  if (finalGrade === "" || finalGrade === null || finalGrade === undefined || isNaN(finalGrade)) return "";
  const score = parseFloat(finalGrade);
  if (score >= 90) return "Advancing";
  if (score >= 80) return "Benchmarking";
  if (score >= 75) return "Connecting";
  if (score >= 65) return "Developing";
  return "Emerging";
}

function getRemark(finalGrade) {
  if (finalGrade === "" || finalGrade === null || finalGrade === undefined || isNaN(finalGrade)) return "";
  const score = parseFloat(finalGrade);
  return score >= 75 ? "Passed" : "Failed";
}

function calculateFinalGrade(t1, t2, t3) {
  const grades = [t1, t2, t3].filter((g) => g !== "" && g !== null && g !== undefined && !isNaN(g));
  if (grades.length === 0) return "";
  const sum = grades.reduce((acc, curr) => acc + parseFloat(curr), 0);
  return Math.round(sum / grades.length);
}

class GradingSheetWorkbookService {
  static async generateWorkbook({
    sectionName = "Mahogany",
    gradeLevel = "Grade 10",
    subjectName = "Mathematics",
    teacherName = "Teacher",
    region = "Region X",
    division = "GINGOOG",
    schoolId = "304130",
    schoolName = "GINGOOG CITY COMPREHENSIVE NHS",
    schoolYear = "2026-2027",
    students = [],
  }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Auralis Academic System";
    workbook.lastModifiedBy = "Auralis Academic System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("GRADING SHEET - FINAL GRADES", {
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    // Column widths: 9-column grid aligning Region and School Name with Grade Level
    worksheet.columns = [
      { width: 5 },  // A: # (Index Number)
      { width: 15 }, // B: Label alignment part (A + B = 20, matches GRADE LEVEL / SECTION / REGION / SCHOOL NAME)
      { width: 23 }, // C: Remainder of Learners' Names (B + C = 38, full student name width)
      { width: 14 }, // D: Term 1
      { width: 14 }, // E: Term 2
      { width: 14 }, // F: Term 3
      { width: 16 }, // G: Final Grade
      { width: 22 }, // H: Descriptor
      { width: 16 }, // I: Remark
    ];

    const COLORS = {
      headerBanner: "002060",
      groupHeader: "595959",
      white: "FFFFFF",
      black: "000000",
      indexBlueFill: "D9E1F2", // Light blue fill for student number column
    };

    // Add Compact Logos if available (DepEd logo aligned right above SCHOOL ID cell)
    try {
      if (fs.existsSync(SCHOOL_LOGO_PATH)) {
        const logo1Id = workbook.addImage({
          filename: SCHOOL_LOGO_PATH,
          extension: "png",
        });
        worksheet.addImage(logo1Id, {
          tl: { col: 0.1, row: 0.1 },
          ext: { width: 60, height: 60 },
        });
      }
      if (fs.existsSync(DEPED_LOGO_PATH)) {
        const logo2Id = workbook.addImage({
          filename: DEPED_LOGO_PATH,
          extension: "gif",
        });
        worksheet.addImage(logo2Id, {
          tl: { col: 8.0, row: 0.1 },
          ext: { width: 90, height: 45 },
        });
      }
    } catch (e) {
      console.warn("Logo attachment warning:", e.message);
    }

    // Row 1: Main Title
    worksheet.mergeCells("A1:I1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "CLASS RECORD - FINAL GRADES";
    titleCell.font = { name: "Calibri", size: 20, bold: true, color: { argb: COLORS.black } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 40;

    // Row 2: Region, Division, School ID
    const r2 = worksheet.getRow(2);
    r2.height = 20;
    worksheet.mergeCells("A2:B2");
    const lblRegion = r2.getCell(1);
    lblRegion.value = "REGION";
    lblRegion.font = { bold: true, size: 10 };
    lblRegion.alignment = { horizontal: "left", vertical: "middle" };

    const valRegion = r2.getCell(3);
    valRegion.value = region;
    valRegion.alignment = { horizontal: "center", vertical: "middle" };
    valRegion.border = thinBorder;

    r2.getCell(4).value = "DIVISION";
    r2.getCell(4).font = { bold: true, size: 10 };
    r2.getCell(4).alignment = { horizontal: "center", vertical: "middle" };

    worksheet.mergeCells("E2:F2");
    const valDivision = r2.getCell(5);
    valDivision.value = division;
    valDivision.alignment = { horizontal: "center", vertical: "middle" };
    r2.getCell(5).border = thinBorder;
    r2.getCell(6).border = thinBorder;

    r2.getCell(7).value = "SCHOOL ID";
    r2.getCell(7).font = { bold: true, size: 10 };
    r2.getCell(7).alignment = { horizontal: "center", vertical: "middle" };

    worksheet.mergeCells("H2:I2");
    const valSchoolId = r2.getCell(8);
    valSchoolId.value = schoolId;
    valSchoolId.alignment = { horizontal: "center", vertical: "middle" };
    r2.getCell(8).border = thinBorder;
    r2.getCell(9).border = thinBorder;

    // Row 3: School Name, School Year
    const r3 = worksheet.getRow(3);
    r3.height = 20;
    worksheet.mergeCells("A3:B3");
    const lblSchoolName = r3.getCell(1);
    lblSchoolName.value = "SCHOOL NAME";
    lblSchoolName.font = { bold: true, size: 10 };
    lblSchoolName.alignment = { horizontal: "left", vertical: "middle" };

    worksheet.mergeCells("C3:F3");
    const valSchoolName = r3.getCell(3);
    valSchoolName.value = schoolName;
    valSchoolName.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 6; c++) r3.getCell(c).border = thinBorder;

    r3.getCell(7).value = "SCHOOL YEAR";
    r3.getCell(7).font = { bold: true, size: 10 };
    r3.getCell(7).alignment = { horizontal: "center", vertical: "middle" };

    worksheet.mergeCells("H3:I3");
    const valSchoolYear = r3.getCell(8);
    valSchoolYear.value = schoolYear;
    valSchoolYear.alignment = { horizontal: "center", vertical: "middle" };
    r3.getCell(8).border = thinBorder;
    r3.getCell(9).border = thinBorder;

    // Row 4: Dark Blue Banner
    worksheet.mergeCells("A4:I4");
    const bannerCell = worksheet.getCell("A4");
    bannerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBanner } };
    worksheet.getRow(4).height = 10;

    // Row 5: Grade Level, Subject
    const r5 = worksheet.getRow(5);
    r5.height = 22;
    worksheet.mergeCells("A5:B5");
    const lblGrade = r5.getCell(1);
    lblGrade.value = "GRADE LEVEL";
    lblGrade.font = { bold: true, size: 10 };
    lblGrade.alignment = { horizontal: "left", vertical: "middle" };
    lblGrade.border = thinBorder;
    r5.getCell(2).border = thinBorder;

    worksheet.mergeCells("C5:E5");
    const valGrade = r5.getCell(3);
    valGrade.value = gradeLevel;
    valGrade.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 5; c++) r5.getCell(c).border = thinBorder;

    r5.getCell(6).value = "SUBJECT";
    r5.getCell(6).font = { bold: true, size: 10 };
    r5.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    r5.getCell(6).border = thinBorder;

    worksheet.mergeCells("G5:I5");
    const valSubject = r5.getCell(7);
    valSubject.value = subjectName;
    valSubject.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 7; c <= 9; c++) r5.getCell(c).border = thinBorder;

    // Row 6: Section, Teacher
    const r6 = worksheet.getRow(6);
    r6.height = 22;
    worksheet.mergeCells("A6:B6");
    const lblSection = r6.getCell(1);
    lblSection.value = "SECTION";
    lblSection.font = { bold: true, size: 10 };
    lblSection.alignment = { horizontal: "left", vertical: "middle" };
    lblSection.border = thinBorder;
    r6.getCell(2).border = thinBorder;

    worksheet.mergeCells("C6:E6");
    const valSection = r6.getCell(3);
    valSection.value = sectionName;
    valSection.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 3; c <= 5; c++) r6.getCell(c).border = thinBorder;

    r6.getCell(6).value = "TEACHER";
    r6.getCell(6).font = { bold: true, size: 10 };
    r6.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    r6.getCell(6).border = thinBorder;

    worksheet.mergeCells("G6:I6");
    const valTeacher = r6.getCell(7);
    valTeacher.value = teacherName;
    valTeacher.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 7; c <= 9; c++) r6.getCell(c).border = thinBorder;

    // Row 7 & 8: Table Header
    worksheet.mergeCells("A7:C8");
    const hName = worksheet.getCell("A7");
    hName.value = "LEARNERS' NAMES";
    hName.font = { bold: true, size: 11 };
    hName.alignment = { horizontal: "center", vertical: "middle" };
    for (let r = 7; r <= 8; r++) {
      for (let c = 1; c <= 3; c++) {
        worksheet.getCell(r, c).border = thinBorder;
      }
    }

    worksheet.mergeCells("D7:F7");
    const hTerms = worksheet.getCell("D7");
    hTerms.value = "TERM GRADES";
    hTerms.font = { bold: true, size: 11 };
    hTerms.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = 4; c <= 6; c++) worksheet.getCell(7, c).border = thinBorder;

    const r8 = worksheet.getRow(8);
    r8.getCell(4).value = "TERM 1";
    r8.getCell(4).font = { bold: true, size: 10 };
    r8.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
    r8.getCell(4).border = thinBorder;

    r8.getCell(5).value = "TERM 2";
    r8.getCell(5).font = { bold: true, size: 10 };
    r8.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
    r8.getCell(5).border = thinBorder;

    r8.getCell(6).value = "TERM 3";
    r8.getCell(6).font = { bold: true, size: 10 };
    r8.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
    r8.getCell(6).border = thinBorder;

    worksheet.mergeCells("G7:G8");
    const hFinal = worksheet.getCell("G7");
    hFinal.value = "FINAL GRADE";
    hFinal.font = { bold: true, size: 11 };
    hFinal.alignment = { horizontal: "center", vertical: "middle" };
    hFinal.border = thinBorder;
    worksheet.getCell("G8").border = thinBorder;

    worksheet.mergeCells("H7:H8");
    const hDesc = worksheet.getCell("H7");
    hDesc.value = "DESCRIPTOR";
    hDesc.font = { italic: true, bold: true, size: 11 };
    hDesc.alignment = { horizontal: "center", vertical: "middle" };
    hDesc.border = thinBorder;
    worksheet.getCell("H8").border = thinBorder;

    worksheet.mergeCells("I7:I8");
    const hRem = worksheet.getCell("I7");
    hRem.value = "REMARK";
    hRem.font = { bold: true, size: 11 };
    hRem.alignment = { horizontal: "center", vertical: "middle" };
    hRem.border = thinBorder;
    worksheet.getCell("I8").border = thinBorder;

    worksheet.getRow(7).height = 22;
    worksheet.getRow(8).height = 22;

    const males = students.filter((s) => (s.sex || "M").toUpperCase().startsWith("M"));
    const females = students.filter((s) => (s.sex || "M").toUpperCase().startsWith("F"));

    /**
     * Helper to format student name as: First Name Middle Initial Last Name
     */
    const formatStudentName = (student) => {
      const first = (student.firstName || "").trim();
      const middleInitial = student.middleName ? student.middleName.trim().charAt(0) + "." : "";
      const last = (student.lastName || "").trim();
      return [first, middleInitial, last].filter(Boolean).join(" ");
    };

    let currentRowIdx = 9;

    // --- MALE SECTION ---
    worksheet.mergeCells(`A${currentRowIdx}:I${currentRowIdx}`);
    const maleHeaderCell = worksheet.getCell(`A${currentRowIdx}`);
    maleHeaderCell.value = "MALE";
    maleHeaderCell.font = { bold: true, size: 11, color: { argb: COLORS.white } };
    maleHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.groupHeader } };
    maleHeaderCell.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= 9; c++) {
      worksheet.getCell(currentRowIdx, c).border = thinBorder;
    }
    worksheet.getRow(currentRowIdx).height = 20;
    currentRowIdx++;

    males.forEach((student, index) => {
      const row = worksheet.getRow(currentRowIdx);
      row.height = 20;

      const fullName = formatStudentName(student);
      const final = calculateFinalGrade(student.term1, student.term2, student.term3);
      const descriptor = getDescriptor(final);
      const remark = getRemark(final);

      // Col A: Index Number in separate column with light blue fill background
      row.getCell(1).value = index + 1;
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.indexBlueFill } };
      row.getCell(1).border = thinBorder;

      // Col B & C: First Name Middle Initial Last Name (merged across B and C)
      worksheet.mergeCells(currentRowIdx, 2, currentRowIdx, 3);
      row.getCell(2).value = fullName;
      row.getCell(2).font = { name: "Calibri", size: 10 };
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(2).border = thinBorder;
      row.getCell(3).border = thinBorder;

      // Col D: Term 1
      row.getCell(4).value = student.term1 !== undefined && student.term1 !== null && student.term1 !== "" ? Number(student.term1) : "";
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(4).border = thinBorder;

      // Col E: Term 2
      row.getCell(5).value = student.term2 !== undefined && student.term2 !== null && student.term2 !== "" ? Number(student.term2) : "";
      row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).border = thinBorder;

      // Col F: Term 3
      row.getCell(6).value = student.term3 !== undefined && student.term3 !== null && student.term3 !== "" ? Number(student.term3) : "";
      row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(6).border = thinBorder;

      // Col G: Final Grade
      row.getCell(7).value = final !== "" ? Number(final) : "";
      row.getCell(7).font = { bold: true };
      row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(7).border = thinBorder;

      // Col H: Descriptor
      row.getCell(8).value = descriptor;
      row.getCell(8).font = { italic: true, bold: true };
      row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(8).border = thinBorder;

      // Col I: Remark
      row.getCell(9).value = remark;
      row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(9).border = thinBorder;

      currentRowIdx++;
    });

    // --- FEMALE SECTION ---
    worksheet.mergeCells(`A${currentRowIdx}:I${currentRowIdx}`);
    const femaleHeaderCell = worksheet.getCell(`A${currentRowIdx}`);
    femaleHeaderCell.value = "FEMALE";
    femaleHeaderCell.font = { bold: true, size: 11, color: { argb: COLORS.white } };
    femaleHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.groupHeader } };
    femaleHeaderCell.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 1; c <= 9; c++) {
      worksheet.getCell(currentRowIdx, c).border = thinBorder;
    }
    worksheet.getRow(currentRowIdx).height = 20;
    currentRowIdx++;

    females.forEach((student, index) => {
      const row = worksheet.getRow(currentRowIdx);
      row.height = 20;

      const fullName = formatStudentName(student);
      const final = calculateFinalGrade(student.term1, student.term2, student.term3);
      const descriptor = getDescriptor(final);
      const remark = getRemark(final);

      // Col A: Index Number in separate column with light blue fill background
      row.getCell(1).value = index + 1;
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.indexBlueFill } };
      row.getCell(1).border = thinBorder;

      // Col B & C: First Name Middle Initial Last Name (merged across B and C)
      worksheet.mergeCells(currentRowIdx, 2, currentRowIdx, 3);
      row.getCell(2).value = fullName;
      row.getCell(2).font = { name: "Calibri", size: 10 };
      row.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
      row.getCell(2).border = thinBorder;
      row.getCell(3).border = thinBorder;

      // Col D: Term 1
      row.getCell(4).value = student.term1 !== undefined && student.term1 !== null && student.term1 !== "" ? Number(student.term1) : "";
      row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(4).border = thinBorder;

      // Col E: Term 2
      row.getCell(5).value = student.term2 !== undefined && student.term2 !== null && student.term2 !== "" ? Number(student.term2) : "";
      row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(5).border = thinBorder;

      // Col F: Term 3
      row.getCell(6).value = student.term3 !== undefined && student.term3 !== null && student.term3 !== "" ? Number(student.term3) : "";
      row.getCell(6).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(6).border = thinBorder;

      // Col G: Final Grade
      row.getCell(7).value = final !== "" ? Number(final) : "";
      row.getCell(7).font = { bold: true };
      row.getCell(7).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(7).border = thinBorder;

      // Col H: Descriptor
      row.getCell(8).value = descriptor;
      row.getCell(8).font = { italic: true, bold: true };
      row.getCell(8).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(8).border = thinBorder;

      // Col I: Remark
      row.getCell(9).value = remark;
      row.getCell(9).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(9).border = thinBorder;

      currentRowIdx++;
    });

    return workbook;
  }
}

module.exports = GradingSheetWorkbookService;
