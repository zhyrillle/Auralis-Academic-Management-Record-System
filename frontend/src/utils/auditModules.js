export const AUDIT_MODULES = ['Account Management', 'System', 'Class Record', 'Grade Reopening'];

const key = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export function isAuditEventVisible(event) {
  const type = key(event.eventType || event.event_type);
  if (['GRADE_SHEET_DATA_RECONCILED', 'ATTENDANCE_FINALIZED'].includes(type)) return false;
  const summary = event.summary || event.metadata?.summary || '';
  return !(type === 'ATTENDANCE_RECORDED' && /\brecorded\s+monthly\s+attendance\b/i.test(summary));
}

// Group historical module names without changing the stored audit events.
const moduleGroups = {
  ACCOUNT_MANAGEMENT: 'Account Management',
  GRADING: 'Class Record', CLASS_RECORD: 'Class Record', ATTENDANCE: 'Class Record',
  SF9: 'Class Record', SF9_RECORDS: 'Class Record', STUDENT: 'Class Record',
  DEPARTMENT_OVERSIGHT: 'Class Record', SCHOOL_OVERSIGHT: 'Class Record',
  ANALYTICS: 'Class Record', ANALYTICS_REPORTS: 'Class Record', FEEDBACK: 'Class Record',
  SYSTEM: 'System', WS_CONFIGURATION: 'System', GRADE_TRANSMUTATION: 'System',
  GRADING_PERIOD: 'System', GRADE_LOCK: 'Grade Reopening', GRADE_REOPENING: 'Grade Reopening',
};

export function auditModuleGroup(event) {
  const type = key(event.eventType || event.event_type);
  const entity = key(event.entityType || event.entity_type);
  if (/^GRADE_REOPEN_|^TEMPORARY_REOPENING_/.test(type)
    || ['GRADE_REOPEN_REQUEST', 'TEMPORARY_REOPENING'].includes(entity)) return 'Grade Reopening';
  if (/^TERM_AUTOMATICALLY_LOCKED$|^GRADING_PERIOD_|^UPCOMING_SCHOOL_YEAR_|^SUBJECT_WEIGHTS_|^GRADE_TRANSMUTATION_/.test(type)) return 'System';
  if (/^USER_/.test(type)) return 'Account Management';
  if (/^ATTENDANCE_|^GRADE_SHEET_|^CLASS_RECORD_|^SCORE_|^ASSESSMENT_/.test(type)) return 'Class Record';
  // Unknown legacy sources stay visible under System with their recorded module available in the drawer.
  return moduleGroups[key(event.recordedModule || event.module || event.module_name)] || 'System';
}
