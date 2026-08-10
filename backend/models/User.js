const db = require('../config/db');

const ALLOWED_ROLES = ['admin', 'principal', 'department head', 'subject teacher'];
const PUBLIC_USER_COLUMNS = `
  user_id,
  role,
  first_name,
  middle_name,
  last_name,
  extension_name,
  email,
  pfp_url,
  account_status,
  last_login_at
`;

class User {
  static async findAll() {
    const [rows] = await db.execute(`SELECT ${PUBLIC_USER_COLUMNS} FROM USER`);
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute(
      `SELECT ${PUBLIC_USER_COLUMNS} FROM USER WHERE user_id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findByEmail(email) {
    const [rows] = await db.execute('SELECT * FROM USER WHERE email = ?', [email]);
    return rows[0];
  }

  static async create(data) {
    const { role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status } = data;

    if (!ALLOWED_ROLES.includes(role)) {
      throw new Error(`Invalid role '${role}'. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`);
    }

    const [result] = await db.execute(
      `INSERT INTO USER (role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [role, first_name, middle_name, last_name, extension_name, email, password, pfp_url, account_status || 'active']
    );
    return result.insertId;
  }

  static async update(id, data) {
    if (data.role && !ALLOWED_ROLES.includes(data.role)) {
      throw new Error(`Invalid role '${data.role}'. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`);
    }

    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE USER SET ${setClause} WHERE user_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async updateProfile(id, data) {
    const {
      first_name,
      middle_name,
      last_name,
      extension_name,
      email,
    } = data;

    await db.execute(
      `UPDATE USER
       SET first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, email = ?
       WHERE user_id = ?`,
      [
        first_name,
        middle_name || null,
        last_name,
        extension_name || null,
        email,
        id,
      ]
    );

    return this.findById(id);
  }

  static async updateProfilePicture(id, profilePictureUrl) {
    await db.execute(
      'UPDATE USER SET pfp_url = ? WHERE user_id = ?',
      [profilePictureUrl, id]
    );
    return this.findById(id);
  }

  static async updateLastLogin(id) {
    await db.execute(
      'UPDATE USER SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [id]
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM USER WHERE user_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = User;
