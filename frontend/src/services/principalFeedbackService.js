import { getPrincipalSchoolYears, principalRead, numeric } from './principalData';

export const getTeacherFeedbackSummary = schoolYear => principalRead('/principal/feedback/summary', { schoolYear }, data =>
  data && ['totalResponses', 'overallRating', 'totalComments', 'belowTargetCount'].every(key => numeric(data[key])));

export async function getLikertEvaluationResults(schoolYear) {
  const data = await principalRead('/principal/feedback/likert-results', { schoolYear }, result =>
    result && Array.isArray(result.results) && result.results.every(row => typeof row.description === 'string' && numeric(row.rate)));
  return data.results;
}

export async function getTeacherFeedbackComments(schoolYear, query = '') {
  const data = await principalRead('/principal/feedback/comments', { schoolYear, query }, result =>
    result && Array.isArray(result.comments) && result.comments.every(comment => typeof comment.text === 'string' && typeof comment.category === 'string'));
  return data.comments;
}

export async function getPrincipalFeedback({ schoolYear }) {
  const [summary, likertResults, comments] = await Promise.all([
    getTeacherFeedbackSummary(schoolYear), getLikertEvaluationResults(schoolYear), getTeacherFeedbackComments(schoolYear),
  ]);
  return { summary, likertResults, comments };
}

export async function getSchoolYears() {
  return (await getPrincipalSchoolYears()).map(year => year.value);
}
