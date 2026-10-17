export const SECTION_PROGRAMS = [{
  value: "1",
  label: "Science, Technology & Engineering (STE)",
  code: "STE"
}, {
  value: "2",
  label: "Special Program in Journalism (SPJ)",
  code: "SPJ"
}, {
  value: "3",
  label: "Special Program in the Arts (SPA)",
  code: "SPA"
}];
export function formatSectionGrade(level, id) {
  const numericId = Number(id);
  if (numericId >= 1 && numericId <= 4) return `Grade ${numericId + 6}`;
  const grade = Number(String(level || "").replace(/\D/g, ""));
  if (grade >= 1 && grade <= 4) return `Grade ${grade + 6}`;
  return grade ? `Grade ${grade}` : "Unassigned";
}
export function sectionProgram(section) {
  return Number(section?.is_specialized) === 1 ? SECTION_PROGRAMS.find(program => Number(program.value) === Number(section.program_id)) : null;
}

// Preserve the existing grade/program eligibility rules used by section management.
export function canAddToSection(student, section) {
  if (!section || student.section_id) return false;
  if (student.grade_level_id && Number(student.grade_level_id) !== Number(section.grade_level_id)) return false;
  const specialization = sectionProgram(section);
  const studentIsSpecialized = Number(student.is_specialized) === 1 || [1, 2, 3].includes(Number(student.program_id));
  if (!specialization) return !studentIsSpecialized;
  return ![1, 2, 3].includes(Number(student.program_id)) || Number(student.program_id) === Number(section.program_id);
}
export function sectionCapacity(count) {
  return {
    percent: Math.min(100, Math.max(0, count / 45 * 100)),
    tone: count > 45 ? "over" : count >= 40 ? "target" : "available"
  };
}
