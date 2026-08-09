const db = require('../config/db');

class GradeLevel {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_LEVEL');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM GRADE_LEVEL WHERE grade_level_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { grade_level_name } = data;
    const [result] = await db.execute(
      `INSERT INTO GRADE_LEVEL (grade_level_name) VALUES (?)`,
      [grade_level_name]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE GRADE_LEVEL SET ${setClause} WHERE grade_level_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_LEVEL WHERE grade_level_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeLevel;