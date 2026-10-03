const db = require('../config/db');

const toYear = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value > 1000 && value < 10000 ? value : null;
  const str = String(value).trim();
  if (/^\d{4}$/.test(str)) return Number(str);
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
};

const normalizeTermCode = (term) => {
  const str = String(term || 'overall').toLowerCase().trim();
  if (str === 'overall' || str === 'all' || str === '') return null;
  if (str.includes('1') || str.includes('t1') || str.includes('first')) return 'T1';
  if (str.includes('2') || str.includes('t2') || str.includes('second')) return 'T2';
  if (str.includes('3') || str.includes('t3') || str.includes('third')) return 'T3';
  return null;
};

const safeQuery = async (sql, params = [], label = 'query') => {
  try {
    const [rows] = await db.execute(sql, params);
    return rows;
  } catch (err) {
    console.warn(`[AtRiskPrediction] ${label} failed:`, err.message);
    return [];
  }
};

class AtRiskPrediction {
  /**
   * Helper to fetch options (school years, grade levels)
   */
  static async getOptions() {
    const [yearRows, gradeRows] = await Promise.all([
      safeQuery(`SELECT starts_on, ends_on FROM SCHOOL_YEAR ORDER BY starts_on DESC`, [], 'school years'),
      safeQuery(`SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC`, [], 'grade levels'),
    ]);

    const seen = new Set();
    const schoolYears = [];
    yearRows.forEach((row) => {
      const start = toYear(row.starts_on);
      const end = toYear(row.ends_on);
      if (!start || !end) return;
      const value = `${start}-${end}`;
      if (seen.has(value)) return;
      seen.add(value);
      schoolYears.push({ id: `sy-${value}`, label: `SY ${start}–${end}`, value });
    });

    const finalYears = schoolYears.length
      ? schoolYears
      : [
          { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
          { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
        ];

    const gradeLevels = (gradeRows.length ? gradeRows : [
      { grade_level_id: 7, grade_level_name: 'Grade 7' },
      { grade_level_id: 8, grade_level_name: 'Grade 8' },
      { grade_level_id: 9, grade_level_name: 'Grade 9' },
      { grade_level_id: 10, grade_level_name: 'Grade 10' },
    ]).map((gl) => {
      const match = String(gl.grade_level_name || '').match(/\d+/);
      const num = match ? Number(match[0]) : gl.grade_level_id;
      return {
        id: `g-${num}`,
        label: `Grade ${num}`,
        value: String(num),
      };
    });

    return {
      schoolYears: finalYears,
      gradeLevels: [
        { id: 'g-all', label: 'All Grade Levels', value: 'all' },
        ...gradeLevels,
      ],
    };
  }

  /**
   * Helper to query live at-risk student records directly from MySQL with predictive scoring.
   */
  static async getAllStudentRiskProfiles({ schoolYear = '2026-2027', term, gradeLevel } = {}) {
    const termCode = normalizeTermCode(term);
    const startYear = parseInt(String(schoolYear || '2026').split('-')[0], 10);

    const query = `
      SELECT 
        s.student_id,
        s.LRN,
        CONCAT(s.first_name, ' ', COALESCE(CONCAT(s.middle_name, ' '), ''), s.last_name) AS full_name,
        s.first_name,
        s.last_name,
        COALESCE(sec.section_name, 'Section 1') AS section_name,
        COALESCE(gl.grade_level_name, 'Grade 7') AS grade_level_name,
        COALESCE(u.adv_name, 'Ms. Bautista') AS adviser_name,
        sy.starts_on,
        COALESCE(att.absences, 0) AS total_absences,
        COALESCE(att.lates, 0) AS total_lates,
        COALESCE(sc.missing_count, 0) AS missing_submissions,
        gr.avg_gpa,
        COALESCE(gr.failing_count, 0) AS failing_count,
        gr.min_grade,
        gr.t1_avg,
        gr.t2_avg,
        gr.t3_avg
      FROM STUDENT s
      LEFT JOIN (
        SELECT student_id, MIN(section_id) AS section_id, MIN(student_section_id) AS student_section_id, MIN(school_year_id) as school_year_id
        FROM STUDENT_SECTION
        GROUP BY student_id
      ) ss_min ON s.student_id = ss_min.student_id
      LEFT JOIN SECTION sec ON ss_min.section_id = sec.section_id
      LEFT JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON ss_min.school_year_id = sy.school_year_id
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
               SUM(CASE WHEN COALESCE(quarterly_grade, initial_grade) < 75 THEN 1 ELSE 0 END) AS failing_count,
               AVG(CASE WHEN term IN ('T1', '1st') THEN COALESCE(quarterly_grade, initial_grade) END) AS t1_avg,
               AVG(CASE WHEN term IN ('T2', '2nd') THEN COALESCE(quarterly_grade, initial_grade) END) AS t2_avg,
               AVG(CASE WHEN term IN ('T3', '3rd') THEN COALESCE(quarterly_grade, initial_grade) END) AS t3_avg
        FROM STUDENT_GRADE
        ${termCode ? `WHERE term = '${termCode}'` : ''}
        GROUP BY student_id
      ) gr ON s.student_id = gr.student_id
      WHERE 1=1
      ORDER BY s.student_id ASC
    `;

    const rows = await safeQuery(query, [], 'student risk profiles');

    // Parse grade level filter
    let glFilter = null;
    if (gradeLevel && gradeLevel !== 'all' && gradeLevel !== 'Overall' && gradeLevel !== '') {
      const cleanG = String(gradeLevel).replace(/\D/g, '');
      if (cleanG) glFilter = Number(cleanG);
    }

    // Process unique real student rows into formatted risk profiles
    const studentList = rows
      .filter((r) => {
        const gNum = parseInt(String(r.grade_level_name || '7').replace(/\D/g, ''), 10) || 7;
        if (glFilter !== null && gNum !== glFilter) return false;
        return true;
      })
      .map((r) => {
        const gNum = parseInt(String(r.grade_level_name || '7').replace(/\D/g, ''), 10) || 7;
        const absences = parseInt(r.total_absences || 0, 10);
        const lates = parseInt(r.total_lates || 0, 10);
        const missing = parseInt(r.missing_submissions || 0, 10);
        const failing = parseInt(r.failing_count || 0, 10);
        const gpa = r.avg_gpa !== null ? parseFloat(r.avg_gpa) : null;
        const t1 = r.t1_avg !== null ? parseFloat(r.t1_avg) : null;
        const t2 = r.t2_avg !== null ? parseFloat(r.t2_avg) : null;
        const t3 = r.t3_avg !== null ? parseFloat(r.t3_avg) : null;

        // Predictive risk score calculation
        let calculatedScore = 40; // baseline
        let hasGradeDrop = false;

        if (gpa !== null) {
          if (gpa < 75) {
            calculatedScore += 30 + (75 - gpa) * 1.5;
          } else if (gpa < 80) {
            calculatedScore += 15 + (80 - gpa) * 2;
          } else if (gpa >= 85) {
            calculatedScore -= Math.min(10, (gpa - 85) * 1.0);
          }
        }

        // Multi-term trend momentum prediction
        if (t1 !== null && t2 !== null && t2 < t1 - 1.5) {
          calculatedScore += 8;
          hasGradeDrop = true;
        }
        if (t2 !== null && t3 !== null && t3 < t2 - 1.5) {
          calculatedScore += 10;
          hasGradeDrop = true;
        }

        calculatedScore += failing * 10;
        calculatedScore += absences * 6;
        calculatedScore += lates * 2;
        calculatedScore += missing * 5;

        const clampedScore = Math.min(98, Math.max(30, Math.round(calculatedScore)));

        let riskLevel = 'low';
        if (clampedScore >= 80 || failing >= 2 || (gpa !== null && gpa < 75)) {
          riskLevel = 'high';
        } else if (clampedScore >= 60 || absences >= 2 || missing >= 2 || (gpa !== null && gpa < 79) || hasGradeDrop) {
          riskLevel = 'medium';
        }

        // Generate indicator flags
        const flags = [];

        // 1. Absences / Attendance flag
        if (absences > 0) {
          flags.push({ icon: 'calendar', label: `${absences} absence${absences > 1 ? 's' : ''} recorded` });
        } else if (lates > 0) {
          flags.push({ icon: 'calendar', label: `${lates} late arrival${lates > 1 ? 's' : ''}` });
        } else {
          flags.push({ icon: 'calendar', label: 'Regular attendance' });
        }

        // 2. Academic / GPA flag
        if (gpa !== null) {
          if (gpa < 75 || failing > 0) {
            flags.push({ icon: 'trending-down', label: `Failing average (${gpa.toFixed(1)}%)` });
          } else if (hasGradeDrop) {
            flags.push({ icon: 'trending-down', label: `Declining trend (${gpa.toFixed(1)}%)` });
          } else if (gpa < 80) {
            flags.push({ icon: 'trending-down', label: `Borderline GPA (${gpa.toFixed(1)}%)` });
          } else {
            flags.push({ icon: 'trending-down', label: `Passing GPA (${gpa.toFixed(1)}%)` });
          }
        } else {
          flags.push({ icon: 'trending-down', label: 'No recorded grades yet' });
        }

        // 3. Submissions flag
        if (missing > 0) {
          flags.push({ icon: 'document', label: `${missing} missing submission${missing > 1 ? 's' : ''}` });
        } else {
          flags.push({ icon: 'document', label: 'Submissions up to date' });
        }

        return {
          id: `s-${r.student_id}`,
          studentId: r.student_id,
          lrn: r.LRN,
          name: r.full_name,
          grade: gNum,
          section: r.section_name || 'Section 1',
          adviser: r.adviser_name || 'Ms. Bautista',
          schoolYear: schoolYear || '2026-2027',
          term: term || 'Overall',
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
      if (s.riskLevel === 'high') highRisk++;
      else if (s.riskLevel === 'medium') mediumRisk++;
      else if (s.riskLevel === 'low') lowRisk++;
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
      7: { grade: 'Grade 7', high: 0, medium: 0, low: 0 },
      8: { grade: 'Grade 8', high: 0, medium: 0, low: 0 },
      9: { grade: 'Grade 9', high: 0, medium: 0, low: 0 },
      10: { grade: 'Grade 10', high: 0, medium: 0, low: 0 },
    };

    students.forEach((s) => {
      if (s.riskLevel === 'high') highCount++;
      if (s.riskLevel === 'medium') medCount++;
      if (s.riskLevel === 'low') lowCount++;

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

