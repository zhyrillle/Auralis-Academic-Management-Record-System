const { computeProgress } = require('./MonitoringProgress');
const { loadAttendanceInputs } = require('./AttendanceRiskFeatures');
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const dateInManila = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const termCode = name => {
  const match = String(name || '').match(/^(?:T|TERM\s*)?([123])(?:ST|ND|RD)?(?:\s*TERM)?$/i);
  return match ? `T${match[1]}` : null;
};
const year = value => value instanceof Date ? value.getUTCFullYear() : Number(String(value).slice(0, 4));
const nextDay = value => new Date(Date.parse(`${value}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const index = (rows, key) => {
  const grouped = new Map();
  for (const row of rows) {
    const id = String(row[key]);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(row);
  }
  return grouped;
};

async function getOptions(db, now = new Date()) {
  const [[years], [terms], [subjects]] = await Promise.all([
    db.execute('SELECT school_year_id, starts_on, ends_on, status FROM SCHOOL_YEAR ORDER BY starts_on DESC, school_year_id DESC'),
    db.execute(`SELECT school_year_id, term_id, term_name, status,
      DATE_FORMAT(CONVERT_TZ(starts_at, '+00:00', '+08:00'), '%Y-%m-%d') AS startsOn,
      DATE_FORMAT(CONVERT_TZ(ends_at, '+00:00', '+08:00'), '%Y-%m-%d') AS endsOn
      FROM ACADEMIC_TERM ORDER BY starts_at`),
    db.execute(`SELECT DISTINCT so.school_year_id, sub.subject_id, sub.subject_name, sub.subject_code
      FROM SUBJECT_OFFERING so JOIN SUBJECT sub ON sub.subject_id = so.subject_id ORDER BY sub.subject_name`),
  ]);
  const today = dateInManila(now);
  const schoolYears = years.map(row => ({ value: String(row.school_year_id),
    label: `SY ${year(row.starts_on)}–${year(row.ends_on)}`, status: row.status,
    terms: terms.filter(term => Number(term.school_year_id) === Number(row.school_year_id) && termCode(term.term_name))
      .map(term => ({ value: termCode(term.term_name), label: `Term ${termCode(term.term_name).slice(1)}`,
        id: Number(term.term_id), startsOn: term.startsOn, endsOn: term.endsOn, status: term.status })),
  }));
  const activeYear = schoolYears.find(row => /^(active|ongoing)$/i.test(row.status))
    || schoolYears.find(row => row.terms.some(term => term.startsOn <= today && term.endsOn >= today))
    || schoolYears.find(row => row.terms.some(term => term.startsOn <= today)) || schoolYears[0];
  return { schoolYears, defaultSchoolYear: activeYear?.value || '', today,
    subjects: subjects.map(row => ({ value: String(row.subject_id), label: row.subject_name,
      code: row.subject_code, schoolYearId: String(row.school_year_id) })) };
}

async function readTransmutation(db) {
  // Read directly: the existing configuration getter also initializes tables.
  const [rows] = await db.execute('SELECT is_custom_enabled, ranges_json FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1');
  if (Number(rows[0]?.is_custom_enabled) !== 1) return { is_custom_enabled: false };
  let ranges;
  try { ranges = JSON.parse(rows[0].ranges_json); } catch { throw fail('The custom grade conversion needs review.', 503); }
  const error = GradeTransmutationConfig.validateRanges(ranges);
  if (error) throw fail(`The custom grade conversion needs review: ${error}`, 503);
  return { is_custom_enabled: true, ranges };
}

function readingIndicator(screenings, assessments, { start, end }) {
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const within = value => validDate(value) && start && value >= start && value <= end;
  const complete = (raw, max) => raw !== null && raw !== '' && raw !== undefined
    && Number.isFinite(Number(raw)) && Number(max) > 0 && Number(raw) >= 0 && Number(raw) <= Number(max);
  const screening = screenings.find(row => within(row.assessed_on) && Number(row.test_taken) === 1
    && ['literal', 'inferential', 'critical'].every(key => complete(row[`${key}_score`], row[`${key}_max`])));
  const assessment = assessments.find(row => within(row.recordedOn)
    && ['INDEPENDENT', 'INSTRUCTIONAL', 'FRUSTRATION'].includes(row.overall_reading_level)
    && complete(row.words_correct, row.passage_words_count) && complete(row.comp_correct, row.total_comp_items));
  return { status: screening || assessment ? 'available' : 'needs_records',
    screening: screening ? { date: screening.assessed_on,
      earned: ['literal', 'inferential', 'critical'].reduce((sum, key) => sum + Number(screening[`${key}_score`]), 0),
      possible: ['literal', 'inferential', 'critical'].reduce((sum, key) => sum + Number(screening[`${key}_max`]), 0) } : null,
    assessment: assessment ? { recordedOn: assessment.recordedOn, testType: assessment.test_type,
      level: assessment.overall_reading_level, oral: Number(assessment.words_correct) / Number(assessment.passage_words_count) * 100,
      comprehension: Number(assessment.comp_correct) / Number(assessment.total_comp_items) * 100 } : null };
}

async function getPreview(db, query, now = new Date(), { subjectOfferingId, academicOnly = false } = {}) {
  if (subjectOfferingId !== undefined && (!Number.isSafeInteger(subjectOfferingId) || subjectOfferingId <= 0)) {
    throw fail('A valid subject offering is required.');
  }
  const options = await getOptions(db, now);
  const selectedYear = options.schoolYears.find(row => row.value === String(query.schoolYear));
  const subject = options.subjects.find(row => row.value === String(query.subject) && row.schoolYearId === selectedYear?.value);
  const periods = selectedYear?.terms.filter(row => row.value === query.term) || [];
  if (!selectedYear || !subject || periods.length !== 1) throw fail('Choose a configured school year, subject, and unique term.');
  const period = periods[0], today = options.today;
  if (!period.startsOn || !period.endsOn || period.startsOn > period.endsOn) throw fail('The selected term calendar needs review.');
  const asOf = period.endsOn < today ? period.endsOn : today;
  const context = { schoolYearId: Number(selectedYear.value), schoolYear: selectedYear.label,
    subjectId: Number(subject.value), subject: subject.label, term: period.value,
    startsOn: period.startsOn, endsOn: period.endsOn, asOf, isEnglish: /^(ENG|ENGLISH)$/i.test(subject.code)
      || /^English$/i.test(subject.label), hasStarted: period.startsOn <= today };
  const params = [period.id, context.schoolYearId, context.subjectId];
  const offeringScope = subjectOfferingId === undefined ? '' : ' AND so.subject_offering_id = ?';
  if (subjectOfferingId !== undefined) params.push(subjectOfferingId);
  const [[candidates], [activityRows], [weightRows], transmutationConfig] = await Promise.all([
    db.execute(`SELECT ss.student_section_id, st.student_id,
      CONCAT_WS(', ', st.last_name, CONCAT_WS(' ', st.first_name, NULLIF(st.middle_name, ''))) AS name,
      sec.section_id, sec.section_name, gl.grade_level_name, so.subject_offering_id,
      gs.grade_sheet_id, gs.workflow_status,
      (SELECT COUNT(*) FROM SUBJECT_OFFERING sibling WHERE sibling.section_id = so.section_id
        AND sibling.school_year_id = so.school_year_id AND sibling.subject_id = so.subject_id) AS subject_offering_count,
      (SELECT CONCAT_WS(' ', u.first_name, u.last_name) FROM SECTION_ADVISER_ASSIGNMENT saa
        JOIN USER u ON u.user_id = saa.user_id WHERE saa.section_id = sec.section_id
        AND saa.school_year_id = ss.school_year_id ORDER BY saa.adviser_assignment_id DESC LIMIT 1) AS adviser
      FROM SUBJECT_OFFERING so JOIN STUDENT_SECTION ss ON ss.section_id = so.section_id AND ss.school_year_id = so.school_year_id
      JOIN STUDENT st ON st.student_id = ss.student_id JOIN SECTION sec ON sec.section_id = so.section_id
      JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = ?
      WHERE so.school_year_id = ? AND so.subject_id = ?${offeringScope} ORDER BY st.last_name, st.first_name`, params),
    db.execute(`SELECT gs.grade_sheet_id, ga.activity_id, ga.activity_name, ga.highest_possible_score,
      DATE_FORMAT(ga.activity_date, '%Y-%m-%d') AS activity_date, ga.mapeh_component, cw.subject_id AS weight_subject_id,
      cw.school_year_id AS weight_year_id, ct.component_code, sc.student_section_id, sc.score_id, sc.raw_score, sc.score_status
      FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
      JOIN GRADE_ACTIVITY ga ON ga.grade_sheet_id = gs.grade_sheet_id
      LEFT JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id = ga.subj_comp_weight_id
      LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
      LEFT JOIN SCORE sc ON sc.activity_id = ga.activity_id
      WHERE gs.term_id = ? AND so.school_year_id = ? AND so.subject_id = ?${offeringScope}
      AND (ga.status = 'ACTIVE' OR ga.status IS NULL) ORDER BY ga.activity_id, sc.score_id`, params),
    db.execute(`SELECT cw.percentage, ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw
      JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id WHERE cw.school_year_id = ? AND cw.subject_id = ?`,
    [context.schoolYearId, context.subjectId]),
    readTransmutation(db),
  ]);
  const isMapeh = /^MAPEH$/i.test(subject.code) || /^MAPEH$/i.test(subject.label);
  const activitiesBySheet = new Map();
  for (const row of activityRows) {
    const sheetId = String(row.grade_sheet_id);
    if (!activitiesBySheet.has(sheetId)) activitiesBySheet.set(sheetId, new Map());
    const groups = activitiesBySheet.get(sheetId), id = String(row.activity_id);
    if (!groups.has(id)) groups.set(id, { template: row, learners: new Map() });
    const learners = groups.get(id).learners, key = String(row.student_section_id);
    if (!learners.has(key)) learners.set(key, []);
    learners.get(key).push(row);
  }
  const students = [...index(candidates, 'student_section_id').values()].map(rows => {
    const row = rows[0];
    const ownActivities = [...(activitiesBySheet.get(String(row.grade_sheet_id)) || new Map()).values()]
      .flatMap(group => group.learners.get(String(row.student_section_id))
        || [{ ...group.template, score_id: null, raw_score: null, score_status: 'NOT_ENCODED' }]);
    const contextInvalid = ownActivities.some(activity => activity.score_id
      && (Number(activity.weight_subject_id) !== context.subjectId || Number(activity.weight_year_id) !== context.schoolYearId));
    let academic = computeProgress({ activities: ownActivities, weightRows, transmutationConfig, isMapeh, asOf });
    const reason = !context.hasStarted ? 'This term has not started.'
      : rows.length > 1 || Number(row.subject_offering_count) > 1 ? 'Duplicate subject offerings or grade sheets need review.'
        : contextInvalid ? 'An activity is linked to weights for a different subject or school year.' : null;
    if (reason) academic = { ...academic, status: context.hasStarted ? 'review' : 'needs_records',
      riskLevel: null, progress: null, gradePreview: null, weightedPoints: 0, availableWeight: 0,
      recordedActivities: 0, pendingActivities: 0, components: [], reasons: [reason] };
    return { id: String(row.student_section_id), studentId: Number(row.student_id), studentSectionId: Number(row.student_section_id),
      sectionId: Number(row.section_id), schoolYearId: context.schoolYearId, name: row.name,
      section: row.section_name, grade: Number(String(row.grade_level_name).match(/\d+/)?.[0]),
      adviser: row.adviser || 'Not assigned', subjectOfferingId: Number(row.subject_offering_id), academic };
  });
  const policy = { version: 'academic-progress-v2', highBelow: 75, moderateBelow: 80,
    attendanceAffectsBand: false, readingAffectsBand: false, minimumRecordedActivities: 1 };
  if (academicOnly) return { context, students, policy };
  const schoolStart = selectedYear.terms.find(term => term.value === 'T1')?.startsOn;
  const readingParams = [context.schoolYearId];
  const [attendance, [screenings], [assessments]] = await Promise.all([
    loadAttendanceInputs(db, students, { sourceStart: period.startsOn, sourceEnd: asOf, targetStart: nextDay(asOf) }),
    context.isEnglish ? db.execute(`SELECT ps.* FROM PHIL_IRI_SCREENING ps JOIN STUDENT_SECTION ss
      ON ss.student_section_id = ps.student_section_id WHERE ss.school_year_id = ? ORDER BY ps.assessed_on DESC, ps.screening_id DESC`, readingParams) : Promise.resolve([[]]),
    context.isEnglish ? db.execute(`SELECT pa.*, DATE_FORMAT(CONVERT_TZ(pa.created_at, '+00:00', '+08:00'), '%Y-%m-%d') AS recordedOn
      FROM PHIL_IRI_ASSESSMENT pa JOIN STUDENT_SECTION ss ON ss.student_section_id = pa.student_section_id
      LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = pa.subject_offering_id
      LEFT JOIN SUBJECT sub ON sub.subject_id = so.subject_id
      WHERE ss.school_year_id = ? AND (pa.subject_offering_id IS NULL OR UPPER(sub.subject_code) IN ('ENG', 'ENGLISH')
        OR UPPER(sub.subject_name) = 'ENGLISH') ORDER BY pa.created_at DESC, pa.phil_iri_id DESC`, readingParams) : Promise.resolve([[]]),
  ]);
  const screeningsByLearner = index(screenings, 'student_section_id'), assessmentsByLearner = index(assessments, 'student_section_id');
  for (const student of students) {
    const input = attendance.get(student.id);
    student.attendance = input ? { status: input.status, reason: input.reason, ...input.summary }
      : { status: 'unavailable', reason: 'No attendance records are available.' };
    student.reading = context.isEnglish ? readingIndicator(screeningsByLearner.get(student.id) || [],
      assessmentsByLearner.get(student.id) || [], { start: schoolStart, end: asOf }) : null;
  }
  return { context, students, policy };
}

module.exports = { getOptions, getPreview, readingIndicator, dateInManila };
