const db = require('../config/db');

const Feedback = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM FEEDBACK');
    return rows;
  },

  create: async (feedback) => {
    const { user_id, feedback_type, comment } = feedback;
    const [result] = await db.query(
      'INSERT INTO FEEDBACK (user_id, feedback_type, comment) VALUES (?, ?, ?)',
      [user_id, feedback_type, comment]
    );
    return result.insertId;
  }
};

module.exports = Feedback;