const db = require('../config/db');

class SubjectOffering {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_OFFERING');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_OFFERING WHERE subject_offering_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { subject_id, section_id, school_year_id } = data;
    const [result] = await db.execute(
      `INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id) VALUES (?, ?, ?)`,
      [subject_id, section_id, school_year_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SUBJECT_OFFERING SET ${setClause} WHERE subject_offering_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = SubjectOffering;