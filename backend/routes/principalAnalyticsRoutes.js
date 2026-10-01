const express = require('express');
const router = express.Router();
const db = require('../config/db');

const DEFAULT_SUBJECTS = [
  { id: 'filipino', code: 'FIL', label: 'Filipino', color: '#8b5cf6' },
  { id: 'english', code: 'ENG', label: 'English', color: '#2563eb' },
  { id: 'mathematics', code: 'MATH', label: 'Mathematics', color: '#ef4444' },
  { id: 'science', code: 'SCI', label: 'Science', color: '#10b981' },
  { id: 'ap', code: 'AP', label: 'Araling Panlipunan', color: '#6366f1' },
  { id: 'tle', code: 'TLE', label: 'TLE', color: '#f59e0b' },
  { id: 'mapeh', code: 'MAPEH', label: 'MAPEH', color: '#ec4899' },
  { id: 'esp', code: 'ESP', label: 'ESP', color: '#64748b' },
];

const SUBJECT_COLORS = {
  FIL: '#8b5cf6',
  ENG: '#2563eb',
  MATH: '#ef4444',
  SCI: '#10b981',
  AP: '#6366f1',
  TLE: '#f59e0b',
  MAPEH: '#ec4899',
  ESP: '#64748b',
};

const round = (val) => Math.round(Number(val || 0) * 10) / 10;
const average = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/**
 * Normalizes term string ('T1', 'term-1', 'Quarter 1', 1) to standard index (0, 1, 2)
 */
function normalizeTermIndex(term) {
  const str = String(term || 'overall').toLowerCase();
  if (str.includes('1') || str.includes('t1') || str.includes('first')) return 0;
  if (str.includes('2') || str.includes('t2') || str.includes('second')) return 1;
  if (str.includes('3') || str.includes('t3') || str.includes('third')) return 2;
  return -1; // Overall
}

/**
 * GET /api/principal/analytics/options
 */
