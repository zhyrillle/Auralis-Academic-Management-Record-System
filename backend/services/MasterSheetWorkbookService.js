const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const ASSET_DIRECTORY = path.join(__dirname, "..", "assets", "master-sheet");
const SCHOOL_LOGO_PATH = path.join(ASSET_DIRECTORY, "school-logo.png");
const DEPED_LOGO_PATH = path.join(ASSET_DIRECTORY, "deped-logo.gif");

const COLORS = {
  group: "D9E1F2",
  black: "000000",
};

const thinBorder = {
  top: { style: "thin", color: { argb: COLORS.black } },
  left: { style: "thin", color: { argb: COLORS.black } },
  bottom: { style: "thin", color: { argb: COLORS.black } },
  right: { style: "thin", color: { argb: COLORS.black } },
};

const horizontalBorder = {
  top: { style: "thin", color: { argb: COLORS.black } },
  bottom: { style: "thin", color: { argb: COLORS.black } },
};

const subjectBoundary = {
  style: "medium",
  color: { argb: "595959" },
};

const structureBoundary = {
  style: "medium",
  color: { argb: COLORS.black },
};

const columnLetter = (columnNumber) => {
  let value = columnNumber;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const sanitizeFilenamePart = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Unknown";

const buildFilename = (data) => {
  const gradeLevel = sanitizeFilenamePart(data.section.gradeLevel);
  const sectionName = sanitizeFilenamePart(data.section.name);
  const schoolYear = sanitizeFilenamePart(data.schoolYear.label).replace(
    /_/g,
    "-",
  );
  return `Master_Sheet_${gradeLevel}_${sectionName}_SY_${schoolYear}.xlsx`;
};

const toRomanNumeral = (value) => {
  const numericValue = Number.parseInt(String(value || "").trim(), 10);
  if (
    !Number.isInteger(numericValue) ||
    numericValue <= 0 ||
    numericValue > 3999
  ) {
    return String(value || "").trim();
  }

  const symbols = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remainder = numericValue;
  let result = "";

  symbols.forEach(([amount, symbol]) => {
    while (remainder >= amount) {
      result += symbol;
      remainder -= amount;
    }
  });

  return result;
};

const formatRegion = (value) => {
  const normalized = String(value || "").trim();
  const numericRegion = normalized.match(/^(?:REGION\s*)?(\d+)$/i);
  return numericRegion ? toRomanNumeral(numericRegion[1]) : normalized;
};

const applyCellStyle = (cell, options = {}) => {
  cell.font = {
    name: options.fontName || "Arial",
    size: options.size || 10,
    bold: Boolean(options.bold),
    color: { argb: options.fontColor || COLORS.black },
  };
  cell.alignment = {
    horizontal: options.horizontal || "center",
    vertical: "middle",
    wrapText: options.wrapText !== false,
  };
  cell.border = options.border === false ? {} : options.border || thinBorder;
  if (options.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: options.fill },
    };
  }
};

const styleRange = (
  worksheet,
  startRow,
  endRow,
  startColumn,
  endColumn,
  options,
) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      applyCellStyle(worksheet.getCell(row, column), options);
    }
  }
};

const addBrandingImages = (workbook, worksheet, totalColumns) => {
  if (fs.existsSync(SCHOOL_LOGO_PATH)) {
    const schoolLogoId = workbook.addImage({
      filename: SCHOOL_LOGO_PATH,
      extension: "png",
    });
    worksheet.addImage(schoolLogoId, {
      tl: { col: 1.6, row: 0.3 },
      ext: { width: 120, height: 120 },
      editAs: "oneCell",
    });
  }

  if (fs.existsSync(DEPED_LOGO_PATH)) {
    const depedLogoId = workbook.addImage({
      filename: DEPED_LOGO_PATH,
      extension: "gif",
    });
    worksheet.addImage(depedLogoId, {
      tl: { col: totalColumns - 2.8, row: 0.6 },
      ext: { width: 180, height: 66 },
      editAs: "oneCell",
    });
  }
};

const applySubjectGroupBoundaries = (worksheet, subjects, startRow, endRow) => {
  subjects.forEach((subject, index) => {
    const startColumn = 6 + index * 4;
    const endColumn = startColumn + 3;

    for (let row = startRow; row <= endRow; row += 1) {
      const firstCell = worksheet.getCell(row, startColumn);
      const lastCell = worksheet.getCell(row, endColumn);

      firstCell.border = {
        ...firstCell.border,
        left: subjectBoundary,
      };
      lastCell.border = {
        ...lastCell.border,
        right: subjectBoundary,
      };
    }
  });
};

