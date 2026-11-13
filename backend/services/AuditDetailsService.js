const AuditEvent = require('../models/AuditEvent');

// Select explicit fields for evidence. Authentication secrets and transient timestamps
// never enter these snapshots; unchanged autosaves do not create audit entries.
const actorId = (req, fallback = null) => {
  const value = req.currentUser?.user_id || req.headers?.['x-auralis-user-id'] || fallback;
  return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
};
const yearLabel = row => row?.starts_on && row?.ends_on ? `${row.starts_on}–${row.ends_on}` : null;
const identity = row => row?.score_key ?? row?.weight_key ?? row?.assignment_key ?? row?.grade_id ?? row?.activity_id ?? row?.student_section_id ?? row?.id;
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => String(identity(a) ?? JSON.stringify(a)).localeCompare(String(identity(b) ?? JSON.stringify(b))));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function changedSnapshots(before, after) {
  if (same(before, after)) return null;
  if (!before || !after) return { before_data: before, after_data: after };
  const pair = { before_data: {}, after_data: {} };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    if (Array.isArray(before[key]) && Array.isArray(after[key])) {
      const left = new Map(before[key].map(row => [identity(row), row]));
      const right = new Map(after[key].map(row => [identity(row), row]));
      if (left.size !== before[key].length || right.size !== after[key].length || left.has(undefined) || right.has(undefined)) {
        pair.before_data[key] = before[key];
        pair.after_data[key] = after[key];
        continue;
      }
      const ids = [...new Set([...left.keys(), ...right.keys()])].filter(id => !same(left.get(id), right.get(id)));
      pair.before_data[key] = ids.filter(id => left.has(id)).map(id => left.get(id));
      pair.after_data[key] = ids.filter(id => right.has(id)).map(id => right.get(id));
    } else {
      if (Object.hasOwn(before, key)) pair.before_data[key] = before[key];
      if (Object.hasOwn(after, key)) pair.after_data[key] = after[key];
    }
  }
  return pair;
}
async function actorContext(connection, userId, context = {}) {
  const [rows] = userId ? await connection.execute('SELECT first_name, last_name, role FROM USER WHERE user_id = ?', [userId]) : [[]];
  const actor = rows[0];
  return { source: userId ? 'user' : 'system', ...context,
    actor_name: actor ? [actor.first_name, actor.last_name].filter(Boolean).join(' ') : context.actor_name,
    role: context.role || actor?.role || 'system' };
}
async function record(connection, { before, after, actor = null, actor_context = {}, ...event }) {
  const changes = changedSnapshots(before, after);
  if (!changes) return null;
  return AuditEvent.create({ ...event, ...changes, user_id: actor,
    actor_context: await actorContext(connection, actor, actor_context),
    metadata: { ...event.metadata, details_version: 1 } }, connection);
}
async function sheetContext(connection, sheetId) {
  const [rows] = await connection.execute(`SELECT gs.grade_sheet_id, sub.subject_name AS subject,
    sec.section_name AS section, at.term_name AS term, sy.starts_on, sy.ends_on
    FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
    JOIN SUBJECT sub ON sub.subject_id = so.subject_id JOIN SECTION sec ON sec.section_id = so.section_id
    JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
    WHERE gs.grade_sheet_id = ?`, [sheetId]);
  const row = rows[0] || {};
  return { subject: row.subject, section: row.section, term: row.term, school_year: yearLabel(row),
    target: [row.section, row.subject, row.term].filter(Boolean).join(' · ') || `Grade sheet #${sheetId}` };
}
async function classSnapshot(connection, sheetId) {
  const [activities] = await connection.execute(`SELECT ga.activity_id, ga.activity_name, ct.component_name AS component,
    ga.mapeh_component, ga.highest_possible_score, DATE_FORMAT(ga.activity_date, '%Y-%m-%d') AS activity_date, ga.status
    FROM GRADE_ACTIVITY ga LEFT JOIN SUBJECT_COMPONENT_WEIGHT w ON w.subj_comp_weight_id = ga.subj_comp_weight_id
    LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = w.component_type_id
    WHERE ga.grade_sheet_id = ? ORDER BY ga.activity_id`, [sheetId]);
  const [scores] = await connection.execute(`SELECT CONCAT(sc.activity_id, ':', sc.student_section_id) AS score_key,
    sc.activity_id, ga.activity_name, sc.student_section_id,
    CONCAT_WS(' ', st.first_name, st.middle_name, st.last_name, st.extension_name) AS learner_name,
    sc.raw_score, sc.score_status
    FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
    JOIN STUDENT_SECTION ss ON ss.student_section_id = sc.student_section_id JOIN STUDENT st ON st.student_id = ss.student_id
    WHERE ga.grade_sheet_id = ? ORDER BY sc.activity_id, sc.student_section_id`, [sheetId]);
  return { activities, scores };
}
async function gradeSnapshot(connection, sheetId) {
  const [grades] = await connection.execute(`SELECT sg.student_grade_id AS grade_id, sg.student_id,
    CONCAT_WS(' ', st.first_name, st.middle_name, st.last_name, st.extension_name) AS learner_name,
    sg.mapeh_component, sg.initial_grade, sg.quarterly_grade AS term_grade, sg.remarks
    FROM STUDENT_GRADE sg JOIN STUDENT st ON st.student_id = sg.student_id
    JOIN GRADE_SHEET gs ON gs.subject_offering_id = sg.subject_offering_id
    JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
    WHERE gs.grade_sheet_id = ? AND CAST(sg.term AS BINARY) = CAST(CASE at.term_name WHEN '1st' THEN 'T1' WHEN '2nd' THEN 'T2' WHEN '3rd' THEN 'T3' ELSE at.term_name END AS BINARY)
    ORDER BY sg.student_grade_id`, [sheetId]);
  return grades;
}
async function recordClass(connection, { sheetId, actor, before, eventType, summary, after }) {
  const current = after || await classSnapshot(connection, sheetId);
  // Assessment deletion records the assessment itself, not individual learner scores.
  const priorDetails = eventType === 'GRADE_ACTIVITY_DELETED' && before ? { activities: before.activities } : before;
  const currentDetails = eventType === 'GRADE_ACTIVITY_DELETED' ? { activities: current.activities } : current;
  return record(connection, { actor, before: priorDetails, after: currentDetails,
    event_type: eventType, module_name: 'GRADING', entity_type: 'GRADE_SHEET', entity_id: sheetId,
    metadata: { ...await sheetContext(connection, sheetId), summary } });
}
async function attendanceSnapshot(connection, sheetId) {
  const [learners] = await connection.execute(`SELECT a.student_section_id,
    CONCAT_WS(' ', st.first_name, st.middle_name, st.last_name, st.extension_name) AS learner_name, a.status, a.remarks
    FROM ATTENDANCE a JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
    JOIN STUDENT st ON st.student_id = ss.student_id WHERE a.attendance_sheet_id = ? ORDER BY a.student_section_id`, [sheetId]);
  return { learners };
}
async function recordAttendance(connection, sheetId, before, after, actor, extra = {}) {
  if (same(before, after)) return null;
  const [rows] = await connection.execute(`SELECT ash.attendance_scope,
    DATE_FORMAT(ash.attendance_date, '%Y-%m-%d') AS attendance_date, sub.subject_name AS subject,
    sec.section_id, sec.section_name AS section, sy.starts_on, sy.ends_on
    FROM ATTENDANCE_SHEET ash LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
    LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
    LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
    LEFT JOIN SUBJECT sub ON sub.subject_id = so.subject_id
    LEFT JOIN SECTION sec ON sec.section_id = COALESCE(saa.section_id, so.section_id)
    LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = COALESCE(saa.school_year_id, so.school_year_id)
    WHERE ash.attendance_sheet_id = ?`, [sheetId]);
  const row = rows[0] || {};
  const subject = row.attendance_scope === 'SUBJECT';
  return record(connection, { actor, before, after, event_type: 'ATTENDANCE_RECORDED', module_name: 'ATTENDANCE',
    entity_type: 'ATTENDANCE_SHEET', entity_id: sheetId,
    actor_context: actor ? { acting_as: `${subject ? 'Teacher' : 'Adviser'} — ${row.section}${subject ? ` (${row.subject})` : ''}`, role: subject ? 'subject_teacher' : 'adviser' } : {},
    metadata: { target: row.section, section: row.section, section_id: row.section_id,
      subject: subject ? row.subject : null,
      school_year: yearLabel(row), attendance_date: row.attendance_date, attendance_scope: row.attendance_scope,
      summary: `Updated ${subject ? `${row.subject} attendance` : 'section attendance'} for ${row.section} on ${row.attendance_date}.`, ...extra } });
}
async function accountSnapshot(connection, userId, schoolYearId = null) {
  const [users] = await connection.execute(`SELECT u.role, u.first_name, u.middle_name, u.last_name, u.extension_name,
    u.credentials, u.email, u.account_status, d.department_name AS department
    FROM USER u LEFT JOIN DEPARTMENT d ON d.department_id = u.department_id WHERE u.user_id = ?`, [userId]);
  if (!users[0]) return null;
  if (!schoolYearId) return users[0];
  const [teaching] = await connection.execute(`SELECT CONCAT('teaching:', so.subject_offering_id) AS assignment_key,
    s.subject_name AS subject, sec.section_name AS section, ta.assigned_from, ta.assigned_until
    FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
    JOIN SUBJECT s ON s.subject_id = so.subject_id JOIN SECTION sec ON sec.section_id = so.section_id
    WHERE ta.user_id = ? AND so.school_year_id = ? ORDER BY so.subject_offering_id`, [userId, schoolYearId]);
  const [advisory] = await connection.execute(`SELECT CONCAT('advisory:', saa.section_id) AS assignment_key,
    s.section_name AS section, saa.assigned_from, saa.assigned_until FROM SECTION_ADVISER_ASSIGNMENT saa
    JOIN SECTION s ON s.section_id = saa.section_id WHERE saa.user_id = ? AND saa.school_year_id = ? ORDER BY saa.section_id`, [userId, schoolYearId]);
  const [heads] = await connection.execute(`SELECT CONCAT('department:', dh.department_id) AS assignment_key,
    d.department_name AS department, dh.appointed_from, dh.appointed_until FROM DEPARTMENT_HEAD dh
    JOIN DEPARTMENT d ON d.department_id = dh.department_id WHERE dh.user_id = ? AND dh.school_year_id = ? ORDER BY dh.department_id`, [userId, schoolYearId]);
  return { ...users[0], teaching_assignments: teaching, advisory_assignments: advisory, department_appointments: heads };
}
async function saveCredential(database, { userId, hash, actor, eventType, target }) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT user_id FROM USER WHERE user_id = ? FOR UPDATE', [userId]);
    await connection.execute('UPDATE USER SET password = ? WHERE user_id = ?', [hash, userId]);
    await AuditEvent.create({ user_id: actor, actor_context: await actorContext(connection, actor),
      event_type: eventType, module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
      metadata: { target, summary: `${eventType === 'USER_PASSWORD_RESET' ? 'Reset' : 'Changed'} the account password. No password values are retained.`, details_version: 1 } }, connection);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
const weightSnapshot = rows => ({ weights: rows.filter(row => row.percentage != null).map(row => ({
  weight_key: `${row.subject_id}:${row.component_type_id}`, subject: row.subject_name, component: row.component_name,
  percentage: Number(row.percentage) })) });
const transmutationSnapshot = config => ({ is_custom_enabled: config.is_custom_enabled,
  ranges: config.ranges.map((row, i) => ({ id: `range-${i}`, min: Number(row.min), max: Number(row.max),
    transmuted: Number(row.transmuted), label: row.label || null })) });

module.exports = { actorId, actorContext, record, same, changedSnapshots, yearLabel, sheetContext, classSnapshot,
  gradeSnapshot, recordClass, saveCredential, attendanceSnapshot, recordAttendance, accountSnapshot, weightSnapshot, transmutationSnapshot };
