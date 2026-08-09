const db = require('../config/db');

class SubjectComponentWeight {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { subject_id, component_type_id, school_year_id, percentage } = data;
    const [result] = await db.execute(
      `INSERT INTO SUBJECT_COMPONENT_WEIGHT (subject_id, component_type_id, school_year_id, percentage) 
       VALUES (?, ?, ?, ?)`,
      [subject_id, component_type_id, school_year_id, percentage]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SUBJECT_COMPONENT_WEIGHT SET ${setClause} WHERE subj_comp_weight_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SUBJECT_COMPONENT_WEIGHT WHERE subj_comp_weight_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = SubjectComponentWeight;