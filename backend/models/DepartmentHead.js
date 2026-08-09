const db = require('../config/db');

class DepartmentHead {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM DEPARTMENT_HEAD');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM DEPARTMENT_HEAD WHERE department_head_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { department_id, user_id, school_year_id, appointed_from, appointed_until } = data;
    const [result] = await db.execute(
      `INSERT INTO DEPARTMENT_HEAD (department_id, user_id, school_year_id, appointed_from, appointed_until) 
       VALUES (?, ?, ?, ?, ?)`,
      [department_id, user_id, school_year_id, appointed_from, appointed_until]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE DEPARTMENT_HEAD SET ${setClause} WHERE department_head_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM DEPARTMENT_HEAD WHERE department_head_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = DepartmentHead;