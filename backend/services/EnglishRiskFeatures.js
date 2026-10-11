const { calculateStudentGrades, weightsFromRows } = require('../utils/depedTransmutation');
const { loadAttendanceInputs } = require('./AttendanceRiskFeatures');

const numberOrNull = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
function schoolYearRange(row) {
  const year = value => value instanceof Date ? value.getFullYear() : Number(String(value || '').match(/^(\d{4})(?:\D|$)/)?.[1]);
  const start = year(row.starts_on), end = year(row.ends_on);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1900 && end > start ? `${start}-${end}` : null;
}
function termCode(value) {
  const text = String(value || '').trim().toUpperCase();
  const match = text.match(/^(?:T|TERM\s*)?([123])(?:ST|ND|RD)?(?:\s*TERM)?$/);
  return match ? `T${match[1]}` : null;
}
function requestError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_PREDICTION_PERIOD' });
}

function calendarDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Screening is an all-or-none model input, not an oral Post-Test reading level.
function screeningFeatures(row, { schoolYearStart, sourceEnd, targetStart } = {}) {
  const features = { phil_iri_literal_pct: null, phil_iri_inferential_pct: null,
    phil_iri_critical_pct: null, phil_iri_unavailable: 1 };
  const unavailable = reason => ({ features, reason, assessedOn: null });
  if (!row) return unavailable('No screening result recorded.');
  const assessedOn = row.assessed_on;
  if (typeof assessedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(assessedOn)
    || !Number.isFinite(Date.parse(`${assessedOn}T00:00:00Z`))
    || new Date(`${assessedOn}T00:00:00Z`).toISOString().slice(0, 10) !== assessedOn) {
    return unavailable('Screening assessment date is missing or invalid.');
  }
  const start = calendarDate(schoolYearStart), end = calendarDate(sourceEnd), target = calendarDate(targetStart);
  if (!start || !end || !target || assessedOn < start || assessedOn > end || assessedOn >= target) {
    return unavailable('Screening date is outside the completed source period.');
  }
  if (numberOrNull(row.test_taken) !== 1) return unavailable('Screening test is not marked as taken.');
  const percentages = {};
  for (const component of ['literal', 'inferential', 'critical']) {
    const score = numberOrNull(row[`${component}_score`]), max = numberOrNull(row[`${component}_max`]);
    if (!Number.isInteger(score) || !Number.isInteger(max) || max <= 0 || score < 0 || score > max) {
      return unavailable('Screening sub-scores are incomplete or invalid.');
    }
    percentages[`phil_iri_${component}_pct`] = score / max * 100;
  }
  return { features: { ...percentages, phil_iri_unavailable: 0 }, reason: null, assessedOn };
}

