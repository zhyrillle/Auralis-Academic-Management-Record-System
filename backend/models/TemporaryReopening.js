const db = require('../config/db');

class TemporaryReopening {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM TEMPORARY_REOPENING');
    return rows;
  }

  static async findById(id, connection = db) {
    const [rows] = await connection.execute('SELECT * FROM TEMPORARY_REOPENING WHERE temporary_reopening_id = ?', [id]);
    return rows[0];
  }

  static async create(data, connection = db) {
    const { request_id, starts_at, expires_at, status } = data;
    const [result] = await connection.execute(
      `INSERT INTO TEMPORARY_REOPENING (request_id, starts_at, expires_at, status) 
       VALUES (?, ?, ?, ?)`,
      [request_id, starts_at, expires_at, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data, connection = db) {
    const allowedFields = ['starts_at', 'expires_at', 'status'];
    const entries = Object.entries(data).filter(([key]) => allowedFields.includes(key));
    if (!entries.length) return this.findById(id, connection);
    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await connection.execute(`UPDATE TEMPORARY_REOPENING SET ${setClause} WHERE temporary_reopening_id = ?`, [...values, id]);
    return this.findById(id, connection);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM TEMPORARY_REOPENING WHERE temporary_reopening_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = TemporaryReopening;
