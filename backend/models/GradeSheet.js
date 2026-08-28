const db = require('../config/db');

class GradeSheet {
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

  static async openTemporaryCorrection(id, connection = db) {
    return this.update(id, {
      workflow_status: 'DRAFT',
      lock_status: 'TEMPORARILY_REOPENED',
    }, connection);
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
