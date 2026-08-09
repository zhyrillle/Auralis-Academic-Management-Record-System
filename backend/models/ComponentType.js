const db = require('../config/db');

class ComponentType {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM COMPONENT_TYPE');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM COMPONENT_TYPE WHERE component_type_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { component_code, component_name } = data;
    const [result] = await db.execute(
      `INSERT INTO COMPONENT_TYPE (component_code, component_name) VALUES (?, ?)`,
      [component_code, component_name]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE COMPONENT_TYPE SET ${setClause} WHERE component_type_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM COMPONENT_TYPE WHERE component_type_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = ComponentType;