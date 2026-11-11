const { calculateGrades, isMapehSubject, termCode } = require('./GradeComputationService');

const key = (...parts) => parts.map(value => String(value ?? '')).join('|');
const component = value => !value || value === 'ALL' ? null : value;
const numeric = value => value === null || value === undefined || value === '' ? null : Number(value);
function index(rows, identity) {
  const result = new Map();
  for (const row of rows) {
    const id = identity(row);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return result;
}

// Uses only SELECT; callers choose a read-only preview or a locked repair transaction.
async function readSnapshot(connection, { lock = false } = {}) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const read = async sql => (await connection.execute(sql + suffix))[0];
  const offerings = await read(`SELECT so.*, sub.subject_code, sub.subject_name, sec.section_name,
    gl.grade_level_name FROM SUBJECT_OFFERING so JOIN SUBJECT sub ON sub.subject_id = so.subject_id
    JOIN SECTION sec ON sec.section_id = so.section_id JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id`);
  const periods = await read('SELECT * FROM ACADEMIC_TERM');
  const sheets = await read('SELECT * FROM GRADE_SHEET');
  const enrollments = await read('SELECT * FROM STUDENT_SECTION');
  const activities = await read(`SELECT ga.*, cw.subject_id AS weight_subject_id,
    cw.school_year_id AS weight_year_id, ct.component_code FROM GRADE_ACTIVITY ga
    LEFT JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id = ga.subj_comp_weight_id
    LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
    WHERE ga.status = 'ACTIVE' OR ga.status IS NULL`);
  const scores = await read(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
    WHERE ga.status = 'ACTIVE' OR ga.status IS NULL`);
  const weights = await read(`SELECT cw.*, ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw
    JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id`);
  const configs = await read('SELECT * FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1');
  const grades = await read('SELECT * FROM STUDENT_GRADE');
  return { offerings, periods, sheets, enrollments, activities, scores, weights, configs, grades };
}

function buildPlan(snapshot, { schoolYearId }) {
  if (!Number.isSafeInteger(schoolYearId) || schoolYearId <= 0) throw new Error('Choose one school year explicitly.');
  if (snapshot.configs.length !== 1) throw new Error('A unique transmutation configuration is required.');
  const configRow = snapshot.configs[0];
  const config = { is_custom_enabled: Boolean(Number(configRow.is_custom_enabled)),
    ranges: configRow.ranges_json ? JSON.parse(configRow.ranges_json) : [] };
  const offerings = new Map(snapshot.offerings.map(row => [Number(row.subject_offering_id), row]));
  const siblings = index(snapshot.offerings, row => key(row.section_id, row.school_year_id, row.subject_id));
  const periods = index(snapshot.periods, row => key(row.school_year_id, termCode(row.term_name)));
  const sheets = index(snapshot.sheets, row => key(row.subject_offering_id, row.term_id));
  const enrollmentById = new Map(snapshot.enrollments.map(row => [Number(row.student_section_id), row]));
  const enrollments = index(snapshot.enrollments, row => key(row.student_id, row.section_id, row.school_year_id));
  const activities = index(snapshot.activities, row => Number(row.grade_sheet_id));
  const scores = index(snapshot.scores, row => key(row.activity_id, row.student_section_id));
  const weights = index(snapshot.weights, row => key(row.subject_id, row.school_year_id));
  const saved = index(snapshot.grades, row => key(row.subject_offering_id, row.student_id, termCode(row.term), component(row.mapeh_component)));
  const updates = [], skipped = [];
  let matching = 0;
  for (const before of snapshot.grades) {
    const off = offerings.get(Number(before.subject_offering_id));
    if (!off || Number(off.school_year_id) !== schoolYearId) continue;
    const term = termCode(before.term), part = component(before.mapeh_component);
    const context = { gradeId: Number(before.student_grade_id), offeringId: Number(off.subject_offering_id),
      section: off.section_name, grade: off.grade_level_name, subject: off.subject_code, term, component: part };
    const skip = reason => skipped.push({ ...context, reason });
    if (!term) { skip('UNRECOGNIZED_TERM'); continue; }
    if (siblings.get(key(off.section_id, schoolYearId, off.subject_id)).length !== 1) { skip('DUPLICATE_OFFERINGS'); continue; }
    const termRows = periods.get(key(schoolYearId, term)) || [];
    if (termRows.length !== 1) { skip('MISSING_OR_DUPLICATE_TERM'); continue; }
    const sheetRows = sheets.get(key(off.subject_offering_id, termRows[0].term_id)) || [];
    if (sheetRows.length !== 1) { skip('MISSING_OR_DUPLICATE_GRADE_SHEET'); continue; }
    let enrollment = before.student_section_id ? enrollmentById.get(Number(before.student_section_id)) : null;
    if (before.student_section_id) {
      if (!enrollment || Number(enrollment.student_id) !== Number(before.student_id)
        || Number(enrollment.section_id) !== Number(off.section_id) || Number(enrollment.school_year_id) !== schoolYearId) {
        skip('INVALID_ENROLLMENT_REFERENCE'); continue;
      }
    } else {
      const matches = enrollments.get(key(before.student_id, off.section_id, schoolYearId)) || [];
      if (matches.length !== 1) { skip('MISSING_OR_DUPLICATE_ENROLLMENT'); continue; }
      enrollment = matches[0];
    }
    if (saved.get(key(off.subject_offering_id, before.student_id, term, part)).length !== 1) { skip('DUPLICATE_SAVED_GRADES'); continue; }
    const active = activities.get(Number(sheetRows[0].grade_sheet_id)) || [];
    if (!active.length) { skip('NO_ACTIVITY_RECORDS'); continue; }
    if (active.some(row => Number(row.weight_subject_id) !== Number(off.subject_id) || Number(row.weight_year_id) !== schoolYearId)) {
      skip('INVALID_ACTIVITY_WEIGHT_REFERENCE'); continue;
    }
    const ownScores = active.flatMap(row => scores.get(key(row.activity_id, enrollment.student_section_id)) || []);
    let computed;
    try {
      const values = calculateGrades({ offering: off, students: [enrollment],
        weights: weights.get(key(off.subject_id, schoolYearId)) || [], activities: active,
        scores: ownScores, config, componentOnly: isMapehSubject(off) && part ? part : null });
      computed = values.find(row => component(row.mapehComponent) === part);
      if (!computed) throw new Error('UNEXPECTED_COMPONENT');
    } catch (error) { skip(error.code || error.message); continue; }
    const initial = numeric(before.initial_grade), final = numeric(before.quarterly_grade);
    if (initial !== null && final !== null && Math.abs(initial - computed.initialGrade) < 0.005 && final === computed.termGrade) {
      matching++; continue;
    }
    updates.push({ ...context, sheetId: Number(sheetRows[0].grade_sheet_id), before,
      after: { initial_grade: computed.initialGrade, quarterly_grade: computed.termGrade,
        remarks: computed.termGrade >= 75 ? 'Passed' : 'Failed' } });
  }
  return { schoolYearId, matching, updates, skipped };
}

async function applyPlan(connection, plan, { backupPath, source }) {
  // An explicit connection is required so callers control backup, locks and commit/rollback.
  if (!connection || !backupPath || !source) throw new Error('A transaction connection, backup and source are required.');
  for (const change of plan.updates) {
    const [result] = await connection.execute(`UPDATE STUDENT_GRADE SET initial_grade = ?, quarterly_grade = ?,
      remarks = ?, updated_at = UTC_TIMESTAMP(6) WHERE student_grade_id = ?`,
    [change.after.initial_grade, change.after.quarterly_grade, change.after.remarks, change.gradeId]);
    if (result.affectedRows !== 1) throw new Error(`Grade ${change.gradeId} was not updated uniquely.`);
  }
  const bySheet = index(plan.updates, row => row.sheetId);
  const auditIds = [];
  for (const [sheetId, changes] of bySheet) auditIds.push(await require('../models/AuditEvent').create({
    event_type: 'GRADE_SHEET_DATA_RECONCILED', module_name: 'GRADING', entity_type: 'GRADE_SHEET', entity_id: sheetId,
    actor_context: { role: 'system', source },
    before_data: changes.map(row => ({ gradeId: row.gradeId, initial: row.before.initial_grade, final: row.before.quarterly_grade })),
    after_data: changes.map(row => ({ gradeId: row.gradeId, ...row.after })),
    metadata: { school_year_id: plan.schoolYearId, backup_file: backupPath, changed_records: changes.length },
  }, connection));
  return auditIds;
}

module.exports = { readSnapshot, buildPlan, applyPlan };
