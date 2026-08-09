const db = require('../config/db');

class School {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SCHOOL');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SCHOOL WHERE school_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { school_name, school_code, region, division, street, barangay, city, province, country, postal_code } = data;
    const [result] = await db.execute(
      `INSERT INTO SCHOOL (school_name, school_code, region, division, street, barangay, city, province, country, postal_code) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [school_name, school_code, region, division, street, barangay, city, province, country, postal_code]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SCHOOL SET ${setClause} WHERE school_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SCHOOL WHERE school_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = School;