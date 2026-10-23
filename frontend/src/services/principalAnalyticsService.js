import { principalRead, principalTerms, numeric } from './principalData';

export const principalAnalyticsTerms = principalTerms;
const triple = values => Array.isArray(values) && values.length === 3 && values.every(numeric);
const years = data => Array.isArray(data.availableSchoolYears)
  && data.availableSchoolYears.every(year => typeof year.value === 'string' && typeof year.label === 'string');

export const getSubjectPerformanceTrend = filters => principalRead('/principal/analytics/subject-trend', filters, data =>
  data && years(data) && principalTerms.some(term => term.id === data.term) && Array.isArray(data.availableGradeLevels) && numeric(data.totalLearners)
  && triple(data.schoolWideAverages) && triple(data.schoolWideGradeCounts)
  && Array.isArray(data.subjects) && data.subjects.every(subject => typeof subject.label === 'string'
    && numeric(subject.learnerCount) && triple(subject.termAverages) && triple(subject.termPassRates) && triple(subject.termGradeCounts)));

export const getHistoricalComparison = filters => principalRead('/principal/analytics/historical-comparison', filters, data =>
  data && years(data) && typeof data.primarySchoolYear?.label === 'string' && typeof data.comparisonSchoolYear?.label === 'string'
  && principalTerms.some(term => term.id === data.term) && triple(data.primaryTrend) && triple(data.comparisonTrend)
  && triple(data.primaryTrendGradeCounts) && triple(data.comparisonTrendGradeCounts)
  && typeof data.hasPrimaryData === 'boolean' && typeof data.hasComparisonData === 'boolean'
  && Array.isArray(data.subjects) && data.subjects.every(subject => typeof subject.label === 'string'
    && numeric(subject.primaryAverage) && numeric(subject.comparisonAverage)
    && (subject.difference === null || numeric(subject.difference))
    && typeof subject.hasPrimaryData === 'boolean' && typeof subject.hasComparisonData === 'boolean'
    && typeof subject.status === 'string'
    && [subject.primaryTermAverages, subject.comparisonTermAverages, subject.primaryTermPassRates,
      subject.primaryTermGradeCounts, subject.comparisonTermGradeCounts].every(triple)));

export const getPrincipalAnalyticsOptions = () => principalRead('/principal/analytics/options', {}, data =>
  data && Array.isArray(data.schoolYears) && Array.isArray(data.gradeLevels));
