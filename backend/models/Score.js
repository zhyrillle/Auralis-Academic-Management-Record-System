const db = require('../config/db');

class Score {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SCORE');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SCORE WHERE score_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { activity_id, student_section_id, raw_score, score_status, teacher_assignment_id } = data;
    const [result] = await db.execute(
      `INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW(6))`,
      [activity_id, student_section_id, raw_score, score_status || 'NOT_ENCODED', teacher_assignment_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SCORE SET ${setClause}, updated_at = NOW(6) WHERE score_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SCORE WHERE score_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Score;