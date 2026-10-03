const express = require('express');
const router = express.Router();
const db = require('../config/db');

/* ==========================================================================
   CONSTANTS & HELPERS
   ========================================================================== */

const PASSING_GRADE = 75;
const TARGET_GRADE = 80;

const DEFAULT_GRADE_LEVEL_ROWS = [
  { grade_level_id: 7, grade_level_name: 'Grade 7' },
  { grade_level_id: 8, grade_level_name: 'Grade 8' },
  { grade_level_id: 9, grade_level_name: 'Grade 9' },
  { grade_level_id: 10, grade_level_name: 'Grade 10' },
];

const DEFAULT_SCHOOL_YEARS = [
  { id: 'sy-2026-2027', label: 'SY 2026–2027', value: '2026-2027' },
  { id: 'sy-2025-2026', label: 'SY 2025–2026', value: '2025-2026' },
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
  VE: '#64748b',
};

const PALETTE = [
  '#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#64748b',
];

const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
const average = (values) =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

const parseGradeNum = (name, fallback) => {
  const match = String(name || '').match(/\d+/);
  return match ? Number(match[0]) : Number(fallback);
};

/** 'term-1' | 'T1' | '1st' -> 0..2, 'overall' -> null */
const termIndexOf = (term) => {
  const str = String(term || '').toLowerCase();
  if (!str || str === 'overall') return null;
  const match = str.match(/[1-3]/);
  return match ? Number(match[0]) - 1 : null;
};

const statusFor = (averageGrade, passRate, hasData) => {
  if (!hasData) return 'No data';
  if (averageGrade < PASSING_GRADE || passRate < PASSING_GRADE) return 'Needs attention';
  if (averageGrade < TARGET_GRADE) return 'Monitor';
  return 'On track';
};

/** DepEd descriptor bands collapsed into the four UI bands. */
const bandFor = (grade) => {
  if (grade >= 90) return 'outstanding';
  if (grade >= 85) return 'verySatisfactory';
  if (grade >= 80) return 'satisfactory';
  return 'needsAttention';
};

const schoolYearLabel = (schoolYear) => {
  const [start = '2026', end = '2027'] = String(schoolYear).split('-');
  return { id: `sy-${schoolYear}`, label: `SY ${start}–${end}`, value: schoolYear };
};

const safeQuery = async (sql, params = [], label = 'query') => {
  try {
    const [rows] = await db.execute(sql, params);
    return rows;
  } catch (err) {
    console.warn(`[principalPerformance] ${label} failed:`, err.message);
    return [];
  }
};

/* ==========================================================================
   DATA LOADERS
   ========================================================================== */

/** SCHOOL_YEAR.starts_on may be an integer year (2026) or a DATE. */
const toYear = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value > 1000 && value < 10000 ? value : null;
  const str = String(value).trim();
  if (/^\d{4}$/.test(str)) return Number(str);
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
};

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
  return years.length ? years : DEFAULT_SCHOOL_YEARS;
}

async function loadGradeLevels() {
  const rows = await safeQuery(
    `SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC`,
    [],
    'grade levels'
  );
  return (rows.length ? rows : DEFAULT_GRADE_LEVEL_ROWS).map((gl) => {
    const gradeLevel = parseGradeNum(gl.grade_level_name, gl.grade_level_id);
    const name = String(gl.grade_level_name || '').trim();
    return {
      gradeLevelId: gl.grade_level_id,
      gradeLevel,
      label: !name || /^g\s*\d+$/i.test(name) ? `Grade ${gradeLevel}` : name,
    };
  });
}

async function loadSections() {
  const rows = await safeQuery(
    `SELECT sec.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name,
            COUNT(DISTINCT ss.student_id) AS learners
       FROM SECTION sec
       LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       LEFT JOIN STUDENT_SECTION ss ON ss.section_id = sec.section_id
      GROUP BY sec.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name
      ORDER BY sec.grade_level_id ASC, sec.section_name ASC`,
    [],
    'sections'
  );
  return rows.map((sec) => {
    const gradeLevel = parseGradeNum(sec.grade_level_name, sec.grade_level_id);
    return {
      sectionId: sec.section_id,
      section: sec.section_name,
      gradeLevel,
      label: `G${gradeLevel}–${sec.section_name}`,
      enrolled: Number(sec.learners || 0),
    };
  });
}

