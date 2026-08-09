const db = require('../config/db');

class Department {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM DEPARTMENT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM DEPARTMENT WHERE department_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { department_code, department_name } = data;
    const [result] = await db.execute(
      `INSERT INTO DEPARTMENT (department_code, department_name) VALUES (?, ?)`,
      [department_code, department_name]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE DEPARTMENT SET ${setClause} WHERE department_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM DEPARTMENT WHERE department_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Department;