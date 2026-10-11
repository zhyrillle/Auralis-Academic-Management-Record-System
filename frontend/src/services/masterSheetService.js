import { jsPDF } from "jspdf";
import educationSealUrl from "../assets/deped_logo.png";
import depedWordmarkUrl from "../assets/deped-logo.gif";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

const parseJsonResponse = async (response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "The Master Sheet request could not be completed.");
  }
  return data;
};

export const normalizeMasterSheetError = (error) => {
  if (error instanceof TypeError || /failed to fetch/i.test(error?.message || "")) {
    return "Unable to connect to the Master Sheet service. Check the backend connection and try again.";
  }
  return error?.message || "The Master Sheet request could not be completed.";
};

export const getMasterSheetOptions = async (userId) => {
  const response = await fetch(
    `${API_BASE_URL}/master-sheets/options?user_id=${encodeURIComponent(userId)}`,
  );
  return parseJsonResponse(response);
};

export const getMasterSheet = async (adviserAssignmentId, userId) => {
  const response = await fetch(
    `${API_BASE_URL}/master-sheets/${encodeURIComponent(adviserAssignmentId)}?user_id=${encodeURIComponent(userId)}`,
  );
  return parseJsonResponse(response);
};

// Render the authorized response as a vector PDF, never a screenshot of the scroll area.
// Grades are copied as supplied; this exporter performs no grading calculations.
export const createMasterSheetPdf = async (data) => {
  if (!data?.subjects?.length || !Array.isArray(data.students) || !data.section || !data.schoolYear) {
    throw new Error("The Master Sheet data is incomplete. Reload the sheet and try again.");
  }
  // Use the same branding and field/table structure as the workbook template.
  // Canvas only converts logo assets; the report text and table remain vector content.
  const loadLogo = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // Sufficient resolution for the small printed logos, without oversized PDFs.
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ png: canvas.toDataURL("image/png"), ratio: canvas.width / canvas.height });
      } catch {
        reject(new Error("Unable to prepare the Master Sheet logos. Reload the page and try again."));
      }
    };
    image.onerror = () => reject(new Error("Unable to load the Master Sheet logos. Reload the page and try again."));
    image.src = url;
  });
  const [educationSeal, depedWordmark] = await Promise.all([
    loadLogo(educationSealUrl), loadLogo(depedWordmarkUrl),
  ]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const width = pageWidth - margin * 2;
  const nameWidth = 70;
  const numberWidth = 7;
  const averageWidth = 17;
  const subjectWidth = (width - nameWidth - averageWidth) / data.subjects.length;
  // Like the workbook, leave more room for FINAL GRADE than each term number.
  const termWidth = subjectWidth / 5;
  const finalWidth = subjectWidth - termWidth * 3;
  const bottom = pageHeight - 18;
  const tableTop = 50;
  const headerHeight = 20;
  let y = 0;
  const gradeText = (grade) => grade === null || grade === undefined || grade === "" ? "" : String(grade);

  const cell = (x, top, w, h, text, { bold = false, align = "center", fill = null, size = 7, font = "times" } = {}) => {
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.15);
    if (fill) pdf.setFillColor(...fill);
    pdf.rect(x, top, w, h, fill ? "FD" : "S");
    pdf.setTextColor(0);
    pdf.setFont(font, bold ? "bold" : "normal");
    let textSize = size;
    pdf.setFontSize(textSize);
    const textWidth = Math.max(w - (align === "left" ? 3 : 1.5), 1);
    let lines = pdf.splitTextToSize(String(text), textWidth);
    while (lines.length * textSize * 0.3528 * 1.12 > h - 1 && textSize > 5) {
      textSize -= 0.5;
      pdf.setFontSize(textSize);
      lines = pdf.splitTextToSize(String(text), textWidth);
    }
    if (lines.length * textSize * 0.3528 * 1.12 > h - 1) {
      throw new Error("A Master Sheet field is too long to fit the template. Review the record.");
    }
    const lineHeight = textSize * 0.3528 * 1.12;
    const textX = align === "left" ? x + 1.5 : x + w / 2;
    pdf.text(lines, textX, top + h / 2 - (lines.length - 1) * lineHeight / 2, { align, baseline: "middle", lineHeightFactor: 1.12 });
  };

  const headerField = (x, top, label, labelWidth, value, valueWidth) => {
    pdf.setFont("times", "bold");
    pdf.setFontSize(9);
    pdf.text(label, x + labelWidth - 2, top + 3.5, { align: "right", baseline: "middle" });
    cell(x + labelWidth, top, valueWidth, 7, value || "", { size: 9, font: "helvetica" });
  };
  const finishTable = () => {
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.4);
    pdf.rect(margin, tableTop, width, y - tableTop);
    // Emphasize the name, subject, and average boundaries, as in the template.
    for (let index = 0; index <= data.subjects.length; index += 1) {
      const x = margin + nameWidth + index * subjectWidth;
      pdf.line(x, tableTop, x, y);
    }
  };
  const drawPageHeader = () => {
    pdf.setTextColor(0);
    pdf.setFont("times", "bold");
    pdf.setFontSize(20);
    pdf.text("FINAL GRADES AND GENERAL AVERAGE", pageWidth / 2, 17, { align: "center" });
    const sealHeight = 27 / educationSeal.ratio;
    const logoCenterY = 13 + sealHeight / 2;
    pdf.addImage(educationSeal.png, "PNG", margin + 1, 13, 27, sealHeight);
    const wordmarkWidth = 43;
    const wordmarkHeight = wordmarkWidth / depedWordmark.ratio;
    pdf.addImage(depedWordmark.png, "PNG", pageWidth - margin - wordmarkWidth, logoCenterY - wordmarkHeight / 2, wordmarkWidth, wordmarkHeight);
    headerField(43, 25, "REGION", 27, data.school?.region, 35);
    headerField(43, 35, "SCHOOL NAME", 27, data.school?.name, 87);
    headerField(166, 25, "DIVISION", 24, data.school?.division, 54);
    headerField(166, 35, "SCHOOL ID", 24, data.school?.code, 54);
    headerField(251, 25, "SCHOOL YEAR", 39, data.schoolYear.label, 66);
    headerField(251, 35, "GRADE & SECTION", 39, `${data.section.gradeLevel} - ${data.section.name}`, 66);
    y = tableTop;
    cell(margin, y, nameWidth, 8, `ADVISER: ${data.adviser?.name || ""}`, { bold: true, align: "left", size: 8 });
    cell(margin, y + 8, nameWidth, 12, "NAMES OF LEARNERS", { bold: true, size: 10 });
    data.subjects.forEach((subject, index) => {
      const x = margin + nameWidth + index * subjectWidth;
      cell(x, y, subjectWidth, 8, String(subject.label || subject.code).toUpperCase(), { bold: true, size: 8.5, font: "helvetica" });
      cell(x, y + 8, termWidth * 3, 6, "TERM", { bold: true, size: 8, font: "helvetica" });
      cell(x + termWidth * 3, y + 8, finalWidth, 12, "FINAL\nGRADE", { bold: true, size: 7.5, font: "helvetica" });
      [1, 2, 3].forEach((term, index) => {
        cell(x + index * termWidth, y + 14, termWidth, 6, term, { bold: true, size: 7 });
      });
    });
    cell(pageWidth - margin - averageWidth, y, averageWidth, headerHeight, "GEN.\nAVERAGE", { bold: true, size: 7.5 });
    y += headerHeight;
  };

  const drawGroup = (label, continuation = false) => {
    cell(margin, y, width, 5, `${label}${continuation ? " (continued)" : ""}`, { bold: true, align: "left", fill: [225, 225, 225], size: 8 });
    y += 5;
  };
  const newTablePage = () => {
    finishTable();
    pdf.addPage();
    drawPageHeader();
  };
  const groups = [
    ["MALE", data.students.filter((student) => student.sex === "M")],
    ["FEMALE", data.students.filter((student) => student.sex === "F")],
    ["UNSPECIFIED", data.students.filter((student) => !["M", "F"].includes(student.sex))],
  ];
  drawPageHeader();
  for (const [label, learners] of groups) {
    if (label === "UNSPECIFIED" && !learners.length) continue;
    if (y + 11 > bottom) newTablePage();
    drawGroup(label);
    if (!learners.length) {
      cell(margin, y, width, 6, "No learners in this group.", { align: "left" });
      y += 6;
    }
    for (const [index, student] of learners.entries()) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      const learnerName = String(student.displayName || "Unnamed learner");
      const nameLines = pdf.splitTextToSize(learnerName, nameWidth - numberWidth - 3);
      const rowHeight = Math.max(6, nameLines.length * 3.2 + 2);
      if (rowHeight + 5 > bottom - tableTop - headerHeight) throw new Error("A learner name is too long to fit the PDF. Review the record.");
      if (y + rowHeight > bottom) { newTablePage(); drawGroup(label, true); }
      cell(margin, y, numberWidth, rowHeight, index + 1, { size: 8 });
      cell(margin + numberWidth, y, nameWidth - numberWidth, rowHeight, learnerName, { align: "left", size: 8, font: "helvetica" });
      data.subjects.forEach((subject, index) => {
        const grades = student.grades?.[subject.key];
        const x = margin + nameWidth + index * subjectWidth;
        [0, 1, 2].forEach((term) => cell(x + term * termWidth, y, termWidth, rowHeight, gradeText(grades?.terms?.[term]), { size: 8 }));
        cell(x + termWidth * 3, y, finalWidth, rowHeight, gradeText(grades?.finalGrade), { bold: true, size: 8 });
      });
      cell(pageWidth - margin - averageWidth, y, averageWidth, rowHeight, gradeText(student.generalAverage), { bold: true, size: 8 });
      y += rowHeight;
    }
  }
  finishTable();
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(0);
    pdf.text("Blank grade cells indicate unavailable or incomplete grades.", margin, pageHeight - 8);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
  pdf.setProperties({ title: `Master Sheet - ${data.section.name} - ${data.schoolYear.label}` });
  const filenamePart = (value) => String(value || "Unknown").trim().replace(/[^a-zA-Z0-9-]+/g, "_");
  return {
    blob: pdf.output("blob"),
    filename: `Master_Sheet_${filenamePart(data.section.gradeLevel)}_${filenamePart(data.section.name)}_SY_${filenamePart(data.schoolYear.label)}.pdf`,
  };
};

export const downloadMasterSheet = async (adviserAssignmentId, userId) => {
  const data = await getMasterSheet(adviserAssignmentId, userId);
  return createMasterSheetPdf(data);
};
