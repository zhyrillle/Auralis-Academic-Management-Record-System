const db = require('../config/db');

class GradeReopenRequest {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_REOPEN_REQUEST');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status } = data;
    const [result] = await db.execute(
      `INSERT INTO GRADE_REOPEN_REQUEST (grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status || 'PENDING']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE GRADE_REOPEN_REQUEST SET ${setClause} WHERE request_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeReopenRequest;