const db = require('../config/db');

class Subject {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SUBJECT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SUBJECT WHERE subject_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { department_id, subject_name, subject_code, description, status } = data;
    const [result] = await db.execute(
      `INSERT INTO SUBJECT (department_id, subject_name, subject_code, description, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [department_id, subject_name, subject_code, description, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SUBJECT SET ${setClause} WHERE subject_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SUBJECT WHERE subject_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Subject;