const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// No real database or cloud connection is constructed by this suite.
const database = { execute: async () => { throw Error('Unexpected database read'); }, query: async () => [[{ Field: 'credentials' }]], cloudPool: null };
const originalLoad = Module._load;
Module._load = function (request, parent, main) {
  if (request === '../config/db') return database;
  return originalLoad.call(this, request, parent, main);
};
const Details = require('../services/AuditDetailsService');
const AuditEvent = require('../models/AuditEvent');
const Weights = require('../models/SubjectComponentWeight');
const Config = require('../models/GradeTransmutationConfig');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Periods = require('../services/GradingPeriodService');
const express = require('express');
const examples = [];
test.after(() => {
  Module._load = originalLoad;
  const output = process.env.AUDIT_PREVIEW_EVENTS || path.join(os.tmpdir(), 'auralis-audit-details-examples.json');
  fs.writeFileSync(output, JSON.stringify(examples, null, 2));
  console.log(`Audit preview events: ${output}`);
});

function fixture() {
  const state = { events: [], weights: [
    { subject_id: 1, component_type_id: 1, subj_comp_weight_id: 1, subject_name: 'English', component_name: 'Written Work', percentage: '30.00' },
    { subject_id: 1, component_type_id: 2, subj_comp_weight_id: 2, subject_name: 'English', component_name: 'Performance Tasks', percentage: '50.00' },
    { subject_id: 1, component_type_id: 3, subj_comp_weight_id: 3, subject_name: 'English', component_name: 'Examinations', percentage: '20.00' }],
    config: { config_id: 1, is_custom_enabled: 1, ranges_json: JSON.stringify(Config.OFFICIAL_TABLE) },
    learner: { student_section_id: 101, learner_name: 'Alex Santos', status: 'A', remarks: null },
    profile: { role: 'subject_teacher', first_name: 'Alex', middle_name: null, last_name: 'Teacher', extension_name: null,
      credentials: null, email: 'alex@example.test', account_status: 'active', department: 'English' },
    failAudit: false, calls: [], commits: 0, rollbacks: 0 };
  let saved;
  const connection = {
    beginTransaction: async () => { saved = structuredClone({ weights: state.weights, config: state.config, learner: state.learner, profile: state.profile, events: state.events }); },
    commit: async () => { state.commits++; },
    rollback: async () => { state.rollbacks++; if (saved) Object.assign(state, structuredClone(saved)); },
    release() {},
    execute: async (sql, params = []) => {
      state.calls.push({ sql, params });
      if (sql.includes('CREATE TABLE IF NOT EXISTS GRADE_TRANSMUTATION_CONFIG')) return [{ affectedRows: 0 }];
      if (/INSERT INTO AUDIT_EVENT/.test(sql)) {
        if (state.failAudit) throw Error('Audit unavailable');
        const period = sql.includes("'GRADING_PERIOD'");
        const p = [...params]; if (period) p.splice(3, 0, 'GRADING_PERIOD');
        state.events.push({ audit_event_id: state.events.length + 1, user_id: p[0], actor_context: p[1], event_type: p[2],
          module_name: p[3], entity_type: p[4], entity_id: p[5], before_data: p[6], after_data: p[7], metadata: p[8], occurred_at: '2026-11-12T06:00:00Z' });
        return [{ insertId: state.events.length }];
      }
      if (sql.includes('SELECT first_name, last_name, role FROM USER')) return [[params[0] === 8
        ? { first_name: 'Morgan', last_name: 'Admin', role: 'system_admin' }
        : { first_name: 'Jamie', last_name: 'Teacher', role: 'subject_teacher' }]];
      if (sql.includes('FROM AUDIT_EVENT a')) return [state.events];
      if (sql.includes('FROM SCHOOL_YEAR')) return [[{ school_year_id: 1, starts_on: 2026, ends_on: 2027, status: 'ongoing' }]];
      if (sql.includes('CROSS JOIN COMPONENT_TYPE')) return [structuredClone(state.weights)];
      if (sql.includes('SELECT subj_comp_weight_id')) return [[{ subj_comp_weight_id: params[1] }]];
      if (sql.includes('UPDATE SUBJECT_COMPONENT_WEIGHT')) { state.weights.find(row => row.subj_comp_weight_id === params[1]).percentage = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.includes('SELECT config_id FROM GRADE_TRANSMUTATION_CONFIG')) return [[{ config_id: 1 }]];
      if (sql.includes('SELECT gtc.*')) return [[structuredClone(state.config)]];
      if (sql.includes('INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id,')) {
        state.config.is_custom_enabled = params[0]; state.config.ranges_json = params[1]; return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT a.student_section_id')) return [[structuredClone(state.learner)]];
      if (sql.includes('FROM ATTENDANCE_SHEET ash') && sql.includes('AS subject')) return [[{ attendance_scope: 'SUBJECT', attendance_date: '2026-11-12', subject: 'English', section_id: 1, section: 'Demo Section', starts_on: 2026, ends_on: 2027 }]];
      if (sql.includes('SELECT student_section_id FROM STUDENT_SECTION')) return [[{ student_section_id: 101 }]];
      if (sql.includes('INSERT INTO ATTENDANCE (')) { state.learner.status = params[2]; state.learner.remarks = params[3]; return [{ insertId: 11 }]; }
      if (sql.includes('AS adviser_section_id')) return [[{ attendance_sheet_id: 11, attendance_scope: 'SUBJECT', attendance_date: '2026-11-12', teacher_section_id: 1, teacher_year_id: 1 }]];
      if (sql.includes('SELECT section_id FROM SECTION')) return [[{ section_id: 1 }]];
      if (sql.includes('ORDER BY ash.attendance_sheet_id FOR UPDATE')) return [[{ attendance_sheet_id: 11, no_class_reason: null }]];
      if (sql.includes('FROM USER u LEFT JOIN DEPARTMENT')) return [[structuredClone(state.profile)]];
      if (sql.includes('SELECT user_id FROM USER')) return [[{ user_id: 7 }]];
      if (sql.includes('UPDATE USER SET first_name')) { [state.profile.first_name, state.profile.middle_name, state.profile.last_name, state.profile.extension_name, state.profile.credentials, state.profile.email] = params; return [{ affectedRows: 1 }]; }
      if (sql.includes('UPDATE USER SET password')) return [{ affectedRows: 1 }];
      throw Error('Unexpected fixture query: ' + sql);
    },
  };
  database.getConnection = async () => connection;
  database.execute = connection.execute;
  return { state, connection };
}
async function retainPreview() {
  const rows = await AuditEvent.findAll();
  examples.push(...rows.map((row, i) => ({ ...row, id: String(examples.length + i + 1) })));
}

test('attendance saves changed marks once, attributes subject-teacher context and rolls back when auditing fails', async () => {
  const { state } = fixture();
  const records = [{ attendance_sheet_id: 11, student_section_id: 101, status: 'P', remarks: 'Arrived before first period' }];
  await Attendance.bulkUpsert(records, 7);
  assert.equal(state.events.length, 1);
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.actorRole, 'Subject Teacher');
  assert.equal(event.beforeData.learners[0].status, 'A');
  assert.equal(event.afterData.learners[0].status, 'P');
  assert.equal(event.metadata.attendance_date, '2026-11-12');
  assert.equal(event.metadata.attendance_scope, 'SUBJECT');
  assert.equal(event.metadata.section_id, 1);
  await retainPreview();
  await Attendance.bulkUpsert(records, 7); assert.equal(state.events.length, 1);
  state.failAudit = true;
  await assert.rejects(Attendance.bulkUpsert([{ ...records[0], status: 'L' }], 7), /Audit unavailable/);
  assert.equal(state.learner.status, 'P'); assert.equal(state.rollbacks, 1);
});

