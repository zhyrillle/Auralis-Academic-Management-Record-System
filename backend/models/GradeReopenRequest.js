const db = require('../config/db');

const GradeReopenRequest = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM GRADE_REOPEN_REQUEST');
    return rows;
  },

  create: async (request) => {
    const { user_id, subject_id, submission_id, reason } = request;
    const [result] = await db.query(
      'INSERT INTO GRADE_REOPEN_REQUEST (user_id, subject_id, submission_id, reason) VALUES (?, ?, ?, ?)',
      [user_id, subject_id, submission_id, reason]
    );
    return result.insertId;
  },

  updateStatus: async (requestId, status, reopenUntilDate) => {
    await db.query(
      'UPDATE GRADE_REOPEN_REQUEST SET status = ?, reopen_until = ? WHERE request_id = ?',
      [status, reopenUntilDate, requestId]
    );
  }
};

module.exports = GradeReopenRequest;