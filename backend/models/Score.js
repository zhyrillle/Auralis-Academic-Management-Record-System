const db = require('../config/db');

const Score = {
  findByStudentSection: async (studentSectionId) => {
    const [rows] = await db.query('SELECT * FROM SCORE WHERE student_section_id = ?', [studentSectionId]);
    return rows;
  },

  create: async (score) => {
    const { component_type_id, activity_name, highest_score, raw_score, initial_grade, term_grade, descriptor, remark, locked_status, subject_id, student_section_id } = score;
    const [result] = await db.query(
      `INSERT INTO SCORE (component_type_id, activity_name, highest_score, raw_score, initial_grade, term_grade, descriptor, remark, locked_status, subject_id, student_section_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [component_type_id, activity_name, highest_score, raw_score, initial_grade, term_grade, descriptor, remark, locked_status, subject_id, student_section_id]
    );
    return result.insertId;
  },

  lockScores: async (subjectId) => {
    await db.query('UPDATE SCORE SET locked_status = TRUE WHERE subject_id = ?', [subjectId]);
  }
};

module.exports = Score;