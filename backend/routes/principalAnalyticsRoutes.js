const express = require('express');
const router = express.Router();
const db = require('../config/db');

/* ==========================================================================
   CONSTANTS & HELPERS
   ========================================================================== */

const SUBJECT_COLORS = {
  FIL: '#8b5cf6',
  ENG: '#2563eb',
  MATH: '#ef4444',
  SCI: '#10b981',
  AP: '#6366f1',
  TLE: '#f59e0b',
  MAPEH: '#ec4899',
  ESP: '#64748b',
  VE: '#64748b',
};

const PALETTE = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#64748b',
];

const round = (val) => Math.round(Number(val || 0) * 10) / 10;
const average = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const parseGradeNum = (name, fallback) => {
  const match = String(name || '').match(/\d+/);
  return match ? Number(match[0]) : Number(fallback);
};

const toYear = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value > 1000 && value < 10000 ? value : null;
  const str = String(value).trim();
  if (/^\d{4}$/.test(str)) return Number(str);
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
};

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

const schoolYearLabel = (schoolYear) => {
  const [start = '2026', end = '2027'] = String(schoolYear).split('-');
  return { id: `sy-${schoolYear}`, label: `SY ${start}–${end}`, value: schoolYear };
};

const safeQuery = async (sql, params = [], label = 'query') => {
  try {
    const [rows] = await db.execute(sql, params);
    return rows;
  } catch (err) {
    console.warn(`[principalAnalytics] ${label} failed:`, err.message);
    throw err;
  }
};

/* ==========================================================================
   METADATA LOADERS
   ========================================================================== */

async function loadAvailableSchoolYears() {
  const rows = await safeQuery(
    `SELECT starts_on, ends_on FROM SCHOOL_YEAR ORDER BY starts_on DESC`,
    [],
    'school years'
  );
  const seen = new Set();
  const years = [];
  rows.forEach((row) => {
    const start = toYear(row.starts_on);
    const end = toYear(row.ends_on);
    if (!start || !end) return;
    const value = `${start}-${end}`;
    if (seen.has(value)) return;
    seen.add(value);
    years.push({ id: `sy-${value}`, label: `SY ${start}–${end}`, value });
  });
  return years;
}

async function loadGradeLevels() {
  const rows = await safeQuery(
    `SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC`,
    [],
    'grade levels'
  );
  return rows.map((gl) => {
    const num = parseGradeNum(gl.grade_level_name, gl.grade_level_id);
    return {
      id: `g-${num}`,
      label: `Grade ${num}`,
      value: String(num),
    };
  });
}

/**
 * Aggregates multi-term subject performance from STUDENT_GRADE and joins.
 */
