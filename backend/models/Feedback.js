const db = require('../config/db');

class Feedback {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM FEEDBACK ORDER BY feedback_id DESC');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM FEEDBACK WHERE feedback_id = ?', [id]);
    return rows[0];
  }

  static async findByEvaluatorId(evaluatorId) {
    const [rows] = await db.execute(
      'SELECT * FROM FEEDBACK WHERE evaluator_id = ? ORDER BY feedback_id DESC',
      [evaluatorId]
    );
    return rows;
  }

  static async findByEvalueeId(evalueeId) {
    const [rows] = await db.execute(
      `SELECT f.*, 
              CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS evaluator_name
       FROM FEEDBACK f
       LEFT JOIN USER u ON u.user_id = f.evaluator_id
       WHERE f.evaluee_id = ?
       ORDER BY f.feedback_id DESC`,
      [evalueeId]
    );
    return rows;
  }

  static async checkExistingFeedback(evaluatorId, evalueeId) {
    const [rows] = await db.execute(
      'SELECT * FROM FEEDBACK WHERE evaluator_id = ? AND evaluee_id = ?',
      [evaluatorId, evalueeId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async getEvalueeStats(userId) {
    // 1. Calculate average rating received
    const [ratingRows] = await db.execute(
      `SELECT 
        COUNT(*) AS total_received,
        AVG((COALESCE(q1_rate, 0) + COALESCE(q2_rate, 0) + COALESCE(q3_rate, 0) + COALESCE(q4_rate, 0) + 
             COALESCE(q5_rate, 0) + COALESCE(q6_rate, 0) + COALESCE(q7_rate, 0) + COALESCE(q8_rate, 0)) / 8.0) AS avg_rating
       FROM FEEDBACK
       WHERE evaluee_id = ?`,
      [userId]
    );

    // 2. Count feedback submitted by this evaluator
    const [submittedRows] = await db.execute(
      'SELECT COUNT(*) AS total_submitted FROM FEEDBACK WHERE evaluator_id = ?',
      [userId]
    );

    const totalReceived = ratingRows[0]?.total_received || 0;
    const avgRating = ratingRows[0]?.avg_rating ? parseFloat(ratingRows[0].avg_rating).toFixed(1) : "0.0";
    const totalSubmitted = submittedRows[0]?.total_submitted || 0;

    return {
      total_submitted: totalSubmitted,
      total_received: totalReceived,
      avg_rating: avgRating
    };
  }

  static async create(data) {
    const {
      evaluator_id,
      evaluee_id,
      q1_rate,
      q2_rate,
      q3_rate,
      q4_rate,
      q5_rate,
      q6_rate,
      q7_rate,
      q8_rate,
      strengths_comments,
      improvements_comment,
      status,
      created_at,
      reviewed_at
    } = data;

    const [result] = await db.execute(
      `INSERT INTO FEEDBACK (
        evaluator_id,
        evaluee_id,
        q1_rate,
        q2_rate,
        q3_rate,
        q4_rate,
        q5_rate,
        q6_rate,
        q7_rate,
        q8_rate,
        strengths_comments,
        improvements_comment,
        status,
        created_at,
        reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evaluator_id,
        evaluee_id,
        q1_rate,
        q2_rate,
        q3_rate,
        q4_rate,
        q5_rate,
        q6_rate,
        q7_rate,
        q8_rate,
        strengths_comments || null,
        improvements_comment || null,
        status || 'OPEN',
        created_at || new Date(),
        reviewed_at || null
      ]
    );

    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) return this.findById(id);

    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE FEEDBACK SET ${setClause} WHERE feedback_id = ?`, [...values, id]);

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM FEEDBACK WHERE feedback_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Feedback;