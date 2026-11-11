import { TEACHER_RISK_VIEW_VERSION } from '../services/riskInputPolicy.js';

const monitoringLevels = ['low', 'moderate', 'high'];
const modelLevels = ['low', 'medium', 'high'];
const validNumber = value => Number.isFinite(value) && value >= 0 && value <= 100;

export function getSectionGrade(learner, mode) {
  return mode === 'monitoring' ? learner.academic?.gradePreview : learner.termGrade;
}

export function getSectionRisk(learner, mode) {
  if (mode === 'prediction') return learner.riskAssessment;
  const academic = learner.academic;
  if (academic?.status === 'available') return {
    status: 'available', riskLevel: academic.riskLevel,
    label: `${academic.riskLevel[0].toUpperCase()}${academic.riskLevel.slice(1)} Risk`,
    reason: [`Current-term grade preview: ${academic.gradePreview}.`, ...(academic.reasons || [])].join(' '),
  };
  return { status: academic?.status === 'review' ? 'needs_review' : 'awaiting_records',
    label: academic?.status === 'review' ? 'Review records' : 'Records needed',
    reason: academic?.reasons?.join(' ') || 'Valid recorded activities and configured subject weights are needed.' };
}

// Reject a partially updated server response before it can mix old labels with new grades.
export function isSectionDetailsView(data, { assignmentType, assignmentId, term, riskMode }) {
  const context = data?.context, mode = context?.riskMode;
  if (data?.viewVersion !== TEACHER_RISK_VIEW_VERSION || context?.assignmentType !== assignmentType
    || Number(context?.assignmentId) !== Number(assignmentId) || context?.selectedTerm?.code !== term
    || !Array.isArray(data.learners) || !data.summary?.performanceBands) return false;
  if (assignmentType === 'advisory') return mode === 'advisory';
  if (!Number.isSafeInteger(context.subject?.id) || context.subject.id <= 0
    || !Number.isSafeInteger(context.subject?.offeringId) || context.subject.offeringId <= 0) return false;
  const fallback = riskMode === 'prediction' && mode === 'monitoring'
    && data.capabilities?.predictionReady === false && typeof data.notice === 'string' && data.notice.length > 0;
  if (mode !== riskMode && !fallback) return false;
  if (data.riskContext?.mode !== mode || !['monitoring', 'prediction'].includes(mode)) return false;
  if (mode === 'prediction' && (data.capabilities?.predictionApplicable !== true
    || data.capabilities?.predictionReady !== true || !['T1', 'T2'].includes(term)
    || !(/^(ENG|ENGLISH)$/i.test(context.subject.code) || /^English$/i.test(context.subject.name))
    || data.riskContext?.targetTerm !== `T${Number(term[1]) + 1}`)) return false;
  const seen = new Set();
  return data.learners.every(learner => {
    if (!Number.isSafeInteger(learner.studentSectionId) || learner.studentSectionId <= 0 || seen.has(learner.studentSectionId)) return false;
    seen.add(learner.studentSectionId);
    if (mode === 'monitoring') {
      const academic = learner.academic;
      if (!academic || !Array.isArray(academic.reasons)) return false;
      if (academic.status === 'available') return validNumber(academic.gradePreview)
        && monitoringLevels.includes(academic.riskLevel)
        && academic.riskLevel === (academic.gradePreview < 75 ? 'high' : academic.gradePreview < 80 ? 'moderate' : 'low');
      return ['needs_records', 'review'].includes(academic.status)
        && academic.riskLevel === null && academic.gradePreview === null;
    }
    const risk = learner.riskAssessment;
    return ['available', 'needs_review', 'insufficient_data', 'awaiting_records', 'unavailable', 'not_applicable'].includes(risk?.status)
      && typeof risk.label === 'string' && (risk.status !== 'available'
      || (modelLevels.includes(risk.riskLevel) && validNumber(learner.termGrade) && learner.termGrade >= 60));
  });
}