const applyRangeOuterBorder = (
  worksheet,
  startRow,
  endRow,
  startColumn,
  endColumn,
) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = worksheet.getCell(row, column);
      cell.border = {
        ...cell.border,
        ...(row === startRow ? { top: structureBoundary } : {}),
        ...(row === endRow ? { bottom: structureBoundary } : {}),
        ...(column === startColumn ? { left: structureBoundary } : {}),
        ...(column === endColumn ? { right: structureBoundary } : {}),
      };
    }
  }
};

const applySectionRowBoundary = (worksheet, row, endColumn) => {
  for (let column = 1; column <= endColumn; column += 1) {
    const cell = worksheet.getCell(row, column);
    cell.border = {
      ...cell.border,
      top: structureBoundary,
      bottom: structureBoundary,
    };
  }
};

const writeHeaderField = (
  worksheet,
  { labelRange, valueRange, label, value, labelHorizontal = "center" },
) => {
  const labelCell = labelRange.split(":")[0];
  const valueCell = valueRange.split(":")[0];

  worksheet.mergeCells(labelRange);
  worksheet.getCell(labelCell).value = label;
  applyCellStyle(worksheet.getCell(labelCell), {
    size: 12,
    bold: true,
    horizontal: labelHorizontal,
    wrapText: false,
    border: false,
  });

  worksheet.mergeCells(valueRange);
  worksheet.getCell(valueCell).value = value || "";
  applyCellStyle(worksheet.getCell(valueCell), {
    size: 11,
    border: thinBorder,
  });
};

const writeHeader = (workbook, worksheet, data, totalColumns) => {
  const lastColumn = columnLetter(totalColumns);

  worksheet.mergeCells(`A1:${lastColumn}1`);
  worksheet.getCell("A1").value = "FINAL GRADES AND GENERAL AVERAGE";
  applyCellStyle(worksheet.getCell("A1"), {
    size: 24,
    bold: true,
    wrapText: false,
    border: false,
  });

  writeHeaderField(worksheet, {
    labelRange: "D3:G3",
    valueRange: "I3:L3",
    label: "REGION",
    value: formatRegion(data.school.region),
    labelHorizontal: "right",
  });
  writeHeaderField(worksheet, {
    labelRange: "C5:G5",
    valueRange: "I5:N5",
    label: "SCHOOL NAME",
    value: data.school.name,
    labelHorizontal: "right",
  });

  writeHeaderField(worksheet, {
    labelRange: "P3:R3",
    valueRange: "T3:X3",
    label: "DIVISION",
    value: data.school.division,
    labelHorizontal: "right",
  });
  writeHeaderField(worksheet, {
    labelRange: "P5:R5",
    valueRange: "T5:X5",
    label: "SCHOOL ID",
    value: data.school.code,
    labelHorizontal: "right",
  });

  writeHeaderField(worksheet, {
    labelRange: "Z3:AC3",
    valueRange: "AE3:AI3",
    label: "SCHOOL YEAR",
    value: data.schoolYear.label,
    labelHorizontal: "right",
  });
  writeHeaderField(worksheet, {
    labelRange: "Y5:AC5",
    valueRange: "AE5:AI5",
    label: "GRADE & SECTION",
    value: `${data.section.gradeLevel} - ${data.section.name}`,
    labelHorizontal: "right",
  });

  worksheet.getRow(1).height = 30;
  worksheet.getRow(2).height = 12.75;
  worksheet.getRow(3).height = 20.25;
  worksheet.getRow(4).height = 10.5;
  worksheet.getRow(5).height = 27;
  worksheet.getRow(6).height = 18.75;

  addBrandingImages(workbook, worksheet, totalColumns);
};

