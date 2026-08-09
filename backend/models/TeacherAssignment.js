const db = require('../config/db');

class TeacherAssignment {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM TEACHER_ASSIGNMENT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { user_id, subject_offering_id, assigned_from, assigned_until } = data;
    const [result] = await db.execute(
      `INSERT INTO TEACHER_ASSIGNMENT (user_id, subject_offering_id, assigned_from, assigned_until) 
       VALUES (?, ?, ?, ?)`,
      [user_id, subject_offering_id, assigned_from, assigned_until]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE TEACHER_ASSIGNMENT SET ${setClause} WHERE teacher_assignment_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = TeacherAssignment;