// Test-only SELECT responses for the real monitoring and Section Details services.
const subjects = [
  { subject_id: 1, subject_code: 'ENG', subject_name: 'English' },
  { subject_id: 2, subject_code: 'MATH', subject_name: 'Mathematics' },
  { subject_id: 3, subject_code: 'SCI', subject_name: 'Science' },
  { subject_id: 4, subject_code: 'MAPEH', subject_name: 'MAPEH' },
];

function fixture({ code = 'ENG', submitted = false, ongoing = false, duplicateSheet = false,
  duplicateOffering = false, noScores = false, invalidScore = false } = {}) {
  const subject = subjects.find(row => row.subject_code === code);
  const offeringId = 100 + subject.subject_id;
  const state = { submitted, ongoing, duplicateSheet, duplicateOffering, noScores, invalidScore };
  const calls = [];
  const assignment = { ...subject, assignment_id: subject.subject_id, user_id: 10, section_id: 7,
    section_name: 'Fixture', grade_level_name: 'Grade 8', school_year_id: 3,
    starts_on: '2026-06-01', ends_on: '2027-03-31', school_year_status: 'ONGOING',
    program_code: 'EBEC', subject_offering_id: offeringId };
  const enrollments = [501, 502];
  const students = enrollments.map((id, i) => ({ student_section_id: id, student_id: 41 + i,
    first_name: `Learner ${i + 1}`, last_name: 'Fixture', lrn: `10000000000${i + 1}` }));
  const periods = () => [
    { term_id: 11, term_name: 'Term 1', starts_at: '2026-06-01T00:00:00Z', ends_at: state.ongoing ? '2999-01-01T00:00:00Z' : '2026-09-01T00:00:00Z' },
    { term_id: 12, term_name: 'Term 2', starts_at: state.ongoing ? '2999-01-02T00:00:00Z' : '2026-09-02T00:00:00Z', ends_at: '2999-02-01T00:00:00Z' },
    { term_id: 13, term_name: 'Term 3', starts_at: '2999-02-02T00:00:00Z', ends_at: '2999-03-01T00:00:00Z' },
  ].map(row => ({ ...row, school_year_id: 3, startsOn: row.starts_at.slice(0, 10), endsOn: row.ends_at.slice(0, 10), status: 'ACTIVE' }));
  const sheet = () => ({ grade_sheet_id: 200, workflow_status: state.submitted ? 'SUBMITTED' : 'DRAFT',
    lock_status: state.submitted ? 'TERM_LOCKED' : 'EDITABLE' });
  const candidates = () => enrollments.map((id, i) => ({ ...sheet(), student_section_id: id, student_id: 41 + i,
    section_id: 7, section_name: 'Fixture', grade_level_name: 'Grade 8', subject_offering_id: offeringId,
    subject_offering_count: state.duplicateOffering ? 2 : 1, name: `Fixture, Learner ${i + 1}`, adviser: 'Fixture Adviser' }));
  const activities = () => {
    let activityId = 0;
    return (code === 'MAPEH' ? ['MA', 'PEH'] : [null]).flatMap(group => ['WW', 'PT'].flatMap(component => {
      activityId++;
      return enrollments.map((id, i) => ({ grade_sheet_id: 200, activity_id: activityId,
        activity_name: `${component} ${activityId}`, highest_possible_score: component === 'WW' ? 20 : 50,
        activity_date: '2026-06-03', mapeh_component: group, weight_subject_id: subject.subject_id,
        weight_year_id: 3, component_code: component, student_section_id: id,
        score_id: state.noScores ? null : activityId * 1000 + id,
        raw_score: state.noScores ? null : state.invalidScore ? 999 : component === 'WW' ? (i ? 20 : 10) : (i ? 50 : 43),
        score_status: state.noScores ? 'NOT_ENCODED' : 'ENCODED' }));
    }));
  };
  const database = { execute: async (sql, params = []) => {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('The fixture only permits SELECT.');
    calls.push({ sql, params });
    if (sql.includes('FROM TEACHER_ASSIGNMENT')) return [[assignment]];
    if (sql.includes('FROM ACADEMIC_TERM')) return [periods()];
    if (sql.includes('FROM STUDENT_SECTION ss JOIN STUDENT st')) return [students];
    if (sql.includes('FROM STUDENT_GRADE sg')) return [enrollments.flatMap((id, i) =>
      (code === 'MAPEH' ? ['MA', 'PEH', null] : [null]).map((component, part) => ({ ...sheet(),
        student_grade_id: id * 10 + part, subject_offering_id: offeringId, student_section_id: id,
        saved_enrollment_id: id, quarterly_grade: i ? 90 : 84, mapeh_component: component })))];
    if (sql.includes('FROM GRADE_SHEET WHERE')) return [state.duplicateSheet ? [sheet(), { ...sheet(), grade_sheet_id: 201 }] : [sheet()]];
    if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 3, starts_on: '2026-06-01', ends_on: '2027-03-31', status: 'ONGOING' }]];
    if (sql.includes('SELECT DISTINCT so.school_year_id')) return [subjects.map(row => ({ ...row, school_year_id: 3 }))];
    if (sql.includes("CONCAT_WS(', ', st.last_name")) {
      let rows = candidates();
      if (state.duplicateSheet) rows = rows.flatMap(row => [row, { ...row, grade_sheet_id: 201 }]);
      return [rows];
    }
    if (sql.includes('ga.activity_id')) return [activities()];
    if (sql.includes('SELECT cw.percentage')) return [[
      { component_code: 'WW', percentage: code === 'MAPEH' ? 20 : 30 },
      { component_code: 'PT', percentage: code === 'MAPEH' ? 60 : 50 },
      { component_code: 'EX', percentage: 20 },
    ]];
    if (sql.includes('GRADE_TRANSMUTATION_CONFIG')) return [[{ is_custom_enabled: 0 }]];
    throw new Error(`Unexpected read: ${sql}`);
  } };
  return { database, state, calls, assignment, enrollments, periods, sheet };
}

module.exports = { fixture, subjects };