const writeTableHeader = (
  worksheet,
  subjects,
  rawAverageColumn,
  generalAverageColumn,
  adviserName,
) => {
  worksheet.mergeCells(7, 1, 7, 5);
  worksheet.getCell(7, 1).value = `ADVISER: ${adviserName || ""}`;
  styleRange(worksheet, 7, 7, 1, 5, {
    size: 10,
    bold: true,
    horizontal: "left",
    wrapText: false,
  });
  applyRangeOuterBorder(worksheet, 7, 7, 1, 5);

  worksheet.mergeCells(8, 1, 9, 5);
  worksheet.getCell(8, 1).value = "NAMES OF LEARNERS";
  styleRange(worksheet, 8, 9, 1, 5, {
    size: 14,
    bold: true,
  });

  subjects.forEach((subject, index) => {
    const startColumn = 6 + index * 4;
    worksheet.mergeCells(7, startColumn, 7, startColumn + 3);
    worksheet.getCell(7, startColumn).value = subject.label.toUpperCase();
    styleRange(worksheet, 7, 7, startColumn, startColumn + 3, {
      size: 11,
      bold: true,
      wrapText: false,
    });

    worksheet.mergeCells(8, startColumn, 8, startColumn + 2);
    worksheet.getCell(8, startColumn).value = "TERM";
    styleRange(worksheet, 8, 8, startColumn, startColumn + 2, {
      size: 9,
      bold: true,
    });

    worksheet.mergeCells(8, startColumn + 3, 9, startColumn + 3);
    worksheet.getCell(8, startColumn + 3).value = "FINAL\nGRADE";
    styleRange(worksheet, 8, 9, startColumn + 3, startColumn + 3, {
      size: 9,
      bold: true,
    });

    [1, 2, 3].forEach((termNumber, offset) => {
      const cell = worksheet.getCell(9, startColumn + offset);
      cell.value = termNumber;
      applyCellStyle(cell, { size: 9, bold: true });
    });
  });

  worksheet.mergeCells(7, rawAverageColumn, 9, rawAverageColumn);
  styleRange(worksheet, 7, 9, rawAverageColumn, rawAverageColumn, {
    size: 9,
    bold: true,
  });

  worksheet.mergeCells(7, generalAverageColumn, 9, generalAverageColumn);
  worksheet.getCell(7, generalAverageColumn).value = "GEN.\nAVERAGE";
  styleRange(worksheet, 7, 9, generalAverageColumn, generalAverageColumn, {
    size: 9,
    bold: true,
  });

  worksheet.getRow(7).height = 17.25;
  worksheet.getRow(8).height = 17.25;
  worksheet.getRow(9).height = 15.75;
};

const styleLearnerNameBlock = (worksheet, rowNumber) => {
  for (let column = 2; column <= 5; column += 1) {
    const cell = worksheet.getCell(rowNumber, column);
    applyCellStyle(cell, {
      fontName: "Arial",
      size: 10,
      horizontal: column === 2 ? "left" : "center",
      border: horizontalBorder,
    });
  }

  worksheet.getCell(rowNumber, 2).border = {
    ...horizontalBorder,
    left: thinBorder.left,
  };
  worksheet.getCell(rowNumber, 5).border = {
    ...horizontalBorder,
    right: thinBorder.right,
  };
};

const writeLearnerGroup = ({
  worksheet,
  students,
  label,
  startRow,
  subjects,
  rawAverageColumn,
  generalAverageColumn,
}) => {
  applyCellStyle(worksheet.getCell(startRow, 1), {
    size: 10,
    bold: true,
    horizontal: "left",
    fill: COLORS.group,
  });
  worksheet.getCell(startRow, 1).value = "";

  worksheet.mergeCells(startRow, 2, startRow, 5);
  worksheet.getCell(startRow, 2).value = label.toUpperCase();
  applyCellStyle(worksheet.getCell(startRow, 2), {
    size: 10,
    bold: true,
    horizontal: "left",
    fill: COLORS.group,
  });

  styleRange(worksheet, startRow, startRow, 6, generalAverageColumn, {
    size: 10,
    bold: true,
    horizontal: "left",
    fill: COLORS.group,
  });
  applySectionRowBoundary(worksheet, startRow, generalAverageColumn);
  worksheet.getRow(startRow).height = 15.75;

  let rowNumber = startRow + 1;
  students.forEach((student, index) => {
    worksheet.getCell(rowNumber, 1).value = index + 1;
    applyCellStyle(worksheet.getCell(rowNumber, 1), { size: 10 });

    worksheet.getCell(rowNumber, 2).value = student.displayName;
    styleLearnerNameBlock(worksheet, rowNumber);

    const finalCellReferences = [];
    const finalGradeValues = [];
    subjects.forEach((subject, subjectIndex) => {
      const grade = student.grades[subject.key] || {
        terms: [null, null, null],
        finalGrade: null,
      };
      const startColumn = 6 + subjectIndex * 4;

      grade.terms.forEach((termGrade, termIndex) => {
        const cell = worksheet.getCell(rowNumber, startColumn + termIndex);
        cell.value = Number.isFinite(termGrade) ? termGrade : null;
        applyCellStyle(cell, { size: 10 });
      });

      const firstTermCell = `${columnLetter(startColumn)}${rowNumber}`;
      const thirdTermCell = `${columnLetter(startColumn + 2)}${rowNumber}`;
      const finalColumn = startColumn + 3;
      const finalCell = worksheet.getCell(rowNumber, finalColumn);
      finalCell.value = {
        formula: `IF(COUNT(${firstTermCell}:${thirdTermCell})<3,"",ROUND(AVERAGE(${firstTermCell}:${thirdTermCell}),0))`,
        result: Number.isFinite(grade.finalGrade) ? grade.finalGrade : null,
      };
      applyCellStyle(finalCell, { size: 10, bold: true });
      finalCellReferences.push(`${columnLetter(finalColumn)}${rowNumber}`);
      finalGradeValues.push(grade.finalGrade);
    });

    const hasCompleteFinalGrades = finalGradeValues.every(Number.isFinite);
    const rawAverage = hasCompleteFinalGrades
      ? finalGradeValues.reduce((sum, value) => sum + value, 0) /
        finalGradeValues.length
      : null;

    const rawAverageCell = worksheet.getCell(rowNumber, rawAverageColumn);
    rawAverageCell.value = {
      formula: `IF(COUNT(${finalCellReferences.join(",")})<${subjects.length},"",AVERAGE(${finalCellReferences.join(",")}))`,
      result: rawAverage,
    };
    rawAverageCell.numFmt = "0.00";
    applyCellStyle(rawAverageCell, { size: 10 });

    const rawAverageReference = `${columnLetter(rawAverageColumn)}${rowNumber}`;
    const generalAverageCell = worksheet.getCell(
      rowNumber,
      generalAverageColumn,
    );
    generalAverageCell.value = {
      formula: `IF(${rawAverageReference}="","",ROUND(${rawAverageReference},0))`,
      result: Number.isFinite(student.generalAverage)
        ? student.generalAverage
        : null,
    };
    generalAverageCell.numFmt = "0";
    applyCellStyle(generalAverageCell, { size: 10, bold: true });
    worksheet.getRow(rowNumber).height = 18;
    rowNumber += 1;
  });

  return rowNumber;
};

