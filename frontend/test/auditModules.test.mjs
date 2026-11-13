import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_MODULES, auditModuleGroup, isAuditEventVisible } from '../src/utils/auditModules.js';

test('finalized and monthly attendance are excluded while daily attendance stays visible', () => {
  assert.equal(isAuditEventVisible({ eventType: 'ATTENDANCE_FINALIZED' }), false);
  assert.equal(isAuditEventVisible({ eventType: 'GRADE_SHEET_DATA_RECONCILED' }), false);
  assert.equal(isAuditEventVisible({ eventType: 'ATTENDANCE_RECORDED', summary: 'Recorded monthly attendance for Term #1.' }), false);
  assert.equal(isAuditEventVisible({ event_type: 'ATTENDANCE_RECORDED', metadata: { summary: 'Sample data: Recorded Monthly attendance.' } }), false);
  assert.equal(isAuditEventVisible({ eventType: 'ATTENDANCE_RECORDED', summary: 'Recorded daily attendance for Section Banana.' }), true);
  assert.equal(isAuditEventVisible({ eventType: 'ATTENDANCE_RECORDED', summary: 'Updated English attendance for Demo Section.' }), true);
});

test('legacy module codes and display names group into the four agreed modules', () => {
  assert.deepEqual(AUDIT_MODULES, ['Account Management', 'System', 'Class Record', 'Grade Reopening']);
  for (const module of ['ACCOUNT_MANAGEMENT', 'Account Management']) assert.equal(auditModuleGroup({ module }), 'Account Management');
  for (const module of ['WS_CONFIGURATION', 'WS Configuration', 'Grade Transmutation', 'GRADING_PERIOD']) assert.equal(auditModuleGroup({ module }), 'System');
  for (const module of ['Grading', 'CLASS_RECORD', 'Attendance', 'SF9 Records', 'Department Oversight', 'Analytics & Reports']) assert.equal(auditModuleGroup({ module }), 'Class Record');
});

test('event types distinguish reopening decisions from schedules within the old Grading Period module', () => {
  const event = { module: 'Grading Period', eventType: 'GRADE_REOPEN_REQUEST_APPROVED' };
  assert.equal(auditModuleGroup(event), 'Grade Reopening');
  assert.equal(event.module, 'Grading Period');
  assert.equal(auditModuleGroup({ module_name: 'GRADING_PERIOD', event_type: 'TEMPORARY_REOPENING_EXPIRED' }), 'Grade Reopening');
  assert.equal(auditModuleGroup({ module: 'Grade Lock', eventType: 'TERM_AUTOMATICALLY_LOCKED' }), 'System');
  assert.equal(auditModuleGroup({ module: 'Grading Period', eventType: 'GRADING_PERIOD_TIMELINE_UPDATED' }), 'System');
});

test('profile actions and legacy academic views remain in their relevant groups', () => {
  assert.equal(auditModuleGroup({ event_type: 'USER_PROFILE_UPDATED' }), 'Account Management');
  assert.equal(auditModuleGroup({ module: 'School Oversight', eventType: 'SCHOOL_ANALYTICS_REVIEWED' }), 'Class Record');
  assert.equal(auditModuleGroup({ module: 'System', entity_type: 'GRADE_REOPEN_REQUEST' }), 'Grade Reopening');
});

test('unrecognized historical sources remain visible in System without modifying their source data', () => {
  const event = { module: 'Legacy source', eventType: 'LEGACY_EVENT' };
  assert.equal(auditModuleGroup(event), 'System');
  assert.equal(event.module, 'Legacy source');
});
