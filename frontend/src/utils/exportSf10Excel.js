import ExcelJS from "exceljs/dist/exceljs.min.js";
import depedLogoUrl from "../assets/deped_logo.png";
import gccnhsLogoUrl from "../assets/gccnhs_logo.png";

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
          resolve(result.split(",")[1]);
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
 * Outer perimeter: 'medium'
 * Inner gridlines: 'thin'
 * Eliminates all heavy/double internal borders!
 */
function applyBoxBorders(worksheet, startRow, endRow, startCol, endCol) {
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r);
    for (let c = startCol; c <= endCol; c++) {
      const cell = row.getCell(c);
      const isTop = (r === startRow);
      const isBottom = (r === endRow);
      const isLeft = (c === startCol);
      const isRight = (c === endCol);

      cell.border = {
        top: { style: isTop ? "medium" : "thin", color: { argb: COLORS.black } },
        bottom: { style: isBottom ? "medium" : "thin", color: { argb: COLORS.black } },
        left: { style: isLeft ? "medium" : "thin", color: { argb: COLORS.black } },
        right: { style: isRight ? "medium" : "thin", color: { argb: COLORS.black } },
      };
    }
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
  cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: COLORS.black } };

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
  worksheet.getRow(rowNum).height = 18;
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

  const boxStartRow = startRowNum;
  let curr = startRowNum;

  // 1. Meta Row 1: School, School ID, District, Division, Region
  worksheet.mergeCells(curr, 2, curr, 4);
  worksheet.getCell(curr, 2).value = `School: ${recSchool}`;
  worksheet.mergeCells(curr, 5, curr, 6);
  worksheet.getCell(curr, 5).value = `School ID: ${recSchoolId}`;
  worksheet.mergeCells(curr, 7, curr, 8);
  worksheet.getCell(curr, 7).value = `District: ${recDistrict}`;
  worksheet.mergeCells(curr, 9, curr, 10);
  worksheet.getCell(curr, 9).value = `Division: ${recDivision}`;
  worksheet.mergeCells(curr, 11, curr, 12);
  worksheet.getCell(curr, 11).value = `Region: ${recRegion}`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(curr, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(curr).height = 18;
  curr++;

  // 2. Meta Row 2: Classified as Grade, Section, School Year, Adviser, Signature
  worksheet.mergeCells(curr, 2, curr, 3);
  worksheet.getCell(curr, 2).value = `Classified as Grade: ${gradeLevel}`;
  worksheet.mergeCells(curr, 4, curr, 5);
  worksheet.getCell(curr, 4).value = `Section: ${section}`;
  worksheet.mergeCells(curr, 6, curr, 7);
  worksheet.getCell(curr, 6).value = `School Year: ${sy}`;
  worksheet.mergeCells(curr, 8, curr, 10);
  worksheet.getCell(curr, 8).value = `Name of Adviser/Teacher: ${adviser}`;
  worksheet.mergeCells(curr, 11, curr, 12);
  worksheet.getCell(curr, 11).value = `Signature: __________`;

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(curr, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.alignment = { vertical: "middle" };
    cell.protection = { locked: true };
  }
  worksheet.getRow(curr).height = 18;
  curr++;

  // 3. Table Header Row 1
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

  worksheet.getRow(thRow1).height = 16;
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
  worksheet.getRow(thRow2).height = 15;
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
      titleCell.font = { name: "Arial", size: 8.5 };
      titleCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    } else if (subDef.isHeader) {
      titleCell.value = subDef.name;
      titleCell.font = { name: "Arial", size: 8.5, bold: true };
      titleCell.alignment = { horizontal: "left", vertical: "middle" };
    } else {
      titleCell.value = subDef.name;
      titleCell.font = { name: "Arial", size: 8.5 };
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

    worksheet.getRow(curr).height = 16;
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

  worksheet.getRow(curr).height = 17;
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
  worksheet.getRow(remHdrRow).height = 16;
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
  worksheet.getRow(remThRow).height = 16;
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
    worksheet.getRow(rData).height = 15;
    curr++;
  }

  const boxEndRow = curr - 1;

  // Apply medium border to outer perimeter, thin to all inner gridlines
  applyBoxBorders(worksheet, boxStartRow, boxEndRow, 2, 12);

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
    worksheet.getRow(curr).height = 15;
    curr++;
  }

  addSectionBanner(worksheet, curr, "CERTIFICATION");
  curr++;

  const certBoxStart = curr;

  const isEligibleG11 = isTransfer && recordG10?.general_average?.remarks === "Passed";
  const nextGrade = isEligibleG11 ? "Grade 11 (SHS)" : (cert.eligible_for_admission_to_grade || "____");

  // Cert statement Line 1
  worksheet.mergeCells(curr, 2, curr, 12);
  const certP1 = worksheet.getCell(curr, 2);
  certP1.value = `I CERTIFY that this is a true record of ${cert.true_record_of} with LRN ${cert.lrn} and that he/she is eligible for admission to Grade ${nextGrade}.`;
  certP1.font = { name: "Arial", size: 8.5 };
  certP1.alignment = { vertical: "middle", wrapText: true };
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 17;
  curr++;

  // Cert statement Line 2
  worksheet.mergeCells(curr, 2, curr, 12);
  const certP2 = worksheet.getCell(curr, 2);
  certP2.value = `Name of School: ${cert.school_name}   School ID: ${cert.school_id}   Last School Year Attended: ${cert.last_school_year_attended}`;
  certP2.font = { name: "Arial", size: 8.5 };
  certP2.alignment = { vertical: "middle", wrapText: true };
  for (let c = 2; c <= 12; c++) worksheet.getCell(curr, c).protection = { locked: true };
  worksheet.getRow(curr).height = 16;
  curr++;

  // Signature row 1: lines
  const sigLineRow = curr;
  worksheet.mergeCells(sigLineRow, 2, sigLineRow, 4);
  worksheet.getCell(sigLineRow, 2).value = "________________________";
  worksheet.getCell(sigLineRow, 2).alignment = { horizontal: "center", vertical: "bottom" };

  worksheet.mergeCells(sigLineRow, 5, sigLineRow, 9);
  worksheet.getCell(sigLineRow, 5).value = `____________________________________`;
  worksheet.getCell(sigLineRow, 5).alignment = { horizontal: "center", vertical: "bottom" };

  worksheet.mergeCells(sigLineRow, 10, sigLineRow, 12);
  worksheet.getCell(sigLineRow, 10).value = "";

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(sigLineRow, c);
    cell.font = { name: "Arial", size: 8.5 };
    cell.protection = { locked: true };
  }
  worksheet.getRow(sigLineRow).height = 14;
  curr++;

  // Signature row 2: labels and values
  const sigLabelRow = curr;
  worksheet.mergeCells(sigLabelRow, 2, sigLabelRow, 4);
  worksheet.getCell(sigLabelRow, 2).value = `Date: ${cert.date_issued}`;
  worksheet.getCell(sigLabelRow, 2).alignment = { horizontal: "center", vertical: "top" };

  worksheet.mergeCells(sigLabelRow, 5, sigLabelRow, 9);
  worksheet.getCell(sigLabelRow, 5).value = `${cert.principal_name}\nName of Principal/School Head over Printed Name`;
  worksheet.getCell(sigLabelRow, 5).alignment = { horizontal: "center", vertical: "top", wrapText: true };

  worksheet.mergeCells(sigLabelRow, 10, sigLabelRow, 12);
  worksheet.getCell(sigLabelRow, 10).value = "(Affix School Seal here)";
  worksheet.getCell(sigLabelRow, 10).alignment = { horizontal: "center", vertical: "middle" };

  for (let c = 2; c <= 12; c++) {
    const cell = worksheet.getCell(sigLabelRow, c);
    cell.font = { name: "Arial", size: 8 };
    cell.protection = { locked: true };
  }
  worksheet.getRow(sigLabelRow).height = 24;
  curr++;

  const certBoxEnd = curr - 1;
  applyBoxBorders(worksheet, certBoxStart, certBoxEnd, 2, 12);

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
      paperSize: 1, // Letter size
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
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
  // Col 2-7 (B-G): Learning Areas & Left Demographics (combined width ~ 56)
  // Col 8 (H): Term 1 (width: 8)
  // Col 9 (I): Term 2 (width: 8)
  // Col 10 (J): Term 3 (width: 8)
  // Col 11 (K): Final Rating (width: 12)
  // Col 12 (L): Remarks (width: 14)
  worksheet.columns = [
    { width: 3 },  // A: Left margin spacer
    { width: 9 },  // B
    { width: 9 },  // C
    { width: 9 },  // D
    { width: 11 }, // E
    { width: 11 }, // F
    { width: 13 }, // G
    { width: 8 },  // H: Term 1
    { width: 8 },  // I: Term 2
    { width: 8 },  // J: Term 3
    { width: 12 }, // K: FINAL RATING
    { width: 14 }, // L: REMARKS
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
  worksheet.getCell(row, 2).font = { name: "Arial", size: 9, bold: true };
  worksheet.getCell(row, 2).protection = { locked: true };
  worksheet.getRow(row).height = 14;
  row++;

  // Embed Official Logos if available
  try {
    const depedLogoBase64 = await fetchImageBase64(depedLogoUrl);
    const gccnhsLogoBase64 = await fetchImageBase64(gccnhsLogoUrl);

    if (depedLogoBase64) {
      const img1 = workbook.addImage({ base64: depedLogoBase64, extension: "png" });
      worksheet.addImage(img1, {
        tl: { col: 1.1, row: 1.2 },
        ext: { width: 50, height: 50 }
      });
    }

    if (gccnhsLogoBase64) {
      const img2 = workbook.addImage({ base64: gccnhsLogoBase64, extension: "png" });
      worksheet.addImage(img2, {
        tl: { col: 10.6, row: 1.2 },
        ext: { width: 50, height: 50 }
      });
    }
  } catch (imgErr) {
    console.warn("Logo embed skipped:", imgErr);
  }

  // Rows 2-5: Document Official Header
  const headerLines = [
    { text: "Republic of the Philippines", size: 9, bold: false, italic: false },
    { text: "Department of Education", size: 9, bold: false, italic: false },
    { text: "Learner's Permanent Academic Record for Junior High School (SF10-JHS)", size: 10.5, bold: true, italic: false },
    { text: "(Formerly Form 137)", size: 8.5, bold: false, italic: true }
  ];

  headerLines.forEach((hl) => {
    worksheet.mergeCells(row, 2, row, 12);
    const c = worksheet.getCell(row, 2);
    c.value = hl.text;
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.font = { name: "Arial", size: hl.size, bold: hl.bold, italic: hl.italic };
    for (let col = 2; col <= 12; col++) worksheet.getCell(row, col).protection = { locked: true };
    worksheet.getRow(row).height = 15;
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
  worksheet.getRow(row).height = 17;
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
  worksheet.getRow(row).height = 17;
  row++;

  // Blank spacer
  worksheet.getRow(row).height = 6;
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
  worksheet.getRow(row).height = 17;
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
  worksheet.getRow(row).height = 17;
  row++;

  // Eligibility Line 3: Other Credential Presented
  worksheet.mergeCells(row, 2, row, 12);
  worksheet.getCell(row, 2).value = "Other Credential Presented";
  worksheet.getCell(row, 2).font = { name: "Arial", size: 8.5, italic: true };
  worksheet.getCell(row, 2).alignment = { vertical: "middle" };
  for (let c = 2; c <= 12; c++) worksheet.getCell(row, c).protection = { locked: true };
  worksheet.getRow(row).height = 15;
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
  worksheet.getRow(row).height = 17;
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
  worksheet.getRow(row).height = 17;
  row++;

  // Blank spacer
  worksheet.getRow(row).height = 6;
  row++;

  // Section 3: SCHOLASTIC RECORD - GRADE 7
  addSectionBanner(worksheet, row, "SCHOLASTIC RECORD");
  row++;
  row = renderScholasticBlockExcel(worksheet, recordG7, "7", row, isSpaActive);

  // Blank spacer between blocks
  worksheet.getRow(row).height = 8;
  row++;

  // SCHOLASTIC RECORD - GRADE 8
  row = renderScholasticBlockExcel(worksheet, recordG8, "8", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 8;
  row++;

  // Page 1 Certification
  row = renderCertificationBlockExcel(worksheet, cert, row, false);

  // ============================================================
  // PAGE 2 (GRADE 9 & GRADE 10)
  // ============================================================
  // Add explicit horizontal page break before Page 2
  worksheet.getRow(row).addPageBreak();

  // Page 2 Top bar
  worksheet.getCell(row, 2).value = "SF 10-JHS";
  worksheet.getCell(row, 2).font = { name: "Arial", size: 9, bold: true };
  worksheet.mergeCells(row, 11, row, 12);
  const p2Tag = worksheet.getCell(row, 11);
  p2Tag.value = "Page 2 of 2";
  p2Tag.font = { name: "Arial", size: 9, bold: true };
  p2Tag.alignment = { horizontal: "right" };
  for (let c = 2; c <= 12; c++) worksheet.getCell(row, c).protection = { locked: true };
  worksheet.getRow(row).height = 16;
  row++;

  // SCHOLASTIC RECORD - GRADE 9
  row = renderScholasticBlockExcel(worksheet, recordG9, "9", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 8;
  row++;

  // SCHOLASTIC RECORD - GRADE 10
  row = renderScholasticBlockExcel(worksheet, recordG10, "10", row, isSpaActive);

  // Blank spacer
  worksheet.getRow(row).height = 8;
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
  worksheet.getRow(row).height = 14;
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
