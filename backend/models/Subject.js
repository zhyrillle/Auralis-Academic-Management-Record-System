const db = require('../config/db');

class Subject {
  static async findAll() {
    const [rows] = await db.execute(`
      SELECT 
        s.*,
        p.program_code,
        p.program_name,
        COALESCE(p.is_specialized, 0) AS is_specialized
      FROM SUBJECT s
      LEFT JOIN PROGRAM p ON p.program_id = s.program_id
      ORDER BY s.subject_name ASC
    `);
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute(`
      SELECT 
        s.*,
        p.program_code,
        p.program_name,
        COALESCE(p.is_specialized, 0) AS is_specialized
      FROM SUBJECT s
      LEFT JOIN PROGRAM p ON p.program_id = s.program_id
      WHERE s.subject_id = ?
    `, [id]);
    return rows[0];
  }

  static async create(data) {
    const { department_id, subject_name, subject_code, description, status, program_id } = data;
    const [result] = await db.execute(
      `INSERT INTO SUBJECT (department_id, subject_name, subject_code, description, status, program_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [department_id || null, subject_name, subject_code, description || null, status || 'ACTIVE', program_id || null]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const allowedKeys = ['department_id', 'subject_name', 'subject_code', 'description', 'status', 'program_id'];
    const updates = [];
    const values = [];

    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(data[key] === '' ? null : data[key]);
      }
    }

    if (updates.length > 0) {
      values.push(id);
      await db.execute(`UPDATE SUBJECT SET ${updates.join(', ')} WHERE subject_id = ?`, values);
    }
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SUBJECT WHERE subject_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Subject;