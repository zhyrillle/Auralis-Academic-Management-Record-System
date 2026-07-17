const db = require('../config/db');

const Subject = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM SUBJECT');
    return rows;
  },

  create: async (subject) => {
    const { subject_name, subject_code, description, student_section_id, user_id } = subject;
    const [result] = await db.query(
      'INSERT INTO SUBJECT (subject_name, subject_code, description, student_section_id, user_id) VALUES (?, ?, ?, ?, ?)',
      [subject_name, subject_code, description, student_section_id, user_id]
    );
    return result.insertId;
  }
};

module.exports = Subject;