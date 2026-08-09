const db = require('../config/db');

class SectionAdviserAssignment {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { section_id, school_year_id, user_id, assigned_from, assigned_until } = data;
    const [result] = await db.execute(
      `INSERT INTO SECTION_ADVISER_ASSIGNMENT (section_id, school_year_id, user_id, assigned_from, assigned_until) 
       VALUES (?, ?, ?, ?, ?)`,
      [section_id, school_year_id, user_id, assigned_from, assigned_until]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SECTION_ADVISER_ASSIGNMENT SET ${setClause} WHERE adviser_assignment_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = SectionAdviserAssignment;