import { AlertCircle, MinusCircle, AlertTriangle } from 'lucide-react';

export const TERM_OPTIONS = [
  { id: 'T2', label: 'Predict Term 2' },
  { id: 'T3', label: 'Predict Term 3' },
];
export const RISK_BANDS = [
  { level: 'low', key: 'lowRisk', label: 'Low Risk', caption: 'Continue regular monitoring', tone: 'green', color: '#16a34a', icon: AlertCircle,
    meaning: 'The model indicates a lower risk of next-term English failure. This does not guarantee a passing grade.',
    action: 'Continue regular monitoring and check any missing or substituted records.' },
  { level: 'medium', key: 'mediumRisk', label: 'Medium Risk', caption: 'Review and monitor closely', tone: 'gold', color: '#d97706', icon: MinusCircle,
    meaning: 'The model indicates an intermediate risk of next-term English failure. A closer review may help identify support needs.',
    action: 'Review recent English work with the teacher and adviser, and monitor progress.' },
  { level: 'high', key: 'highRisk', label: 'High Risk', caption: 'Prioritize a record review', tone: 'red', color: '#dc2626', icon: AlertTriangle,
    meaning: 'The model indicates a higher risk of next-term English failure. This is a signal for review, not a confirmed outcome.',
    action: 'Prioritize a teacher–adviser review and agree on appropriate support.' },
];

export const RISK_FILTERS = [{ id: 'all', label: 'All learners' },
  ...[...RISK_BANDS].reverse().map(band => ({ id: band.level, label: band.label }))];

export function learnerCountScale(highestCount) {
  // Leave room for bar labels while keeping the learner-count axis in whole numbers.
  const paddedMaximum = Math.max(5, highestCount * 1.15);
  const rawStep = paddedMaximum / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= rawStep) * magnitude;
  const maximum = Math.ceil(paddedMaximum / step) * step;
  return { maximum, ticks: Array.from({ length: Math.round(maximum / step) + 1 }, (_, index) => index * step) };
}

export function learnerReportPath(student) {
  if (!student.studentId || !student.schoolYearId || !student.studentSectionId) return null;
  return `/principal/reports?${new URLSearchParams({ studentId: student.studentId,
    schoolYearId: student.schoolYearId, enrollmentId: student.studentSectionId })}`;
}

const INPUT_ROWS = [
  ['previous_final_grade', 'Previous English grade', false],
  ['ww_pct', 'Written Work', true],
  ['pt_pct', 'Performance Tasks', true],
  ['qa_pct', 'Assessments · ST1, ST2 and Term Exam', true],
  ['phil_iri_literal_pct', 'Screening · Literal', true],
  ['phil_iri_inferential_pct', 'Screening · Inferential', true],
  ['phil_iri_critical_pct', 'Screening · Critical', true],
  ['absence_rate', 'Absence rate', true],
];

export function predictionInputRows(student) {
  const inputs = student.modelInputs;
  return INPUT_ROWS.map(([key, label, percent]) => {
    const raw = inputs?.[key];
    const supplied = raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
    const value = key === 'absence_rate' ? Number(raw) * 100 : Number(raw);
    return { key, label, value: supplied ? `${value.toFixed(1).replace(/\.0$/, '')}${percent ? '%' : ''}` : 'Not available' };
  });
}

export function predictionRecordGroups(student) {
  const values = Object.fromEntries(predictionInputRows(student).map(row => [row.key, row.value]));
  const sourceTerm = /^T[123]$/.test(student.sourceTerm) ? student.sourceTerm.replace('T', 'Term ') : 'Previous term';
  const attendance = student.attendanceSummary;
  const completeAttendance = student.attendanceStatus === 'available'
    && values.absence_rate !== 'Not available'
    && Number.isInteger(attendance?.absentDays) && Number.isInteger(attendance?.classDays)
    && attendance.classDays > 0 && attendance.absentDays >= 0 && attendance.absentDays <= attendance.classDays;
  return [
    { key: 'grade', label: `${sourceTerm} English grade`,
      metrics: [{ label: 'Saved grade', value: values.previous_final_grade }] },
    { key: 'assessments', label: 'Assessment components', metrics: [
      { label: 'Written Work', value: values.ww_pct },
      { label: 'Performance Tasks', value: values.pt_pct },
      { label: 'Assessments', value: values.qa_pct },
    ], note: 'Component percentages from the source term.' },
    { key: 'screening', label: 'PHIL-IRI screening', metrics: [
      { label: 'Literal', value: values.phil_iri_literal_pct },
      { label: 'Inferential', value: values.phil_iri_inferential_pct },
      { label: 'Critical', value: values.phil_iri_critical_pct },
    ], note: student.screeningAssessmentDate ? `Assessed on ${student.screeningAssessmentDate}` : 'Available screening sub-score percentages.' },
    { key: 'attendance', label: 'Attendance', metrics: completeAttendance
      ? [{ label: 'Recorded attendance', value: `${attendance.absentDays} absence${attendance.absentDays === 1 ? '' : 's'} / ${attendance.classDays} class days` },
        { label: 'Absence rate', value: values.absence_rate }]
      : [{ label: 'Absence rate', value: values.absence_rate }],
      note: completeAttendance ? 'No-class days are excluded.' : 'Only available learner records are shown.' },
  ];
}

export function sortByRisk(students) {
  return [...students].sort((a, b) => b.score - a.score || b.riskScore - a.riskScore
    || String(a.id).localeCompare(String(b.id)));
}

export function learnerListPath(origin, level, filterQuery) {
  return `/principal/at-risk-students/${origin}/learners/${level}?${filterQuery}`;
}

export function learnerFilterOptions(students, gradeLevel) {
  const inGrade = students.filter(student => gradeLevel === 'all' || String(student.grade) === gradeLevel);
  const sections = [...new Map(inGrade.map(student => [
    `${student.grade}|${student.section}`, { value: `${student.grade}|${student.section}`, label: `Grade ${student.grade} · ${student.section}` },
  ])).values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const advisers = [...new Set(inGrade.map(student => student.adviser).filter(Boolean))].sort();
  return {
    sections: [{ value: 'all', label: 'All Sections' }, ...sections],
    advisers: [{ value: 'all', label: 'All Advisers' }, ...advisers.map(name => ({ value: name, label: name }))],
  };
}

export function getLearnerFilterPanelLayout(trigger, viewportWidth) {
  const gutter = 16;
  const gap = 12;
  const spaceOnLeft = Math.max(0, trigger.left - gap - gutter);
  const placement = spaceOnLeft >= 480 ? 'left' : 'below';
  const width = Math.min(660, placement === 'left' ? spaceOnLeft : Math.max(0, viewportWidth - gutter * 2));
  const left = placement === 'left' ? trigger.left - gap - width
    : Math.max(gutter, Math.min(trigger.right - width, viewportWidth - gutter - width));
  return { placement, style: { width, left: left - trigger.left, top: placement === 'left' ? 0 : trigger.height + gap } };
}

export function filterLearners(students, { gradeLevel = 'all', section = 'all', adviser = 'all', search = '' }) {
  const query = search.trim().toLowerCase();
  return students.filter(student => (gradeLevel === 'all' || String(student.grade) === gradeLevel)
    && (section === 'all' || `${student.grade}|${student.section}` === section)
    && (adviser === 'all' || student.adviser === adviser)
    && `${student.name} ${student.grade} ${student.section} ${student.adviser || ''}`.toLowerCase().includes(query));
}