async function querySubjectAnalytics({ schoolYearValue, gradeLevelValue, includeUnrated = false }) {
  const startYear = parseInt(String(schoolYearValue || '2026').split('-')[0], 10);
  const glFilter = gradeLevelValue && gradeLevelValue !== 'all' ? Number(gradeLevelValue) : null;

  // 1. Fetch Subject Catalog
  const dbSubjects = await safeQuery(
    `SELECT subject_id, subject_name, subject_code FROM SUBJECT ORDER BY subject_id ASC`,
    [],
    'subjects'
  );

  const subjectMap = new Map();
  dbSubjects.forEach((s, idx) => {
    const code = (s.subject_code || s.subject_name.substring(0, 4)).toUpperCase();
    const id = s.subject_name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    subjectMap.set(s.subject_id, {
      subjectId: s.subject_id,
      id,
      code,
      label: s.subject_name,
      color: SUBJECT_COLORS[code] || PALETTE[idx % PALETTE.length],
      t1Grades: [],
      t2Grades: [],
      t3Grades: [],
      studentIds: new Set(),
    });
  });

  // 2. Fetch Grades with joins
  const sql = `
    SELECT 
      s.subject_id,
      sec.grade_level_id,
      gl.grade_level_name,
      sy.starts_on,
      sg.term,
      sg.student_id,
      COALESCE(sg.quarterly_grade, sg.initial_grade) AS grade
    FROM STUDENT_GRADE sg
    JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
    JOIN SUBJECT s ON s.subject_id = so.subject_id
    JOIN SECTION sec ON sec.section_id = so.section_id
    LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
    WHERE COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL
  `;
  const gradeRows = await safeQuery(sql, [], 'grade analytics query');

  const allActiveStudentIds = new Set();

  gradeRows.forEach((r) => {
    if (Number.isInteger(startYear) && toYear(r.starts_on) !== startYear) return;
    const glNum = parseGradeNum(r.grade_level_name, r.grade_level_id);
    if (glFilter !== null && glNum !== glFilter) return;

    const entry = subjectMap.get(r.subject_id);
    if (!entry) return;

    const grade = Number(r.grade);
    if (!Number.isFinite(grade) || grade < 0) return;

    entry.studentIds.add(r.student_id);
    allActiveStudentIds.add(r.student_id);

    const termIdx = normalizeTermIndex(r.term);
    if (termIdx === 0) entry.t1Grades.push(grade);
    else if (termIdx === 1) entry.t2Grades.push(grade);
    else if (termIdx === 2) entry.t3Grades.push(grade);
  });

  // Catalog rows are configuration, not evidence that a term has grades.
  const subjects = Array.from(subjectMap.values()).map(subject => {
    const grades = [subject.t1Grades, subject.t2Grades, subject.t3Grades];
    return {
      id: subject.id, code: subject.code, label: subject.label, color: subject.color,
      learnerCount: subject.studentIds.size,
      termAverages: grades.map(values => round(average(values))),
      termPassRates: grades.map(values => values.length ? round(values.filter(grade => grade >= 75).length / values.length * 100) : 0),
      termGradeCounts: grades.map(values => values.length),
    };
  }).filter(subject => includeUnrated || subject.termGradeCounts.some(count => count > 0));
  const schoolWideGradeCounts = [0, 1, 2].map(index => subjects.reduce((total, subject) => total + subject.termGradeCounts[index], 0));
  const schoolWideAverages = [0, 1, 2].map(index => {
    const values = subjects.filter(subject => subject.termGradeCounts[index] > 0).map(subject => subject.termAverages[index]);
    return round(average(values));
  });
  return { subjects, totalLearners: allActiveStudentIds.size, schoolWideAverages, schoolWideGradeCounts };
}

/* ==========================================================================
   ROUTES
   ========================================================================== */

/**
 * GET /api/principal/analytics/options
 */
router.get('/options', async (req, res) => {
  try {
    const [schoolYears, gradeLevels] = await Promise.all([
      loadAvailableSchoolYears(),
      loadGradeLevels(),
    ]);

    res.json({
      recordsVersion: 2,
      schoolYears,
      gradeLevels: [
        { id: 'g-all', label: 'All Grade Levels', value: 'all' },
        ...gradeLevels,
      ],
    });
  } catch (err) {
    console.error('Error fetching analytics options:', err);
    res.status(500).json({ error: 'Unable to load Principal analytics. Please retry.' });
  }
});

/**
 * GET /api/principal/analytics/subject-trend
 */