class MasterSheetWorkbookService {
  static async generate(data) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Auralis Academic Management and Record System";
    workbook.lastModifiedBy = "Auralis";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.calcProperties.forceFullCalc = true;

    const worksheet = workbook.addWorksheet("SUMMARY - FINAL GRADES", {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        horizontalCentered: true,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.15,
          footer: 0.15,
        },
      },
      views: [{ showGridLines: false }],
    });

    const totalColumns = 5 + data.subjects.length * 4 + 2;
    const rawAverageColumn = totalColumns - 1;
    const generalAverageColumn = totalColumns;

    worksheet.properties.defaultRowHeight = 18;
    worksheet.getColumn(1).width = 3.5;
    worksheet.getColumn(2).width = 27;
    worksheet.getColumn(3).width = 3.43;
    worksheet.getColumn(4).width = 3.29;
    worksheet.getColumn(5).width = 4.29;

    data.subjects.forEach((subject, index) => {
      const startColumn = 6 + index * 4;
      worksheet.getColumn(startColumn).width = 3.8;
      worksheet.getColumn(startColumn + 1).width = 3.8;
      worksheet.getColumn(startColumn + 2).width = 3.8;
      worksheet.getColumn(startColumn + 3).width = 7.5;
    });
    worksheet.getColumn(rawAverageColumn).width = 9;
    worksheet.getColumn(generalAverageColumn).width = 10;

    writeHeader(workbook, worksheet, data, totalColumns);
    writeTableHeader(
      worksheet,
      data.subjects,
      rawAverageColumn,
      generalAverageColumn,
      data.adviser.name,
    );

    const maleStudents = data.students.filter((student) => student.sex === "M");
    const femaleStudents = data.students.filter(
      (student) => student.sex === "F",
    );
    const unspecifiedStudents = data.students.filter(
      (student) => student.sex === "UNSPECIFIED",
    );

    let nextRow = writeLearnerGroup({
      worksheet,
      students: maleStudents,
      label: "Male",
      startRow: 10,
      subjects: data.subjects,
      rawAverageColumn,
      generalAverageColumn,
    });
    nextRow = writeLearnerGroup({
      worksheet,
      students: femaleStudents,
      label: "Female",
      startRow: nextRow,
      subjects: data.subjects,
      rawAverageColumn,
      generalAverageColumn,
    });
    if (unspecifiedStudents.length) {
      nextRow = writeLearnerGroup({
        worksheet,
        students: unspecifiedStudents,
        label: "Unspecified",
        startRow: nextRow,
        subjects: data.subjects,
        rawAverageColumn,
        generalAverageColumn,
      });
    }

    const lastTableRow = Math.max(10, nextRow - 1);
    applySubjectGroupBoundaries(worksheet, data.subjects, 7, lastTableRow);
    applyRangeOuterBorder(worksheet, 7, lastTableRow, 1, generalAverageColumn);

    worksheet.pageSetup.printArea = `A1:${columnLetter(totalColumns)}${lastTableRow}`;
    await worksheet.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), filename: buildFilename(data) };
  }
}

module.exports = MasterSheetWorkbookService;
module.exports.buildFilename = buildFilename;
