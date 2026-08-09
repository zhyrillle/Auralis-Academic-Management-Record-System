const db = require('../config/db');

class Notification {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM NOTIFICATION');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM NOTIFICATION WHERE notification_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { user_id, title, message, related_entity_type, related_entity_id, type, is_read } = data;
    const [result] = await db.execute(
      `INSERT INTO NOTIFICATION (user_id, title, message, related_entity_type, related_entity_id, type, is_read) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, title, message, related_entity_type, related_entity_id, type, is_read || false]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE NOTIFICATION SET ${setClause} WHERE notification_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM NOTIFICATION WHERE notification_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Notification;