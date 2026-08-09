const db = require('../config/db');

class Feedback {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM FEEDBACK');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM FEEDBACK WHERE feedback_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { user_id, feedback_type, comment, status } = data;
    const [result] = await db.execute(
      `INSERT INTO FEEDBACK (user_id, feedback_type, comment, status) 
       VALUES (?, ?, ?, ?)`,
      [user_id, feedback_type, comment, status || 'OPEN']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE FEEDBACK SET ${setClause} WHERE feedback_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM FEEDBACK WHERE feedback_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Feedback;