const db = require('../config/db');

class AttendanceSheet {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]);
    return rows[0];
  }

  // Find or create an ATTENDANCE_SHEET for a given date + adviser assignment
  static async findOrCreate({ adviser_assignment_id, attendance_scope, attendance_date }) {
    const [existing] = await db.execute(
      `SELECT attendance_sheet_id FROM ATTENDANCE_SHEET
       WHERE adviser_assignment_id = ? AND attendance_date = ? AND attendance_scope = ?`,
      [adviser_assignment_id, attendance_date, attendance_scope]
    );
    if (existing.length > 0) {
      return { attendance_sheet_id: existing[0].attendance_sheet_id, created: false };
    }
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)
       VALUES (?, ?, ?)`,
      [adviser_assignment_id, attendance_scope, attendance_date]
    );
    return { attendance_sheet_id: result.insertId, created: true };
  }

  // Get all attendance sheet dates for a given adviser assignment (for building the date grid)
  static async findByAdviserAssignmentId(adviserAssignmentId) {
    const [rows] = await db.execute(
      `SELECT * FROM ATTENDANCE_SHEET
       WHERE adviser_assignment_id = ? AND attendance_scope = 'SECTION'
       ORDER BY attendance_date ASC`,
      [adviserAssignmentId]
    );
    return rows;
  }

  static async create(data) {
    const { teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date } = data;
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE_SHEET (teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date) 
       VALUES (?, ?, ?, ?)`,
      [teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE ATTENDANCE_SHEET SET ${setClause} WHERE attendance_sheet_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AttendanceSheet;