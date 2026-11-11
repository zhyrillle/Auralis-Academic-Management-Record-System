// Include this policy in both page and request cache identities to retire old imputed labels.
export const RISK_INPUT_POLICY = 'complete-records-v1';
export const RISK_PREVIEW_CACHE = `risk:preview:${RISK_INPUT_POLICY}`;
export const TEACHER_RISK_VIEW_VERSION = 'teacher-monitoring-v2';
export const ACADEMIC_PROGRESS_VERSION = 'academic-progress-v2';
export const SECTION_DETAILS_CACHE = `section-details:${TEACHER_RISK_VIEW_VERSION}:${RISK_INPUT_POLICY}`;