function academicFeatures(candidate, activities, weightRows) {
  if (!candidate.grade_sheet_id || candidate.workflow_status !== 'SUBMITTED' || candidate.lock_status !== 'TERM_LOCKED') {
    return { reason: 'Previous English grade sheet is not submitted and term-locked.' };
  }
  const previousGrade = numberOrNull(candidate.quarterly_grade);
  if (previousGrade === null || previousGrade < 60 || previousGrade > 100) {
    return { reason: 'Official previous-term English grade is missing or invalid.' };
  }
  if (!activities.length) return { reason: 'Previous-term English assessment records are missing.' };
  const assessments = [], scores = {}, seen = new Set(), examKeys = new Set();
  for (const activity of activities) {
    if (seen.has(activity.activity_id)) return { reason: 'Duplicate assessment scores need review.' };
    seen.add(activity.activity_id);
    const code = String(activity.component_code || '').toUpperCase();
    if (!['WW', 'PT', 'EX', 'QA', 'STE'].includes(code)) return { reason: 'Assessment component mapping needs review.' };
    const isExam = ['EX', 'QA', 'STE'].includes(code);
    const name = String(activity.activity_name || '').toUpperCase();
    const examKey = /\b(ST1|SUMMATIVE\s*TEST\s*1|SUMMATIVE\s*1)\b/.test(name) ? 'ST1'
      : /\b(ST2|SUMMATIVE\s*TEST\s*2|SUMMATIVE\s*2)\b/.test(name) ? 'ST2'
        : /\b(TE|TERM\s*EXAM)\b/.test(name) ? 'TE' : null;
    if (isExam && (!examKey || examKeys.has(examKey))) return { reason: 'ST1, ST2 and TE mapping needs review.' };
    if (isExam) examKeys.add(examKey);
    const status = String(activity.score_status || 'NOT_ENCODED').toUpperCase();
    if (status === 'EXCUSED') {
      if (isExam) return { reason: 'Excused exam requires an approved examination mapping.' };
      continue;
    }
    const hps = numberOrNull(activity.highest_possible_score);
    const raw = status === 'MISSING' ? 0 : numberOrNull(activity.raw_score);
    if (!['ENCODED', 'MISSING'].includes(status) || !activity.score_id || hps === null || hps <= 0 || raw === null || raw < 0 || raw > hps) {
      return { reason: 'Previous-term assessment scores are incomplete or invalid.' };
    }
    assessments.push({ assessment_id: activity.activity_id, component_code: code,
      activity_name: activity.activity_name, max_score: hps, exam_key: examKey });
    scores[activity.activity_id] = raw;
  }
  if (examKeys.size !== 3) return { reason: 'Complete ST1, ST2 and TE scores are required.' };
  const calculated = calculateStudentGrades({ assessments, scores, weights: weightsFromRows(weightRows) });
  if (calculated.calculationError || !['WW', 'PT', 'QA'].every(code => calculated.components[code].hasInput)) {
    return { reason: 'English component scores or saved grading weights need review.' };
  }
  return { features: {
    ww_pct: calculated.components.WW.ps, pt_pct: calculated.components.PT.ps,
    qa_pct: calculated.components.QA.ps, previous_final_grade: previousGrade,
    phil_iri_literal_pct: null, phil_iri_inferential_pct: null, phil_iri_critical_pct: null,
    phil_iri_unavailable: 1, absence_rate: null,
  } };
}