router.get('/options', async (req, res) => {
  try {
    let schoolYears = [];
    let gradeLevels = [];

    try {
      const [syRows] = await db.execute(
        `SELECT school_year_id, starts_on, ends_on, status 
         FROM SCHOOL_YEAR 
         ORDER BY starts_on DESC`
      );
      schoolYears = syRows.map((sy) => {
        const startYear = new Date(sy.starts_on).getFullYear();
        const endYear = new Date(sy.ends_on).getFullYear();
        const val = `${startYear}-${endYear}`;
        return {
          id: `sy-${val}`,
          label: `SY ${startYear}–${endYear}`,
          value: val,
          school_year_id: sy.school_year_id,
        };
      });
    } catch (e) {
      console.warn('Could not query SCHOOL_YEAR table:', e.message);
    }

    try {
      const [glRows] = await db.execute(
        `SELECT grade_level_id, grade_level_name 
         FROM GRADE_LEVEL 
         ORDER BY grade_level_id ASC`
      );
      gradeLevels = glRows.map((gl) => {
        const numMatch = gl.grade_level_name.match(/\d+/);
        const num = numMatch ? Number(numMatch[0]) : gl.grade_level_id;
        return {
          id: `g${num}`,
          label: gl.grade_level_name,
          value: String(num),
          grade_level_id: gl.grade_level_id,
        };
      });
    } catch (e) {
      console.warn('Could not query GRADE_LEVEL table:', e.message);
    }

    res.json({
      schoolYears: schoolYears.length
        ? schoolYears
        : [
            { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
            { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
            { id: 'sy-2024-2025', label: 'SY 2024–2025', value: '2024-2025' },
          ],
      gradeLevels: gradeLevels.length
        ? gradeLevels
        : [
            { id: 'g7', label: 'Grade 7', value: '7' },
            { id: 'g8', label: 'Grade 8', value: '8' },
            { id: 'g9', label: 'Grade 9', value: '9' },
            { id: 'g10', label: 'Grade 10', value: '10' },
          ],
    });
  } catch (err) {
    console.error('Error fetching analytics options:', err);
    res.json({
      schoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      gradeLevels: [
        { id: 'g7', label: 'Grade 7', value: '7' },
        { id: 'g8', label: 'Grade 8', value: '8' },
        { id: 'g9', label: 'Grade 9', value: '9' },
        { id: 'g10', label: 'Grade 10', value: '10' },
      ],
    });
  }
});

/**
 * Helper to aggregate subject analytics from the database
 */
async function querySubjectAnalytics({ schoolYearValue, gradeLevelValue }) {
  const subjectMap = new Map();

  // Initialize with standard default subjects
  DEFAULT_SUBJECTS.forEach((subj) => {
    subjectMap.set(subj.code, {
      id: subj.id,
      code: subj.code,
      label: subj.label,
      color: subj.color,
      learnerCount: 0,
      t1Grades: [],
      t2Grades: [],
      t3Grades: [],
    });
  });

  try {
    // 1. Try querying real subjects from DB
    const [dbSubjects] = await db.execute(
      `SELECT subject_id, subject_name, subject_code 
       FROM SUBJECT 
       ORDER BY subject_id ASC`
    ).catch(() => [[]]);

    dbSubjects.forEach((subj) => {
      const code = (subj.subject_code || subj.subject_name.substring(0, 4)).toUpperCase();
      const id = subj.subject_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (!subjectMap.has(code)) {
        subjectMap.set(code, {
          id,
          code,
          label: subj.subject_name,
          color: SUBJECT_COLORS[code] || '#2563eb',
          learnerCount: 0,
          t1Grades: [],
          t2Grades: [],
          t3Grades: [],
        });
      }
    });

    // 2. Query StudentGrades with joins
    let sql = `
      SELECT 
        s.subject_id,
        s.subject_name,
        s.subject_code,
        sg.term,
        sg.quarterly_grade,
        sg.initial_grade,
        COUNT(DISTINCT sg.student_id) as total_students
      FROM SUBJECT s
      JOIN SUBJECT_OFFERING so ON so.subject_id = s.subject_id
      JOIN SECTION sec ON sec.section_id = so.section_id
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN STUDENT_GRADE sg ON sg.subject_offering_id = so.subject_offering_id
      WHERE 1=1
    `;
    const params = [];

    if (gradeLevelValue && gradeLevelValue !== 'all') {
      sql += ` AND (gl.grade_level_name LIKE ? OR sec.grade_level_id = ?)`;
      params.push(`%${gradeLevelValue}%`, Number(gradeLevelValue));
    }

    sql += ` GROUP BY s.subject_id, s.subject_name, s.subject_code, sg.term, sg.quarterly_grade, sg.initial_grade`;

    const [gradeRows] = await db.execute(sql, params).catch(() => [[]]);

    gradeRows.forEach((row) => {
      const code = (row.subject_code || row.subject_name?.substring(0, 4) || '').toUpperCase();
      const entry = subjectMap.get(code);
      if (!entry) return;

      const grade = Number(row.quarterly_grade || row.initial_grade || 0);
      const termCode = String(row.term || '').toUpperCase();

      if (grade > 0) {
        if (termCode.includes('1') || termCode.includes('T1')) {
          entry.t1Grades.push(grade);
        } else if (termCode.includes('2') || termCode.includes('T2')) {
          entry.t2Grades.push(grade);
        } else if (termCode.includes('3') || termCode.includes('T3')) {
          entry.t3Grades.push(grade);
        }
      }
      if (row.total_students) {
        entry.learnerCount = Math.max(entry.learnerCount, Number(row.total_students));
      }
    });
  } catch (err) {
    console.warn('Database query fallback in querySubjectAnalytics:', err.message);
  }

  // Format into final structure
  return Array.from(subjectMap.values()).map((s) => {
    const avgT1 = round(average(s.t1Grades));
    const avgT2 = round(average(s.t2Grades));
    const avgT3 = round(average(s.t3Grades));

    const passT1 = s.t1Grades.length ? round((s.t1Grades.filter((g) => g >= 75).length / s.t1Grades.length) * 100) : 0;
    const passT2 = s.t2Grades.length ? round((s.t2Grades.filter((g) => g >= 75).length / s.t2Grades.length) * 100) : 0;
    const passT3 = s.t3Grades.length ? round((s.t3Grades.filter((g) => g >= 75).length / s.t3Grades.length) * 100) : 0;

    return {
      id: s.id,
      code: s.code,
      label: s.label,
      color: s.color,
      learnerCount: s.learnerCount || 0,
      termAverages: [avgT1, avgT2, avgT3],
      termPassRates: [passT1, passT2, passT3],
    };
  });
}

/**
 * GET /api/principal/analytics/subject-trend
 */
router.get('/subject-trend', async (req, res) => {
  try {
    const { schoolYear = '2026-2027', gradeLevel = 'all', term = 'overall' } = req.query;

    const subjects = await querySubjectAnalytics({
      schoolYearValue: schoolYear,
      gradeLevelValue: gradeLevel,
    });

    const schoolWideAverages = [0, 1, 2].map((idx) => {
      const vals = subjects.map((s) => s.termAverages[idx]).filter((v) => v > 0);
      return vals.length ? round(average(vals)) : 0;
    });

    const totalLearners = subjects.reduce((sum, s) => sum + s.learnerCount, 0);

    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      schoolYear: {
        id: `sy-${schoolYear}`,
        label: `SY ${startYear}–${endYear}`,
        value: schoolYear,
      },
      gradeLevel,
      term,
      subjects,
      schoolWideAverages,
      totalLearners,
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
        { id: 'sy-2024-2025', label: 'SY 2024–2025', value: '2024-2025' },
      ],
      availableGradeLevels: [
        { id: 'g-all', label: 'All Grade Levels', value: 'all' },
        { id: 'g-7', label: 'Grade 7', value: '7' },
        { id: 'g-8', label: 'Grade 8', value: '8' },
        { id: 'g-9', label: 'Grade 9', value: '9' },
        { id: 'g-10', label: 'Grade 10', value: '10' },
      ],
    });
  } catch (err) {
    console.error('Error in subject-trend route:', err);
    res.json({
      schoolYear: { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
      gradeLevel: 'all',
      term: 'overall',
      subjects: DEFAULT_SUBJECTS.map((s) => ({
        ...s,
        learnerCount: 0,
        termAverages: [0, 0, 0],
        termPassRates: [0, 0, 0],
      })),
      schoolWideAverages: [0, 0, 0],
      totalLearners: 0,
      availableSchoolYears: [{ id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' }],
      availableGradeLevels: [{ id: 'g-all', label: 'All Grade Levels', value: 'all' }],
    });
  }
});

/**
 * GET /api/principal/analytics/historical-comparison
 */
router.get('/historical-comparison', async (req, res) => {
  try {
    const {
      primarySchoolYear = '2026-2027',
      comparisonSchoolYear = '2025-2026',
      term = 'overall',
    } = req.query;

    const [primarySubjects, comparisonSubjects] = await Promise.all([
      querySubjectAnalytics({ schoolYearValue: primarySchoolYear, gradeLevelValue: 'all' }),
      querySubjectAnalytics({ schoolYearValue: comparisonSchoolYear, gradeLevelValue: 'all' }),
    ]);

    const termIdx = normalizeTermIndex(term);
    const getAvg = (s) => (termIdx === -1 ? average(s.termAverages) : s.termAverages[termIdx] || 0);

    const primaryMap = new Map(primarySubjects.map((s) => [s.id, s]));
    const comparisonMap = new Map(comparisonSubjects.map((s) => [s.id, s]));

    const allSubjectIds = Array.from(new Set([...primaryMap.keys(), ...comparisonMap.keys()]));

    const comparedSubjects = allSubjectIds.map((id) => {
      const p = primaryMap.get(id) || { label: id, color: '#2563eb', code: id };
      const c = comparisonMap.get(id) || { label: id, color: '#2563eb', code: id };

      const primaryAverage = round(p.termAverages ? getAvg(p) : 0);
      const comparisonAverage = round(c.termAverages ? getAvg(c) : 0);
      const difference = round(primaryAverage - comparisonAverage);

      return {
        id,
        code: p.code || c.code,
        label: p.label || c.label,
        color: p.color || c.color,
        primaryAverage,
        comparisonAverage,
        difference,
        improved: difference >= 0,
      };
    });

    const primaryOverallAverage = round(
      average(comparedSubjects.map((s) => s.primaryAverage).filter((v) => v > 0))
    );
    const comparisonOverallAverage = round(
      average(comparedSubjects.map((s) => s.comparisonAverage).filter((v) => v > 0))
    );
    const overallDifference = round(primaryOverallAverage - comparisonOverallAverage);

    const startP = primarySchoolYear.split('-')[0] || '2026';
    const endP = primarySchoolYear.split('-')[1] || '2027';
    const startC = comparisonSchoolYear.split('-')[0] || '2025';
    const endC = comparisonSchoolYear.split('-')[1] || '2026';

    res.json({
      primarySchoolYear: {
        id: `sy-${primarySchoolYear}`,
        label: `SY ${startP}–${endP}`,
        value: primarySchoolYear,
      },
      comparisonSchoolYear: {
        id: `sy-${comparisonSchoolYear}`,
        label: `SY ${startC}–${endC}`,
        value: comparisonSchoolYear,
      },
      term,
      subjects: comparedSubjects,
      primaryOverallAverage,
      comparisonOverallAverage,
      overallDifference,
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
        { id: 'sy-2024-2025', label: 'SY 2024–2025', value: '2024-2025' },
      ],
    });
  } catch (err) {
    console.error('Error in historical-comparison route:', err);
    res.json({
      primarySchoolYear: { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
      comparisonSchoolYear: { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      term: 'overall',
      subjects: DEFAULT_SUBJECTS.map((s) => ({
        ...s,
        primaryAverage: 0,
        comparisonAverage: 0,
        difference: 0,
        improved: true,
      })),
      primaryOverallAverage: 0,
      comparisonOverallAverage: 0,
      overallDifference: 0,
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
    });
  }
});

module.exports = router;
