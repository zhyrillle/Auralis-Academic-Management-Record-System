import { jsPDF } from "jspdf";

const DEFAULT_DESCRIPTORS = [
  { scale: "90-100", desc: "Advancing", remarks: "Passed" },
  { scale: "80-89", desc: "Benchmarking", remarks: "Passed" },
  { scale: "75-79", desc: "Connecting", remarks: "Passed" },
  { scale: "65-74", desc: "Developing", remarks: "Failed" },
  { scale: "0-64", desc: "Emerging", remarks: "Failed" },
];

const DEFAULT_MONTHS = [
  "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr",
];

// Cache downscaled high-DPI JPEG seal data URIs once per session (~15KB each, ~311 DPI at 55.5pt print size)
const cachedLogoPromises = new Map();

function loadOptimizedLogo(url, maxDim = 240) {
  if (!url) return Promise.resolve(null);
  const cacheKey = `${url}::${maxDim}`;
  if (cachedLogoPromises.has(cacheKey)) return cachedLogoPromises.get(cacheKey);

  const promise = (async () => {
    if (typeof window === "undefined" || typeof document === "undefined") return null;
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const nw = img.naturalWidth || maxDim;
      const nh = img.naturalHeight || maxDim;
      const scale = Math.min(1, maxDim / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
        format: "JPEG",
        ratio: w / h,
      };
    } catch {
      return null;
    }
  })();

  cachedLogoPromises.set(cacheKey, promise);
  return promise;
}

const pt = (px) => px * 0.75;
const safeText = (value) => (value === null || value === undefined ? "" : String(value));

/**
 * Generates an official 2-page US Letter DepEd SF9 PDF directly using native PDF vector
 * primitives (built-in Times fonts + crisp vector lines/borders + high-DPI cached seals).
 * Runs in ~5ms per student with zero Chromium or html2canvas overhead.
 */