async function loadSubjects() {
  const rows = await safeQuery(
    `SELECT subject_id, subject_name, subject_code FROM SUBJECT ORDER BY subject_id ASC`,
    [],
    'subjects'
  );
  return rows.map((s, index) => {
    const code = String(s.subject_code || s.subject_name.substring(0, 4)).toUpperCase();
    return {
      subjectId: s.subject_id,
      id: `${String(s.subject_name).toLowerCase().replace(/[^a-z0-9]/g, '_')}_${s.subject_id}`,
      code,
      label: s.subject_name,
      color: SUBJECT_COLORS[code] || PALETTE[index % PALETTE.length],
    };
  });
}

/**
 * Raw grade rows for a school year. Each row is one STUDENT_GRADE record
 * (one student × offering × term × optional MAPEH component).
 */
async function loadGradeRecords(schoolYear) {
  const startYear = parseInt(String(schoolYear).split('-')[0], 10);
  const sql = `
    SELECT sg.student_id, sg.term,
           COALESCE(sg.quarterly_grade, sg.initial_grade) AS grade,
           so.subject_offering_id, so.subject_id,
           sec.section_id, sec.grade_level_id, gl.grade_level_name,
           sy.starts_on
      FROM STUDENT_GRADE sg
      JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
      JOIN SECTION sec ON sec.section_id = so.section_id
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
     WHERE COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL`;
  const rows = await safeQuery(sql, [], 'grade records');
  return rows
    .filter((r) => !Number.isInteger(startYear) || toYear(r.starts_on) === startYear)
    .map((r) => ({
      studentId: r.student_id,
      termIndex: termIndexOf(r.term),
      grade: Number(r.grade),
      offeringId: r.subject_offering_id,
      subjectId: r.subject_id,
      sectionId: r.section_id,
      gradeLevel: parseGradeNum(r.grade_level_name, r.grade_level_id),
    }))
    .filter((r) => Number.isFinite(r.grade) && r.grade > 0);
}

/**
 * Collapse raw rows into one grade per student × offering for the selected
 * term (or the mean across terms for "overall"). MAPEH components are
 * averaged together.
 */
function collapseEntries(records, termIndex, gradeLevelFilter = null) {
  const map = new Map();
  records.forEach((r) => {
    if (termIndex !== null && r.termIndex !== termIndex) return;
    if (gradeLevelFilter !== null && r.gradeLevel !== gradeLevelFilter) return;
    const key = `${r.studentId}|${r.offeringId}`;
    const entry = map.get(key) || { ...r, grades: [] };
    entry.grades.push(r.grade);
    map.set(key, entry);
  });
  return Array.from(map.values()).map((e) => ({
    studentId: e.studentId,
    offeringId: e.offeringId,
    subjectId: e.subjectId,
    sectionId: e.sectionId,
    gradeLevel: e.gradeLevel,
    grade: average(e.grades),
  }));
}

/** General average per student (within a section). */
function studentGeneralAverages(entries) {
  const map = new Map();
  entries.forEach((e) => {
    const key = `${e.studentId}|${e.sectionId}`;
    const s = map.get(key) || {
      studentId: e.studentId,
      sectionId: e.sectionId,
      gradeLevel: e.gradeLevel,
      grades: [],
    };
    s.grades.push(e.grade);
    map.set(key, s);
  });
  return Array.from(map.values()).map((s) => ({ ...s, average: average(s.grades) }));
}

function summarizeStudents(students) {
  const total = students.length;
  const passing = students.filter((s) => s.average >= PASSING_GRADE).length;
  const avg = average(students.map((s) => s.average));
  return {
    total,
    passing,
    failing: total - passing,
    averageGrade: round1(avg),
    passRate: total ? round1((passing / total) * 100) : 0,
    failRate: total ? round1(((total - passing) / total) * 100) : 0,
  };
}

/* ==========================================================================
   AGGREGATORS
   ========================================================================== */

