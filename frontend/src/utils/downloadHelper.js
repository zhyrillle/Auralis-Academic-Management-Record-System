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
  getRemark
) {
  if (!activeSelectedClass || !students) return;

  // Construct CSV string
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += `Grade & Section: ${activeSelectedClass.gradeLevel} - ${activeSelectedClass.sectionName},School Year: 2026-2027\r\n`;
  csvContent += `Teacher: Harvey Babia,Subject: ${activeSelectedClass.subject}\r\n\r\n`;
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
