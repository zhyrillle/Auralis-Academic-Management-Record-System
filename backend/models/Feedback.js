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
    // 1. Calculate average rating received overall and per question (Q1 to Q8)
    const [ratingRows] = await db.execute(
      `SELECT 
        COUNT(*) AS total_received,
        AVG((COALESCE(q1_rate, 0) + COALESCE(q2_rate, 0) + COALESCE(q3_rate, 0) + COALESCE(q4_rate, 0) + 
             COALESCE(q5_rate, 0) + COALESCE(q6_rate, 0) + COALESCE(q7_rate, 0) + COALESCE(q8_rate, 0)) / 8.0) AS avg_rating,
        AVG(q1_rate) AS q1_avg,
        AVG(q2_rate) AS q2_avg,
        AVG(q3_rate) AS q3_avg,
        AVG(q4_rate) AS q4_avg,
        AVG(q5_rate) AS q5_avg,
        AVG(q6_rate) AS q6_avg,
        AVG(q7_rate) AS q7_avg,
        AVG(q8_rate) AS q8_avg
       FROM FEEDBACK
       WHERE evaluee_id = ?`,
      [userId]
    );

    // 2. Count feedback submitted by this evaluator
    const [submittedRows] = await db.execute(
      'SELECT COUNT(*) AS total_submitted FROM FEEDBACK WHERE evaluator_id = ?',
      [userId]
    );

    // 3. Count total eligible peers in system (excluding current user & system_admin)
    const [peerRows] = await db.execute(
      "SELECT COUNT(*) AS total_peers FROM `USER` WHERE user_id != ? AND role != 'system_admin'",
      [userId]
    );

    // 4. Query unsubmitted peers grouped by role to calculate category pending counts
    const [pendingPeers] = await db.execute(
      `SELECT u.user_id, u.role
       FROM \`USER\` u
       WHERE u.user_id != ? 
         AND u.role != 'system_admin' 
         AND u.user_id NOT IN (
           SELECT evaluee_id FROM FEEDBACK WHERE evaluator_id = ?
         )`,
      [userId, userId]
    );

    let pendingTeachers = 0;
    let pendingDeptHeads = 0;
    let pendingPrincipals = 0;

    pendingPeers.forEach((u) => {
      const r = (u.role || "").toLowerCase();
      if (r.includes("principal")) {
        pendingPrincipals++;
      } else if (r.includes("head") || r.includes("department")) {
        pendingDeptHeads++;
      } else {
        pendingTeachers++;
      }
    });

    const totalReceived = ratingRows[0]?.total_received || 0;
    const avgRating = ratingRows[0]?.avg_rating ? parseFloat(ratingRows[0].avg_rating).toFixed(1) : "0.0";
    const totalSubmitted = submittedRows[0]?.total_submitted || 0;
    const totalPeers = peerRows[0]?.total_peers || 0;
    const pendingCount = pendingPeers.length;
    const completionRate = totalPeers > 0 ? Math.min(100, Math.round((totalSubmitted / totalPeers) * 100)) : 100;

    // 5. Build Question 1 to 8 performance breakdown
    const qAverages = [
      ratingRows[0]?.q1_avg ? parseFloat(ratingRows[0].q1_avg) : 0,
      ratingRows[0]?.q2_avg ? parseFloat(ratingRows[0].q2_avg) : 0,
      ratingRows[0]?.q3_avg ? parseFloat(ratingRows[0].q3_avg) : 0,
      ratingRows[0]?.q4_avg ? parseFloat(ratingRows[0].q4_avg) : 0,
      ratingRows[0]?.q5_avg ? parseFloat(ratingRows[0].q5_avg) : 0,
      ratingRows[0]?.q6_avg ? parseFloat(ratingRows[0].q6_avg) : 0,
      ratingRows[0]?.q7_avg ? parseFloat(ratingRows[0].q7_avg) : 0,
      ratingRows[0]?.q8_avg ? parseFloat(ratingRows[0].q8_avg) : 0,
    ];

    const qDescriptions = [
      "Professionalism with colleagues",
      "Respect toward fellow staff",
      "Positive workplace attitude",
      "Punctuality & preparedness",
      "Contribution during meetings",
      "Responsiveness to concerns",
      "Timely completion of tasks",
      "Initiative in problem solving"
    ];

    const qColors = [
      "#112d61",
      "#1a3a6b",
      "#23497d",
      "#2f5c97",
      "#9b7914",
      "#b8941f",
      "#c9a227",
      "#e0bd45"
    ];

    const totalAvgSum = qAverages.reduce((acc, curr) => acc + curr, 0);

    const questionDistribution = qAverages.map((avgVal, idx) => {
      const qNum = idx + 1;
      const formattedAvg = avgVal > 0 ? avgVal.toFixed(1) : (totalReceived > 0 ? "0.0" : "4.5");
      const slicePct = totalAvgSum > 0 ? Math.round((avgVal / totalAvgSum) * 100) : 12.5;

      return {
        id: qNum,
        qNumber: qNum,
        label: `Question ${qNum}`,
        description: qDescriptions[idx],
        avg: formattedAvg,
        scorePercent: avgVal > 0 ? Math.round((avgVal / 5.0) * 100) : 90,
        percent: slicePct,
        color: qColors[idx],
      };
    });

    return {
      total_submitted: totalSubmitted,
      total_received: totalReceived,
      avg_rating: avgRating,
      total_peers: totalPeers,
      pending_count: pendingCount,
      completion_rate: completionRate,
      pending_breakdown: {
        teachers: pendingTeachers,
        dept_heads: pendingDeptHeads,
        principals: pendingPrincipals,
      },
      question_distribution: questionDistribution,
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