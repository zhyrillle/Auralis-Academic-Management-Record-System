import { jsPDF } from "jspdf";

/**
 * Generates an official DepEd-formatted PDF of Academic Excellence Awardees (Honor Students).
 *
 * @param {Object} options
 * @param {Array} options.honorStudents - Array of students with { displayName, genAvgDisplay, statusLabel }
 * @param {Object} options.section - Section info { name, gradeLevel }
 * @param {Object} options.schoolYear - School year info { label }
 * @param {string} [options.adviserName] - Name of class adviser
 * @param {string} [options.principalName] - Name of school principal
 * @returns {Promise<{ blob: Blob, filename: string }>}
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
  const cleanSection = `${gradeLevel} - ${sectionName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${cleanSection}_Honor_Students.pdf`;

  // --- HEADER ---
  let y = 18;

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
  pdf.text("DIVISION OF GINGOOG CITY", pageWidth / 2, y, { align: "center" });

  y += 4;
  pdf.text("GINGOOG CITY COMPREHENSIVE NATIONAL HIGH SCHOOL", pageWidth / 2, y, { align: "center" });

  y += 6;
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);

  y += 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(18, 48, 98); // Navy
  pdf.text("LIST OF ACADEMIC EXCELLENCE AWARDEES", pageWidth / 2, y, { align: "center" });

  y += 5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`${gradeLevel} – ${sectionName}  |  School Year: ${syLabel}`, pageWidth / 2, y, { align: "center" });

  y += 8;

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

  if (honorStudents.length === 0) {
    pdf.rect(margin, y, contentWidth, 12, "S");
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.setTextColor(140, 140, 140);
    pdf.text("No honor students recorded for this section.", pageWidth / 2, y + 7.5, { align: "center" });
    y += 12;
  } else {
    honorStudents.forEach((student, index) => {
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

      // Name
      pdf.setFont("helvetica", "bold");
      const cleanName = String(student.displayName || "").trim().toUpperCase();
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

  const sigColWidth = 70;
  const adviserX = margin + 10;
  const principalX = pageWidth - margin - sigColWidth - 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Prepared by:", adviserX, y);
  pdf.text("Noted by:", principalX, y);

  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(15, 23, 42);

  const cleanAdviser = (adviserName || "CLASS ADVISER").toUpperCase();
  const cleanPrincipal = (principalName || "SCHOOL PRINCIPAL").toUpperCase();

  pdf.text(cleanAdviser, adviserX, y);
  pdf.text(cleanPrincipal, principalX, y);

  y += 4;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Class Adviser", adviserX, y);
  pdf.text("School Principal", principalX, y);

  // Return blob
  const blob = pdf.output("blob");
  return { blob, filename, pdf };
}

export default exportHonorStudentsPdf;

