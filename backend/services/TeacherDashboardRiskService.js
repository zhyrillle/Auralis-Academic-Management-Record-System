const SectionDetails = require('./SectionDetailsService');
const Monitoring = require('./StudentMonitoringService');

const rank = { low: 1, medium: 2, high: 3 };
const band = value => value === 'moderate' ? 'medium' : value;

// Count a learner once, at their highest band across the subjects this user teaches.
function summarize(students, context) {
  const assessed = students.filter(student => rank[student.risk_level]);
  const counts = { high: 0, medium: 0, low: 0 };
  assessed.forEach(student => counts[student.risk_level]++);
  return { ...context, counts, highRiskCount: counts.high, totalScored: assessed.length,
    unavailableCount: students.length - assessed.length, students: assessed,
    unavailableStudents: students.filter(student => !rank[student.risk_level]) };
}

async function getRiskOverview(database, userId, activeTerm, { mode = 'monitoring', now = new Date(),
  detailsService = SectionDetails, monitoringService = Monitoring } = {}) {
  if (!['monitoring', 'prediction'].includes(mode)) throw Object.assign(new Error('Choose monitoring or prediction.'), { status: 400 });
  const options = await monitoringService.getOptions(database, now);
  const selectedYear = options.schoolYears.find(year => Number(year.value) === Number(activeTerm.schoolYearId))
    || options.schoolYears.find(year => year.value === options.defaultSchoolYear);
  if (!selectedYear) throw new Error('No school year is configured for monitoring.');
  const term = activeTerm.termCode;
  // Match Section Details: the viewed term is the source for the next term.
  const sourceTerm = term;
  const context = { version: 'teacher-dashboard-risk-v2', mode, term, sourceTerm,
    targetTerm: mode === 'prediction' && term !== 'T3' ? `T${Number(term[1]) + 1}` : null,
    schoolYear: selectedYear.label.replace(/^SY\s*/, ''),
    schoolYearId: Number(selectedYear.value), notices: [], predictionSections: [], predictionReady: false };
  // Do not infer teaching access from an advisory assignment or another teacher's subject.
  const [assignments] = await database.execute(`SELECT ta.teacher_assignment_id, so.subject_offering_id,
    s.subject_name, s.subject_code FROM TEACHER_ASSIGNMENT ta
    JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
    JOIN SUBJECT s ON s.subject_id = so.subject_id WHERE ta.user_id = ? AND so.school_year_id = ?`,
  [userId, Number(selectedYear.value)]);
  const unique = [...new Map(assignments.filter(row => mode !== 'prediction'
    || /^(ENG|ENGLISH)$/i.test(row.subject_code) || /^English$/i.test(row.subject_name))
    .map(row => [Number(row.subject_offering_id), row])).values()];
  const results = await Promise.all(unique.map(row => detailsService.getSectionDetails({ assignmentType: 'teaching',
    assignmentId: row.teacher_assignment_id, userId, term: sourceTerm, riskMode: mode }, database, { now })));
  const learners = new Map();
  for (const result of results) {
    const { sectionId, sectionName, gradeLevel, subject } = result.context;
    if (result.capabilities.predictionApplicable) context.predictionSections.push({ sectionId, sectionName,
      ready: Boolean(result.capabilities.predictionReady),
      label: result.capabilities.predictionUnavailableLabel || '',
      reason: result.capabilities.predictionUnavailableReason || '' });
    const predictionReady = mode !== 'prediction' || (result.capabilities.predictionReady
      && result.context.riskMode === 'prediction' && result.capabilities.atRiskAvailable);
    if (!predictionReady) context.notices.push(`${sectionName}: ${result.capabilities.predictionUnavailableReason
      || result.riskContext?.message || 'Predictions are unavailable. Retry after checking the records.'}`);
    for (const student of result.learners) {
      const key = `${context.schoolYearId}:${student.studentSectionId}`;
      if (!learners.has(key)) learners.set(key, { student_id: student.studentId, student_section_id: student.studentSectionId,
        name: student.name, lrn: student.lrn, section_id: sectionId, section_name: sectionName,
        grade_level: gradeLevel, risk_level: null, subjects: [] });
      const learner = learners.get(key);
      const assessment = mode === 'monitoring' ? student.academic : student.riskAssessment;
      const risk = predictionReady && assessment?.status === 'available' ? band(assessment.riskLevel) : null;
      learner.subjects.push({ name: subject.name, riskLevel: risk,
        grade: mode === 'monitoring' ? student.academic?.gradePreview : student.termGrade,
        reason: assessment?.reason || assessment?.reasons?.join(' ') || (!predictionReady ? 'Prediction is not ready.' : '') });
      if ((rank[risk] || 0) > (rank[learner.risk_level] || 0)) learner.risk_level = risk;
    }
  }
  if (!unique.length) context.notices.push(mode === 'prediction'
    ? 'No English teaching assignments are available in this school year.' : 'No teaching assignments are available in this school year.');
  context.predictionReady = context.predictionSections.some(section => section.ready);
  return summarize([...learners.values()].sort((a, b) => a.name.localeCompare(b.name)), context);
}

module.exports = { getRiskOverview, summarize };