test('subject weights retain changed percentages with subject/component names; unchanged and failed saves leave no false history', async () => {
  const { state } = fixture();
  const weights = state.weights.map(row => ({ ...row, percentage: row.component_type_id === 1 ? 40 : row.component_type_id === 2 ? 40 : 20 }));
  await Weights.saveConfiguration(1, weights, 8);
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.beforeData.weights.length, 2);
  assert.equal(event.afterData.weights[0].percentage, 40);
  assert.equal(event.afterData.weights[0].subject, 'English');
  assert.equal(event.schoolYear, '2026–2027');
  await retainPreview();
  await Weights.saveConfiguration(1, weights, 7); assert.equal(state.events.length, 1);
  state.failAudit = true;
  await assert.rejects(Weights.saveConfiguration(1, weights.map(row => ({ ...row, percentage: 30 })), 7), /Audit unavailable/);
  assert.equal(state.weights[0].percentage, 40);
});

test('transmutation records actual old/new range boundaries and reset; invalid and failed writes preserve configuration', async () => {
  const { state } = fixture();
  const ranges = Config.OFFICIAL_TABLE.map(row => Number(row.min) === 70 ? { ...row, transmuted: 76 } : row);
  await Config.saveConfig({ is_custom_enabled: true, ranges, updated_by: 8 });
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.beforeData.ranges[0].transmuted, 75);
  assert.equal(event.afterData.ranges[0].transmuted, 76);
  await retainPreview();
  const count = state.events.length;
  await Config.saveConfig({ is_custom_enabled: true, ranges, updated_by: 7 });
  assert.equal(state.events.length, count);
  await assert.rejects(Config.saveConfig({ is_custom_enabled: true, ranges: [{ min: 90, max: 20, transmuted: 80 }] }));
  state.failAudit = true;
  await assert.rejects(Config.resetToDefault({ updated_by: 7 }), /Audit unavailable/);
  assert.equal(state.config.is_custom_enabled, 1);
  state.failAudit = false; await Config.resetToDefault({ updated_by: 7 });
  assert.equal(state.config.is_custom_enabled, 0);
  assert.equal(state.events.at(-1).event_type, 'GRADE_TRANSMUTATION_RESET');
});

