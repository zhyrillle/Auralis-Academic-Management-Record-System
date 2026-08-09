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