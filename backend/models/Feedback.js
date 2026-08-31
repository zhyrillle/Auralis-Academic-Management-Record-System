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
      `SELECT feedback_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, 
              q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, 
              improvements_comments, status, created_at
       FROM FEEDBACK
       WHERE evaluee_id = ?
       ORDER BY feedback_id DESC`,
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
      improvements_comments,
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
        improvements_comments,
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
        improvements_comments || null,
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

  static async getDateRange(term = "Overall", schoolYear = "2026-2027") {
    if (!schoolYear || schoolYear === "Overall" || schoolYear === "all") {
      return { startDate: null, endDate: null };
    }
    const syParts = String(schoolYear).split(/[-–_]/);
    const startYr = parseInt(syParts[0], 10);
    const endYr = syParts[1] ? parseInt(syParts[1], 10) : startYr + 1;

    if (isNaN(startYr)) return { startDate: null, endDate: null };

    try {
      const [terms] = await db.execute(
        `SELECT at.term_name, at.starts_at, at.ends_at 
         FROM ACADEMIC_TERM at
         JOIN SCHOOL_YEAR sy ON at.school_year_id = sy.school_year_id
         WHERE sy.starts_on = ? OR YEAR(sy.starts_on) = ? OR (YEAR(sy.starts_on) = ? AND YEAR(sy.ends_on) = ?)`,
        [startYr, startYr, startYr, endYr]
      );

      if (terms.length > 0) {
        const termLower = String(term || "").toLowerCase();
        let matched = null;
        if (termLower.includes("1") || termLower.includes("first")) {
          matched = terms.find(t => t.term_name.includes("1") || t.term_name.toLowerCase().includes("first"));
        } else if (termLower.includes("2") || termLower.includes("second")) {
          matched = terms.find(t => t.term_name.includes("2") || t.term_name.toLowerCase().includes("second"));
        } else if (termLower.includes("3") || termLower.includes("third")) {
          matched = terms.find(t => t.term_name.includes("3") || t.term_name.toLowerCase().includes("third"));
        }

        if (matched) {
          return { startDate: matched.starts_at, endDate: matched.ends_at };
        }

        const starts = terms.map(t => new Date(t.starts_at)).sort((a, b) => a - b);
        const ends = terms.map(t => new Date(t.ends_at)).sort((a, b) => b - a);
        return { startDate: starts[0], endDate: ends[0] };
      }
    } catch (e) {
      console.warn("[WARN] getDateRange DB query error:", e.message);
    }

    const termLower = String(term || "").toLowerCase();
    if (termLower.includes("1") || termLower.includes("first")) {
      return {
        startDate: new Date(`${startYr}-06-01T00:00:00.000Z`),
        endDate: new Date(`${startYr}-09-30T23:59:59.999Z`),
      };
    } else if (termLower.includes("2") || termLower.includes("second")) {
      return {
        startDate: new Date(`${startYr}-10-01T00:00:00.000Z`),
        endDate: new Date(`${startYr}-12-31T23:59:59.999Z`),
      };
    } else if (termLower.includes("3") || termLower.includes("third")) {
      return {
        startDate: new Date(`${endYr}-01-01T00:00:00.000Z`),
        endDate: new Date(`${endYr}-05-31T23:59:59.999Z`),
      };
    }

    return {
      startDate: new Date(`${startYr}-06-01T00:00:00.000Z`),
      endDate: new Date(`${endYr}-05-31T23:59:59.999Z`),
    };
  }

  static async getPrincipalFeedbackSummary(term = "Overall", schoolYear = "2026-2027") {
    try {
      const { startDate, endDate } = await this.getDateRange(term, schoolYear);

      let whereClause = "WHERE LOWER(u.role) LIKE '%principal%'";
      const params = [];

      if (startDate && endDate) {
        whereClause += " AND f.created_at >= ? AND f.created_at <= ?";
        params.push(startDate, endDate);
      }

      const [rows] = await db.execute(
        `SELECT 
          COUNT(*) AS total_responses,
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
         FROM FEEDBACK f
         INNER JOIN \`USER\` u ON f.evaluee_id = u.user_id
         ${whereClause}`,
        params
      );

      const totalResponses = rows[0]?.total_responses || 0;
      const overallRating = rows[0]?.avg_rating ? parseFloat(rows[0].avg_rating) : 0.0;

      const [commentCountRows] = await db.execute(
        `SELECT 
          SUM(
            (CASE WHEN strengths_comments IS NOT NULL AND TRIM(strengths_comments) != '' THEN 1 ELSE 0 END) +
            (CASE WHEN improvements_comments IS NOT NULL AND TRIM(improvements_comments) != '' THEN 1 ELSE 0 END) +
            (CASE WHEN comment IS NOT NULL AND TRIM(comment) != '' THEN 1 ELSE 0 END)
          ) AS total_comments
         FROM FEEDBACK f
         INNER JOIN \`USER\` u ON f.evaluee_id = u.user_id
         ${whereClause}`,
        params
      );

      const totalComments = parseInt(commentCountRows[0]?.total_comments || 0, 10);

      let belowTargetCount = 0;
      if (totalResponses > 0) {
        const qAvgs = [
          rows[0]?.q1_avg ? parseFloat(rows[0].q1_avg) : 0,
          rows[0]?.q2_avg ? parseFloat(rows[0].q2_avg) : 0,
          rows[0]?.q3_avg ? parseFloat(rows[0].q3_avg) : 0,
          rows[0]?.q4_avg ? parseFloat(rows[0].q4_avg) : 0,
          rows[0]?.q5_avg ? parseFloat(rows[0].q5_avg) : 0,
          rows[0]?.q6_avg ? parseFloat(rows[0].q6_avg) : 0,
          rows[0]?.q7_avg ? parseFloat(rows[0].q7_avg) : 0,
          rows[0]?.q8_avg ? parseFloat(rows[0].q8_avg) : 0,
        ];
        belowTargetCount = qAvgs.filter((avg) => avg > 0 && avg < 3.0).length;
      }

      // Calculate dynamic rating difference (comparing to previous period rating or baseline 3.0)
      let ratingDiff = "+0.0";
      if (overallRating > 0) {
        const tLower = String(term || "").toLowerCase();
        const syParts = String(schoolYear || "").split(/[-–_]/);
        const startYr = parseInt(syParts[0], 10) || 2026;
        const endYr = syParts[1] ? parseInt(syParts[1], 10) : startYr + 1;
        const prevSY = `${startYr - 1}-${endYr - 1}`;

        let prevTerm = "Overall";
        let prevSchoolYear = prevSY;

        if (tLower.includes("3") || tLower.includes("third")) {
          prevTerm = "Term 2";
          prevSchoolYear = schoolYear;
        } else if (tLower.includes("2") || tLower.includes("second")) {
          prevTerm = "Term 1";
          prevSchoolYear = schoolYear;
        } else if (tLower.includes("1") || tLower.includes("first")) {
          prevTerm = "Overall";
          prevSchoolYear = prevSY;
        }

        const { startDate: prevStart, endDate: prevEnd } = await this.getDateRange(prevTerm, prevSchoolYear);

        let prevRating = 0;
        if (prevStart && prevEnd) {
          const [prevRows] = await db.execute(
            `SELECT 
              AVG((COALESCE(q1_rate, 0) + COALESCE(q2_rate, 0) + COALESCE(q3_rate, 0) + COALESCE(q4_rate, 0) + 
                   COALESCE(q5_rate, 0) + COALESCE(q6_rate, 0) + COALESCE(q7_rate, 0) + COALESCE(q8_rate, 0)) / 8.0) AS avg_rating
             FROM FEEDBACK f
             INNER JOIN \`USER\` u ON f.evaluee_id = u.user_id
             WHERE LOWER(u.role) LIKE '%principal%' AND f.created_at >= ? AND f.created_at <= ?`,
            [prevStart, prevEnd]
          );
          if (prevRows[0]?.avg_rating) {
            prevRating = parseFloat(prevRows[0].avg_rating);
          }
        }

        if (prevRating > 0) {
          const diff = overallRating - prevRating;
          ratingDiff = (diff >= 0 ? "+" : "") + diff.toFixed(1);
        } else {
          // If no previous period data exists, compare against standard 3.0 baseline
          const diff = overallRating - 3.0;
          ratingDiff = (diff >= 0 ? "+" : "") + diff.toFixed(1);
        }
      }

      return {
        totalResponses,
        overallRating,
        ratingDiff,
        totalComments,
        belowTargetCount,
      };
    } catch (err) {
      console.error("[ERROR] getPrincipalFeedbackSummary:", err);
      return {
        totalResponses: 0,
        overallRating: 0.0,
        ratingDiff: "+0.0",
        totalComments: 0,
        belowTargetCount: 0,
      };
    }
  }

  static async getPrincipalLikertResults(term = "Overall", schoolYear = "2026-2027") {
    try {
      const questions = [
        "The principal communicates clear goals and vision for the school.",
        "The principal provides adequate support for instructional needs and materials.",
        "The principal recognizes and appreciates teachers' accomplishments.",
        "The principal encourages professional growth and learning opportunities.",
        "The principal maintains a safe and positive school environment.",
        "The principal handles administrative matters and concerns promptly.",
        "The principal is approachable and open to teacher feedback.",
        "The principal demonstrates fair and transparent decision-making.",
      ];

      const { startDate, endDate } = await this.getDateRange(term, schoolYear);

      let whereClause = "WHERE LOWER(u.role) LIKE '%principal%'";
      const params = [];

      if (startDate && endDate) {
        whereClause += " AND f.created_at >= ? AND f.created_at <= ?";
        params.push(startDate, endDate);
      }

      const [rows] = await db.execute(
        `SELECT 
          AVG(q1_rate) AS q1_avg,
          AVG(q2_rate) AS q2_avg,
          AVG(q3_rate) AS q3_avg,
          AVG(q4_rate) AS q4_avg,
          AVG(q5_rate) AS q5_avg,
          AVG(q6_rate) AS q6_avg,
          AVG(q7_rate) AS q7_avg,
          AVG(q8_rate) AS q8_avg
         FROM FEEDBACK f
         INNER JOIN \`USER\` u ON f.evaluee_id = u.user_id
         ${whereClause}`,
        params
      );

      const r = rows[0] || {};
      const results = questions.map((desc, idx) => {
        const key = `q${idx + 1}_avg`;
        const val = r[key] != null ? parseFloat(r[key]) : 0;
        return {
          id: idx + 1,
          description: desc,
          rate: val > 0 ? parseFloat(val.toFixed(1)) : 0,
        };
      });

      return { results };
    } catch (err) {
      console.error("[ERROR] getPrincipalLikertResults:", err);
      return { results: [] };
    }
  }

  static async getPrincipalFeedbackComments(term = "Overall", schoolYear = "2026-2027", query = "") {
    try {
      const { startDate, endDate } = await this.getDateRange(term, schoolYear);

      let sql = `
        SELECT f.*
        FROM FEEDBACK f
        INNER JOIN \`USER\` u ON f.evaluee_id = u.user_id
        WHERE LOWER(u.role) LIKE '%principal%'
      `;
      const params = [];

      if (startDate && endDate) {
        sql += ` AND f.created_at >= ? AND f.created_at <= ?`;
        params.push(startDate, endDate);
      }

      if (query && query.trim()) {
        const q = `%${query.trim()}%`;
        sql += ` AND (f.strengths_comments LIKE ? OR f.improvements_comments LIKE ? OR f.comment LIKE ?)`;
        params.push(q, q, q);
      }

      sql += ` ORDER BY f.feedback_id DESC`;

      const [rows] = await db.execute(sql, params);

      const comments = [];
      rows.forEach((row, idx) => {
        const praiseText = row.strengths_comments || row.strengths_comment || row.strenghts_comment;
        const suggestionText = row.improvements_comments || row.improvements_comment;
        const generalText = row.comment;

        if (praiseText && String(praiseText).trim()) {
          comments.push({
            id: `str-${row.feedback_id}-${idx}`,
            category: "Strengths & Contributions",
            text: String(praiseText).trim(),
            created_at: row.created_at,
          });
        }
        if (suggestionText && String(suggestionText).trim()) {
          comments.push({
            id: `imp-${row.feedback_id}-${idx}`,
            category: "Areas for Improvement",
            text: String(suggestionText).trim(),
            created_at: row.created_at,
          });
        }
        if (generalText && String(generalText).trim()) {
          comments.push({
            id: `com-${row.feedback_id}-${idx}`,
            category: "General",
            text: String(generalText).trim(),
            created_at: row.created_at,
          });
        }
      });

      return { comments };
    } catch (err) {
      console.error("[ERROR] getPrincipalFeedbackComments:", err);
      return { comments: [] };
    }
  }
}

module.exports = Feedback;