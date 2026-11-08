// Reconcile only the selected school year. Retained assignments keep their IDs,
// attendance links, raw-score links, and archive flags.
const error = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const id = (value, label) => {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw error(400, `Choose a valid ${label}.`);
  return Number(value);
};

async function validate(connection, userId, body, schoolYearId) {
  const year = id(schoolYearId, 'school year');
  if (body.adviser_section_id) {
    const section = id(body.adviser_section_id, 'advisory section');
    const [sections] = await connection.execute('SELECT section_id FROM SECTION WHERE section_id = ? FOR UPDATE', [section]);
    if (sections.length !== 1) throw error(400, 'The selected advisory section does not exist.');
    const [owners] = await connection.execute(`SELECT saa.user_id FROM SECTION_ADVISER_ASSIGNMENT saa
      WHERE saa.section_id = ? AND saa.school_year_id = ? AND saa.user_id <> ? FOR UPDATE`, [section, year, userId]);
    if (owners.length) throw error(409, 'This section already has an adviser for the selected school year.');
  }
  const seen = new Set();
  if (body.teaching_assignments != null && !Array.isArray(body.teaching_assignments)) throw error(400, 'Teaching assignments must be a list.');
  for (const assignment of body.teaching_assignments || []) {
    const offering = id(assignment.subject_offering_id, 'subject class');
    if (seen.has(offering)) throw error(400, 'Duplicate subject assignments detected. Please select distinct subjects.');
    seen.add(offering);
    const [rows] = await connection.execute('SELECT subject_offering_id,section_id,school_year_id FROM SUBJECT_OFFERING WHERE subject_offering_id = ? FOR UPDATE', [offering]);
    if (rows.length !== 1 || Number(rows[0].school_year_id) !== year) throw error(400, 'Each subject class must belong to the selected school year.');
    if (assignment.section_id != null && Number(assignment.section_id) !== Number(rows[0].section_id)) throw error(400, 'The selected subject does not belong to this section.');
    const [owners] = await connection.execute(`SELECT ta.user_id FROM TEACHER_ASSIGNMENT ta JOIN USER u ON u.user_id=ta.user_id
      WHERE ta.subject_offering_id = ? AND ta.user_id <> ? AND LOWER(COALESCE(u.account_status,'active'))='active' FOR UPDATE`, [offering, userId]);
    if (owners.length) throw error(409, 'A selected subject class already has a teacher for this school year.');
  }
}

async function synchronize(connection, userId, body, schoolYear, role, dates) {
  const year = id(schoolYear.school_year_id, 'school year');
  const teachingRole = role === 'subject teacher';
  const wantedAdvisory = teachingRole && body.adviser_section_id ? id(body.adviser_section_id, 'advisory section') : null;
  const wantedOfferings = new Set(teachingRole ? (body.teaching_assignments || []).map(a => id(a.subject_offering_id, 'subject class')) : []);
  const [advisers] = await connection.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE user_id = ? AND school_year_id = ? ORDER BY adviser_assignment_id FOR UPDATE', [userId, year]);
  const [teachers] = await connection.execute(`SELECT ta.* FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id=ta.subject_offering_id
    WHERE ta.user_id = ? AND so.school_year_id = ? ORDER BY ta.teacher_assignment_id FOR UPDATE`, [userId, year]);
  for (const assignment of advisers.filter(a => Number(a.section_id) !== wantedAdvisory)) {
    await connection.execute('UPDATE ATTENDANCE_SHEET SET adviser_assignment_id = NULL WHERE adviser_assignment_id = ?', [assignment.adviser_assignment_id]);
    await connection.execute('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id = ? AND user_id = ? AND school_year_id = ?', [assignment.adviser_assignment_id, userId, year]);
  }
  if (wantedAdvisory && !advisers.some(a => Number(a.section_id) === wantedAdvisory)) {
    await connection.execute('INSERT INTO SECTION_ADVISER_ASSIGNMENT (section_id,school_year_id,user_id,assigned_from,assigned_until) VALUES (?,?,?,?,?)',
      [wantedAdvisory, year, userId, dates.assignedFrom, dates.assignedUntil]);
  }
  for (const assignment of teachers.filter(a => !wantedOfferings.has(Number(a.subject_offering_id)))) {
    await connection.execute('UPDATE ATTENDANCE_SHEET SET teacher_assignment_id = NULL WHERE teacher_assignment_id = ?', [assignment.teacher_assignment_id]);
    await connection.execute('UPDATE SCORE SET teacher_assignment_id = NULL WHERE teacher_assignment_id = ?', [assignment.teacher_assignment_id]);
    await connection.execute('DELETE FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ? AND user_id = ?', [assignment.teacher_assignment_id, userId]);
  }
  for (const offering of wantedOfferings) if (!teachers.some(a => Number(a.subject_offering_id) === offering)) {
    await connection.execute('INSERT INTO TEACHER_ASSIGNMENT (user_id,subject_offering_id,assigned_from,assigned_until) VALUES (?,?,?,?)', [userId, offering, dates.assignedFrom, dates.assignedUntil]);
  }
  const [heads] = await connection.execute('SELECT * FROM DEPARTMENT_HEAD WHERE user_id = ? AND school_year_id = ? FOR UPDATE', [userId, year]);
  const wantedDepartment = role === 'department head' && body.department_id ? id(body.department_id, 'department') : null;
  for (const assignment of heads.filter(a => Number(a.department_id) !== wantedDepartment)) {
    await connection.execute('DELETE FROM DEPARTMENT_HEAD WHERE department_head_id = ? AND user_id = ? AND school_year_id = ?', [assignment.department_head_id, userId, year]);
  }
  if (wantedDepartment && !heads.some(a => Number(a.department_id) === wantedDepartment)) {
    await connection.execute('INSERT INTO DEPARTMENT_HEAD (department_id,user_id,school_year_id,appointed_from,appointed_until) VALUES (?,?,?,?,?)',
      [wantedDepartment, userId, year, dates.assignedFrom, dates.assignedUntil]);
  }
}

module.exports = { validate, synchronize };
