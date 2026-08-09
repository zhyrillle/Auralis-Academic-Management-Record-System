const db = require('../config/db');

class GradeActivity {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_ACTIVITY');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM GRADE_ACTIVITY WHERE activity_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { grade_sheet_id, component_type_id, teacher_assignment_id, activity_name, highest_possible_score, activity_date, status } = data;
    const [result] = await db.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, component_type_id, teacher_assignment_id, activity_name, highest_possible_score, activity_date, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(6))`,
      [grade_sheet_id, component_type_id, teacher_assignment_id, activity_name, highest_possible_score, activity_date, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE GRADE_ACTIVITY SET ${setClause}, updated_at = NOW(6) WHERE activity_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeActivity;