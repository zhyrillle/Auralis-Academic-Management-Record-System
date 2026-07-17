const db = require('../config/db');

const GradeSubmission = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM GRADE_SUBMISSION');
    return rows;
  },

  create: async (submission) => {
    const { school_year_id, open_datetime, close_datetime, status } = submission;
    const [result] = await db.query(
      'INSERT INTO GRADE_SUBMISSION (school_year_id, open_datetime, close_datetime, status) VALUES (?, ?, ?, ?)',
      [school_year_id, open_datetime, close_datetime, status]
    );
    return result.insertId;
  },

  updateStatus: async (id, status) => {
    await db.query('UPDATE GRADE_SUBMISSION SET status = ? WHERE submission_id = ?', [status, id]);
  }
};

module.exports = GradeSubmission;