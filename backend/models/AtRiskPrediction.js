const db = require('../config/db');

class AtRiskPrediction {
  /**
   * Helper to query live at-risk student records directly from MySQL.
   * Pulls real registered students, sections, attendance, grades, and scores.
   */
  static async getAllStudentRiskProfiles({ schoolYear, term, gradeLevel } = {}) {
    let query = `
      SELECT 
        s.student_id,
        s.LRN,
        CONCAT(s.first_name, ' ', COALESCE(CONCAT(s.middle_name, ' '), ''), s.last_name) AS full_name,
        s.first_name,
        s.last_name,
        COALESCE(sec.section_name, 'Section 1') AS section_name,
        COALESCE(gl.grade_level_name, 'G7') AS grade_level_name,
        COALESCE(u.adv_name, 'Ms. Bautista') AS adviser_name,
        COALESCE(att.absences, 0) AS total_absences,
        COALESCE(att.lates, 0) AS total_lates,
        COALESCE(sc.missing_count, 0) AS missing_submissions,
        gr.avg_gpa,
        COALESCE(gr.failing_count, 0) AS failing_count,
        gr.min_grade
      FROM STUDENT s
      LEFT JOIN (
        SELECT student_id, MIN(section_id) AS section_id, MIN(student_section_id) AS student_section_id
        FROM STUDENT_SECTION
        GROUP BY student_id
      ) ss_min ON s.student_id = ss_min.student_id
      LEFT JOIN SECTION sec ON ss_min.section_id = sec.section_id
      LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      LEFT JOIN (
        SELECT saa.section_id, MAX(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS adv_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN USER u ON saa.user_id = u.user_id
        GROUP BY saa.section_id
      ) u ON sec.section_id = u.section_id
      LEFT JOIN (
        SELECT ss.student_id,
               SUM(CASE WHEN a.status = 'A' THEN 1 ELSE 0 END) AS absences,
               SUM(CASE WHEN a.status = 'L' THEN 1 ELSE 0 END) AS lates
        FROM ATTENDANCE a
        INNER JOIN STUDENT_SECTION ss ON a.student_section_id = ss.student_section_id
        GROUP BY ss.student_id
      ) att ON s.student_id = att.student_id
      LEFT JOIN (
        SELECT COALESCE(sc.student_id, ss.student_id) AS student_id,
               COUNT(*) AS missing_count
        FROM SCORE sc
        LEFT JOIN STUDENT_SECTION ss ON sc.student_section_id = ss.student_section_id
        WHERE sc.score_status = 'MISSING'
        GROUP BY COALESCE(sc.student_id, ss.student_id)
      ) sc ON s.student_id = sc.student_id
      LEFT JOIN (
        SELECT student_id,
               AVG(COALESCE(quarterly_grade, initial_grade)) AS avg_gpa,
               MIN(COALESCE(quarterly_grade, initial_grade)) AS min_grade,
               SUM(CASE WHEN COALESCE(quarterly_grade, initial_grade) < 75 THEN 1 ELSE 0 END) AS failing_count
        FROM STUDENT_GRADE
        ${term && term !== "overall" ? `WHERE term = '${term.toUpperCase().startsWith('T') ? term.toUpperCase() : 'T' + term}'` : ''}
        GROUP BY student_id
      ) gr ON s.student_id = gr.student_id
      WHERE 1=1
    `;

    const params = [];
    if (gradeLevel && gradeLevel !== "all" && gradeLevel !== "Overall") {
      const cleanG = gradeLevel.replace(/\D/g, "");
      if (cleanG) {
        query += ` AND (gl.grade_level_name LIKE ? OR gl.grade_level_id = ?)`;
        params.push(`%${cleanG}%`, cleanG);
      }
    }

    query += ` ORDER BY s.student_id ASC`;

    let rows = [];
    try {
      const [dbRows] = await db.execute(query, params);
      rows = dbRows;
    } catch (err) {
      console.error("DB query for student risk profiles failed:", err.message);
      return [];
    }

    // Process real student rows into formatted risk profiles
    const studentList = rows.map((r) => {
      const gNum = parseInt(String(r.grade_level_name || "7").replace(/\D/g, ""), 10) || 7;
      const absences = parseInt(r.total_absences || 0, 10);
      const lates = parseInt(r.total_lates || 0, 10);
      const missing = parseInt(r.missing_submissions || 0, 10);
      const failing = parseInt(r.failing_count || 0, 10);
      const gpa = r.avg_gpa !== null ? parseFloat(r.avg_gpa) : null;
      const minG = r.min_grade !== null ? parseFloat(r.min_grade) : null;

      // Deterministic risk score calculation directly from database parameters
      let calculatedScore = 40; // Passing baseline
      if (gpa !== null) {
        if (gpa < 75) {
          calculatedScore += 30 + (75 - gpa) * 1.5;
        } else if (gpa < 80) {
          calculatedScore += 15 + (80 - gpa) * 2;
        } else if (gpa >= 85) {
          calculatedScore -= Math.min(10, (gpa - 85) * 1.0);
        }
      }
      calculatedScore += failing * 10;
      calculatedScore += absences * 6;
      calculatedScore += lates * 2;
      calculatedScore += missing * 5;

      const clampedScore = Math.min(98, Math.max(30, Math.round(calculatedScore)));

      let riskLevel = "low";
      if (clampedScore >= 80 || failing >= 2 || (gpa !== null && gpa < 75)) {
        riskLevel = "high";
      } else if (clampedScore >= 60 || absences >= 2 || missing >= 2 || (gpa !== null && gpa < 79)) {
        riskLevel = "medium";
      }

      // Generate accurate indicator flags
      const flags = [];

      // 1. Absences flag
      if (absences > 0) {
        flags.push({ icon: "calendar", label: `${absences} absence${absences > 1 ? "s" : ""} recorded` });
      } else if (lates > 0) {
        flags.push({ icon: "calendar", label: `${lates} late arrival${lates > 1 ? "s" : ""}` });
      } else {
        flags.push({ icon: "calendar", label: "Regular attendance" });
      }

      // 2. Academic / GPA flag
      if (gpa !== null) {
        if (gpa < 75 || failing > 0) {
          flags.push({ icon: "trending-down", label: `Failing average (${gpa.toFixed(1)}%)` });
        } else if (gpa < 80) {
          flags.push({ icon: "trending-down", label: `Borderline GPA (${gpa.toFixed(1)}%)` });
        } else {
          flags.push({ icon: "trending-down", label: `Passing GPA (${gpa.toFixed(1)}%)` });
        }
      } else {
        flags.push({ icon: "trending-down", label: "No recorded grades yet" });
      }

      // 3. Submissions flag
      if (missing > 0) {
        flags.push({ icon: "document", label: `${missing} missing submission${missing > 1 ? "s" : ""}` });
      } else {
        flags.push({ icon: "document", label: "Submissions up to date" });
      }

      return {
        id: `s-${r.student_id}`,
        studentId: r.student_id,
        lrn: r.LRN,
        name: r.full_name,
        grade: gNum,
        section: r.section_name || "Section 1",
        adviser: r.adviser_name || "Ms. Bautista",
        schoolYear: "2025-2026",
        term: term || "Overall",
        riskScore: clampedScore,
        riskLevel,
        flags,
        avgGpa: gpa,
        absences,
        missingSubmissions: missing,
      };
    });

    return studentList;
  }

