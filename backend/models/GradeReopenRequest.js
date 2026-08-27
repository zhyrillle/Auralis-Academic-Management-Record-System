const db = require('../config/db');

class GradeReopenRequest {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_REOPEN_REQUEST');
    return rows;
  }

  static async findById(id, connection = db) {
    const [rows] = await connection.execute('SELECT * FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
    return rows[0];
  }

  static async create(data, connection = db) {
    const { grade_sheet_id, teacher_assignment_id, reason } = data;
    const [result] = await connection.execute(
      `INSERT INTO GRADE_REOPEN_REQUEST (
        grade_sheet_id, teacher_assignment_id, reason, status, requested_at
      ) VALUES (?, ?, ?, 'PENDING', UTC_TIMESTAMP(6))`,
      [grade_sheet_id, teacher_assignment_id, reason]
    );
    return result.insertId;
  }

  static async update(id, data, connection = db) {
    const allowedFields = ['reviewed_by_user_id', 'reason', 'status', 'reviewed_at'];
    const entries = Object.entries(data).filter(([key]) => allowedFields.includes(key));
    if (!entries.length) return this.findById(id, connection);
    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await connection.execute(`UPDATE GRADE_REOPEN_REQUEST SET ${setClause} WHERE request_id = ?`, [...values, id]);
    return this.findById(id, connection);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeReopenRequest;