test('profile HTTP route captures middle name and credentials, distinguishes actor from target, suppresses unchanged save and rolls back failures', async t => {
  const { state } = fixture();
  t.mock.method(User, 'findById', async () => ({ user_id: 7, ...state.profile }));
  const app = express(); app.use(express.json()); app.use('/users', require('../routes/userRoutes'));
  const server = app.listen(0, '127.0.0.1'); t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/users/7/profile`;
  const request = body => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auralis-user-id': '8' }, body: JSON.stringify(body) });
  const body = { first_name: 'Alex', last_name: 'Teacher', email: 'alex@example.test', middle_name: 'Mendoza', credentials: 'LPT' };
  assert.equal((await request(body)).status, 200);
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.actorId, '8'); assert.equal(event.entityId, '7');
  assert.equal(event.beforeData.middle_name, null); assert.equal(event.afterData.middle_name, 'Mendoza');
  assert(!/password|hash|token/i.test(JSON.stringify(event.beforeData)));
  await retainPreview();
  assert.equal((await request(body)).status, 200); assert.equal(state.events.length, 1);
  state.failAudit = true;
  assert.equal((await request({ ...body, last_name: 'Changed' })).status, 500);
  assert.equal(state.profile.last_name, 'Teacher');
});

test('class-record snapshots expose changed learner scores and activity HPS, preserve zero and ignore reordered unchanged saves', async () => {
  const { state, connection } = fixture();
  const before = { scores: [{ score_key: '3:101', activity_id: 3, activity_name: 'Written Work 1', learner_name: 'Alex Santos', raw_score: 8, score_status: 'ENCODED' }],
    activities: [{ activity_id: 3, activity_name: 'Written Work 1', highest_possible_score: 20 }] };
  const after = structuredClone(before); after.scores[0].raw_score = 0;
  const original = connection.execute;
  connection.execute = async (sql, params) => sql.includes('SELECT gs.grade_sheet_id') ? [[{ subject: 'English', section: 'Demo Section', term: '2nd', starts_on: 2026, ends_on: 2027 }]] : original(sql, params);
  await Details.recordClass(connection, { sheetId: 1, actor: 7, before, after, eventType: 'GRADE_SCORES_UPDATED', summary: 'Saved class-record scores.' });
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.beforeData.scores[0].raw_score, 8); assert.equal(event.afterData.scores[0].raw_score, 0);
  assert.equal(event.afterData.activities, undefined); assert.equal(event.module, 'Grading');
  await retainPreview();
  await Details.record(connection, { actor: 7, before: after, after: structuredClone(after) }); assert.equal(state.events.length, 1);
});

test('assessment deletion audit records assessment details without learner scores', async () => {
  const { connection } = fixture();
  const original = connection.execute;
  connection.execute = async (sql, params) => sql.includes('SELECT gs.grade_sheet_id') ? [[{ subject: 'English', section: 'Demo Section', term: '2nd', starts_on: 2026, ends_on: 2027 }]] : original(sql, params);
  await Details.recordClass(connection, { sheetId: 1, actor: 7, eventType: 'GRADE_ACTIVITY_DELETED', summary: 'Deleted an assessment.',
    before: { activities: [{ activity_id: 3, activity_name: 'Quiz' }], scores: [{ score_key: '3:101', raw_score: 8 }] },
    after: { activities: [], scores: [] } });
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.beforeData.activities[0].activity_name, 'Quiz');
  assert.equal(event.beforeData.scores, undefined);
  assert.equal(event.afterData.scores, undefined);
});

test('credential audit records action and target while excluding password/hash values', async () => {
  const { state } = fixture();
  await Details.saveCredential(database, { actor: 8, userId: 7, hash: 'secret-hash-never-in-audit', eventType: 'USER_PASSWORD_RESET', target: 'Alex Teacher' });
  assert(!JSON.stringify(state.events).includes('secret-hash-never-in-audit'));
  assert.equal(state.events[0].user_id, 8);
  assert.equal(state.events[0].entity_id, 7);
});

test('reopening decisions retain requester, actual reason, linked class and editing expiry in the existing module', async t => {
  const { connection } = fixture();
  const execute = connection.execute;
  const now = Date.now();
  connection.execute = async (sql, params) => {
    if (sql.includes('SELECT grr.*')) return [[{ request_id: 1, grade_sheet_id: 1, teacher_assignment_id: 1, subject_offering_id: 1,
      assignment_offering_id: 1, status: 'PENDING', workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED',
      ends_at: new Date(now - 3 * 86400000), requested_at: new Date(now - 2 * 86400000), has_active: 0 }]];
    if (sql.includes('SELECT grr.grade_sheet_id')) return [[{ grade_sheet_id: 1, requester: 'Jamie Teacher', reason: 'Correct the recorded quiz score.' }]];
    if (sql.includes('SELECT gs.grade_sheet_id')) return [[{ subject: 'English', section: 'Demo Section', term: '1st', starts_on: 2026, ends_on: 2027 }]];
    if (sql.includes('INSERT INTO TEMPORARY_REOPENING')) return [{ insertId: 55 }];
    if (sql.includes('UPDATE GRADE_REOPEN_REQUEST') || sql.includes('UPDATE GRADE_SHEET')) return [{ affectedRows: 1 }];
    if (sql.includes('SELECT * FROM TEMPORARY_REOPENING')) return [[{ temporary_reopening_id: 55 }]];
    return execute(sql, params);
  };
  t.mock.method(require('../models/GradeSheet'), 'openTemporaryAccess', async () => {});
  t.mock.method(require('../models/GradeReopenRequest'), 'update', async () => {});
  t.mock.method(require('../models/TemporaryReopening'), 'findById', async () => ({ temporary_reopening_id: 55 }));
  await Periods.approveRequest(1, { duration_minutes: 60, admin_note: 'Verified against the learner’s answer sheet.' }, { user_id: 8, normalized_role: 'system_admin' });
  const event = (await AuditEvent.findAll())[0];
  assert.equal(event.module, 'Grading Period'); assert.equal(event.metadata.requester, 'Jamie Teacher');
  assert.equal(event.metadata.reason, 'Correct the recorded quiz score.'); assert(event.afterData.expires_at);
  assert.equal(event.subject, 'English'); await retainPreview();
});
