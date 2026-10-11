import { requestRiskPreview } from './atRiskPredictionApi';

// Compatibility helpers; the pages use one /preview request for a consistent snapshot.
export const getAtRiskSummary = (filters) => requestRiskPreview('summary', filters);
export async function getOverallDistribution(filters) {
  return (await requestRiskPreview('breakdown', filters)).distribution;
}
export async function getGradeLevelBreakdown(filters) {
  return (await requestRiskPreview('breakdown', filters)).gradeBreakdown;
}
export async function getRiskLevelLearners(filters) {
  const data = await requestRiskPreview('students', filters);
  return { count: data.totalCount, students: data.students, notes: [] };
}
