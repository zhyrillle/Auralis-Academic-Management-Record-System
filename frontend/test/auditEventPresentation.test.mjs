import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuditChangeGroups, formatAuditValue } from '../src/utils/auditEventPresentation.js';

const grading = (beforeData, afterData) => getAuditChangeGroups({ module: 'Grading', beforeData, afterData });
test('reconciled grades match by record identity across reordering and field aliases', () => {
  const result = grading([{ gradeId: 11, initial: '71.00', final: '73.00' }, { gradeId: 12, initial: '78.00', final: '80.00' }],
    [{ gradeId: 12, initial_grade: 81, quarterly_grade: 83, remarks: 'Passed' }, { gradeId: 11, initial_grade: 55.7, quarterly_grade: 67, remarks: 'Failed' }]);
  assert.equal(result.groups.length, 2);
  const row = result.groups.find(group => group.title === 'Grade record #11');
  assert.deepEqual(row.fields.map(field => field.label), ['Initial grade', 'Term grade', 'Remarks']);
  assert.deepEqual(row.fields[1], { id: '/grade_id:11.term_grade', label: 'Term grade', before: '73.00', after: '67', hasBefore: true, hasAfter: true });
  assert.equal(row.fields[2].before, 'Not recorded');
});

test('unchanged numeric grades and reordered nested objects produce no false changes', () => {
  assert.equal(grading([{ gradeId: 5, initial: '71.00', final: '75.00' }], [{ gradeId: 5, quarterly_grade: 75, initial_grade: 71 }]).groups.length, 0);
  assert.equal(getAuditChangeGroups({ beforeData: { settings: { enabled: false, count: 0 } }, afterData: { settings: { count: 0, enabled: false } } }).groups.length, 0);
});

test('after-only history shows recorded values without inventing previous values', () => {
  const result = getAuditChangeGroups({ afterData: { first_name: 'Fixture', account_status: 'active' } });
  assert.equal(result.heading, 'Recorded details');
  assert.equal(result.hasBefore, false);
  assert.equal(result.groups[0].fields[0].hasBefore, false);
  assert.equal(result.groups[0].fields[0].after, 'Fixture');
  assert.equal(getAuditChangeGroups({ beforeData: null, afterData: null }).groups.length, 0);
});

test('created events with empty prior collections show recorded details', () => {
  const created = getAuditChangeGroups({ eventType: 'GRADE_ACTIVITY_CREATED', beforeData: { activities: [] }, afterData: { activities: [{ activity_id: 3, activity_name: 'Quiz 1' }] } });
  assert.equal(created.heading, 'Recorded details');
  assert.equal(created.hasBefore, false);
  assert(created.groups.some(group => group.fields.some(field => field.after === 'Quiz 1')));
  const withPriorValues = getAuditChangeGroups({ eventType: 'GRADE_ACTIVITY_CREATED', beforeData: { count: 1 }, afterData: { count: 2 } });
  assert.equal(withPriorValues.heading, 'Changes');
});

test('deleted events with empty remaining collections show deleted details', () => {
  const deleted = getAuditChangeGroups({ eventType: 'GRADE_ACTIVITY_DELETED', beforeData: { activities: [{ activity_id: 3, activity_name: 'Quiz 1' }], scores: [{ score: 10 }] }, afterData: { activities: [], scores: [] } });
  assert.equal(deleted.heading, 'Deleted details');
  assert.equal(deleted.hasAfter, false);
  assert(deleted.groups.some(group => group.fields.some(field => field.before === 'Quiz 1')));
  assert(deleted.groups.some(group => group.fields.some(field => field.before === '10')));
  const withRemainingValues = getAuditChangeGroups({ eventType: 'GRADE_ACTIVITY_DELETED', beforeData: { count: 2 }, afterData: { count: 1 } });
  assert.equal(withRemainingValues.heading, 'Changes');
});

test('nested attendance, student lists, weights and ranges are readable without JSON', () => {
  const fixtures = [
    { afterData: { statuses: { P: 3, A: 0 }, students: [101, 102], enabled: false } },
    { beforeData: { ranges: [{ min: 0, max: 59, grade: 60 }] }, afterData: { ranges: [{ min: 0, max: 59, grade: 61 }] } },
    { beforeData: { weights: [{ subject_id: 4, component_type_id: 1, percentage: 30 }, { subject_id: 4, component_type_id: 2, percentage: 50 }] },
      afterData: { weights: [{ subject_id: 4, component_type_id: 2, percentage: 45 }, { subject_id: 4, component_type_id: 1, percentage: 35 }] } },
  ];
  for (const fixture of fixtures) {
    const result = getAuditChangeGroups(fixture);
    assert(result.groups.length > 0);
    for (const group of result.groups) for (const field of group.fields) {
      assert(!/[{}]/.test(field.before + field.after));
      assert(!field.after.includes('[object Object]'));
    }
  }
});

test('JSON-encoded historical snapshots are decoded and malformed payloads remain readable', () => {
  const result = getAuditChangeGroups({ beforeData: '{"last_name":"Old"}', afterData: '{"last_name":"New"}' });
  assert.equal(result.groups[0].fields[0].label, 'Last name');
  assert.equal(result.groups[0].fields[0].before, 'Old');
  const invalid = getAuditChangeGroups({ afterData: '{broken' });
  assert.equal(invalid.groups[0].fields[0].after, 'Unreadable saved value');
});

test('duplicate identifiers are not silently merged and new or missing fields stay explicit', () => {
  const result = grading([{ gradeId: 7, final: 70 }, { gradeId: 7, final: 71 }], [{ gradeId: 7, final: 72 }, { gradeId: 7, final: 73 }]);
  assert.equal(result.groups.length, 2);
  const removed = getAuditChangeGroups({ beforeData: { first_name: 'Previous' }, afterData: {} });
  assert.equal(removed.heading, 'Previous details');
});

test('zero, false, null and missing are distinct; dates use Manila and secrets never appear', () => {
  assert.equal(formatAuditValue(0), '0');
  assert.equal(formatAuditValue(false), 'No');
  assert.equal(formatAuditValue(null), 'Not set');
  assert.equal(formatAuditValue(undefined), 'Not recorded');
  assert.match(formatAuditValue('2026-11-11T16:30:00.000Z', 'submitted_at'), /Nov 12, 2026/);
  assert.match(formatAuditValue('2026-11-11', 'attendance_date'), /Nov 11, 2026/);
  const result = getAuditChangeGroups({ afterData: { password_hash: 'hidden-one', profile: { reset_token: 'hidden-two', first_name: 'Visible' } } });
  assert(!JSON.stringify(result).includes('hidden-'));
  assert(JSON.stringify(result).includes('Visible'));
});
