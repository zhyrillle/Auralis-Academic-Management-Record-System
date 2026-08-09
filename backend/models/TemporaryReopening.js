const db = require('../config/db');

class TemporaryReopening {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM TEMPORARY_REOPENING');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM TEMPORARY_REOPENING WHERE temporary_reopening_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { request_id, starts_at, expires_at, status } = data;
    const [result] = await db.execute(
      `INSERT INTO TEMPORARY_REOPENING (request_id, starts_at, expires_at, status) 
       VALUES (?, ?, ?, ?)`,
      [request_id, starts_at, expires_at, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE TEMPORARY_REOPENING SET ${setClause} WHERE temporary_reopening_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM TEMPORARY_REOPENING WHERE temporary_reopening_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = TemporaryReopening;