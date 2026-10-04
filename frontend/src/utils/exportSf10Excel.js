import ExcelJS from "exceljs/dist/exceljs.min.js";
import depedLogoUrl from "../assets/deped_logo.png";
import depedGifLogoUrl from "../assets/deped-logo.gif";

/**
 * Defensive string sanitizer
 */
function safeStr(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") {
    if (val instanceof Date) return val.toLocaleDateString();
    return fallback;
  }
  return String(val);
}

/**
 * Safe number or string display
 */
function safeDisplay(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return val;
  if (typeof val === "string") return val;
  return fallback;
}

/**
 * Parse name parts safely from full name
 */
function parseNameParts(fullName) {
  const nameStr = safeStr(fullName).trim();
  if (!nameStr) return { last: "", first: "", middle: "", ext: "" };
  if (nameStr.includes(",")) {
    const [lastPart, ...restParts] = nameStr.split(",");
    const rest = restParts.join(" ").trim();
    const parts = rest.split(/\s+/).filter(Boolean);
    return {
      last: (lastPart || "").trim().toUpperCase(),
      first: parts[0] ? parts[0].toUpperCase() : "",
      middle: parts.slice(1).join(" ").toUpperCase(),
      ext: ""
    };
  }
  const parts = nameStr.split(/\s+/).filter(Boolean);
  return {
    last: parts[parts.length - 1] ? parts[parts.length - 1].toUpperCase() : "",
    first: parts.slice(0, -1).join(" ").toUpperCase(),
    middle: "",
    ext: ""
  };
}

/**
 * Helper to fetch image asset as base64 string for ExcelJS image attachment
 */
async function fetchImageBase64(url) {
  if (!url || typeof window === "undefined" || !window.fetch) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string" && result.includes(",")) {
          const mimeMatch = result.match(/data:([^;]+);/);
          const mime = mimeMatch ? mimeMatch[1] : "";
          const ext = mime.includes("gif") ? "gif" : (mime.includes("jpeg") || mime.includes("jpg")) ? "jpeg" : "png";
          resolve({
            base64: result.split(",")[1],
            extension: ext
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not load logo image for Excel attachment:", err);
    return null;
  }
}

/**
 * Standard colors & styles
 */
const COLORS = {
  headerFill: "FFDDD9C4", // Hex #DDD9C4 as explicitly required
  tableHeaderFill: "FFF2F2F2",
  genAvgFill: "FFF9F9F9",
  black: "FF000000",
  white: "FFFFFFFF"
};

/**
 * Factory for a complete blank scholastic record
 */
function createDefaultRecord(levelNum) {
  return {
    grade_level: String(levelNum),
    grade_level_name: `Grade ${levelNum}`,
    is_populated: false,
    school_name: "",
    school_id: "",
    district: "",
    division: "",
    region: "",
    section_name: "",
    school_year: "",
    adviser_name: "",
    grades: [],
    general_average: { t1: "", t2: "", t3: "", final: "", remarks: "" },
    remedial_classes: []
  };
}

/**
 * DepEd 8 Core Learning Areas + Sub-Subjects strictly matching specification:
 * 1. Filipino
 * 2. English
 * 3. Mathematics
 * 4. Science
 * 5. Araling Panlipunan (AP)
 * 6. Values Education
 * 7. Technology and Livelihood Education (TLE)
 * 8. MAPEH (Parent)
 * 9.   Music and Arts (Indented)
 * 10.  Physical Education and Health (Indented)
 * 11. SPA Specialization (If active)
 * 12. General Average
 */
const CANONICAL_CORE_SUBJECTS = [
  { code: "fil", name: "Filipino", isHeader: false, isSubSubject: false },
  { code: "eng", name: "English", isHeader: false, isSubSubject: false },
  { code: "math", name: "Mathematics", isHeader: false, isSubSubject: false },
  { code: "sci", name: "Science", isHeader: false, isSubSubject: false },
  { code: "ap", name: "Araling Panlipunan (AP)", isHeader: false, isSubSubject: false },
  { code: "ve", name: "Values Education", isHeader: false, isSubSubject: false },
  { code: "tle", name: "Technology and Livelihood Education (TLE)", isHeader: false, isSubSubject: false },
  { code: "mapeh", name: "MAPEH", isHeader: true, isSubSubject: false },
  { code: "music_arts", name: "Music and Arts", isHeader: false, isSubSubject: true },
  { code: "pe_health", name: "Physical Education and Health", isHeader: false, isSubSubject: true },
];

/**
 * Helper to find matching subject grade from record
 */
function findSubjectGrade(gradesList, def) {
  if (!Array.isArray(gradesList)) return null;

  // 1. Direct code equality
  let found = gradesList.find(g => String(g.code || "").toLowerCase() === def.code.toLowerCase());
  if (found) return found;

  // 2. Specific aliases
  if (def.code === "ve") {
    found = gradesList.find(g => {
      const c = String(g.code || "").toLowerCase();
      const n = String(g.name || "").toLowerCase();
      return c === "esp" || c === "ve" || n.includes("values") || n.includes("esp") || n.includes("edukasyon sa pagpapakatao");
    });
    if (found) return found;
  }
  if (def.code === "tle") {
    found = gradesList.find(g => {
      const c = String(g.code || "").toLowerCase();
      const n = String(g.name || "").toLowerCase();
      return c === "tle" || n.includes("technology") || n.includes("tle");
    });
    if (found) return found;
  }
  if (def.code === "music_arts") {
    found = gradesList.find(g => {
      const c = String(g.code || "").toLowerCase();
      const n = String(g.name || "").toLowerCase();
      return c === "ma" || c.includes("music") || (n.includes("music") && n.includes("art"));
    });
    if (found) return found;
  }
  if (def.code === "pe_health") {
    found = gradesList.find(g => {
      const c = String(g.code || "").toLowerCase();
      const n = String(g.name || "").toLowerCase();
      return c === "peh" || c.includes("pe") || (n.includes("physical") || n.includes("health"));
    });
    if (found) return found;
  }
  if (def.code === "spa_spec") {
    found = gradesList.find(g => {
      const c = String(g.code || "").toLowerCase();
      const n = String(g.name || "").toLowerCase();
      return c.includes("spa") || n.includes("spa");
    });
    if (found) return found;
  }

  // 3. Name normalized match
  const cleanDefName = def.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return gradesList.find(g => {
    const cleanGName = String(g.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleanGName.includes(cleanDefName) || cleanDefName.includes(cleanGName);
  });
}

/**
 * Apply box perimeter border helper:
 * Outer perimeter: 'medium' on ALL 4 sides (top, bottom, left, AND right)
 * Inner gridlines: strictly uniform 'thin'
 * Eliminates all asymmetric border clipping and double internal borders!
 */
function applyScholasticBoxBorders(worksheet, startRow, endRow, startCol = 2, endCol = 12) {
  // Pass 1: Set all interior gridlines strictly to thin with black stroke
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      worksheet.getCell(r, c).border = {
        top: { style: "thin", color: { argb: "000000" } },
        bottom: { style: "thin", color: { argb: "000000" } },
        left: { style: "thin", color: { argb: "000000" } },
        right: { style: "thin", color: { argb: "000000" } },
      };
    }
  }

  // Pass 2: Enforce medium borders strictly on the outer perimeter box
  // Top perimeter
  for (let c = startCol; c <= endCol; c++) {
    const topCell = worksheet.getCell(startRow, c);
    topCell.border = {
      ...topCell.border,
      top: { style: "medium", color: { argb: "000000" } },
    };
  }

  // Bottom perimeter
  for (let c = startCol; c <= endCol; c++) {
    const bottomCell = worksheet.getCell(endRow, c);
    bottomCell.border = {
      ...bottomCell.border,
      bottom: { style: "medium", color: { argb: "000000" } },
    };
  }

  // Left perimeter (Column 2)
  for (let r = startRow; r <= endRow; r++) {
    const leftCell = worksheet.getCell(r, startCol);
    leftCell.border = {
      ...leftCell.border,
      left: { style: "medium", color: { argb: "000000" } },
    };
  }

  // Right perimeter (Column 12)
  for (let r = startRow; r <= endRow; r++) {
    const rightCell = worksheet.getCell(r, endCol);
    rightCell.border = {
      ...rightCell.border,
      right: { style: "medium", color: { argb: "000000" } },
    };
  }
}

