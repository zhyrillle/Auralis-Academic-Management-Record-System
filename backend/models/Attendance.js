const db = require('../config/db');

class Attendance {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE WHERE attendance_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { attendance_sheet_id, student_section_id, status, remarks } = data;
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks) 
       VALUES (?, ?, ?, ?)`,
      [attendance_sheet_id, student_section_id, status, remarks]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE ATTENDANCE SET ${setClause} WHERE attendance_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ATTENDANCE WHERE attendance_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Attendance;