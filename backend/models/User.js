const db = require('../config/db');

class User {
  static async findAll() {
    const [rows] = await db.execute('SELECT user_id, role, first_name, middle_name, last_name, extension_name, email, pfp_url, account_status, last_login_at FROM USER');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM USER WHERE user_id = ?', [id]);
    return rows[0];
  }

  static async findByEmail(email) {
    const [rows] = await db.execute('SELECT * FROM USER WHERE email = ?', [email]);
    return rows[0];
  }

  static async create(data) {
    const { role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status } = data;
    const [result] = await db.execute(
      `INSERT INTO USER (role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status || 'active']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE USER SET ${setClause} WHERE user_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM USER WHERE user_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;