export async function generateVectorSf9Pdf({
  studentProfile = {},
  grades = [],
  performanceDescriptors = [],
  attendanceData = {},
  comments = { term1: "", term2: "", term3: "" },
  depedLogo,
  gccnhsLogo,
  fileName,
  skipDownload = true,
}) {
  const [depedImg, gccnhsImg] = await Promise.all([
    loadOptimizedLogo(depedLogo, 240),
    loadOptimizedLogo(gccnhsLogo, 240),
  ]);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter", // 612 x 792 pt (= 816 x 1056 px at 96 DPI)
    compress: true,
  });

  const pageW = 612;
  const margin = pt(45); // 33.75 pt
  const contentW = pageW - margin * 2; // 544.5 pt
  const centerX = pageW / 2;

  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.75);

  const drawLogo = (imgObj, boxX, boxY, boxSize) => {
    if (!imgObj?.dataUrl) return;
    const ratio = imgObj.ratio || 1;
    const drawW = ratio >= 1 ? boxSize : boxSize * ratio;
    const drawH = ratio >= 1 ? boxSize / ratio : boxSize;
    const dx = boxX + (boxSize - drawW) / 2;
    const dy = boxY + (boxSize - drawH) / 2;
    pdf.addImage(imgObj.dataUrl, imgObj.format, dx, dy, drawW, drawH, undefined, "FAST");
  };

  const drawField = (label, value, x, y, totalWidth, { centerValue = false, uppercase = false } = {}) => {
    pdf.setFont("times", "bold");
    pdf.setFontSize(pt(11.5));
    pdf.text(label, x, y);
    const labelW = pdf.getTextWidth(label) + pt(6);
    const lineX1 = x + labelW;
    const lineX2 = x + totalWidth;
    pdf.line(lineX1, y + 1.5, lineX2, y + 1.5);

    const rawVal = safeText(value);
    const displayVal = uppercase ? rawVal.toUpperCase() : rawVal;
    if (displayVal) {
      pdf.setFont("times", "bold");
      pdf.setFontSize(pt(11));
      const maxValW = Math.max(10, lineX2 - lineX1 - pt(8));
      let fitted = displayVal;
      while (fitted.length > 1 && pdf.getTextWidth(fitted) > maxValW) {
        fitted = fitted.slice(0, -1);
      }
      if (centerValue) {
        pdf.text(fitted, (lineX1 + lineX2) / 2, y, { align: "center" });
      } else {
        pdf.text(fitted, lineX1 + pt(4), y);
      }
    }
  };

  const drawCellText = (text, cellX, cellY, cellW, cellH, {
    align = "center",
    fontSizePt = pt(15),
    fontStyle = "normal",
    padLeft = pt(6),
  } = {}) => {
    const str = safeText(text);
    if (!str) return;
    pdf.setFont("times", fontStyle);
    pdf.setFontSize(fontSizePt);
    const maxW = cellW - (align === "left" ? padLeft + pt(4) : pt(4));
    let actualSize = fontSizePt;
    while (actualSize > 6.5 && pdf.getTextWidth(str) > maxW) {
      actualSize -= 0.5;
      pdf.setFontSize(actualSize);
    }
    const baselineY = cellY + cellH / 2 + actualSize * 0.34;
    if (align === "left") {
      pdf.text(str, cellX + padLeft, baselineY);
    } else {
      pdf.text(str, cellX + cellW / 2, baselineY, { align: "center" });
    }
  };

  // =========================================================================
  // PAGE 1 (FRONT PAGE)
  // =========================================================================
  let y = margin;
  const logoSize = pt(74); // 55.5 pt

  // Institutional Header
  const headerLines = [
    { text: "Republic of the Philippines", size: pt(11), style: "normal", dy: pt(14) },
    { text: "Department of Education", size: pt(11), style: "normal", dy: pt(14) },
    { text: "Region X – Northern Mindanao", size: pt(11), style: "normal", dy: pt(14) },
    { text: "SCHOOLS DIVISION OFFICE OF GINGOOG CITY", size: pt(11), style: "bold", dy: pt(14) },
    { text: "West 1 District", size: pt(11), style: "normal", dy: pt(14) },
    { text: "Gingoog City, Misamis Oriental", size: pt(11), style: "normal", dy: pt(14) },
    { text: "GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL", size: pt(12), style: "bold", dy: pt(18) },
    { text: "LEARNER'S PERFORMANCE REPORT", size: pt(13), style: "bold", dy: pt(16) },
    { text: `School Year ${safeText(studentProfile.schoolYear)}`, size: pt(11), style: "normal", dy: pt(14) },
  ];

  const totalHeaderH = headerLines.reduce((sum, l) => sum + l.dy, 0);
  const logoTopY = y + (totalHeaderH - logoSize) / 2;
  drawLogo(depedImg, margin, logoTopY, logoSize);
  drawLogo(gccnhsImg, pageW - margin - logoSize, logoTopY, logoSize);

  let headerY = y + pt(10);
  for (const line of headerLines) {
    pdf.setFont("times", line.style);
    pdf.setFontSize(line.size);
    pdf.text(line.text, centerX, headerY, { align: "center" });
    headerY += line.dy;
  }
  y += totalHeaderH + pt(16);

  // Learner Information Block (3 rows, 22px pitch)
  const gap = pt(16);
  const rowPitch = pt(22);

  // Row 1: Name, Age, Sex
  const ageW = pt(85);
  const sexW = pt(100);
  const nameW = contentW - ageW - sexW - gap * 2;
  drawField("Name:", studentProfile.name, margin, y, nameW, { uppercase: true });
  drawField("Age:", studentProfile.age, margin + nameW + gap, y, ageW, { centerValue: true });
  drawField("Sex:", studentProfile.sex, margin + nameW + gap + ageW + gap, y, sexW, { centerValue: true });
  y += rowPitch;

  // Row 2: LRN, Grade, Section
  const gradeW = pt(90);
  const flexTotal = contentW - gradeW - gap * 2;
  const lrnW = flexTotal * (2 / 3.2);
  const sectionW = flexTotal * (1.2 / 3.2);
  drawField("LRN:", studentProfile.lrn, margin, y, lrnW);
  drawField("Grade:", studentProfile.grade || studentProfile.gradeLevel, margin + lrnW + gap, y, gradeW, { centerValue: true });
  drawField("Section:", studentProfile.section, margin + lrnW + gap + gradeW + gap, y, sectionW, { centerValue: true });
  y += rowPitch;

  // Row 3: Program
  drawField("Program:", studentProfile.program, margin, y, contentW);
  y += pt(24);

  // Salutation & Parent Letter
  pdf.setFont("times", "normal");
  pdf.setFontSize(pt(10.5));
  const letterLineH = pt(16);
  pdf.text("Dear Parents,", margin, y);
  y += letterLineH;
  pdf.text(
    "This Performance Report shows the ability and progress your child has made in the different learning areas as well as his/her core values.",
    margin + pt(28),
    y,
    { maxWidth: contentW - pt(28) }
  );
  y += letterLineH * 1.15;
  pdf.text(
    "The school welcomes you should you desire to know more about your child's progress.",
    margin + pt(28),
    y,
    { maxWidth: contentW - pt(28) }
  );
  y += pt(22);

  // Learning Progress and Achievement Table
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("LEARNING PROGRESS AND ACHIEVEMENT", centerX, y, { align: "center" });
  y += pt(8);

  const colW = [
    contentW * 0.42, // Subjects
    contentW * 0.10, // Term 1
    contentW * 0.10, // Term 2
    contentW * 0.10, // Term 3
    contentW * 0.14, // Final Grade
    contentW * 0.14, // Remarks
  ];
  const colX = [margin];
  for (let c = 0; c < colW.length - 1; c++) colX.push(colX[c] + colW[c]);

  const hdrTopH = pt(26);
  const hdrSubH = pt(18);
  const hdrTotalH = hdrTopH + hdrSubH;

  // Header cells
  pdf.rect(colX[0], y, colW[0], hdrTotalH);
  drawCellText("Subjects", colX[0], y, colW[0], hdrTotalH, { fontSizePt: pt(11.5), fontStyle: "bold" });

  pdf.rect(colX[1], y, colW[1] + colW[2] + colW[3], hdrTopH);
  drawCellText("TERM", colX[1], y, colW[1] + colW[2] + colW[3], hdrTopH, { fontSizePt: pt(11.5), fontStyle: "bold" });

  for (let t = 0; t < 3; t++) {
    pdf.rect(colX[1 + t], y + hdrTopH, colW[1 + t], hdrSubH);
    drawCellText(`Term ${t + 1}`, colX[1 + t], y + hdrTopH, colW[1 + t], hdrSubH, { fontSizePt: pt(10.5), fontStyle: "bold" });
  }

  pdf.rect(colX[4], y, colW[4], hdrTotalH);
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(10.5));
  pdf.text("Final", colX[4] + colW[4] / 2, y + hdrTotalH / 2 - 2, { align: "center" });
  pdf.text("Grade", colX[4] + colW[4] / 2, y + hdrTotalH / 2 + pt(10.5), { align: "center" });

  pdf.rect(colX[5], y, colW[5], hdrTotalH);
  drawCellText("Remarks", colX[5], y, colW[5], hdrTotalH, { fontSizePt: pt(11.5), fontStyle: "bold" });

  y += hdrTotalH;

  const gradeRowCount = grades.length + 1;
  const gradeRowH = gradeRowCount > 11 ? pt(22) : pt(25);
  const gradeFontPt = pt(13.5);

  for (const row of grades) {
    for (let c = 0; c < 6; c++) pdf.rect(colX[c], y, colW[c], gradeRowH);
    drawCellText(row.name, colX[0], y, colW[0], gradeRowH, {
      align: "left",
      fontSizePt: gradeFontPt,
      fontStyle: row.isHeader ? "bold" : row.isSubSubject ? "italic" : "normal",
      padLeft: row.isSubSubject ? pt(16) : pt(6),
    });
    drawCellText(row.t1, colX[1], y, colW[1], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: row.isHeader ? "bold" : "normal" });
    drawCellText(row.t2, colX[2], y, colW[2], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: row.isHeader ? "bold" : "normal" });
    drawCellText(row.t3, colX[3], y, colW[3], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: row.isHeader ? "bold" : "normal" });
    drawCellText(row.final, colX[4], y, colW[4], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: "bold" });
    drawCellText(row.remark, colX[5], y, colW[5], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: row.isHeader ? "bold" : "normal" });
    y += gradeRowH;
  }

  // General Average row
  const genAvgSpanW = colW[0] + colW[1] + colW[2] + colW[3];
  pdf.rect(colX[0], y, genAvgSpanW, gradeRowH);
  pdf.rect(colX[4], y, colW[4], gradeRowH);
  pdf.rect(colX[5], y, colW[5], gradeRowH);
  drawCellText("General Average", colX[0], y, genAvgSpanW, gradeRowH, { fontSizePt: gradeFontPt, fontStyle: "bold" });
  drawCellText(studentProfile.termGrade, colX[4], y, colW[4], gradeRowH, { fontSizePt: gradeFontPt, fontStyle: "bold" });
  const genRemark =
    studentProfile.termGrade !== "" && studentProfile.termGrade !== null && studentProfile.termGrade !== undefined
      ? (studentProfile.honorStatus || "Passed")
      : "";
  drawCellText(genRemark, colX[5], y, colW[5], gradeRowH, { fontSizePt: pt(12), fontStyle: "bold" });
  y += gradeRowH + pt(20);

  // Performance Descriptors Table
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("PERFORMANCE DESCRIPTORS", margin, y);
  y += pt(8);

  const descriptorsToUse =
    Array.isArray(performanceDescriptors) && performanceDescriptors.length > 0
      ? performanceDescriptors
      : DEFAULT_DESCRIPTORS;

  const descColW = [contentW * 0.35, contentW * 0.35, contentW * 0.30];
  const descColX = [margin, margin + descColW[0], margin + descColW[0] + descColW[1]];
  const descRowH = pt(23);
  const descFontPt = pt(13.5);

  pdf.setFillColor(250, 250, 250);
  for (let c = 0; c < 3; c++) pdf.rect(descColX[c], y, descColW[c], descRowH, "FD");
  drawCellText("Grading Scale", descColX[0], y, descColW[0], descRowH, { fontSizePt: descFontPt, fontStyle: "bold" });
  drawCellText("Description", descColX[1], y, descColW[1], descRowH, { fontSizePt: descFontPt, fontStyle: "bold" });
  drawCellText("Remarks", descColX[2], y, descColW[2], descRowH, { fontSizePt: descFontPt, fontStyle: "bold" });
  y += descRowH;

  for (const desc of descriptorsToUse) {
    for (let c = 0; c < 3; c++) pdf.rect(descColX[c], y, descColW[c], descRowH);
    drawCellText(desc.scale, descColX[0], y, descColW[0], descRowH, { fontSizePt: descFontPt });
    drawCellText(desc.desc, descColX[1], y, descColW[1], descRowH, { fontSizePt: descFontPt });
    drawCellText(desc.remarks, descColX[2], y, descColW[2], descRowH, { fontSizePt: descFontPt });
    y += descRowH;
  }

  // =========================================================================
  // PAGE 2 (BACK PAGE)
  // =========================================================================
  pdf.addPage("letter", "portrait");
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.75);
  y = margin + pt(8);

  // Section 1: ATTENDANCE RECORD
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("ATTENDANCE RECORD", centerX, y, { align: "center" });
  y += pt(8);

  const months =
    Array.isArray(attendanceData?.months) && attendanceData.months.length > 0
      ? attendanceData.months
      : DEFAULT_MONTHS;
  const classDays = attendanceData?.classDays || new Array(months.length).fill(0);
  const daysPresent = attendanceData?.daysPresent || new Array(months.length).fill(0);
  const daysAbsent = attendanceData?.daysAbsent || new Array(months.length).fill(0);
  const sumArr = (arr = []) => arr.reduce((acc, v) => acc + (Number(v) || 0), 0);

  const labelColW = contentW * 0.25;
  const numCols = months.length + 1;
  const dataColW = (contentW - labelColW) / numCols;
  const attHdrH = pt(28);
  const attRowH = pt(25);

  // Header row
  pdf.rect(margin, y, labelColW, attHdrH);
  drawCellText("Month", margin, y, labelColW, attHdrH, { align: "left", fontSizePt: pt(12), fontStyle: "bold", padLeft: pt(8) });
  for (let m = 0; m < months.length; m++) {
    const cx = margin + labelColW + m * dataColW;
    pdf.rect(cx, y, dataColW, attHdrH);
    drawCellText(months[m], cx, y, dataColW, attHdrH, { fontSizePt: pt(11), fontStyle: "bold" });
  }
  const totalColX = margin + labelColW + months.length * dataColW;
  pdf.rect(totalColX, y, dataColW, attHdrH);
  drawCellText("Total", totalColX, y, dataColW, attHdrH, { fontSizePt: pt(11.5), fontStyle: "bold" });
  y += attHdrH;

  const attRows = [
    { label: "No. of Class Days", values: classDays },
    { label: "No. of Days Present", values: daysPresent },
    { label: "No. of Days Absent", values: daysAbsent },
  ];
  for (const attRow of attRows) {
    pdf.rect(margin, y, labelColW, attRowH);
    drawCellText(attRow.label, margin, y, labelColW, attRowH, { align: "left", fontSizePt: pt(11.5), fontStyle: "bold", padLeft: pt(8) });
    for (let m = 0; m < months.length; m++) {
      const cx = margin + labelColW + m * dataColW;
      pdf.rect(cx, y, dataColW, attRowH);
      drawCellText(attRow.values[m] ?? 0, cx, y, dataColW, attRowH, { fontSizePt: pt(12.5) });
    }
    pdf.rect(totalColX, y, dataColW, attRowH);
    drawCellText(sumArr(attRow.values), totalColX, y, dataColW, attRowH, { fontSizePt: pt(12.5), fontStyle: "bold" });
    y += attRowH;
  }

  y += pt(22);

  // Section 2: TEACHER'S COMMENTS/REMARKS
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("TEACHER'S COMMENTS/REMARKS", centerX, y, { align: "center" });
  y += pt(8);

  const commentRowH = pt(42);
  const commentEntries = [
    { label: "Term 1", text: comments?.term1 || "" },
    { label: "Term 2", text: comments?.term2 || "" },
    { label: "Term 3", text: comments?.term3 || "" },
  ];
  for (const entry of commentEntries) {
    pdf.rect(margin, y, contentW, commentRowH);
    pdf.setFont("times", "bold");
    pdf.setFontSize(pt(11));
    pdf.text(entry.label, margin + pt(8), y + pt(13));
    if (entry.text) {
      pdf.setFont("times", "normal");
      pdf.setFontSize(pt(10.5));
      const lines = pdf.splitTextToSize(safeText(entry.text), contentW - pt(16)).slice(0, 2);
      pdf.text(lines, margin + pt(8), y + pt(25));
    }
    y += commentRowH;
  }

  y += pt(24);

  // Section 3: PARENTS/GUARDIAN'S SIGNATURE
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("PARENTS/GUARDIAN'S SIGNATURE", centerX, y, { align: "center" });
  y += pt(18);

  const sigBlockW = pt(360);
  const sigStartX = centerX - sigBlockW / 2;
  const sigLabelW = pt(55);
  for (const termLabel of ["Term 1", "Term 2", "Term 3"]) {
    pdf.setFont("times", "bold");
    pdf.setFontSize(pt(11));
    pdf.text(termLabel, sigStartX, y);
    pdf.line(sigStartX + sigLabelW + pt(10), y + 1.5, sigStartX + sigBlockW, y + 1.5);
    y += pt(20);
  }

  y += pt(14);

  // Section 4: CERTIFICATE OF TRANSFER
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("CERTIFICATE OF TRANSFER", centerX, y, { align: "center" });
  y += pt(16);

  pdf.setFont("times", "normal");
  pdf.setFontSize(pt(10.5));
  pdf.text(
    "This is to certify that the above-named learner has satisfactorily completed the requirements for the grade level indicated.",
    margin,
    y,
    { maxWidth: contentW }
  );
  y += pt(20);

  drawField("Admitted to Grade:", studentProfile.admittedToGrade, margin, y, pt(245), { centerValue: true });
  y += pt(18);
  drawField("Eligible for Admission to Grade:", studentProfile.eligibleForAdmission, margin, y, pt(340), { centerValue: true });
  y += pt(18);

  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(10.5));
  pdf.text("Approved:", margin, y);
  y += pt(22);

  const sigLineW = pt(180);
  // Adviser signature on right
  const advX = pageW - margin - pt(40) - sigLineW;
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11));
  if (studentProfile.adviserName) {
    pdf.text(safeText(studentProfile.adviserName), advX + sigLineW / 2, y, { align: "center" });
  }
  pdf.line(advX, y + 2, advX + sigLineW, y + 2);
  pdf.setFont("times", "normal");
  pdf.setFontSize(pt(10));
  pdf.text("Adviser", advX + sigLineW / 2, y + pt(12), { align: "center" });
  y += pt(32);

  // School Head signature on left
  const headX = margin + pt(40);
  const principalUpper = safeText(studentProfile.principalName).toUpperCase();
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11));
  if (principalUpper) {
    pdf.text(principalUpper, headX + sigLineW / 2, y, { align: "center" });
  }
  pdf.line(headX, y + 2, headX + sigLineW, y + 2);
  pdf.setFont("times", "normal");
  pdf.setFontSize(pt(10));
  pdf.text("School Head", headX + sigLineW / 2, y + pt(12), { align: "center" });
  y += pt(34);

  // Section 5: CANCELLATION OF ELIGIBILITY TO TRANSFER
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11.5));
  pdf.text("CANCELLATION OF ELIGIBILITY TO TRANSFER", centerX, y, { align: "center" });
  y += pt(20);

  const halfW = contentW * 0.44;
  drawField("Admitted in:", "", margin + pt(10), y, halfW);
  drawField("Date:", "", pageW - margin - pt(10) - halfW, y, halfW);
  y += pt(32);

  const cancelHeadX = margin + pt(10);
  pdf.setFont("times", "bold");
  pdf.setFontSize(pt(11));
  if (principalUpper) {
    pdf.text(principalUpper, cancelHeadX + sigLineW / 2, y, { align: "center" });
  }
  pdf.line(cancelHeadX, y + 2, cancelHeadX + sigLineW, y + 2);
  pdf.setFont("times", "normal");
  pdf.setFontSize(pt(10));
  pdf.text("School Head", cancelHeadX + sigLineW / 2, y + pt(12), { align: "center" });

  const nameParts = safeText(studentProfile.name || "STUDENT").split(",");
  const lastName = nameParts[0].trim().toUpperCase().replace(/[^A-Z0-9_-]/gi, "");
  const resolvedFileName = fileName || `${lastName || "STUDENT"}_SF9.pdf`;
  pdf.setProperties({ title: resolvedFileName.replace(/\.pdf$/i, "") });

  if (!skipDownload) {
    pdf.save(resolvedFileName);
  }

  const blob = pdf.output("blob");
  return { pdf, blob, fileName: resolvedFileName };
}
