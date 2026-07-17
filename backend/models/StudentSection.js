const db = require('../config/db');

const StudentSection = {
  findAll: async () => {
    const [rows] = await db.query(`
      SELECT ss.*, s.first_name, s.last_name, sec.section_name 
      FROM STUDENT_SECTION ss
      JOIN STUDENT s ON ss.student_id = s.student_id
      JOIN SECTION sec ON ss.section_id = sec.section_id
    `);
    return rows;
  },

  assignStudent: async (student_id, section_id, school_year_id) => {
    const [result] = await db.query(
      'INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)',
      [student_id, section_id, school_year_id]
    );
    return result.insertId;
  }
};

module.exports = StudentSection;