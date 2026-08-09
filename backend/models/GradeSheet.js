const db = require('../config/db');

class GradeSheet {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_SHEET');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM GRADE_SHEET WHERE grade_sheet_id = ?', [id]);
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

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE GRADE_SHEET SET ${setClause}, updated_at = NOW(6) WHERE grade_sheet_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_SHEET WHERE grade_sheet_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeSheet;