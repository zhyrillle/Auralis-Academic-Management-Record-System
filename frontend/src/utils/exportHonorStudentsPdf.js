import { jsPDF } from "jspdf";
import depedLogo from "../assets/deped_logo.png";
import gccnhsLogo from "../assets/gccnhs_logo.png";

/**
 * Converts an image source into a base64 PNG data URL via canvas.
 * Resolves to null safely if image fails to load.
 */
function toBase64Image(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("Could not convert image to dataUrl:", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Formats a student's name into: Firstname MiddleInitial Lastname Extension
 * (e.g., "Alex Matthew D. Cruz" or "Vera S. Estrella")
 */
export function formatStudentPrintName(student) {
  if (!student) return "";
  const first = (student.firstName || student.first_name || "").trim();
  const middle = (student.middleName || student.middle_name || "").trim();
  const last = (student.lastName || student.last_name || "").trim();
  const ext = (student.extensionName || student.extension_name || "").trim();

  if (first && last) {
    let middleInitial = "";
    if (middle) {
      const cleanMid = middle.replace(/\./g, "").trim();
      if (cleanMid) {
        middleInitial = `${cleanMid.charAt(0).toUpperCase()}.`;
      }
    }
    const parts = [first, middleInitial, last, ext].filter(Boolean);
    return parts.join(" ");
  }

  // Fallback if student only has a composite displayName like "Lastname, Firstname M."
  const display = String(student.displayName || student.name || "").trim();
  if (display.includes(",")) {
    const [lastPart, ...restParts] = display.split(",");
    const rest = restParts.join(",").trim();
    if (rest) {
      return `${rest} ${lastPart.trim()}`.replace(/\s+/g, " ").trim();
    }
  }

  return display;
}

/**
 * Standardized filename generation for Honor Students PDF exports and print dialogs.
 */
export function getHonorStudentsFilename(section = {}, schoolYear = {}) {
  const gradeLevel = String(section?.gradeLevel || "Grade")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Grade";
  const sectionName = String(section?.name || "Section")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Section";
  const syLabel = String(schoolYear?.label || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const syPart = syLabel ? `_SY_${syLabel.replace(/_/g, "-")}` : "";
  return `${gradeLevel}_${sectionName}_Honor_Students${syPart}.pdf`;
}

/**
 * Generates an official DepEd-formatted PDF of Academic Excellence Awardees (Honor Students).
 *
 * @param {Object} options
 * @param {Array} options.honorStudents - Array of students with { displayName, genAvgDisplay, statusLabel }
 * @param {Object} options.section - Section info { name, gradeLevel }
 * @param {Object} options.schoolYear - School year info { label }
 * @param {string} [options.adviserName] - Name of class adviser
 * @param {string} [options.principalName] - Name of school principal
 * @returns {Promise<{ blob: Blob, filename: string, pdf: jsPDF }>}
 */
export async function exportHonorStudentsPdf({
  honorStudents = [],
  section = {},
  schoolYear = {},
  adviserName = "",
  principalName = "",
}) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth(); // 215.9 mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 279.4 mm
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 185.9 mm

  const sectionName = section.name || "Section";
  const gradeLevel = section.gradeLevel || "Grade";
  const syLabel = schoolYear.label || "";
  const filename = getHonorStudentsFilename(section, schoolYear);

  // Set document properties so print-preview defaults to the same filename
  pdf.setProperties({
    title: filename.replace(/\.pdf$/i, ""),
    subject: "Official List of Academic Excellence Awardees",
    author: adviserName || "Class Adviser",
    creator: "Auralis Academic Record Management System",
  });

  // Automatically order students strictly highest-to-lowest general average
  const sortedStudents = [...honorStudents].sort((a, b) => {
    const avgA = Number(a?.numericAverage ?? a?.generalAverage ?? a?.genAvgDisplay ?? 0);
    const avgB = Number(b?.numericAverage ?? b?.generalAverage ?? b?.genAvgDisplay ?? 0);
    if (avgB !== avgA) {
      return avgB - avgA;
    }
    return String(a?.displayName || "").localeCompare(String(b?.displayName || ""));
  });

  // Pre-load official seals (DepEd seal on left, GCCNHS school seal on right)
  const [depedDataUrl, gccnhsDataUrl] = await Promise.all([
    toBase64Image(depedLogo),
    toBase64Image(gccnhsLogo),
  ]);

  // --- HEADER SECTION ---
  const logoWidth = 20; // 20 mm (~76 px)
  const logoHeight = 20; // 20 mm
  const logoY = 12;

  if (depedDataUrl) {
    try {
      pdf.addImage(depedDataUrl, "PNG", margin, logoY, logoWidth, logoHeight);
    } catch (err) {
      console.warn("DepEd logo rendering skipped:", err);
    }
  }

  if (gccnhsDataUrl) {
    try {
      pdf.addImage(
        gccnhsDataUrl,
        "PNG",
        pageWidth - margin - logoWidth,
        logoY,
        logoWidth,
        logoHeight
      );
    } catch (err) {
      console.warn("School logo rendering skipped:", err);
    }
  }

  let y = 14;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Republic of the Philippines", pageWidth / 2, y, { align: "center" });

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(30, 41, 59);
  pdf.text("Department of Education", pageWidth / 2, y, { align: "center" });

  y += 4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Region X – Northern Mindanao", pageWidth / 2, y, { align: "center" });

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(30, 41, 59);
  pdf.text("DIVISION OF GINGOOG CITY", pageWidth / 2, y, { align: "center" });

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(18, 48, 98);
  pdf.text("GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL", pageWidth / 2, y, { align: "center" });

  y += 5;
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);

  y += 6;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(18, 48, 98); // Navy
  pdf.text("LIST OF ACADEMIC EXCELLENCE AWARDEES", pageWidth / 2, y, { align: "center" });

  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`${gradeLevel} – ${sectionName}  |  School Year: ${syLabel}`, pageWidth / 2, y, { align: "center" });

  y += 7;

  // --- TABLE COLUMN WIDTHS ---
  const colNo = 15;
  const colName = 90.9;
  const colAvg = 35;
  const colStatus = 45;
  // Total = 15 + 90.9 + 35 + 45 = 185.9 mm

  const drawTableHeader = (startY) => {
    pdf.setFillColor(241, 245, 249); // #f1f5f9
    pdf.setDrawColor(180, 195, 215);
    pdf.setLineWidth(0.3);
    pdf.rect(margin, startY, contentWidth, 8, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(18, 48, 98);

    pdf.text("NO.", margin + colNo / 2, startY + 5.2, { align: "center" });
    pdf.text("LEARNER NAME", margin + colNo + 4, startY + 5.2, { align: "left" });
    pdf.text("GENERAL AVERAGE", margin + colNo + colName + colAvg / 2, startY + 5.2, { align: "center" });
    pdf.text("AWARD / HONOR STATUS", margin + colNo + colName + colAvg + colStatus / 2, startY + 5.2, { align: "center" });

    return startY + 8;
  };

  y = drawTableHeader(y);

  // --- ROWS ---
  const rowHeight = 7.5;
  const bottomLimit = pageHeight - 40;

  if (sortedStudents.length === 0) {
    pdf.rect(margin, y, contentWidth, 12, "S");
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.setTextColor(140, 140, 140);
    pdf.text("No honor students recorded for this section.", pageWidth / 2, y + 7.5, { align: "center" });
    y += 12;
  } else {
    sortedStudents.forEach((student, index) => {
      // Check page overflow
      if (y + rowHeight > bottomLimit) {
        pdf.addPage();
        y = 20;
        y = drawTableHeader(y);
      }

      const isEven = index % 2 === 1;
      if (isEven) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(margin, y, contentWidth, rowHeight, "F");
      }

      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.2);
      pdf.rect(margin, y, contentWidth, rowHeight, "S");

      // Column borders
      pdf.line(margin + colNo, y, margin + colNo, y + rowHeight);
      pdf.line(margin + colNo + colName, y, margin + colNo + colName, y + rowHeight);
      pdf.line(margin + colNo + colName + colAvg, y, margin + colNo + colName + colAvg, y + rowHeight);

      // Text values
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(30, 41, 59);

      // No.
      pdf.text(String(index + 1), margin + colNo / 2, y + 5, { align: "center" });

      // Name (Firstname MiddleInitial Lastname Extension)
      pdf.setFont("helvetica", "bold");
      const cleanName = formatStudentPrintName(student).toUpperCase();
      pdf.text(cleanName, margin + colNo + 4, y + 5, { align: "left" });

      // General Average
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(18, 48, 98);
      pdf.text(String(student.genAvgDisplay ?? "—"), margin + colNo + colName + colAvg / 2, y + 5, { align: "center" });

      // Award / Honor Status
      pdf.setFont("helvetica", "bold");
      const status = student.statusLabel || "With Honors";
      if (status.includes("Highest")) {
        pdf.setTextColor(161, 98, 7); // Gold
      } else if (status.includes("High")) {
        pdf.setTextColor(30, 64, 175); // Blue
      } else {
        pdf.setTextColor(180, 83, 9); // Bronze
      }
      pdf.text(status, margin + colNo + colName + colAvg + colStatus / 2, y + 5, { align: "center" });

      y += rowHeight;
    });
  }

  // --- SIGNATURE BLOCK ---
  y += 14;
  if (y + 25 > pageHeight - 15) {
    pdf.addPage();
    y = 25;
  }

  const adviserCenterX = margin + 35;
  const principalCenterX = pageWidth - margin - 35;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Prepared by:", adviserCenterX, y, { align: "center" });
  pdf.text("Noted by:", principalCenterX, y, { align: "center" });

  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);

  const cleanAdviser = (adviserName || "CLASS ADVISER").toUpperCase();
  let cleanPrincipal = (principalName || "SCHOOL PRINCIPAL").trim().toUpperCase();
  if (
    cleanPrincipal &&
    cleanPrincipal !== "SCHOOL PRINCIPAL" &&
    !cleanPrincipal.includes("PH.D") &&
    !cleanPrincipal.includes("PHD")
  ) {
    cleanPrincipal = `${cleanPrincipal}, PH.D.`;
  }

  pdf.text(cleanAdviser, adviserCenterX, y, { align: "center" });
  pdf.text(cleanPrincipal, principalCenterX, y, { align: "center" });

  // Signature underlines
  const adviserWidth = Math.max(50, pdf.getTextWidth(cleanAdviser) + 8);
  const principalWidth = Math.max(50, pdf.getTextWidth(cleanPrincipal) + 8);
  pdf.setDrawColor(100, 116, 139);
  pdf.setLineWidth(0.3);
  pdf.line(adviserCenterX - adviserWidth / 2, y + 1.2, adviserCenterX + adviserWidth / 2, y + 1.2);
  pdf.line(principalCenterX - principalWidth / 2, y + 1.2, principalCenterX + principalWidth / 2, y + 1.2);

  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Class Adviser", adviserCenterX, y, { align: "center" });
  pdf.text("School Principal", principalCenterX, y, { align: "center" });

  // Return blob & filename
  const blob = pdf.output("blob");
  return { blob, filename, pdf };
}

export default exportHonorStudentsPdf;
