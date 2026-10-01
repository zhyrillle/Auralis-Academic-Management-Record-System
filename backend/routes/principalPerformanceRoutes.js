const express = require('express');
const router = express.Router();
const db = require('../config/db');

const DEFAULT_GRADE_LEVELS = [
  { id: 'grade-7', gradeLevel: 7, label: 'Grade 7', shortLabel: 'G7', learners: 0, averageGrade: 0, passRate: 0, status: 'On track' },
  { id: 'grade-8', gradeLevel: 8, label: 'Grade 8', shortLabel: 'G8', learners: 0, averageGrade: 0, passRate: 0, status: 'On track' },
  { id: 'grade-9', gradeLevel: 9, label: 'Grade 9', shortLabel: 'G9', learners: 0, averageGrade: 0, passRate: 0, status: 'On track' },
  { id: 'grade-10', gradeLevel: 10, label: 'Grade 10', shortLabel: 'G10', learners: 0, averageGrade: 0, passRate: 0, status: 'On track' },
];

/**
 * 1. GET /api/principal/performance/grade-levels
 */
router.get('/grade-levels', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027' } = req.query;

    const [glRows] = await db.execute(
      `SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC`
    ).catch(() => [[]]);

    let gradeLevels = DEFAULT_GRADE_LEVELS;

    if (glRows.length > 0) {
      gradeLevels = glRows.map((gl) => {
        const numMatch = gl.grade_level_name.match(/\d+/);
        const num = numMatch ? Number(numMatch[0]) : gl.grade_level_id;
        return {
          id: `grade-${num}`,
          gradeLevel: num,
          label: gl.grade_level_name,
          shortLabel: `G${num}`,
          learners: 0,
          averageGrade: 0,
          passRate: 0,
          status: 'On track',
        };
      });
    }

    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      term,
      schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
      gradeLevels,
      summary: {
        averageGrade: 0,
        passRate: 0,
        failRate: 0,
        totalLearners: 0,
        passingLearners: 0,
        failingLearners: 0,
        passingGradeLevels: 0,
        totalGradeLevels: gradeLevels.length,
      },
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      availableGradeLevels: [7, 8, 9, 10],
    });
  } catch (err) {
    console.error('Error in grade-levels route:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. GET /api/principal/performance/sections
 */
router.get('/sections', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;

    let sql = `
      SELECT 
        sec.section_id,
        sec.section_name,
        sec.grade_level_id,
        gl.grade_level_name,
        COUNT(DISTINCT ss.student_id) as learners
      FROM SECTION sec
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN STUDENT_SECTION ss ON ss.section_id = sec.section_id
      WHERE 1=1
    `;
    const params = [];

    if (gradeLevel && gradeLevel !== 'all') {
      sql += ` AND (gl.grade_level_name LIKE ? OR sec.grade_level_id = ?)`;
      params.push(`%${gradeLevel}%`, Number(gradeLevel));
    }

    sql += ` GROUP BY sec.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name ORDER BY sec.grade_level_id ASC, sec.section_name ASC`;

    const [secRows] = await db.execute(sql, params).catch(() => [[]]);

    const sections = secRows.map((sec) => {
      const numMatch = (sec.grade_level_name || '').match(/\d+/);
      const glNum = numMatch ? Number(numMatch[0]) : sec.grade_level_id;
      return {
        id: `sec-${sec.section_id}`,
        sectionId: `sec-${sec.section_id}`,
        label: `G${glNum}–${sec.section_name}`,
        section: sec.section_name,
        gradeLevel: glNum,
        learners: Number(sec.learners || 0),
        averageGrade: 0,
        passRate: 0,
        status: 'On track',
        distribution: {
          needsAttention: 0,
          satisfactory: 0,
          verySatisfactory: 0,
          outstanding: 0,
        },
      };
    });

    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      term,
      gradeLevel,
      schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
      sections,
      bands: [
        { id: 'needs-attention', label: 'Needs Attention', count: 0 },
        { id: 'satisfactory', label: 'Satisfactory', count: 0 },
        { id: 'very-satisfactory', label: 'Very Satisfactory', count: 0 },
        { id: 'outstanding', label: 'Outstanding', count: 0 },
      ],
      summary: {
        averageGrade: 0,
        passRate: 0,
        failRate: 0,
        totalLearners: 0,
        passingLearners: 0,
        failingLearners: 0,
        needsAttention: 0,
      },
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      availableGradeLevels: [7, 8, 9, 10],
    });
  } catch (err) {
    console.error('Error in sections route:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. GET /api/principal/performance/subjects
 */
router.get('/subjects', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;

    const [subjRows] = await db.execute(
      `SELECT subject_id, subject_name, subject_code FROM SUBJECT ORDER BY subject_id ASC`
    ).catch(() => [[]]);

    const subjects = subjRows.map((s) => ({
      id: s.subject_name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      code: (s.subject_code || s.subject_name.substring(0, 4)).toUpperCase(),
      label: s.subject_name,
      color: '#2563eb',
      averageGrade: 0,
      passRate: 0,
      learners: 0,
      status: 'On track',
      highestSection: null,
      lowestSection: null,
    }));

    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      term,
      gradeLevel,
      schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
      subjects,
      summary: {
        totalSubjects: subjects.length,
        topSubject: null,
        lowestSubject: null,
        belowTarget: 0,
      },
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      availableGradeLevels: [7, 8, 9, 10],
    });
  } catch (err) {
    console.error('Error in subjects route:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. GET /api/principal/performance/teachers
 */
router.get('/teachers', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;

    const [teacherRows] = await db.execute(
      `SELECT 
         u.user_id,
         CONCAT(u.first_name, ' ', u.last_name) as name,
         s.subject_name,
         s.subject_code,
         sec.section_name,
         gl.grade_level_name
       FROM USER u
       JOIN TEACHER_ASSIGNMENT ta ON ta.user_id = u.user_id
       JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
       JOIN SUBJECT s ON s.subject_id = so.subject_id
       JOIN SECTION sec ON sec.section_id = so.section_id
       LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       WHERE LOWER(u.role) = 'teacher' OR LOWER(u.role) = 'adviser'
       ORDER BY u.last_name ASC`
    ).catch(() => [[]]);

    const teacherMap = new Map();
    teacherRows.forEach((r) => {
      const current = teacherMap.get(r.user_id) || {
        id: `teacher-${r.user_id}`,
        name: r.name,
        subject: r.subject_name,
        subjectCode: r.subject_code || 'SUBJ',
        assignments: [],
        status: 'Submitted',
        completion: 0,
        averageGrade: 0,
        passRate: 0,
        color: '#2563eb',
        learnerCount: 0,
        termAverages: [0, 0, 0],
        progress: { completed: 0, total: 0 },
        sectionIds: [],
      };
      if (r.section_name && !current.assignments.includes(r.section_name)) {
        current.assignments.push(r.section_name);
        current.progress.total += 1;
      }
      teacherMap.set(r.user_id, current);
    });

    const teachers = Array.from(teacherMap.values());

    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      term,
      gradeLevel,
      schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
      teachers,
      summary: {
        totalTeachers: teachers.length,
        submittedReports: 0,
        failRate: 0,
        needsAttention: 0,
      },
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      availableGradeLevels: [7, 8, 9, 10],
    });
  } catch (err) {
    console.error('Error in teachers route:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. GET /api/principal/performance/lowest-performers
 */
router.get('/lowest-performers', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027' } = req.query;
    const startYear = schoolYear.split('-')[0] || '2026';
    const endYear = schoolYear.split('-')[1] || '2027';

    res.json({
      term,
      schoolYear: { id: `sy-${schoolYear}`, label: `SY ${startYear}–${endYear}`, value: schoolYear },
      gradeLevels: [],
      sections: [],
      subjects: [],
      summary: {
        lowestGradeLevel: null,
        lowestSection: null,
        lowestSubject: null,
        atRiskStudents: 0,
      },
      availableSchoolYears: [
        { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
        { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
      ],
      availableGradeLevels: [7, 8, 9, 10],
    });
  } catch (err) {
    console.error('Error in lowest-performers route:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