async function loadInputs(db, { schoolYear, term = 'T2', gradeLevel = 'all' }, now = new Date(), scope = {}) {
  // Internal scope is supplied only after an assignment's ownership is checked.
  for (const key of ['schoolYearId', 'sectionId', 'subjectOfferingId']) {
    if (scope[key] != null && (!Number.isInteger(Number(scope[key])) || Number(scope[key]) <= 0)) {
      throw requestError('The assigned prediction scope is invalid.');
    }
  }
  if (!/^\d{4}-\d{4}$/.test(String(schoolYear || ''))) throw requestError('Choose a valid school year.');
  const targetCode = termCode(term);
  if (!targetCode) throw requestError('Choose the target term: Term 1, 2 or 3. Overall is not a prediction period.');
  if (gradeLevel !== 'all' && !/^(7|8|9|10)$/.test(String(gradeLevel))) throw requestError('Choose a valid grade level.');
  const [yearRows] = await db.execute(`SELECT school_year_id, starts_on, ends_on FROM SCHOOL_YEAR${scope.schoolYearId ? ' WHERE school_year_id = ?' : ''}`,
    scope.schoolYearId ? [Number(scope.schoolYearId)] : []);
  const years = yearRows.filter(row => schoolYearRange(row) === schoolYear);
  if (years.length !== 1) throw requestError('The selected school year is unavailable or ambiguous.');
  const yearId = years[0].school_year_id;
  const [terms] = await db.execute('SELECT term_id, term_name, starts_at, ends_at FROM ACADEMIC_TERM WHERE school_year_id = ?', [yearId]);
  const matches = terms.filter(row => termCode(row.term_name) === targetCode);
  if (matches.length !== 1) throw requestError('The selected target term is unavailable or ambiguous.');
  const sourceCode = targetCode === 'T1' ? null : `T${Number(targetCode[1]) - 1}`;
  const sources = terms.filter(row => termCode(row.term_name) === sourceCode);
  const source = sources.length === 1 ? sources[0] : null;
  const sourceEnd = source?.ends_at && new Date(source.ends_at);
  const targetStart = matches[0].starts_at && new Date(matches[0].starts_at);
  const completed = sourceEnd && targetStart && Number.isFinite(sourceEnd.getTime()) && Number.isFinite(targetStart.getTime())
    && sourceEnd <= now && sourceEnd < targetStart;
  const candidateScope = `${scope.sectionId ? ' AND ss.section_id = ?' : ''}${scope.subjectOfferingId ? ' AND so.subject_offering_id = ?' : ''}`;
  const scopeParameters = [scope.sectionId, scope.subjectOfferingId].filter(value => value != null).map(Number);
  const [candidates] = await db.execute(`
    SELECT ss.student_section_id, ss.student_id, ss.section_id, st.LRN AS lrn,
      CONCAT_WS(' ', st.first_name, NULLIF(st.middle_name, ''), st.last_name) AS name,
      sec.section_name AS section, gl.grade_level_name, so.subject_offering_id, so.subject_id,
      gs.grade_sheet_id, gs.workflow_status, gs.lock_status, sg.quarterly_grade,
      sg.student_grade_id, sg.student_section_id AS saved_enrollment_id,
      (SELECT CONCAT_WS(' ', u.first_name, u.last_name) FROM SECTION_ADVISER_ASSIGNMENT saa
       JOIN USER u ON u.user_id = saa.user_id WHERE saa.section_id = ss.section_id
       AND saa.school_year_id = ss.school_year_id ORDER BY saa.adviser_assignment_id DESC LIMIT 1) AS adviser
    FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id = ss.student_id
    JOIN SECTION sec ON sec.section_id = ss.section_id JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    JOIN SUBJECT_OFFERING so ON so.section_id = ss.section_id AND so.school_year_id = ss.school_year_id
    JOIN SUBJECT sub ON sub.subject_id = so.subject_id
    LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = ?
    LEFT JOIN STUDENT_GRADE sg ON sg.subject_offering_id = so.subject_offering_id AND sg.student_id = ss.student_id
      AND (sg.student_section_id = ss.student_section_id OR sg.student_section_id IS NULL)
      AND sg.term = ? AND sg.mapeh_component IS NULL
    WHERE ss.school_year_id = ? AND (UPPER(sub.subject_code) IN ('ENG', 'ENGLISH') OR UPPER(sub.subject_name) = 'ENGLISH')
    ${candidateScope}
    ORDER BY sec.section_name, st.last_name, st.first_name`, [source?.term_id || null, sourceCode, yearId, ...scopeParameters]);
  // Scope baseline scores to the enrollment year. Do not substitute year-end Post-Test data.
  // Query errors must propagate; an unavailable database is not a missing learner result.
  const [screenings] = await db.execute(`SELECT ps.student_section_id,
    DATE_FORMAT(ps.assessed_on, '%Y-%m-%d') AS assessed_on, ps.test_taken,
    ps.literal_score, ps.inferential_score, ps.critical_score,
    ps.literal_max, ps.inferential_max, ps.critical_max
    FROM PHIL_IRI_SCREENING ps JOIN STUDENT_SECTION ss ON ss.student_section_id = ps.student_section_id
    WHERE ss.school_year_id = ?${scope.sectionId ? ' AND ss.section_id = ?' : ''}`,
  scope.sectionId ? [yearId, Number(scope.sectionId)] : [yearId]);
  const screeningMap = new Map();
  for (const row of screenings) {
    const key = String(row.student_section_id);
    if (!screeningMap.has(key)) screeningMap.set(key, []);
    screeningMap.get(key).push(row);
  }
  const firstTerms = terms.filter(row => termCode(row.term_name) === 'T1');
  const screeningPeriod = { schoolYearStart: firstTerms.length === 1 ? firstTerms[0].starts_at : null,
    sourceEnd: source?.ends_at, targetStart: matches[0].starts_at };
  const filtered = candidates.filter(row => gradeLevel === 'all' || String(row.grade_level_name).match(/\d+/)?.[0] === String(gradeLevel));
  const [activities] = source ? await db.execute(`
    SELECT gs.grade_sheet_id, ga.activity_id, ga.activity_name, ga.highest_possible_score,
      ct.component_code, sc.student_section_id, sc.score_id, sc.raw_score, sc.score_status
    FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
    JOIN SUBJECT sub ON sub.subject_id = so.subject_id
    JOIN GRADE_ACTIVITY ga ON ga.grade_sheet_id = gs.grade_sheet_id
    JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id = ga.subj_comp_weight_id
    JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
    LEFT JOIN SCORE sc ON sc.activity_id = ga.activity_id
    WHERE gs.term_id = ? AND so.school_year_id = ? AND (UPPER(sub.subject_code) IN ('ENG', 'ENGLISH') OR UPPER(sub.subject_name) = 'ENGLISH')
      AND (ga.status = 'ACTIVE' OR ga.status IS NULL) AND ga.mapeh_component IS NULL
      ${scope.sectionId ? ' AND so.section_id = ?' : ''}${scope.subjectOfferingId ? ' AND so.subject_offering_id = ?' : ''}
    ORDER BY gs.grade_sheet_id, ga.activity_id, sc.score_id`, [source.term_id, yearId, ...scopeParameters]) : [[]];
  const [weights] = await db.execute(`SELECT cw.subject_id, cw.percentage, ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw
    JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id WHERE cw.school_year_id = ?`, [yearId]);
  const grouped = new Map();
  for (const row of filtered) {
    const key = `${row.student_section_id}:${row.subject_offering_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const eligible = [], unavailable = [];
  for (const [id, rows] of grouped) {
    const row = rows[0];
    const profile = { id, studentId: row.student_id, studentSectionId: row.student_section_id, sectionId: row.section_id,
      schoolYearId: yearId, name: row.name, lrn: row.lrn,
      grade: Number(String(row.grade_level_name).match(/\d+/)?.[0]), section: row.section,
      adviser: row.adviser || 'Not assigned', subject: 'English', schoolYear,
      sourceTerm: sourceCode, targetTerm: targetCode, subjectOfferingId: row.subject_offering_id,
      sourceGradeId: row.student_grade_id || null,
      gradeMatch: row.saved_enrollment_id == null ? 'offering_student_term' : 'enrollment_offering_term' };
    let result;
    if (!sourceCode) result = { reason: 'Term 1 has no previous term in this school year.' };
    else if (!completed) result = { reason: 'The previous term is not completed or its calendar needs review.' };
    else if (rows.length !== 1) result = { reason: 'Duplicate English grade sheets or saved grades need review.' };
    else {
      // A LEFT JOIN score belonging to another learner must not look like an encoded zero.
      const learnerActivities = new Map();
      for (const activity of activities.filter(item => item.grade_sheet_id === row.grade_sheet_id)) {
        if (!learnerActivities.has(activity.activity_id)) learnerActivities.set(activity.activity_id, []);
        learnerActivities.get(activity.activity_id).push(activity);
      }
      const ownActivities = [];
      for (const group of learnerActivities.values()) {
        const own = group.filter(item => Number(item.student_section_id) === Number(row.student_section_id));
        ownActivities.push(...(own.length ? own : [{ ...group[0], score_id: null, raw_score: null, score_status: 'NOT_ENCODED' }]));
      }
      result = academicFeatures(row, ownActivities, weights.filter(item => item.subject_id === row.subject_id));
    }
    if (result.features) {
      const rows = screeningMap.get(String(row.student_section_id)) || [];
      const screening = screeningFeatures(rows.length === 1 ? rows[0] : null, screeningPeriod);
      if (rows.length > 1) screening.reason = 'Duplicate screening results need review.';
      eligible.push({ profile: { ...profile, screeningAssessmentDate: screening.assessedOn,
        screeningStatus: screening.reason ? 'unavailable' : 'available', screeningReason: screening.reason },
        features: { ...result.features, ...screening.features } });
    }
    else unavailable.push({ ...profile, reason: result.reason });
  }
  const attendanceTargetDate = calendarDate(matches[0].starts_at);
  let attendanceEndDate = calendarDate(source?.ends_at);
  // A source term can end before the target starts on the same Manila date.
  // Daily attendance cannot be split by hour, so never use the target's first day.
  if (attendanceTargetDate && attendanceEndDate === attendanceTargetDate) {
    const previousDay = new Date(`${attendanceTargetDate}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    attendanceEndDate = previousDay.toISOString().slice(0, 10);
  }
  const attendance = await loadAttendanceInputs(db, eligible.map(row => row.profile), {
    sourceStart: calendarDate(source?.starts_at), sourceEnd: attendanceEndDate,
    targetStart: attendanceTargetDate,
  });
  for (const row of eligible) {
    const input = attendance.get(String(row.profile.studentSectionId));
    row.features.absence_rate = input.absenceRate;
    Object.assign(row.profile, { attendanceStatus: input.status, attendanceReason: input.reason,
      attendanceSummary: input.summary });
  }
  return { eligible, unavailable, sourceTerm: sourceCode, targetTerm: targetCode, schoolYear };
}

module.exports = { loadInputs, academicFeatures, screeningFeatures, termCode, schoolYearRange };
