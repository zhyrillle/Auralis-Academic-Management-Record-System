export const schoolYearLabel = year => `${String(year.starts_on).slice(0, 4)}–${String(year.ends_on).slice(0, 4)}`;

export const adviserIsInYear = (user, schoolYearId) => {
  const year = user.adviser_school_year_id || user.adviser_assignment?.school_year_id;
  return year != null && String(year) === String(schoolYearId);
};

export function assignmentFieldsForYear(user, options) {
  const year = String(options.schoolYear?.school_year_id || '');
  const sections = options.sections || [];
  const offerings = options.subjectOfferings || [];
  const sectionId = user?.adviser_section_id && (!user.adviser_school_year_id || adviserIsInYear(user, year))
    ? String(user.adviser_section_id) : '';
  const section = sections.find(s => String(s.section_id) === sectionId);
  return {
    school_year_id: year,
    adviser_section_id: sectionId,
    adviser_grade_level_id: sectionId ? String(user.adviser_grade_level_id || section?.grade_level_id || '') : '',
    teaching_assignments: (user?.teaching_assignments || []).filter(assignment =>
      assignment.school_year_id != null ? String(assignment.school_year_id) === year
        : offerings.some(o => String(o.subject_offering_id) === String(assignment.subject_offering_id)))
      .map(assignment => {
        const offering = offerings.find(o => String(o.subject_offering_id) === String(assignment.subject_offering_id));
        const sectionId = String(assignment.section_id || offering?.section_id || '');
        const section = sections.find(s => String(s.section_id) === sectionId);
        return { grade_level_id: String(assignment.grade_level_id || offering?.grade_level_id || section?.grade_level_id || ''),
          section_id: sectionId, subject_offering_id: String(assignment.subject_offering_id || '') };
      }),
  };
}
