import { principalRead, principalTerms, numeric } from './principalData';

export const principalPerformanceTerms = principalTerms;
const metadata = data => data && data.summary && Array.isArray(data.availableSchoolYears)
  && data.availableSchoolYears.every(year => typeof year.value === 'string' && typeof year.label === 'string')
  && Array.isArray(data.availableGradeLevels) && data.availableGradeLevels.every(numeric);
const metrics = row => row && typeof row.label === 'string' && typeof row.status === 'string'
  && ['averageGrade', 'passRate', 'failRate', 'learners', 'gradedLearners'].every(key => numeric(row[key]));
const summaryHas = (data, fields) => fields.every(key => numeric(data.summary[key]));
const arrayOf = (data, key, validate) => Array.isArray(data[key]) && data[key].every(validate);
const rows = {
  'grade-levels': data => arrayOf(data, 'gradeLevels', metrics) && summaryHas(data, ['averageGrade', 'passRate', 'failRate', 'totalLearners', 'passingLearners', 'failingLearners', 'needsAttention']),
  sections: data => arrayOf(data, 'sections', row => metrics(row) && typeof row.section === 'string' && numeric(row.gradeLevel)
    && row.distribution && ['needsAttention', 'satisfactory', 'verySatisfactory', 'outstanding'].every(key => numeric(row.distribution[key])))
    && arrayOf(data, 'bands', band => typeof band.label === 'string' && numeric(band.count))
    && summaryHas(data, ['averageGrade', 'passRate', 'failRate', 'passingLearners', 'failingLearners', 'needsAttention']),
  subjects: data => arrayOf(data, 'subjects', metrics) && summaryHas(data, ['totalSubjects', 'belowTarget'])
    && ['topSubject', 'lowestSubject'].every(key => data.summary[key] === null || (typeof data.summary[key]?.label === 'string' && numeric(data.summary[key].averageGrade))),
  teachers: data => arrayOf(data, 'teachers', row => typeof row.name === 'string' && typeof row.subject === 'string'
    && Array.isArray(row.assignments) && typeof row.hasGrades === 'boolean' && ['averageGrade', 'completion', 'learnerCount'].every(key => numeric(row[key]))
    && Array.isArray(row.termAverages) && row.termAverages.length === 3 && row.termAverages.every(numeric)
    && Array.isArray(row.termGradeCounts) && row.termGradeCounts.length === 3 && row.termGradeCounts.every(numeric))
    && summaryHas(data, ['totalTeachers', 'submittedReports', 'failRate', 'needsAttention']),
  'lowest-performers': data => ['gradeLevels', 'sections', 'subjects'].every(key => arrayOf(data, key, metrics))
    && summaryHas(data, ['atRiskStudents'])
    && ['lowestGradeLevel', 'lowestSection', 'lowestSubject'].every(key => data.summary[key] === null || (typeof data.summary[key]?.label === 'string' && numeric(data.summary[key].averageGrade))),
};
const read = (page, filters) => principalRead('/principal/performance/' + page, filters, data => metadata(data) && rows[page](data));

export const getGradeLevelPerformance = filters => read('grade-levels', filters);
export const getSectionPerformance = filters => read('sections', filters);
export const getSubjectPerformance = filters => read('subjects', filters);
export const getTeacherPerformance = filters => read('teachers', filters);
export const getLowestPerformers = filters => read('lowest-performers', filters);