  /**
   * Get At-Risk Summary Counts
   */
  static async getSummary({ schoolYear, term, gradeLevel } = {}) {
    const students = await this.getAllStudentRiskProfiles({ schoolYear, term, gradeLevel });

    let lowRisk = 0;
    let mediumRisk = 0;
    let highRisk = 0;

    students.forEach((s) => {
      if (s.riskLevel === "high") highRisk++;
      else if (s.riskLevel === "medium") mediumRisk++;
      else if (s.riskLevel === "low") lowRisk++;
    });

    return {
      lowRisk,
      mediumRisk,
      highRisk,
      total: lowRisk + mediumRisk + highRisk,
    };
  }

  /**
   * Get Students by Risk Level
   */
  static async getStudentsByRiskLevel({ schoolYear, term, gradeLevel, riskLevel, limit } = {}) {
    const students = await this.getAllStudentRiskProfiles({ schoolYear, term, gradeLevel });
    const filtered = riskLevel ? students.filter((s) => s.riskLevel === riskLevel) : students;

    const totalCount = filtered.length;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const resultStudents = parsedLimit ? filtered.slice(0, parsedLimit) : filtered;

    return {
      totalCount,
      students: resultStudents,
    };
  }

  /**
   * Get Breakdown analytics for Principal At-Risk Breakdown page
   */
  static async getBreakdownData({ schoolYear, term } = {}) {
    const students = await this.getAllStudentRiskProfiles({ schoolYear, term });

    let lowCount = 0;
    let medCount = 0;
    let highCount = 0;

    const gradeMap = {
      7: { grade: "Grade 7", high: 0, medium: 0, low: 0 },
      8: { grade: "Grade 8", high: 0, medium: 0, low: 0 },
      9: { grade: "Grade 9", high: 0, medium: 0, low: 0 },
      10: { grade: "Grade 10", high: 0, medium: 0, low: 0 },
    };

    students.forEach((s) => {
      if (s.riskLevel === "high") highCount++;
      if (s.riskLevel === "medium") medCount++;
      if (s.riskLevel === "low") lowCount++;

      if (gradeMap[s.grade]) {
        gradeMap[s.grade][s.riskLevel]++;
      }
    });

    const totalFlagged = lowCount + medCount + highCount;

    return {
      summary: {
        lowRisk: lowCount,
        mediumRisk: medCount,
        highRisk: highCount,
        total: totalFlagged,
      },
      distribution: {
        high: { count: highCount, percent: totalFlagged ? Math.round((highCount / totalFlagged) * 100) : 0 },
        medium: { count: medCount, percent: totalFlagged ? Math.round((medCount / totalFlagged) * 100) : 0 },
        low: { count: lowCount, percent: totalFlagged ? Math.round((lowCount / totalFlagged) * 100) : 0 },
        totalFlagged,
      },
      gradeBreakdown: Object.values(gradeMap),
    };
  }
}

module.exports = AtRiskPrediction;