router.get('/subject-trend', async (req, res) => {
  try {
    const { schoolYear = '2026-2027', gradeLevel = 'all', term = 'overall' } = req.query;

    const [analytics, availableSchoolYears, dbGradeLevels] = await Promise.all([
      querySubjectAnalytics({
        schoolYearValue: schoolYear,
        gradeLevelValue: gradeLevel,
        includeUnrated: req.query.includeUnrated === "true",
      }),
      loadAvailableSchoolYears(),
      loadGradeLevels(),
    ]);

    res.json({
      recordsVersion: 2,
      schoolYear: schoolYearLabel(schoolYear),
      gradeLevel,
      term,
      subjects: analytics.subjects,
      schoolWideAverages: analytics.schoolWideAverages,
      schoolWideGradeCounts: analytics.schoolWideGradeCounts,
      totalLearners: analytics.totalLearners,
      availableSchoolYears,
      availableGradeLevels: [
        { id: 'g-all', label: 'All Grade Levels', value: 'all' },
        ...dbGradeLevels,
      ],
    });
  } catch (err) {
    console.error('Error in subject-trend route:', err);
    res.status(500).json({ error: 'Unable to load Principal analytics. Please retry.' });
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

    const [primaryData, comparisonData, availableSchoolYears] = await Promise.all([
      querySubjectAnalytics({ schoolYearValue: primarySchoolYear, gradeLevelValue: 'all' }),
      querySubjectAnalytics({ schoolYearValue: comparisonSchoolYear, gradeLevelValue: 'all' }),
      loadAvailableSchoolYears(),
    ]);

    const termIdx = normalizeTermIndex(term);
    const hasGrades = counts => termIdx === -1 ? counts.some(count => count > 0) : counts[termIdx] > 0;
    const periodAverage = (values, counts) => termIdx === -1
      ? round(average(values.filter((_, index) => counts[index] > 0))) : values[termIdx] || 0;

    const comparisonMap = new Map(comparisonData.subjects.map((s) => [s.id, s]));

    const primaryMap = new Map(primaryData.subjects.map(subject => [subject.id, subject]));
    const catalog = new Map([...primaryData.subjects, ...comparisonData.subjects].map(subject => [subject.id, subject]));
    const comparedSubjects = Array.from(catalog.values()).map((subject) => {
      const p = primaryMap.get(subject.id) || { ...subject, learnerCount: 0, termAverages: [0, 0, 0], termPassRates: [0, 0, 0], termGradeCounts: [0, 0, 0] };
      const c = comparisonMap.get(p.id) || {
        termAverages: [0, 0, 0],
        termPassRates: [0, 0, 0],
        termGradeCounts: [0, 0, 0],
      };

      const hasPrimaryData = hasGrades(p.termGradeCounts);
      const hasComparisonData = hasGrades(c.termGradeCounts);
      const canCompare = hasPrimaryData && hasComparisonData;
      const primaryAverage = periodAverage(p.termAverages, p.termGradeCounts);
      const comparisonAverage = periodAverage(c.termAverages, c.termGradeCounts);
      const difference = canCompare ? round(primaryAverage - comparisonAverage) : null;
      const passRate = periodAverage(p.termPassRates, p.termGradeCounts);

      let status = hasPrimaryData ? 'On track' : 'No data';
      if (hasPrimaryData && (primaryAverage < 75 || (canCompare && difference <= -3))) status = 'Needs attention';
      else if (hasPrimaryData && (primaryAverage < 80 || (canCompare && difference < -1))) status = 'Monitor';

      return {
        id: p.id,
        code: p.code,
        label: p.label,
        color: p.color,
        learnerCount: p.learnerCount,
        primaryAverage,
        comparisonAverage,
        difference,
        passRate,
        status,
        improved: canCompare ? difference >= 0 : null,
        hasPrimaryData, hasComparisonData,
        primaryTermGradeCounts: p.termGradeCounts,
        comparisonTermGradeCounts: c.termGradeCounts,
        primaryTermAverages: p.termAverages,
        comparisonTermAverages: c.termAverages,
        primaryTermPassRates: p.termPassRates,
        comparisonTermPassRates: c.termPassRates,
      };
    });

    const primaryOverallAverage = round(
      average(comparedSubjects.filter(s => s.hasPrimaryData).map(s => s.primaryAverage))
    );
    const comparisonOverallAverage = round(
      average(comparedSubjects.filter(s => s.hasComparisonData).map(s => s.comparisonAverage))
    );
    const hasPrimaryData = comparedSubjects.some(subject => subject.hasPrimaryData);
    const hasComparisonData = comparedSubjects.some(subject => subject.hasComparisonData);
    const overallDifference = hasPrimaryData && hasComparisonData ? round(primaryOverallAverage - comparisonOverallAverage) : null;

    res.json({
      recordsVersion: 2,
      primarySchoolYear: schoolYearLabel(primarySchoolYear),
      comparisonSchoolYear: schoolYearLabel(comparisonSchoolYear),
      term,
      totalStudents: primaryData.totalLearners,
      subjects: comparedSubjects,
      primaryTrend: primaryData.schoolWideAverages,
      primaryTrendGradeCounts: primaryData.schoolWideGradeCounts,
      comparisonTrendGradeCounts: comparisonData.schoolWideGradeCounts,
      hasPrimaryData, hasComparisonData,
      comparisonTrend: comparisonData.schoolWideAverages,
      primaryOverallAverage,
      comparisonOverallAverage,
      overallDifference,
      availableSchoolYears,
    });
  } catch (err) {
    console.error('Error in historical-comparison route:', err);
    res.status(500).json({ error: 'Unable to load Principal analytics. Please retry.' });
  }
});

module.exports = router;
