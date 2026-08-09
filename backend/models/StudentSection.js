const db = require('../config/db');

class StudentSection {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM STUDENT_SECTION');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM STUDENT_SECTION WHERE student_section_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { student_id, section_id, school_year_id } = data;
    const [result] = await db.execute(
      `INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)`,
      [student_id, section_id, school_year_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE STUDENT_SECTION SET ${setClause} WHERE student_section_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM STUDENT_SECTION WHERE student_section_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = StudentSection;