const db = require('../config/db');

class GradeSheet {
  static async editingWindow(sheet, user, connection = db, { lock = false } = {}) {
  const sheetId = sheet.gradeSheetId || sheet.grade_sheet_id;
  if (!sheetId || !user?.user_id) return { editable: false };
  const [rows] = await connection.execute(`SELECT gs.workflow_status, gs.lock_status, gs.grade_sheet_id,
      ta.teacher_assignment_id, at.grade_submission_deadline_at AS submission_deadline,
      (at.starts_at <= UTC_TIMESTAMP(6) AND at.grade_submission_deadline_at > UTC_TIMESTAMP(6)
        AND LOWER(at.status) IN ('open', 'ongoing')) AS within_submission_window
      FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
      JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id AND at.school_year_id = so.school_year_id
      JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id AND ta.user_id = ?
      WHERE gs.grade_sheet_id = ? AND (ta.assigned_from IS NULL OR ta.assigned_from <= UTC_DATE() OR ta.assigned_from < '1901-01-01')
        AND (ta.assigned_until IS NULL OR ta.assigned_until >= UTC_DATE() OR ta.assigned_until < '1901-01-01')${lock ? ' FOR UPDATE' : ''}`,
    [Number(user.user_id), sheetId]);
  if (rows.length !== 1) return { editable: false };
  const row = rows[0];
  if (row.workflow_status !== 'DRAFT') {
    return { editable: false, deadline: row.submission_deadline, correction: false };
  }
  if (row.lock_status !== 'TEMPORARILY_REOPENED') {
    return { editable: ['EDITABLE', 'OPEN'].includes(row.lock_status) && Number(row.within_submission_window) === 1,
      deadline: row.submission_deadline, correction: false };
  }
  const [access] = await connection.execute(`SELECT tr.temporary_reopening_id, tr.expires_at FROM TEMPORARY_REOPENING tr
      JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
      WHERE grr.grade_sheet_id = ? AND grr.teacher_assignment_id = ? AND grr.status = 'APPROVED'
        AND tr.status = 'ACTIVE' AND tr.starts_at <= UTC_TIMESTAMP(6) AND tr.expires_at > UTC_TIMESTAMP(6)${lock ? ' FOR UPDATE' : ''}`,
    [sheetId, row.teacher_assignment_id]);
  return { editable: access.length === 1, deadline: access[0]?.expires_at || row.submission_deadline, correction: true };
}

  static async canEdit(...args) { return (await this.editingWindow(...args)).editable; }

  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_SHEET');
    return rows;
  }

  static async findById(id, connection = db) {
    const [rows] = await connection.execute('SELECT * FROM GRADE_SHEET WHERE grade_sheet_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { subject_offering_id, term_id, workflow_status, lock_status, submitted_at, approved_at, locked_at } = data;
    const [result] = await db.execute(
      `INSERT INTO GRADE_SHEET (subject_offering_id, term_id, workflow_status, lock_status, submitted_at, approved_at, locked_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subject_offering_id, term_id, workflow_status || 'DRAFT', lock_status || 'EDITABLE', submitted_at, approved_at, locked_at]
    );
    return result.insertId;
  }

  static async update(id, data, connection = db) {
    const allowedFields = [
      'workflow_status', 'lock_status', 'submitted_at', 'approved_at', 'locked_at'
    ];
    const entries = Object.entries(data).filter(([key]) => allowedFields.includes(key));
    if (!entries.length) return this.findById(id, connection);
    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await connection.execute(`UPDATE GRADE_SHEET SET ${setClause}, updated_at = UTC_TIMESTAMP(6) WHERE grade_sheet_id = ?`, [...values, id]);
    return this.findById(id, connection);
  }

  static async openTemporaryAccess(id, connection = db) {
    return this.update(id, {
      workflow_status: 'DRAFT',
      lock_status: 'TEMPORARILY_REOPENED',
    }, connection);
  }

  static async openTemporaryCorrection(id, connection = db) {
    return this.openTemporaryAccess(id, connection);
  }

  static async restoreTermLock(id, connection = db) {
    return this.update(id, { lock_status: 'TERM_LOCKED' }, connection);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_SHEET WHERE grade_sheet_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeSheet;
