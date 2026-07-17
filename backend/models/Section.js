const db = require('../config/db');

const Section = {
  findAll: async () => {
    const [rows] = await db.query(`
      SELECT s.*, gl.grade_level_name, CONCAT(u.first_name, ' ', u.last_name) AS adviser_name 
      FROM SECTION s
      LEFT JOIN GRADE_LEVEL gl ON s.grade_level_id = gl.grade_level_id
      LEFT JOIN USER u ON s.user_id = u.user_id
    `);
    return rows;
  },

  create: async (section) => {
    const { section_name, grade_level_id, user_id } = section;
    const [result] = await db.query(
      'INSERT INTO SECTION (section_name, grade_level_id, user_id) VALUES (?, ?, ?)',
      [section_name, grade_level_id, user_id]
    );
    return result.insertId;
  }
};

module.exports = Section;