function buildGradeLevelStats(gradeLevelCatalog, sections, students) {
  return gradeLevelCatalog.map((gl) => {
    const group = students.filter((s) => s.gradeLevel === gl.gradeLevel);
    const stats = summarizeStudents(group);
    const enrolled = sections
      .filter((sec) => sec.gradeLevel === gl.gradeLevel)
      .reduce((sum, sec) => sum + sec.enrolled, 0);
    const hasData = stats.total > 0;
    return {
      id: `grade-${gl.gradeLevel}`,
      gradeLevel: gl.gradeLevel,
      label: gl.label,
      shortLabel: `G${gl.gradeLevel}`,
      learners: Math.max(enrolled, stats.total),
      gradedLearners: stats.total,
      averageGrade: stats.averageGrade,
      passRate: stats.passRate,
      failRate: stats.failRate,
      status: statusFor(stats.averageGrade, stats.passRate, hasData),
    };
  });
}

function buildSectionStats(sections, students) {
  return sections.map((sec) => {
    const group = students.filter((s) => s.sectionId === sec.sectionId);
    const stats = summarizeStudents(group);
    const hasData = stats.total > 0;
    const distribution = { needsAttention: 0, satisfactory: 0, verySatisfactory: 0, outstanding: 0 };
    group.forEach((s) => {
      distribution[bandFor(s.average)] += 1;
    });
    Object.keys(distribution).forEach((k) => {
      distribution[k] = hasData ? round1((distribution[k] / stats.total) * 100) : 0;
    });
    return {
      id: `sec-${sec.sectionId}`,
      sectionId: `sec-${sec.sectionId}`,
      rawSectionId: sec.sectionId,
      label: sec.label,
      section: sec.section,
      gradeLevel: sec.gradeLevel,
      learners: Math.max(sec.enrolled, stats.total),
      averageGrade: stats.averageGrade,
      passRate: stats.passRate,
      failRate: stats.failRate,
      status: statusFor(stats.averageGrade, stats.passRate, hasData),
      distribution,
    };
  });
}

function buildSubjectStats(subjects, sections, entries) {
  const sectionLabel = new Map(sections.map((s) => [s.sectionId, s.label]));
  return subjects.map((subj) => {
    const group = entries.filter((e) => e.subjectId === subj.subjectId);
    const hasData = group.length > 0;
    const passing = group.filter((e) => e.grade >= PASSING_GRADE).length;
    const averageGrade = round1(average(group.map((e) => e.grade)));
    const passRate = hasData ? round1((passing / group.length) * 100) : 0;

    const bySection = new Map();
    group.forEach((e) => {
      const list = bySection.get(e.sectionId) || [];
      list.push(e.grade);
      bySection.set(e.sectionId, list);
    });
    const sectionAverages = Array.from(bySection.entries())
      .map(([sectionId, grades]) => ({
        section: { code: sectionLabel.get(sectionId) || `Section ${sectionId}` },
        averageGrade: round1(average(grades)),
      }))
      .sort((a, b) => b.averageGrade - a.averageGrade);

    return {
      id: subj.id,
      code: subj.code,
      label: subj.label,
      color: subj.color,
      averageGrade,
      passRate,
      failRate: hasData ? round1(100 - passRate) : 0,
      learners: new Set(group.map((e) => e.studentId)).size,
      status: statusFor(averageGrade, passRate, hasData),
      highestSection: sectionAverages[0] || null,
      lowestSection: sectionAverages.length > 1 ? sectionAverages[sectionAverages.length - 1] : null,
    };
  });
}

const withData = (items) => items.filter((i) => i.status !== 'No data');
const lowestOf = (items) => {
  const ranked = withData(items).sort((a, b) => a.averageGrade - b.averageGrade);
  return ranked[0] ? { label: ranked[0].label, averageGrade: ranked[0].averageGrade } : null;
};
const highestOf = (items) => {
  const ranked = withData(items).sort((a, b) => b.averageGrade - a.averageGrade);
  return ranked[0] ? { label: ranked[0].label, averageGrade: ranked[0].averageGrade } : null;
};

