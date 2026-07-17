const db = require('../config/db');

const GradeLevel = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM GRADE_LEVEL');
    return rows;
  },

  findById: async (id) => {
    const [rows] = await db.query('SELECT * FROM GRADE_LEVEL WHERE grade_level_id = ?', [id]);
    return rows[0];
  },

  create: async (name) => {
    const [result] = await db.query('INSERT INTO GRADE_LEVEL (grade_level_name) VALUES (?)', [name]);
    return result.insertId;
  },

  delete: async (id) => {
    await db.query('DELETE FROM GRADE_LEVEL WHERE grade_level_id = ?', [id]);
  }
};

module.exports = GradeLevel;