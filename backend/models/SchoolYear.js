const db = require('../config/db');

class SchoolYear {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SCHOOL_YEAR');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SCHOOL_YEAR WHERE school_year_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { school_id, starts_on, ends_on, curriculum, status } = data;
    const [result] = await db.execute(
      `INSERT INTO SCHOOL_YEAR (school_id, starts_on, ends_on, curriculum, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [school_id, starts_on, ends_on, curriculum, status || 'upcoming']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SCHOOL_YEAR SET ${setClause} WHERE school_year_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SCHOOL_YEAR WHERE school_year_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = SchoolYear;