/**
 * Section Header Banner:
 * Fill: Background hex #DDD9C4
 * Clean border-free styling
 */
function addSectionBanner(worksheet, rowNum, title) {
  worksheet.mergeCells(rowNum, 2, rowNum, 12);
  const cell = worksheet.getCell(rowNum, 2);
  cell.value = title;
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.font = { name: "Arial", size: 9, bold: true, color: { argb: COLORS.black } };

  for (let c = 2; c <= 12; c++) {
    const current = worksheet.getCell(rowNum, c);
    current.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.headerFill },
    };
    current.border = {}; // Clean border-free styling as specified
    current.protection = { locked: true };
  }
  worksheet.getRow(rowNum).height = 15;
}

/**
 * Renders a full Scholastic Record block (Grade 7, 8, 9, or 10)
 */
function renderScholasticBlockExcel(worksheet, record, defaultGradeNum, startRowNum, isSpaActive) {
  const isPop = Boolean(record?.is_populated);
  const gradeLevel = isPop ? safeStr(record?.grade_level || defaultGradeNum) : safeStr(defaultGradeNum);
  const section = isPop ? safeStr(record?.section_name) : "";
  const sy = isPop ? safeStr(record?.school_year) : "";
  const adviser = isPop ? safeStr(record?.adviser_name) : "";
  const recSchool = isPop && record?.school_name ? safeStr(record.school_name) : "Gingoog City Comprehensive National High School";
  const recSchoolId = isPop && record?.school_id ? safeStr(record.school_id) : "304130";
  const recDistrict = isPop && record?.district ? safeStr(record.district) : "West 1 District";
  const recDivision = isPop && record?.division ? safeStr(record.division) : "Gingoog City";
  const recRegion = isPop && record?.region ? safeStr(record.region) : "Region X";
  const genAvg = record?.general_average || {};

  let curr = startRowNum;

  // 1. Meta Row 1: School (B..D, cols 2-4), School ID (E..F, cols 5-6), District (G..H, cols 7-8), Division (I..J, cols 9-10), Region (K..L, cols 11-12)
  const metaRow1 = curr;
  worksheet.mergeCells(metaRow1, 2, metaRow1, 4);
  worksheet.getCell(metaRow1, 2).value = `School: ${recSchool}`;

  worksheet.mergeCells(metaRow1, 5, metaRow1, 6);
  worksheet.getCell(metaRow1, 5).value = `School ID: ${recSchoolId}`;

  worksheet.mergeCells(metaRow1, 7, metaRow1, 8);
  worksheet.getCell(metaRow1, 7).value = `District: ${recDistrict}`;

  worksheet.mergeCells(metaRow1, 9, metaRow1, 10);
  worksheet.getCell(metaRow1, 9).value = `Division: ${recDivision}`;

  worksheet.mergeCells(metaRow1, 11, metaRow1, 12);
  worksheet.getCell(metaRow1, 11).value = `Region: ${recRegion}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(metaRow1, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(metaRow1).height = 14;
  curr++;

  // 2. Meta Row 2: Classified as Grade (B, col 2), Section (C, col 3), School Year (D..F, cols 4-6), Adviser (G..J, cols 7-10), Signature (K..L, cols 11-12)
  const metaRow2 = curr;
  worksheet.getCell(metaRow2, 2).value = `Classified as Grade: ${gradeLevel}`;
  worksheet.getCell(metaRow2, 3).value = `Section: ${section}`;

  worksheet.mergeCells(metaRow2, 4, metaRow2, 6);
  worksheet.getCell(metaRow2, 4).value = `School Year: ${sy}`;

  worksheet.mergeCells(metaRow2, 7, metaRow2, 10);
  worksheet.getCell(metaRow2, 7).value = `Name of Adviser/Teacher: ${adviser}`;

  worksheet.mergeCells(metaRow2, 11, metaRow2, 12);
  worksheet.getCell(metaRow2, 11).value = `Signature: ________________`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(metaRow2, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(metaRow2).height = 14;
  curr++;

  // Reset internal cells to borderless, and apply medium outer perimeter box
  for (let c = 2; c <= 12; c++) {
    worksheet.getCell(metaRow1, c).border = {};
    worksheet.getCell(metaRow2, c).border = {};
  }

  // Top perimeter of metadata box (metaRow1)
  for (let c = 2; c <= 12; c++) {
    const cell1 = worksheet.getCell(metaRow1, c);
    cell1.border = { ...cell1.border, top: { style: "medium", color: { argb: "000000" } } };
  }

  // Bottom perimeter of metadata box (metaRow2)
  for (let c = 2; c <= 12; c++) {
    const cell2 = worksheet.getCell(metaRow2, c);
    cell2.border = { ...cell2.border, bottom: { style: "medium", color: { argb: "000000" } } };
  }

  // Left perimeter of metadata box (Col 2)
  const r1MasterLeft = worksheet.getCell(metaRow1, 2);
  r1MasterLeft.border = {
    ...r1MasterLeft.border,
    left: { style: "medium", color: { argb: "000000" } },
  };
  const r2MasterLeft = worksheet.getCell(metaRow2, 2);
  r2MasterLeft.border = {
    ...r2MasterLeft.border,
    left: { style: "medium", color: { argb: "000000" } },
  };

  // Right perimeter of metadata box (Cols 11 & 12)
  const r1RightMaster = worksheet.getCell(metaRow1, 11);
  r1RightMaster.border = {
    ...r1RightMaster.border,
    right: { style: "medium", color: { argb: "000000" } },
  };
  const r1Col12 = worksheet.getCell(metaRow1, 12);
  r1Col12.border = {
    ...r1Col12.border,
    right: { style: "medium", color: { argb: "000000" } },
  };

  const r2RightMaster = worksheet.getCell(metaRow2, 11);
  r2RightMaster.border = {
    ...r2RightMaster.border,
    right: { style: "medium", color: { argb: "000000" } },
  };
  const r2Col12 = worksheet.getCell(metaRow2, 12);
  r2Col12.border = {
    ...r2Col12.border,
    right: { style: "medium", color: { argb: "000000" } },
  };

  // 3. Table Header Row 1
  const tableStartRow = curr;
  const thRow1 = curr;
  const thRow2 = curr + 1;

  worksheet.mergeCells(thRow1, 2, thRow2, 7);
  const cellLa = worksheet.getCell(thRow1, 2);
  cellLa.value = "LEARNING AREAS";
  cellLa.alignment = { horizontal: "center", vertical: "middle" };
  cellLa.font = { name: "Arial", size: 8.5, bold: true };

  // 3 Term Columns under Term Rating
  worksheet.mergeCells(thRow1, 8, thRow1, 10);
  const cellTr = worksheet.getCell(thRow1, 8);
  cellTr.value = "Term Rating";
  cellTr.alignment = { horizontal: "center", vertical: "middle" };
  cellTr.font = { name: "Arial", size: 8.5, bold: true };

  worksheet.mergeCells(thRow1, 11, thRow2, 11);
  const cellFin = worksheet.getCell(thRow1, 11);
  cellFin.value = "FINAL\nRATING";
  cellFin.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cellFin.font = { name: "Arial", size: 8, bold: true };

  worksheet.mergeCells(thRow1, 12, thRow2, 12);
  const cellRem = worksheet.getCell(thRow1, 12);
  cellRem.value = "REMARKS";
  cellRem.alignment = { horizontal: "center", vertical: "middle" };
  cellRem.font = { name: "Arial", size: 8.5, bold: true };

  worksheet.getRow(thRow1).height = 14;
  curr++;

  // 4. Table Header Row 2: Sub-columns for 3 Terms: 1, 2, 3
  worksheet.getCell(thRow2, 8).value = 1;
  worksheet.getCell(thRow2, 9).value = 2;
  worksheet.getCell(thRow2, 10).value = 3;

  for (let r = thRow1; r <= thRow2; r++) {
    for (let c = 2; c <= 12; c++) {
      const cell = worksheet.getCell(r, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.tableHeaderFill }
      };
      cell.protection = { locked: true };
      if (!cell.font) cell.font = { name: "Arial", size: 8.5, bold: true };
      if (!cell.alignment) cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  worksheet.getRow(thRow2).height = 13;
  curr++;

  // 5. Build subject list: Canonical 10 items + SPA Specialization if active
  const subjectsToRender = [...CANONICAL_CORE_SUBJECTS];
  if (isSpaActive) {
    subjectsToRender.push({
      code: "spa_spec",
      name: "SPA Specialization",
      isHeader: false,
      isSubSubject: false
    });
  }

  const gradesList = Array.isArray(record?.grades) ? record.grades : [];

  // Extract MAPEH sub-components for parent auto-calculation fallback
  const maGrade = findSubjectGrade(gradesList, { code: "music_arts", name: "Music and Arts" });
  const pehGrade = findSubjectGrade(gradesList, { code: "pe_health", name: "Physical Education and Health" });

  subjectsToRender.forEach((subDef) => {
    worksheet.mergeCells(curr, 2, curr, 7);
    const titleCell = worksheet.getCell(curr, 2);

    if (subDef.isSubSubject) {
      titleCell.value = `    ${subDef.name}`;
      titleCell.font = { name: "Arial", size: 8.5, bold: true };
      titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    } else {
      titleCell.value = subDef.name;
      titleCell.font = { name: "Arial", size: 8.5, bold: true };
      titleCell.alignment = { horizontal: "left", vertical: "middle" };
    }

    const matchedGrade = findSubjectGrade(gradesList, subDef);

    let t1 = matchedGrade ? safeDisplay(matchedGrade.t1) : "";
    let t2 = matchedGrade ? safeDisplay(matchedGrade.t2) : "";
    let t3 = matchedGrade ? safeDisplay(matchedGrade.t3) : "";
    let fin = matchedGrade ? safeDisplay(matchedGrade.final) : "";
    let rem = matchedGrade ? safeStr(matchedGrade.remark || matchedGrade.remarks) : "";

    // MAPEH Parent term synthesis if subcomponents exist
    if (subDef.code === "mapeh") {
      if (t1 === "" && maGrade && pehGrade && typeof maGrade.t1 === "number" && typeof pehGrade.t1 === "number") {
        t1 = Math.round((maGrade.t1 + pehGrade.t1) / 2);
      }
      if (t2 === "" && maGrade && pehGrade && typeof maGrade.t2 === "number" && typeof pehGrade.t2 === "number") {
        t2 = Math.round((maGrade.t2 + pehGrade.t2) / 2);
      }
      if (t3 === "" && maGrade && pehGrade && typeof maGrade.t3 === "number" && typeof pehGrade.t3 === "number") {
        t3 = Math.round((maGrade.t3 + pehGrade.t3) / 2);
      }
      if (fin === "" && typeof t1 === "number" && typeof t2 === "number" && typeof t3 === "number") {
        fin = Math.round((t1 + t2 + t3) / 3);
        rem = fin >= 75 ? "Passed" : "Failed";
      }
    }

    // Individual subject final computation if 3 terms completed
    if (fin === "" && typeof t1 === "number" && typeof t2 === "number" && typeof t3 === "number") {
      fin = Math.round((t1 + t2 + t3) / 3);
      rem = fin >= 75 ? "Passed" : "Failed";
    }

    // Set Term 1, 2, 3, Final, Remarks
    const cT1 = worksheet.getCell(curr, 8);
    const cT2 = worksheet.getCell(curr, 9);
    const cT3 = worksheet.getCell(curr, 10);
    const cFin = worksheet.getCell(curr, 11);
    const cRem = worksheet.getCell(curr, 12);

    cT1.value = t1;
    cT2.value = t2;
    cT3.value = t3;
    cFin.value = fin;
    cRem.value = rem;

    [cT1, cT2, cT3, cFin, cRem].forEach((cell) => {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { name: "Arial", size: 8.5, bold: subDef.isHeader };
      cell.protection = { locked: true };
    });

    for (let c = 2; c <= 7; c++) {
      worksheet.getCell(curr, c).protection = { locked: true };
    }

    worksheet.getRow(curr).height = 13.5;
    curr++;
  });

  // 6. General Average Row
  worksheet.mergeCells(curr, 2, curr, 7);
  const genAvgLabel = worksheet.getCell(curr, 2);
  genAvgLabel.value = "General Average";
  genAvgLabel.font = { name: "Arial", size: 8.5, bold: true };
  genAvgLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };

  const cGaT1 = worksheet.getCell(curr, 8);
  const cGaT2 = worksheet.getCell(curr, 9);
  const cGaT3 = worksheet.getCell(curr, 10);
  const cGaFin = worksheet.getCell(curr, 11);
  const cGaRem = worksheet.getCell(curr, 12);

  cGaT1.value = safeDisplay(genAvg.t1);
  cGaT2.value = safeDisplay(genAvg.t2);
  cGaT3.value = safeDisplay(genAvg.t3);
  cGaFin.value = safeDisplay(genAvg.final);
  cGaRem.value = safeStr(genAvg.remarks);

  [cGaT1, cGaT2, cGaT3, cGaFin, cGaRem].forEach((cell) => {
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.font = { name: "Arial", size: 8.5, bold: true };
  });

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(curr, c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.genAvgFill }
    };
    cell.protection = { locked: true };
  }

  worksheet.getRow(curr).height = 14;
  curr++;

  // 7. Remedial Classes Sub-block
  const remHdrRow = curr;
  worksheet.mergeCells(remHdrRow, 2, remHdrRow, 4);
  const remTitle = worksheet.getCell(remHdrRow, 2);
  remTitle.value = "Remedial Classes";
  remTitle.font = { name: "Arial", size: 8, bold: true };
  remTitle.alignment = { horizontal: "left", vertical: "middle" };

  worksheet.mergeCells(remHdrRow, 5, remHdrRow, 12);
  const remDates = worksheet.getCell(remHdrRow, 5);
  remDates.value = "Conducted from (mm/dd/yyyy): ____________________ to (mm/dd/yyyy): __________________";
  remDates.font = { name: "Arial", size: 8 };
  remDates.alignment = { horizontal: "left", vertical: "middle" };

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(remHdrRow, c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.genAvgFill }
    };
    cell.protection = { locked: true };
  }
  worksheet.getRow(remHdrRow).height = 13.5;
  curr++;

  // Remedial Table Headers
  const remThRow = curr;
  worksheet.mergeCells(remThRow, 2, remThRow, 5);
  worksheet.getCell(remThRow, 2).value = "Learning Areas";
  worksheet.mergeCells(remThRow, 6, remThRow, 7);
  worksheet.getCell(remThRow, 6).value = "Final Rating";
  worksheet.mergeCells(remThRow, 8, remThRow, 9);
  worksheet.getCell(remThRow, 8).value = "Remedial Class Mark";
  worksheet.mergeCells(remThRow, 10, remThRow, 11);
  worksheet.getCell(remThRow, 10).value = "Recomputed Final Grade";
  worksheet.getCell(remThRow, 12).value = "Remarks";

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(remThRow, c);
    cell.font = { name: "Arial", size: 8, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.white }
    };
    cell.protection = { locked: true };
  }
  worksheet.getRow(remThRow).height = 13.5;
  curr++;

  // 2 Blank Remedial Data Input Rows (Unlocked for Teacher input)
  for (let k = 0; k < 2; k++) {
    const rData = curr;
    worksheet.mergeCells(rData, 2, rData, 5);
    worksheet.mergeCells(rData, 6, rData, 7);
    worksheet.mergeCells(rData, 8, rData, 9);
    worksheet.mergeCells(rData, 10, rData, 11);

    for (let c = 2; c <= 12; c++) {
      const cell = worksheet.getCell(rData, c);
      cell.font = { name: "Arial", size: 8 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      // Teachers can manually write remediation records if applicable
      cell.protection = { locked: false };
    }
    worksheet.getRow(rData).height = 13;
    curr++;
  }

  const boxEndRow = curr - 1;

  // Apply medium border to outer perimeter, strictly thin to all inner gridlines of the table
  applyScholasticBoxBorders(worksheet, tableStartRow, boxEndRow, 2, 12);

  return curr;
}

/**
 * Renders the CERTIFICATION Box
 */
function renderCertificationBlockExcel(worksheet, cert, startRowNum, isTransfer = false, recordG10 = null) {
  let curr = startRowNum;

  if (isTransfer) {
    worksheet.mergeCells(curr, 2, curr, 12);
    const subHdr = worksheet.getCell(curr, 2);
    subHdr.value = "For Transfer Out / JHS Completer Only";
    subHdr.font = { name: "Arial", size: 8.5, italic: true };
    subHdr.alignment = { horizontal: "left", vertical: "middle" };
    for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
    worksheet.getRow(curr).height = 13.5;
    curr++;
  }

  // Box starts directly here with internal top padding (NO colored block banner!)
  const certBoxStart = curr;

  // 1. Top padding row inside certification box
  worksheet.mergeCells(curr, 2, curr, 12);
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 4.5;
  curr++;

  // 2. CERTIFICATION Header inside the box (plain white background, bold, centered)
  worksheet.mergeCells(curr, 2, curr, 12);
  const certTitle = worksheet.getCell(curr, 2);
  certTitle.value = "CERTIFICATION";
  certTitle.font = { name: "Arial", size: 9, bold: true };
  certTitle.alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 2; c <= 12; c++) {
    worksheet.getCell(curr, c).protection = { locked: true };
  }
  worksheet.getRow(curr).height = 14;
  curr++;

  const isEligibleG11 = isTransfer && recordG10?.general_average?.remarks === "Passed";
  const rawNextGrade = isEligibleG11 ? "Grade 11 (SHS)" : (cert.eligible_for_admission_to_grade || "____");
  const nextGradeClean = String(rawNextGrade).trim();
  const admissionGradeDisplay = nextGradeClean.toLowerCase().startsWith("grade")
    ? nextGradeClean
    : `Grade ${nextGradeClean}`;

  // 3. Cert statement Line 1 (with left margin/indent)
  worksheet.mergeCells(curr, 2, curr, 12);
  const certP1 = worksheet.getCell(curr, 2);
  certP1.value = `  I CERTIFY that this is a true record of ${cert.true_record_of} with LRN ${cert.lrn} and that he/she is eligible for admission to ${admissionGradeDisplay}.`;
  certP1.font = { name: "Arial", size: 8.5 };
  certP1.alignment = { vertical: "middle", wrapText: true, indent: 1 };
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 14;
  curr++;

  // 4. Cert statement Line 2 (with left margin/indent)
  worksheet.mergeCells(curr, 2, curr, 12);
  const certP2 = worksheet.getCell(curr, 2);
  certP2.value = `  Name of School: ${cert.school_name}   School ID: ${cert.school_id}   Last School Year Attended: ${cert.last_school_year_attended}`;
  certP2.font = { name: "Arial", size: 8.5 };
  certP2.alignment = { vertical: "middle", wrapText: true, indent: 1 };
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 14;
  curr++;

  // 5. Signature row 1: Stacked values (Date value & Principal name) separated by gap at Col 4
  const sigValRow = curr;
  worksheet.mergeCells(sigValRow, 2, sigValRow, 3);
  const cellDateVal = worksheet.getCell(sigValRow, 2);
  cellDateVal.value = cert.date_issued;
  cellDateVal.alignment = { horizontal: "center", vertical: "bottom" };
  cellDateVal.font = { name: "Arial", size: 8.5 };

  // Spacer gap at Col 4 (no underline)
  worksheet.getCell(sigValRow, 4).value = "";

  worksheet.mergeCells(sigValRow, 5, sigValRow, 9);
  const cellPrinVal = worksheet.getCell(sigValRow, 5);
  cellPrinVal.value = cert.principal_name;
  cellPrinVal.alignment = { horizontal: "center", vertical: "bottom" };
  cellPrinVal.font = { name: "Arial", size: 8.5, bold: true };

  worksheet.mergeCells(sigValRow, 10, sigValRow, 12);
  worksheet.getCell(sigValRow, 10).value = "";

  for (let c = 2; c <= 12; c++) {
    worksheet.getCell(sigValRow, c).protection = { locked: true };
  }
  worksheet.getRow(sigValRow).height = 18;
  curr++;

  // 6. Signature row 2: Labels below underline (Date label, Gap, Principal label, Affix Seal)
  const sigLblRow = curr;
  worksheet.mergeCells(sigLblRow, 2, sigLblRow, 3);
  const cellDateLbl = worksheet.getCell(sigLblRow, 2);
  cellDateLbl.value = "Date";
  cellDateLbl.alignment = { horizontal: "center", vertical: "top" };
  cellDateLbl.font = { name: "Arial", size: 8 };

  worksheet.getCell(sigLblRow, 4).value = "";

  worksheet.mergeCells(sigLblRow, 5, sigLblRow, 9);
  const cellPrinLbl = worksheet.getCell(sigLblRow, 5);
  cellPrinLbl.value = "Name of Principal/School Head over Printed Name";
  cellPrinLbl.alignment = { horizontal: "center", vertical: "top" };
  cellPrinLbl.font = { name: "Arial", size: 8 };

  worksheet.mergeCells(sigLblRow, 10, sigLblRow, 12);
  const cellSeal = worksheet.getCell(sigLblRow, 10);
  cellSeal.value = "(Affix School Seal here)";
  cellSeal.alignment = { horizontal: "center", vertical: "middle" };
  cellSeal.font = { name: "Arial", size: 8, italic: true };

  for (let c = 2; c <= 12; c++) {
    worksheet.getCell(sigLblRow, c).protection = { locked: true };
  }
  worksheet.getRow(sigLblRow).height = 14;
  curr++;

  // 7. Bottom padding row inside certification box
  worksheet.mergeCells(curr, 2, curr, 12);
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 5;
  curr++;

  const certBoxEnd = curr - 1;

  // 8. Remove all internal vertical grid borders across the certification box
  for (let r = certBoxStart; r <= certBoxEnd; r++) {
    for (let c = 2; c <= 12; c++) {
      worksheet.getCell(r, c).border = {};
    }
  }

  // 9. Separate underlines: only under Date (Cols 2..3) and Principal (Cols 5..9); Col 4 is completely clear!
  for (let c = 2; c <= 3; c++) {
    worksheet.getCell(sigValRow, c).border = {
      bottom: { style: "thin", color: { argb: "000000" } }
    };
  }
  for (let c = 5; c <= 9; c++) {
    worksheet.getCell(sigValRow, c).border = {
      bottom: { style: "thin", color: { argb: "000000" } }
    };
  }

  // 10. Apply medium outer perimeter strictly around the 4 sides of the Certification box
  for (let c = 2; c <= 12; c++) {
    const topCell = worksheet.getCell(certBoxStart, c);
    topCell.border = { ...topCell.border, top: { style: "medium", color: { argb: "000000" } } };
    const bottomCell = worksheet.getCell(certBoxEnd, c);
    bottomCell.border = { ...bottomCell.border, bottom: { style: "medium", color: { argb: "000000" } } };
  }
  for (let r = certBoxStart; r <= certBoxEnd; r++) {
    const leftCell = worksheet.getCell(r, 2);
    leftCell.border = { ...leftCell.border, left: { style: "medium", color: { argb: "000000" } } };
    const rightCell = worksheet.getCell(r, 12);
    rightCell.border = { ...rightCell.border, right: { style: "medium", color: { argb: "000000" } } };
  }

  return curr;
}

/**
 * Main DepEd SF10-JHS Excel Exporter (.xlsx)
 * 
 * Replicates the official SF10-JHS DepEd layout using 3 Term Ratings (1, 2, 3),
 * enforces worksheet protection with cell locking rules, eliminates double borders,
 * uses hex #DDD9C4 for title headers, and strictly follows the required learning area sequence.
 */
export async function exportSf10Excel({ student = {}, sf10Data = null, fileName = "" }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Auralis Academic Record Management System";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("SF10-JHS", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // Honor manual row page break while fitting to 1 page width
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.25,
        bottom: 0.25,
        header: 0.1,
        footer: 0.1,
      },
    },
    views: [{ showGridLines: true }],
  });

  // 12 Columns Grid:
  // Col 1 (A): Margin spacer (width: 3)
  // Col 2 (B): Classified as Grade / Learning Areas pt 1 (width: 15)
  // Col 3 (C): Section / Learning Areas pt 2 (width: 13)
  // Col 4 (D): School pt 3 / School Year pt 1 / Learning Areas pt 3 (width: 10)
  // Col 5 (E): School pt 4 / School Year pt 2 / Learning Areas pt 4 (width: 10) -> B..E = 48 width for School
  // Col 6 (F): School ID pt 1 / School Year pt 3 / Learning Areas pt 5 (width: 11)
  // Col 7 (G): School ID pt 2 / Adviser pt 1 / Learning Areas pt 6 (width: 11) -> F..G = 22 width for School ID
  // Col 8 (H): Term 1 / District pt 1 / Adviser pt 2 (width: 8.5)
  // Col 9 (I): Term 2 / District pt 2 / Adviser pt 3 (width: 8.5) -> H..I = 17 width for District
  // Col 10 (J): Term 3 / Division pt 1 / Signature pt 1 (width: 8.5)
  // Col 11 (K): FINAL RATING / Division pt 2 / Signature pt 2 (width: 11) -> J..K = 19.5 width for Division
  // Col 12 (L): REMARKS / Region / Signature pt 3 (width: 14.5) -> L = 14.5 width for Region
  worksheet.columns = [
    { width: 3 },    // A: Left margin spacer
    { width: 20.5 }, // B: Col 2 (Grade / School pt 1 / Learning Areas pt 1)
    { width: 18 },   // C: Col 3 (Section / School pt 2 / Learning Areas pt 2)
    { width: 9.5 },  // D: Col 4 (School pt 3 / School Year pt 1 / Learning Areas pt 3)
    { width: 9.5 },  // E: Col 5 (School ID pt 1 / School Year pt 2 / Learning Areas pt 4)
    { width: 9.5 },  // F: Col 6 (School ID pt 2 / School Year pt 3 / Learning Areas pt 5)
    { width: 11 },   // G: Col 7 (Adviser pt 1 / District pt 1 / Learning Areas pt 6)
    { width: 9.5 },  // H: Col 8 (Adviser pt 2 / District pt 2 / Term 1)
    { width: 9.5 },  // I: Col 9 (Adviser pt 3 / Division pt 1 / Term 2)
    { width: 9.5 },  // J: Col 10 (Adviser pt 4 / Division pt 2 / Term 3)
    { width: 11 },   // K: Col 11 (Signature pt 1 / Region pt 1 / FINAL RATING)
    { width: 14.5 }, // L: Col 12 (Signature pt 2 / Region pt 2 / REMARKS)
  ];

  // ============================================================
  // PREPARE DATA
  // ============================================================
  const nameParts = parseNameParts(student?.name);
  const rawLearner = sf10Data?.learner || {};
  const learner = {
    lrn: safeStr(rawLearner.lrn || student?.lrn || student?.LRN),
    last_name: safeStr(rawLearner.last_name || student?.last_name || student?.lastName || nameParts.last).toUpperCase(),
    first_name: safeStr(rawLearner.first_name || student?.first_name || student?.firstName || nameParts.first).toUpperCase(),
    middle_name: safeStr(rawLearner.middle_name || student?.middle_name || student?.middleName || nameParts.middle).toUpperCase(),
    name_extension: safeStr(rawLearner.name_extension || student?.extension_name || nameParts.ext).toUpperCase(),
    full_name: safeStr(rawLearner.full_name || student?.name || `${nameParts.last}, ${nameParts.first} ${nameParts.middle}`.trim()),
    birthdate_formatted: safeStr(rawLearner.birthdate_formatted || student?.dateOfBirth),
    sex: safeStr(rawLearner.sex || student?.sex || student?.gender)
  };

  const rawSchool = sf10Data?.school || {};
  const school = {
    school_id: safeStr(rawSchool.school_id || "304130"),
    school_name: safeStr(rawSchool.school_name || "Gingoog City Comprehensive National High School"),
    district: safeStr(rawSchool.district || "West 1 District"),
    division: safeStr(rawSchool.division || "Gingoog City"),
    region: safeStr(rawSchool.region || "Region X")
  };

  const principal = safeStr(sf10Data?.principal || student?.principalName || "DR. JANE DOE, PH.D.");
  const rawEligibility = sf10Data?.eligibility || {};
  const eligibility = {
    elementary_completer: rawEligibility.elementary_completer ?? true,
    general_average: safeStr(rawEligibility.general_average),
    citation: safeStr(rawEligibility.citation),
    elementary_school_name: safeStr(rawEligibility.elementary_school_name),
    elementary_school_id: safeStr(rawEligibility.elementary_school_id),
    elementary_school_address: safeStr(rawEligibility.elementary_school_address),
    pept_passer: Boolean(rawEligibility.pept_passer),
    pept_rating: safeStr(rawEligibility.pept_rating),
    als_passer: Boolean(rawEligibility.als_passer),
    als_rating: safeStr(rawEligibility.als_rating),
    others_specified: safeStr(rawEligibility.others_specified),
    exam_date: safeStr(rawEligibility.exam_date),
    testing_center_name_address: safeStr(rawEligibility.testing_center_name_address)
  };

  const scholasticRecords = Array.isArray(sf10Data?.scholastic_records) ? sf10Data.scholastic_records : [];
  let recordG7 = scholasticRecords[0] || createDefaultRecord(7);
  let recordG8 = scholasticRecords[1] || createDefaultRecord(8);
  let recordG9 = scholasticRecords[2] || createDefaultRecord(9);
  let recordG10 = scholasticRecords[3] || createDefaultRecord(10);

  // Client-side fallback if backend records not yet loaded
  const studentGradeNum = safeStr(student?.grade || student?.gradeLevel || "7").replace(/\D/g, "") || "7";
  if (!recordG7.is_populated && !recordG8.is_populated && Array.isArray(student?.grades) && student.grades.length > 0) {
    const targetRec = studentGradeNum === "8" ? recordG8 : studentGradeNum === "9" ? recordG9 : studentGradeNum === "10" ? recordG10 : recordG7;
    targetRec.is_populated = true;
    targetRec.section_name = safeStr(student?.section || targetRec.section_name);
    targetRec.school_year = safeStr(student?.schoolYear || targetRec.school_year);
    targetRec.adviser_name = safeStr(student?.adviserName || targetRec.adviser_name);
    targetRec.grades = student.grades.map(g => ({
      code: safeStr(g.code),
      name: safeStr(g.name),
      t1: safeDisplay(g.t1),
      t2: safeDisplay(g.t2),
      t3: safeDisplay(g.t3),
      final: safeDisplay(g.final),
      remarks: safeStr(g.remark || g.remarks),
      isHeader: Boolean(g.isHeader),
      isSubSubject: Boolean(g.isSubSubject)
    }));

    const mainSubjs = targetRec.grades.filter(g => !g.isSubSubject);
    const allT1 = mainSubjs.length > 0 && mainSubjs.every(g => typeof g.t1 === "number");
    const allFinal = mainSubjs.length > 0 && mainSubjs.every(g => typeof g.final === "number");
    targetRec.general_average = {
      t1: allT1 ? Math.round(mainSubjs.reduce((s, g) => s + g.t1, 0) / mainSubjs.length) : "",
      t2: "",
      t3: "",
      final: allFinal ? safeDisplay(student?.termGrade) : "",
      remarks: allFinal ? (student?.honorStatus ? "Passed" : "") : ""
    };
  }

  // SPA Specialization detection
  const isSpaActive = (
    String(student?.program || "").toUpperCase().includes("SPA") ||
    String(student?.program_code || "").toUpperCase() === "SPA" ||
    (Array.isArray(student?.grades) && student.grades.some(g => String(g.code || g.name).toUpperCase().includes("SPA"))) ||
    scholasticRecords.some(r => Array.isArray(r.grades) && r.grades.some(g => String(g.code || g.name).toUpperCase().includes("SPA")))
  );

  const rawCert = sf10Data?.certification || {};
  const cert = {
    true_record_of: safeStr(rawCert.true_record_of || learner.full_name),
    lrn: safeStr(rawCert.lrn || learner.lrn),
    eligible_for_admission_to_grade: safeStr(
      rawCert.eligible_for_admission_to_grade ||
      (studentGradeNum ? (studentGradeNum === "10" ? "Grade 11 (SHS)" : `Grade ${Number(studentGradeNum) + 1}`) : "Grade 8")
    ),
    school_name: safeStr(rawCert.school_name || school.school_name),
    school_id: safeStr(rawCert.school_id || school.school_id),
    last_school_year_attended: safeStr(rawCert.last_school_year_attended || recordG7.school_year || student?.schoolYear),
    principal_name: safeStr(rawCert.principal_name || principal),
    date_issued: safeStr(rawCert.date_issued || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
  };

  // ============================================================
  // PAGE 1 CONSTRUCTION
  // ============================================================
  let row = 1;

  // Row 1: Code Tag
  worksheet.getCell(row, 2).value = "SF 10 - JHS";
  worksheet.getCell(row, 2).font = { name: "Arial", size: 8.5, bold: true };
  worksheet.getCell(row, 2).protection = { locked: true };
  worksheet.getRow(row).height = 13;
  row++;

  // Embed Official Logos: Left: Republic Seal, Right: Official DepEd Logo
  try {
    const leftLogoData = await fetchImageBase64(depedLogoUrl); // Republic of the Philippines Seal
    const rightLogoData = await fetchImageBase64(depedGifLogoUrl); // Official DepEd Logo

    if (leftLogoData?.base64) {
      const img1 = workbook.addImage({ base64: leftLogoData.base64, extension: leftLogoData.extension || "png" });
      worksheet.addImage(img1, {
        tl: { col: 1.1, row: 1.15 },
        ext: { width: 48, height: 48 }
      });
    }

    if (rightLogoData?.base64) {
      const img2 = workbook.addImage({ base64: rightLogoData.base64, extension: rightLogoData.extension || "gif" });
      worksheet.addImage(img2, {
        tl: { col: 11.0, row: 1.15 },
        ext: { width: 95, height: 44 }
      });
    }
  } catch (imgErr) {
    console.warn("Logo embed skipped:", imgErr);
  }

  // Rows 2-5: Document Official Header
  const headerLines = [
    { text: "Republic of the Philippines", size: 8.5, bold: false, italic: false },
    { text: "Department of Education", size: 8.5, bold: false, italic: false },
    { text: "Learner's Permanent Academic Record for Junior High School (SF10-JHS)", size: 10, bold: true, italic: false },
    { text: "(Formerly Form 137)", size: 8, bold: false, italic: true }
  ];

  headerLines.forEach((hl) => {
    worksheet.mergeCells(row, 2, row, 12);
    const c = worksheet.getCell(row, 2);
    c.value = hl.text;
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.font = { name: "Arial", size: hl.size, bold: hl.bold, italic: hl.italic };
    for (let col = 2; col <= 12; col++) worksheet.getCell(row, col).protection = { locked: true };
    worksheet.getRow(row).height = 13;
    row++;
  });

  // Section 1: LEARNER'S INFORMATION
  addSectionBanner(worksheet, row, "LEARNER'S INFORMATION");
  row++;

  // Learner Info Line 1: LAST NAME, FIRST NAME, NAME EXTN, MIDDLE NAME
  worksheet.mergeCells(row, 2, row, 5);
  worksheet.getCell(row, 2).value = `LAST NAME: ${learner.last_name || "________________________"}`;
  worksheet.mergeCells(row, 6, row, 9);
  worksheet.getCell(row, 6).value = `FIRST NAME: ${learner.first_name || "____________________"}  NAME EXTN. (Jr,I,II): ${learner.name_extension || "_______"}`;
  worksheet.mergeCells(row, 10, row, 12);
  worksheet.getCell(row, 10).value = `MIDDLE NAME: ${learner.middle_name || "___________________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Learner Info Line 2: LRN, Birthdate, Sex
  worksheet.mergeCells(row, 2, row, 5);
  worksheet.getCell(row, 2).value = `Learner Reference Number (LRN): ${learner.lrn || "______________"}`;
  worksheet.mergeCells(row, 6, row, 9);
  worksheet.getCell(row, 6).value = `Birthdate (mm/dd/yyyy): ${learner.birthdate_formatted || "_____________________"}`;
  worksheet.mergeCells(row, 10, row, 12);
  worksheet.getCell(row, 10).value = `Sex: ${learner.sex || "_____________________________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Blank spacer
  worksheet.getRow(row).height = 4;
  row++;

  // Section 2: ELIGIBILITY FOR JHS ENROLMENT
  addSectionBanner(worksheet, row, "ELIGIBILITY FOR JHS ENROLMENT");
  row++;

  // Eligibility Line 1: Elementary Completer, Gen Avg, Citation
  worksheet.mergeCells(row, 2, row, 5);
  worksheet.getCell(row, 2).value = `[${eligibility.elementary_completer ? "✓" : " "}] Elementary School Completer`;
  worksheet.mergeCells(row, 6, row, 8);
  worksheet.getCell(row, 6).value = `General Average: ${eligibility.general_average || "________"}`;
  worksheet.mergeCells(row, 9, row, 12);
  worksheet.getCell(row, 9).value = `Citation: (If Any): ${eligibility.citation || "________________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    // Rule: Unlocked for manual input fields in Eligibility
    cell.protection = { locked: false };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Eligibility Line 2: School Name, School ID, Address
  worksheet.mergeCells(row, 2, row, 5);
  worksheet.getCell(row, 2).value = `Name of Elementary School: ${eligibility.elementary_school_name || "________________________"}`;
  worksheet.mergeCells(row, 6, row, 8);
  worksheet.getCell(row, 6).value = `School ID: ${eligibility.elementary_school_id || "________"}`;
  worksheet.mergeCells(row, 9, row, 12);
  worksheet.getCell(row, 9).value = `Address of School: ${eligibility.elementary_school_address || "________________________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: false };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Eligibility Line 3: Other Credential Presented
  worksheet.mergeCells(row, 2, row, 12);
  worksheet.getCell(row, 2).value = "Other Credential Presented";
  worksheet.getCell(row, 2).font = { name: "Arial", size: 8.5, italic: true };
  worksheet.getCell(row, 2).alignment = { vertical: "middle" };
  for (let c = 2; c <= 12; c++) worksheet.getCell(row, c).protection = { locked: true };
  worksheet.getRow(row).height = 13;
  row++;

  // Eligibility Line 4: PEPT Passer, ALS Passer, Others
  worksheet.mergeCells(row, 2, row, 5);
  worksheet.getCell(row, 2).value = `[${eligibility.pept_passer ? "✓" : " "}] PEPT Passer     Rating: ${eligibility.pept_rating || "_________"}`;
  worksheet.mergeCells(row, 6, row, 8);
  worksheet.getCell(row, 6).value = `[${eligibility.als_passer ? "✓" : " "}] ALS A & E Passer     Rating: ${eligibility.als_rating || "_____________"}`;
  worksheet.mergeCells(row, 9, row, 12);
  worksheet.getCell(row, 9).value = `Others (Pls. Specify): ${eligibility.others_specified || "___________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: false };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Eligibility Line 5: Exam Date, Testing Center
  worksheet.mergeCells(row, 2, row, 6);
  worksheet.getCell(row, 2).value = `Date of Examination/Assessment (mm/dd/yyyy): ${eligibility.exam_date || "____________"}`;
  worksheet.mergeCells(row, 7, row, 12);
  worksheet.getCell(row, 7).value = `Name and Address of Testing Center: ${eligibility.testing_center_name_address || "____________________________________"}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: false };
  }
  worksheet.getRow(row).height = 14;
  row++;

  // Blank spacer
  worksheet.getRow(row).height = 4;
  row++;

  // Section 3: SCHOLASTIC RECORD - GRADE 7
  addSectionBanner(worksheet, row, "SCHOLASTIC RECORD");
  row++;
  row = renderScholasticBlockExcel(worksheet, recordG7, "7", row, isSpaActive);

  // Blank spacer between blocks
  worksheet.getRow(row).height = 5;
  row++;

  // SCHOLASTIC RECORD - GRADE 8
  row = renderScholasticBlockExcel(worksheet, recordG8, "8", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 5;
  row++;

  // Page 1 Certification
  row = renderCertificationBlockExcel(worksheet, cert, row, false);

  // Blank spacer at bottom of Page 1 with explicit page break
  // In Excel OpenXML, row.addPageBreak() breaks AFTER the row.
  // Placing the break on page1SpacerRow ensures Page 1 ends here, and Page 2 header starts cleanly on the next row.
  const page1SpacerRow = worksheet.getRow(row);
  page1SpacerRow.height = 4;
  page1SpacerRow.addPageBreak();
  row++;

  // ============================================================
  // PAGE 2 (GRADE 9 & GRADE 10)
  // ============================================================
  // Row 1 of Page 2: "SF 10-JHS" and "Page 2 of 2" Header
  const page2StartRowIndex = row;

  // Page 2 Top bar
  worksheet.getCell(page2StartRowIndex, 2).value = "SF 10-JHS";
  worksheet.getCell(page2StartRowIndex, 2).font = { name: "Arial", size: 8.5, bold: true };
  worksheet.mergeCells(page2StartRowIndex, 11, page2StartRowIndex, 12);
  const p2Tag = worksheet.getCell(page2StartRowIndex, 11);
  p2Tag.value = "Page 2 of 2";
  p2Tag.font = { name: "Arial", size: 8.5, bold: true };
  p2Tag.alignment = { horizontal: "right" };
  for (let c = 2; c <= 12; c++) worksheet.getCell(page2StartRowIndex, c).protection = { locked: true };
  worksheet.getRow(page2StartRowIndex).height = 14;
  row++;

  // SCHOLASTIC RECORD - GRADE 9
  row = renderScholasticBlockExcel(worksheet, recordG9, "9", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 6;
  row++;

  // SCHOLASTIC RECORD - GRADE 10
  row = renderScholasticBlockExcel(worksheet, recordG10, "10", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 6;
  row++;

  // Transfer Out / Completer Certification
  row = renderCertificationBlockExcel(worksheet, cert, row, true, recordG10);

  // Page 2 Bottom Footnote
  worksheet.mergeCells(row, 2, row, 6);
  worksheet.getCell(row, 2).value = "(May add Certification box if needed)";
  worksheet.getCell(row, 2).font = { name: "Arial", size: 7.5, italic: true };
  worksheet.mergeCells(row, 10, row, 12);
  const fnTag = worksheet.getCell(row, 10);
  fnTag.value = "SFRT Revised 2017";
  fnTag.font = { name: "Arial", size: 7.5, italic: true };
  fnTag.alignment = { horizontal: "right" };
  for (let c = 2; c <= 12; c++) worksheet.getCell(row, c).protection = { locked: true };
  worksheet.getRow(row).height = 12;
  row++;

  // ============================================================
  // ENFORCE WORKSHEET PROTECTION
  // ============================================================
  await worksheet.protect("deped_sf10_auralis", {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  // ============================================================
  // WRITE & TRIGGER BROWSER DOWNLOAD
  // ============================================================
  const resolvedFileName = fileName || `${learner.last_name || "STUDENT"}_SF10.xlsx`;

  if (typeof window !== "undefined" && window.document) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = resolvedFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  return workbook;
}

export default exportSf10Excel;