/* ==========================================================================
   1. GET /api/principal/performance/grade-levels
   ========================================================================== */
router.get('/grade-levels', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027' } = req.query;
    const [catalog, sections, records, availableSchoolYears] = await Promise.all([
      loadGradeLevels(),
      loadSections(),
      loadGradeRecords(schoolYear),
      loadAvailableSchoolYears(),
    ]);

    const students = studentGeneralAverages(collapseEntries(records, termIndexOf(term)));
    const gradeLevels = buildGradeLevelStats(catalog, sections, students);
    const overall = summarizeStudents(students);

    res.json({
      term,
      schoolYear: schoolYearLabel(schoolYear),
      gradeLevels,
      summary: {
        averageGrade: overall.averageGrade,
        passRate: overall.passRate,
        failRate: overall.failRate,
        totalLearners: overall.total,
        passingLearners: overall.passing,
        failingLearners: overall.failing,
        passingGradeLevels: gradeLevels.filter((g) => g.status === 'On track').length,
        totalGradeLevels: gradeLevels.length,
        needsAttention: gradeLevels.filter((g) => g.status === 'Needs attention' || g.status === 'Monitor').length,
      },
      availableSchoolYears,
      availableGradeLevels: catalog.map((g) => g.gradeLevel),
    });
  } catch (err) {
    console.error('Error in grade-levels route:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   2. GET /api/principal/performance/sections
   ========================================================================== */
router.get('/sections', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;
    const glFilter = gradeLevel && gradeLevel !== 'all' ? Number(gradeLevel) : null;

    const [catalog, allSections, records, availableSchoolYears] = await Promise.all([
      loadGradeLevels(),
      loadSections(),
      loadGradeRecords(schoolYear),
      loadAvailableSchoolYears(),
    ]);

    const sections = glFilter === null ? allSections : allSections.filter((s) => s.gradeLevel === glFilter);
    const students = studentGeneralAverages(collapseEntries(records, termIndexOf(term), glFilter));
    const sectionStats = buildSectionStats(sections, students);
    const overall = summarizeStudents(students);

    const bandCounts = { needsAttention: 0, satisfactory: 0, verySatisfactory: 0, outstanding: 0 };
    withData(sectionStats).forEach((s) => {
      bandCounts[bandFor(s.averageGrade)] += 1;
    });

    res.json({
      term,
      gradeLevel,
      schoolYear: schoolYearLabel(schoolYear),
      sections: sectionStats,
      bands: [
        { id: 'needs-attention', label: 'Needs Attention', count: bandCounts.needsAttention },
        { id: 'satisfactory', label: 'Satisfactory', count: bandCounts.satisfactory },
        { id: 'very-satisfactory', label: 'Very Satisfactory', count: bandCounts.verySatisfactory },
        { id: 'outstanding', label: 'Outstanding', count: bandCounts.outstanding },
      ],
      summary: {
        averageGrade: overall.averageGrade,
        passRate: overall.passRate,
        failRate: overall.failRate,
        totalLearners: overall.total,
        passingLearners: overall.passing,
        failingLearners: overall.failing,
        needsAttention: sectionStats.filter((s) => s.status === 'Needs attention').length,
      },
      availableSchoolYears,
      availableGradeLevels: catalog.map((g) => g.gradeLevel),
    });
  } catch (err) {
    console.error('Error in sections route:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   3. GET /api/principal/performance/subjects
   ========================================================================== */
router.get('/subjects', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;
    const glFilter = gradeLevel && gradeLevel !== 'all' ? Number(gradeLevel) : null;

    const [catalog, sections, subjects, records, availableSchoolYears] = await Promise.all([
      loadGradeLevels(),
      loadSections(),
      loadSubjects(),
      loadGradeRecords(schoolYear),
      loadAvailableSchoolYears(),
    ]);

    const entries = collapseEntries(records, termIndexOf(term), glFilter);
    const subjectStats = buildSubjectStats(subjects, sections, entries);

    res.json({
      term,
      gradeLevel,
      schoolYear: schoolYearLabel(schoolYear),
      subjects: subjectStats,
      summary: {
        totalSubjects: subjectStats.length,
        topSubject: highestOf(subjectStats),
        lowestSubject: lowestOf(subjectStats),
        belowTarget: withData(subjectStats).filter((s) => s.averageGrade < TARGET_GRADE).length,
      },
      availableSchoolYears,
      availableGradeLevels: catalog.map((g) => g.gradeLevel),
    });
  } catch (err) {
    console.error('Error in subjects route:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   4. GET /api/principal/performance/teachers
   ========================================================================== */
router.get('/teachers', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;
    const glFilter = gradeLevel && gradeLevel !== 'all' ? Number(gradeLevel) : null;
    const termIndex = termIndexOf(term);

    const [catalog, assignmentRows, records, availableSchoolYears] = await Promise.all([
      loadGradeLevels(),
      safeQuery(
        `SELECT u.user_id, u.first_name, u.last_name,
                so.subject_offering_id,
                s.subject_name, s.subject_code,
                sec.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name
           FROM TEACHER_ASSIGNMENT ta
           JOIN USER u ON u.user_id = ta.user_id
           LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
           LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
           LEFT JOIN SECTION sec ON sec.section_id = so.section_id
           LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
          ORDER BY u.last_name ASC, u.first_name ASC`,
        [],
        'teacher assignments'
      ),
      loadGradeRecords(schoolYear),
      loadAvailableSchoolYears(),
    ]);

    const selectedStartYear = parseInt(String(schoolYear).split('-')[0], 10);
    const sheetRows = (
      await safeQuery(
        `SELECT gs.subject_offering_id, gs.workflow_status,
                COALESCE(at.term_name, CONCAT('T', gs.term_id)) AS term,
                COALESCE(sy_term.starts_on, sy_off.starts_on) AS starts_on
           FROM GRADE_SHEET gs
           LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
           LEFT JOIN SCHOOL_YEAR sy_term ON sy_term.school_year_id = at.school_year_id
           LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
           LEFT JOIN SCHOOL_YEAR sy_off ON sy_off.school_year_id = so.school_year_id`,
        [],
        'grade sheets'
      )
    ).filter(
      (s) => !Number.isInteger(selectedStartYear) || toYear(s.starts_on) === selectedStartYear
    );

    // Build teacher map
    const teacherMap = new Map();
    assignmentRows.forEach((r) => {
      const gl = parseGradeNum(r.grade_level_name, r.grade_level_id);
      if (glFilter !== null && r.section_id && gl !== glFilter) return;
      const teacher = teacherMap.get(r.user_id) || {
        id: `teacher-${r.user_id}`,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unnamed teacher',
        subjects: new Set(),
        subjectCodes: new Set(),
        assignments: [],
        offeringIds: new Set(),
      };
      if (r.subject_name) teacher.subjects.add(r.subject_name);
      if (r.subject_code) teacher.subjectCodes.add(String(r.subject_code).toUpperCase());
      if (r.section_name) {
        const label = `G${gl}–${r.section_name}`;
        if (!teacher.assignments.includes(label)) teacher.assignments.push(label);
      }
      if (r.subject_offering_id) teacher.offeringIds.add(r.subject_offering_id);
      teacherMap.set(r.user_id, teacher);
    });

    const scopedRecords = glFilter === null ? records : records.filter((r) => r.gradeLevel === glFilter);
    const selectedEntries = collapseEntries(scopedRecords, termIndex);
    const termEntries = [0, 1, 2].map((idx) => collapseEntries(scopedRecords, idx));

    let totalGraded = 0;
    let totalFailing = 0;
    let submittedReports = 0;

    const teachers = Array.from(teacherMap.values()).map((t, index) => {
      const mine = selectedEntries.filter((e) => t.offeringIds.has(e.offeringId));
      const hasData = mine.length > 0;
      const failing = mine.filter((e) => e.grade < PASSING_GRADE).length;
      totalGraded += mine.length;
      totalFailing += failing;

      const averageGrade = round1(average(mine.map((e) => e.grade)));
      const passRate = hasData ? round1(((mine.length - failing) / mine.length) * 100) : 0;
      const termAverages = termEntries.map((list) =>
        round1(average(list.filter((e) => t.offeringIds.has(e.offeringId)).map((e) => e.grade)))
      );

      const sheets = sheetRows.filter(
        (s) =>
          t.offeringIds.has(s.subject_offering_id) &&
          (termIndex === null || termIndexOf(s.term) === termIndex)
      );
      const submitted = sheets.filter((s) => String(s.workflow_status).toUpperCase() === 'SUBMITTED').length;
      submittedReports += submitted;
      const expected = Math.max(sheets.length, t.offeringIds.size * (termIndex === null ? 3 : 1));
      const completion = expected ? Math.min(100, Math.round((submitted / expected) * 100)) : 0;

      const subjectList = Array.from(t.subjects);
      return {
        id: t.id,
        name: t.name,
        subject: subjectList.join(', ') || '—',
        subjectCode: Array.from(t.subjectCodes).join(', ') || 'SUBJ',
        assignments: t.assignments,
        status: completion >= 100 ? 'Submitted' : 'Pending',
        completion,
        averageGrade,
        passRate,
        color: PALETTE[index % PALETTE.length],
        learnerCount: new Set(mine.map((e) => e.studentId)).size,
        termAverages,
        progress: { completed: submitted, total: expected },
        hasGrades: hasData,
      };
    });

    res.json({
      term,
      gradeLevel,
      schoolYear: schoolYearLabel(schoolYear),
      teachers,
      summary: {
        totalTeachers: teachers.length,
        submittedReports,
        failRate: totalGraded ? round1((totalFailing / totalGraded) * 100) : 0,
        needsAttention: teachers.filter(
          (t) => t.status !== 'Submitted' || (t.hasGrades && t.averageGrade < TARGET_GRADE)
        ).length,
      },
      availableSchoolYears,
      availableGradeLevels: catalog.map((g) => g.gradeLevel),
    });
  } catch (err) {
    console.error('Error in teachers route:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   5. GET /api/principal/performance/lowest-performers
   ========================================================================== */
router.get('/lowest-performers', async (req, res) => {
  try {
    const { term = 'overall', schoolYear = '2026-2027', gradeLevel = 'all' } = req.query;
    const glFilter = gradeLevel && gradeLevel !== 'all' ? Number(gradeLevel) : null;

    const [catalog, allSections, subjects, records, availableSchoolYears] = await Promise.all([
      loadGradeLevels(),
      loadSections(),
      loadSubjects(),
      loadGradeRecords(schoolYear),
      loadAvailableSchoolYears(),
    ]);

    const entries = collapseEntries(records, termIndexOf(term), glFilter);
    const students = studentGeneralAverages(entries);
    const gradeCatalog = glFilter === null ? catalog : catalog.filter((g) => g.gradeLevel === glFilter);
    const sections = glFilter === null ? allSections : allSections.filter((s) => s.gradeLevel === glFilter);

    // Lowest first; entities without grades go last.
    const ascending = (a, b) => {
      const aNo = a.status === 'No data';
      const bNo = b.status === 'No data';
      if (aNo !== bNo) return aNo ? 1 : -1;
      return a.averageGrade - b.averageGrade;
    };

    const gradeLevels = buildGradeLevelStats(gradeCatalog, sections, students).sort(ascending);
    const sectionStats = buildSectionStats(sections, students).sort(ascending);
    const subjectStats = buildSubjectStats(subjects, sections, entries).sort(ascending);

    res.json({
      term,
      gradeLevel,
      schoolYear: schoolYearLabel(schoolYear),
      gradeLevels,
      sections: sectionStats,
      subjects: subjectStats,
      summary: {
        lowestGradeLevel: lowestOf(gradeLevels),
        lowestSection: lowestOf(sectionStats),
        lowestSubject: lowestOf(subjectStats),
        atRiskStudents: new Set(
          students.filter((s) => s.average < PASSING_GRADE).map((s) => s.studentId)
        ).size,
      },
      availableSchoolYears,
      availableGradeLevels: catalog.map((g) => g.gradeLevel),
    });
  } catch (err) {
    console.error('Error in lowest-performers route:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
