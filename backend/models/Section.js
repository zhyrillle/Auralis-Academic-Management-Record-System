const db = require('../config/db');

class Section {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SECTION');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SECTION WHERE section_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { section_name, grade_level_id } = data;
    const [result] = await db.execute(
      `INSERT INTO SECTION (section_name, grade_level_id) VALUES (?, ?)`,
      [section_name, grade_level_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SECTION SET ${setClause} WHERE section_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SECTION WHERE section_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Section;