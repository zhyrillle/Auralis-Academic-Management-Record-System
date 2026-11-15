const monitoring = require('./StudentMonitoringService');
const { DeptHeadMonitoringService } = require('./DeptHeadMonitoringService');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function getSummary(database, user, query, now = new Date(), dependencies = {}) {
  const contextService = dependencies.contextService || DeptHeadMonitoringService;
  const calculator = dependencies.monitoring || monitoring;
  const context = await contextService.context(user);
  const year = context.schoolYears.find(row => String(row.id) === String(query.schoolYearId) || row.label === query.schoolYear);
  if (!year) throw fail('Choose a configured school year.');
  const options = await calculator.getOptions(database, now);
  const terms = options.schoolYears.find(row => row.value === String(year.id))?.terms || [];
  const overall = query.term === 'ALL';
  const selected = overall ? terms[0] : query.term ? terms.find(term => term.value === query.term)
    : terms.find(term => term.startsOn <= options.today && term.endsOn >= options.today)
      || [...terms].reverse().find(term => term.startsOn <= options.today) || terms[0];
  if (!selected) throw fail('Choose a configured risk-monitoring term.');
  const grade = query.gradeLevel ? Number(String(query.gradeLevel).replace(/^G/i, '')) : null;
  if (grade !== null && ![7, 8, 9, 10].includes(grade)) throw fail('Choose a valid grade level.');
  // The subject is resolved from the assigned department; request.subject is never used.
  const results = await Promise.all((overall ? terms : [selected]).map(term => calculator.getPreview(database,
    { schoolYear: String(year.id), subject: String(context.subject.subjectId), term: term.value }, now, { academicOnly: true })));
  const result = results[0];
  // Overall counts each learner once per term. Duplicate enrollments within
  // the same term require review instead of creating extra band entries.
  const learners = new Map();
  for (const termResult of results) for (const row of termResult.students) {
    const key = `${termResult.context.term}:${row.studentId}`;
    if (!learners.has(key)) learners.set(key, []);
    learners.get(key).push(row);
  }
  const students = [...learners.values()].map(rows => rows.length === 1 ? rows[0]
    : { ...rows[0], academic: { status: 'review', riskLevel: null, gradePreview: null } })
    .filter(row => grade === null || row.grade === grade);
  const summary = { high: 0, moderate: 0, low: 0, total: 0, unavailable: 0, totalLearners: students.length };
  const byGrade = [7, 8, 9, 10].filter(value => grade === null || value === grade).map(value => ({ grade: value, high: 0, moderate: 0, low: 0 }));
  for (const student of students) {
    const level = student.academic.riskLevel;
    if (student.academic.status !== 'available' || !['high', 'moderate', 'low'].includes(level) || !Number.isFinite(student.academic.gradePreview)) { summary.unavailable++; continue; }
    summary[level]++; summary.total++;
    const group = byGrade.find(row => row.grade === student.grade);
    if (group) group[level]++;
  }
  return { version: 'department-academic-risk-v2', context: { ...result.context, term: overall ? 'ALL' : selected.value,
    countingUnit: overall ? 'learner-term' : 'learner', department: context.department.name }, terms,
    summary, byGrade, policy: result.policy };
}
module.exports = { getSummary };
