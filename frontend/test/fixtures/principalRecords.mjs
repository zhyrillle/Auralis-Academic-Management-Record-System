// Deliberately synthetic test responses. Not imported by the production app.
export const version = 2;
export const rawYears = [{ school_year_id: 4, starts_on: 2026, ends_on: 2027, status: 'ongoing' }, { school_year_id: 3, starts_on: 2025, ends_on: 2026, status: 'closed' }];
export const years = rawYears.map(row => ({ value: row.starts_on + '-' + row.ends_on, label: 'SY ' + row.starts_on + '–' + row.ends_on }));
export const metric = (id = 'test', extra = {}) => ({ id, label: 'Fixture ' + id, averageGrade: 81.25, passRate: 50, failRate: 50, learners: 2, gradedLearners: 2, status: 'Monitor', ...extra });
export function performance(page, params = {}, empty = false) {
  const common = { recordsVersion: version, term: params.term || 'overall', schoolYear: years[0], availableSchoolYears: years, availableGradeLevels: [7, 8, 9, 10] };
  const gradeLevels = empty ? [] : [7, 8, 9, 10].map((grade, i) => metric('grade-' + grade, { gradeLevel: grade, label: 'Grade ' + grade, shortLabel: 'G' + grade, gradedLearners: i > 1 ? 0 : 2, status: i > 1 ? 'No data' : 'Monitor' }));
  const subjects = empty ? [] : Array.from({ length: 11 }, (_, i) => metric('subject-' + i, { label: i ? 'Fixture Subject ' + i : 'English', code: i ? 'S' + i : 'ENG', highestSection: null, lowestSection: null }));
  const sections = empty ? [] : [metric('section', { section: 'Fixture Section', gradeLevel: 7, distribution: { needsAttention: 1, satisfactory: 1, verySatisfactory: 0, outstanding: 0 } })];
  const teachers = empty ? [] : [1, 2, 3, 4].map((id, i) => ({ id: 'teacher-' + id, name: 'Fixture Teacher ' + id, subject: 'English', subjectCode: 'ENG', assignments: ['G7–Fixture'], completion: 50, status: 'Pending', averageGrade: i ? 81.25 : 0, passRate: 50, learnerCount: 2, termAverages: i ? [68 + i, 82 + i, 90] : [0, 0, 88], termGradeCounts: i ? [2, 2, 2] : [1, 0, 1], hasGrades: true }));
  const summary = { averageGrade: 81.25, passRate: 50, failRate: 50, totalLearners: empty ? 0 : 2, passingLearners: empty ? 0 : 1, failingLearners: empty ? 0 : 1, needsAttention: empty ? 0 : 1 };
  if (page === 'grade-levels') return { ...common, gradeLevels, summary };
  if (page === 'sections') return { ...common, sections, bands: ['Needs Attention', 'Satisfactory', 'Very Satisfactory', 'Outstanding'].map((label, i) => ({ id: ['needs-attention', 'satisfactory', 'very-satisfactory', 'outstanding'][i], label, count: empty ? 0 : 1 })), summary };
  if (page === 'subjects') return { ...common, subjects, summary: { totalSubjects: subjects.length, topSubject: subjects[0] || null, lowestSubject: subjects.at(-1) || null, belowTarget: 0 } };
  if (page === 'teachers') return { ...common, teachers, summary: { totalTeachers: teachers.length, submittedReports: 0, failRate: 50, needsAttention: teachers.length } };
  return { ...common, gradeLevels, sections, subjects, summary: { atRiskStudents: empty ? 0 : 1, lowestGradeLevel: gradeLevels[0] || null, lowestSection: sections[0] || null, lowestSubject: subjects[0] || null } };
}
export function trend(params = {}, empty = false) {
  return { recordsVersion: version, schoolYear: years[0], term: params.term || 'overall', availableSchoolYears: years, availableGradeLevels: [{ value: 'all', label: 'All grade levels' }, { value: '7', label: 'Grade 7' }], totalLearners: empty ? 0 : 2,
    subjects: empty ? [] : [{ id: 'english', code: 'ENG', label: 'English', learnerCount: 2, termAverages: [0, 0, 88], termPassRates: [0, 0, 100], termGradeCounts: [1, 0, 1] }],
    schoolWideAverages: [0, 0, 88], schoolWideGradeCounts: empty ? [0, 0, 0] : [1, 0, 1] };
}
export function historical(params = {}, missing = 'comparison') {
  const hasPrimaryData = !['primary', 'both'].includes(missing), hasComparisonData = !['comparison', 'both'].includes(missing);
  const primaryTermGradeCounts = hasPrimaryData ? [1, 0, 1] : [0, 0, 0], comparisonTermGradeCounts = hasComparisonData ? [1, 1, 1] : [0, 0, 0];
  return { recordsVersion: version, term: params.term || 'overall', availableSchoolYears: years, primarySchoolYear: years[0], comparisonSchoolYear: years[1], totalStudents: hasPrimaryData ? 2 : 0,
    hasPrimaryData, hasComparisonData, primaryTrend: [0, 0, 88], comparisonTrend: hasComparisonData ? [80, 82, 84] : [0, 0, 0],
    primaryTrendGradeCounts: primaryTermGradeCounts, comparisonTrendGradeCounts: comparisonTermGradeCounts,
    subjects: missing === 'both' ? [] : [{ id: 'english', code: 'ENG', label: 'English', hasPrimaryData, hasComparisonData, primaryAverage: hasPrimaryData ? 44 : 0, comparisonAverage: hasComparisonData ? 82 : 0, difference: hasPrimaryData && hasComparisonData ? -38 : null, passRate: 50, status: hasPrimaryData ? 'Needs attention' : 'No data',
      primaryTermAverages: [0, 0, 88], comparisonTermAverages: [80, 82, 84], primaryTermPassRates: [0, 0, 100], comparisonTermPassRates: [100, 100, 100], primaryTermGradeCounts, comparisonTermGradeCounts }] };
}
export const feedbackSummary = empty => ({ recordsVersion: version, totalResponses: empty ? 0 : 2, overallRating: empty ? 0 : 4.125, ratingDiff: '+1.1', totalComments: empty ? 0 : 2, belowTargetCount: 0 });
export const feedbackLikert = empty => ({ recordsVersion: version, results: [{ id: 1, description: 'Fixture survey question', rate: empty ? 0 : 4.1 }] });
export const feedbackComments = empty => ({ recordsVersion: version, comments: empty ? [] : [{ id: 'a', text: 'Fixture positive comment', category: 'Strengths & Contributions' }, { id: 'b', text: 'Fixture improvement comment', category: 'Areas for Improvement' }] });
