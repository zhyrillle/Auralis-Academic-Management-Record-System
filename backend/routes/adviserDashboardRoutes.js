const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { calculateStudentGrades, TRANSMUTATION_TABLE, weightsFromRows } = require('../utils/depedTransmutation');

/**
 * Normalizes term string ('T1', 'term-1', 'Quarter 1', 1) to standard term code ('T1', 'T2', 'T3')
 */
function normalizeTerm(term) {
  const str = String(term || 'T1').toUpperCase();
  if (str.includes('1')) return 'T1';
  if (str.includes('2')) return 'T2';
  if (str.includes('3')) return 'T3';
  return 'T1';
}

/**
 * Check whether a given user is assigned as a section adviser in SECTION_ADVISER_ASSIGNMENT
 */
async function checkIsAdviser(userId) {
  if (!userId) return false;
  const [rows] = await db.execute(
    'SELECT 1 FROM SECTION_ADVISER_ASSIGNMENT WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows.length > 0;
}

/**
 * Resolves the currently active academic term from ACADEMIC_TERM
 */
async function resolveCurrentActiveTerm() {
  try {
    const [rows] = await db.execute(
      `SELECT term_id, school_year_id, term_name, starts_at, ends_at, status
       FROM ACADEMIC_TERM
       WHERE (LOWER(status) = 'ongoing' OR LOWER(status) = 'open')
          OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND CURRENT_TIMESTAMP() BETWEEN starts_at AND ends_at)
       ORDER BY (LOWER(status) = 'ongoing') DESC, term_id DESC
       LIMIT 1`
    );
    if (rows.length > 0) {
      const t = rows[0];
      const code = normalizeTerm(t.term_name);
      return { termId: t.term_id, termCode: code, termName: t.term_name };
    }
    return { termId: 1, termCode: 'T1', termName: '1st' };
  } catch (err) {
    console.warn('Error resolving current active term:', err.message);
    return { termId: 1, termCode: 'T1', termName: '1st' };
  }
}

/**
 * Helper to fetch assigned classes and sections for a teacher/adviser
 */
async function getTeacherClasses(userId) {
  // 1. Teaching assignments
  const [teachingRows] = await db.execute(
    `SELECT DISTINCT
       ta.teacher_assignment_id,
       so.subject_offering_id,
       so.subject_id,
       sec.section_id,
       so.school_year_id,
       sec.section_name,
       sec.program_id,
       p.program_code,
       p.program_name,
       COALESCE(p.is_specialized, 0) AS is_specialized,
       gl.grade_level_id,
       gl.grade_level_name,
       s.subject_name,
       s.subject_code,
       'Regular Class' AS class_type
     FROM TEACHER_ASSIGNMENT ta
     INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
     INNER JOIN SECTION sec ON sec.section_id = so.section_id
     LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
     INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
     INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
     WHERE ta.user_id = ?
     ORDER BY gl.grade_level_id ASC, sec.section_name ASC`,
    [userId]
  ).catch((err) => {
    console.warn('Error querying teaching assignments:', err.message);
    return [[]];
  });

  // 2. Adviser assignments
  const [advisoryRows] = await db.execute(
    `SELECT DISTINCT
       saa.adviser_assignment_id,
       sec.section_id,
       saa.school_year_id,
       sec.section_name,
       sec.program_id,
       p.program_code,
       p.program_name,
       COALESCE(p.is_specialized, 0) AS is_specialized,
       gl.grade_level_id,
       gl.grade_level_name,
       'Advisory Class' AS class_type
     FROM SECTION_ADVISER_ASSIGNMENT saa
     INNER JOIN SECTION sec ON sec.section_id = saa.section_id
     LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
     INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
     WHERE saa.user_id = ?
     ORDER BY gl.grade_level_id ASC, sec.section_name ASC`,
    [userId]
  ).catch((err) => {
    console.warn('Error querying adviser assignments:', err.message);
    return [[]];
  });

  return { teachingRows, advisoryRows };
}

/**
 * Shared helper to get fully populated assigned classes array for a teacher
 */
async function getTeacherAssignedClasses(userId) {
  const { teachingRows, advisoryRows } = await getTeacherClasses(userId);
  const classMap = new Map();

  // Add advisory sections
  advisoryRows.forEach((row) => {
    const key = `sec-${row.section_id}`;
    const progCode = row.program_code && String(row.program_code).toUpperCase() !== 'EBEC' ? String(row.program_code).toUpperCase() : null;
    const isSpec = Boolean(row.is_specialized);
    const displayClassType = isSpec && progCode
      ? `Advisory Class - ${progCode}`
      : 'Advisory Class';

    classMap.set(key, {
      id: key,
      section_id: row.section_id,
      section: row.section_name,
      sectionName: row.section_name,
      gradeLevel: row.grade_level_name,
      subject: 'Advisory Class',
      subject_id: null,
      subject_offering_id: null,
      isAdviser: true,
      assignmentType: 'advisory',
      assignmentId: row.adviser_assignment_id,
      adviser_assignment_id: row.adviser_assignment_id,
      program_id: row.program_id || null,
      program_code: row.program_code || null,
      program_name: row.program_name || null,
      classType: displayClassType,
      is_specialized: isSpec ? 1 : 0,
      studentCount: 0,
      entryProgress: 0,
      status: 'In Progress',
      subject_offering_ids: [],
    });
  });

  // Add or merge teaching sections
  teachingRows.forEach((row) => {
    const key = `sec-${row.section_id}`;
    const progCode = row.program_code && String(row.program_code).toUpperCase() !== 'EBEC' ? String(row.program_code).toUpperCase() : null;
    const isSpec = Boolean(row.is_specialized);
    const displayClassType = isSpec && progCode
      ? `Special Program - ${progCode}`
      : isSpec
      ? 'Special Program'
      : 'Regular Class';

    if (classMap.has(key)) {
      const existing = classMap.get(key);
      existing.subject = row.subject_name || existing.subject;
      existing.subject_id = row.subject_id || existing.subject_id;
      existing.subject_offering_id = row.subject_offering_id || existing.subject_offering_id;
      existing.teacher_assignment_id = row.teacher_assignment_id;
      if (!existing.assignmentId) {
        existing.assignmentId = row.teacher_assignment_id;
        existing.assignmentType = 'teaching';
      }
      existing.subject_offering_ids.push(row.subject_offering_id);
    } else {
      classMap.set(key, {
        id: key,
        section_id: row.section_id,
        section: row.section_name,
        sectionName: row.section_name,
        gradeLevel: row.grade_level_name,
        subject: row.subject_name || 'General Subject',
        subject_id: row.subject_id,
        subject_offering_id: row.subject_offering_id,
        isAdviser: false,
        assignmentType: 'teaching',
        assignmentId: row.teacher_assignment_id,
        teacher_assignment_id: row.teacher_assignment_id,
        program_id: row.program_id || null,
        program_code: row.program_code || null,
        program_name: row.program_name || null,
        classType: displayClassType,
        is_specialized: isSpec ? 1 : 0,
        studentCount: 0,
        entryProgress: 0,
        status: 'In Progress',
        subject_offering_ids: [row.subject_offering_id],
      });
    }
  });

  const classes = Array.from(classMap.values());

  for (const cls of classes) {
    // 1. Direct enrollee count in this section
    const [sCount] = await db.execute(
      `SELECT COUNT(DISTINCT ss.student_id) AS student_count
       FROM STUDENT_SECTION ss
       INNER JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)`,
      [cls.section_id]
    ).catch(() => [[{ student_count: 0 }]]);
    cls.studentCount = Number(sCount[0]?.student_count || 0);

    // 2. Grade entry progress & workflow status
    if (cls.subject_offering_ids.length > 0) {
      const placeholders = cls.subject_offering_ids.map(() => '?').join(',');

      const [sheetStatus] = await db.execute(
        `SELECT workflow_status, lock_status
         FROM GRADE_SHEET
         WHERE subject_offering_id IN (${placeholders})
         ORDER BY grade_sheet_id DESC
         LIMIT 1`,
        cls.subject_offering_ids
      ).catch(() => [[]]);

      const [gradeCount] = await db.execute(
        `SELECT COUNT(DISTINCT student_id) AS graded_count
         FROM STUDENT_GRADE
         WHERE subject_offering_id IN (${placeholders})
           AND COALESCE(quarterly_grade, initial_grade) IS NOT NULL`,
        cls.subject_offering_ids
      ).catch(() => [[{ graded_count: 0 }]]);

      const graded = Number(gradeCount[0]?.graded_count || 0);
      const s = sheetStatus[0] || null;

      if (s && (s.workflow_status === 'SUBMITTED' || s.lock_status === 'TERM_LOCKED')) {
        cls.status = 'Submitted';
        cls.entryProgress = 100;
      } else if (graded > 0 && cls.studentCount > 0) {
        cls.entryProgress = Math.min(100, Math.round((graded / cls.studentCount) * 100));
        cls.status = cls.entryProgress >= 100 ? 'Submitted' : 'In Progress';
      } else {
        // Fallback: check draft encoding progress from SCORE table for active activities
        const [scoreStats] = await db.execute(
          `SELECT
             COUNT(DISTINCT sc.student_section_id) AS scored_students,
             COUNT(sc.score_id) AS encoded_scores,
             COUNT(DISTINCT ga.activity_id) AS total_activities
           FROM GRADE_SHEET gs
           JOIN GRADE_ACTIVITY ga ON ga.grade_sheet_id = gs.grade_sheet_id
           LEFT JOIN SCORE sc ON sc.activity_id = ga.activity_id AND sc.raw_score IS NOT NULL
           WHERE gs.subject_offering_id IN (${placeholders})
             AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
          cls.subject_offering_ids
        ).catch(() => [[{ scored_students: 0, encoded_scores: 0, total_activities: 0 }]]);

        const scoredStudents = Number(scoreStats[0]?.scored_students || 0);
        const encodedScores = Number(scoreStats[0]?.encoded_scores || 0);
        const totalActivities = Number(scoreStats[0]?.total_activities || 0);

        if (totalActivities > 0 && cls.studentCount > 0) {
          const expectedTotal = totalActivities * cls.studentCount;
          const cellProgress = Math.min(100, Math.round((encodedScores / expectedTotal) * 100));
          const studentProgress = Math.min(100, Math.round((scoredStudents / cls.studentCount) * 100));
          cls.entryProgress = Math.max(cellProgress, studentProgress);
        } else if (cls.studentCount > 0 && scoredStudents > 0) {
          cls.entryProgress = Math.min(100, Math.round((scoredStudents / cls.studentCount) * 100));
        } else {
          cls.entryProgress = 0;
        }

        cls.status = cls.entryProgress > 0 ? 'In Progress' : 'Pending';
      }
    } else {
      cls.status = 'In Progress';
      cls.entryProgress = 0;
    }
  }

  return classes;
}

/**
 * GET /api/adviser/dashboard/check-role/:userId
 * Standalone endpoint to verify whether teacher is an Adviser or Pure Subject Teacher
 */
router.get('/check-role/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const isAdviser = await checkIsAdviser(userId);
    res.json({
      userId: Number(userId),
      isAdviser,
      role: isAdviser ? 'adviser' : 'subject teacher',
      displayRole: isAdviser ? 'Adviser' : 'Subject Teacher',
    });
  } catch (err) {
    console.error('Error in check-role endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/summary
 * Retrieves overall KPI counters, section averages, and student counts for the logged-in teacher.
 */
router.get('/summary', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' });
    }

    const isAdviser = await checkIsAdviser(userId);
    const assignedClasses = await getTeacherAssignedClasses(userId);
    const totalClasses = assignedClasses.length;

    // Total Students Counter: Replace mock count with dynamic sum of enrollees across assigned sections
    const totalStudents = assignedClasses.reduce(
      (sum, cls) => sum + (Number(cls.studentCount) || 0),
      0
    );

    // Pending Submissions vs. Submitted Grades:
    // Calculate counts dynamically from the teacher's active assigned classes.
    // Logic: If teacher has 4 assigned classes (2 marked as "Submitted" and 2 as "In Progress"), set Submitted Grades = 2 and Pending Submissions = 2.
    const submittedGrades = assignedClasses.filter(
      (cls) => cls.status === 'Submitted' || cls.entryProgress >= 100
    ).length;
    const pendingSubmissions = Math.max(0, totalClasses - submittedGrades);

    // Calculate grades and section averages from STUDENT_GRADE
    const { teachingRows } = await getTeacherClasses(userId);
    const offeringIds = Array.from(
      new Set(teachingRows.map((r) => r.subject_offering_id).filter(Boolean))
    );

    const activeTermInfo = await resolveCurrentActiveTerm();
    let sectionAverage = 0;
    let sectionAverageDiff = `0% from ${activeTermInfo.termCode}`;
    let lowestPerformingSection = '—';
    let lowestPerformingSectionNote = 'No data';
    let atRiskStudentsCount = 0;
    let atRiskStudentsNote = 'Across assigned classes';
    let entryProgress = 0;

    if (offeringIds.length > 0) {
      const placeholders = offeringIds.map(() => '?').join(',');

      // 1. Overall average from official STUDENT_GRADE
      const [gradeStatsRows] = await db.execute(
        `SELECT
           AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS avg_grade,
           COUNT(DISTINCT sg.student_id) AS graded_students,
           COUNT(*) AS total_encoded_records
         FROM STUDENT_GRADE sg
         WHERE sg.subject_offering_id IN (${placeholders})
           AND COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL`,
        offeringIds
      ).catch(() => [[{ avg_grade: 0, graded_students: 0, total_encoded_records: 0 }]]);

      if (gradeStatsRows[0]?.avg_grade) {
        sectionAverage = Math.round(Number(gradeStatsRows[0].avg_grade) * 10) / 10;
      } else {
        // Fallback: estimate provisional average from SCORE table if in draft
        const [draftStatsRows] = await db.execute(
          `SELECT
             AVG((sc.raw_score / NULLIF(ga.highest_possible_score, 0)) * 100) AS raw_avg
           FROM SCORE sc
           JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
           JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
           WHERE gs.subject_offering_id IN (${placeholders})
             AND sc.raw_score IS NOT NULL
             AND ga.highest_possible_score > 0`,
          offeringIds
        ).catch(() => [[{ raw_avg: null }]]);

        if (draftStatsRows[0]?.raw_avg !== null && draftStatsRows[0]?.raw_avg !== undefined) {
          const rawPct = Number(draftStatsRows[0].raw_avg);
          const estimatedTransmuted = Math.min(100, Math.max(60, 60 + (rawPct * 0.4)));
          sectionAverage = Math.round(estimatedTransmuted * 10) / 10;
        }
      }

      // 2. Average by term to compute diff
      const [termAvgRows] = await db.execute(
        `SELECT
           sg.term,
           AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS term_avg
         FROM STUDENT_GRADE sg
         WHERE sg.subject_offering_id IN (${placeholders})
           AND COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL
         GROUP BY sg.term`,
        offeringIds
      ).catch(() => [[]]);

      const t1Obj = termAvgRows.find((r) => String(r.term).toUpperCase().includes('1'));
      const t2Obj = termAvgRows.find((r) => String(r.term).toUpperCase().includes('2'));
      if (t1Obj && t2Obj) {
        const diff = Math.round((Number(t2Obj.term_avg) - Number(t1Obj.term_avg)) * 10) / 10;
        sectionAverageDiff = `${diff >= 0 ? '+' : ''}${diff}% from T1`;
      } else {
        sectionAverageDiff = `0% from ${activeTermInfo.termCode}`;
      }

      // 3. Lowest performing section
      const [secPerformanceRows] = await db.execute(
        `SELECT
           sec.section_name,
           AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS sec_avg
         FROM STUDENT_GRADE sg
         INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
         INNER JOIN SECTION sec ON sec.section_id = so.section_id
         WHERE sg.subject_offering_id IN (${placeholders})
           AND COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL
         GROUP BY sec.section_id, sec.section_name
         ORDER BY sec_avg ASC
         LIMIT 1`,
        offeringIds
      ).catch(() => [[]]);

      if (secPerformanceRows.length > 0 && secPerformanceRows[0].sec_avg !== null) {
        lowestPerformingSection = secPerformanceRows[0].section_name;
        const avgNum = Math.round(Number(secPerformanceRows[0].sec_avg) * 10) / 10;
        lowestPerformingSectionNote = `${avgNum}% avg`;
      } else {
        // Fallback to draft score average by section
        const [draftSecRows] = await db.execute(
          `SELECT
             sec.section_name,
             AVG((sc.raw_score / NULLIF(ga.highest_possible_score, 0)) * 100) AS raw_sec_avg
           FROM SCORE sc
           JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
           JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
           JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
           JOIN SECTION sec ON sec.section_id = so.section_id
           WHERE gs.subject_offering_id IN (${placeholders})
             AND sc.raw_score IS NOT NULL
             AND ga.highest_possible_score > 0
           GROUP BY sec.section_id, sec.section_name
           ORDER BY raw_sec_avg ASC
           LIMIT 1`,
          offeringIds
        ).catch(() => [[]]);

        if (draftSecRows.length > 0 && draftSecRows[0].raw_sec_avg !== null) {
          lowestPerformingSection = draftSecRows[0].section_name;
          const rawSecPct = Number(draftSecRows[0].raw_sec_avg);
          const estGrade = Math.min(100, Math.max(60, 60 + (rawSecPct * 0.4)));
          const avgNum = Math.round(estGrade * 10) / 10;
          lowestPerformingSectionNote = `${avgNum}% avg`;
        }
      }

      // 4. At-risk students count (students with average grade < 75)
      const [atRiskRows] = await db.execute(
        `SELECT COUNT(DISTINCT sg.student_id) AS at_risk_count
         FROM STUDENT_GRADE sg
         WHERE sg.subject_offering_id IN (${placeholders})
           AND COALESCE(sg.quarterly_grade, sg.initial_grade) < 75`,
        offeringIds
      ).catch(() => [[{ at_risk_count: 0 }]]);

      atRiskStudentsCount = Number(atRiskRows[0]?.at_risk_count || 0);

      if (atRiskStudentsCount === 0) {
        // Check draft scores for any students averaging below 60%
        const [draftAtRiskRows] = await db.execute(
          `SELECT sc.student_section_id
           FROM SCORE sc
           JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
           JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
           WHERE gs.subject_offering_id IN (${placeholders})
             AND sc.raw_score IS NOT NULL
             AND ga.highest_possible_score > 0
           GROUP BY sc.student_section_id
           HAVING AVG((sc.raw_score / ga.highest_possible_score) * 100) < 60`,
          offeringIds
        ).catch(() => [[]]);

        atRiskStudentsCount = (draftAtRiskRows || []).length;
      }
      atRiskStudentsNote = atRiskStudentsCount > 0 ? 'Requires academic support' : 'No students at risk';

      // 5. Entry progress calculation based on active teaching classes
      if (assignedClasses.length > 0) {
        const teachingClasses = assignedClasses.filter(c => c.subject_offering_ids && c.subject_offering_ids.length > 0);
        const targetClasses = teachingClasses.length > 0 ? teachingClasses : assignedClasses;
        const avgProgress =
          targetClasses.reduce((acc, c) => acc + (c.entryProgress || 0), 0) /
          targetClasses.length;
        entryProgress = Math.round(avgProgress);
      }
    } else {
      if (assignedClasses.length > 0) {
        const avgProgress =
          assignedClasses.reduce((acc, c) => acc + (c.entryProgress || 0), 0) /
          assignedClasses.length;
        entryProgress = Math.round(avgProgress);
      }
    }

    res.json({
      isAdviser,
      role: isAdviser ? 'adviser' : 'subject teacher',
      displayRole: isAdviser ? 'Adviser' : 'Subject Teacher',
      activeTerm: activeTermInfo.termCode,
      activeTermName: activeTermInfo.termName,
      sectionAverage: `${sectionAverage}%`,
      sectionAverageDiff,
      lowestPerformingSection,
      lowestPerformingSectionNote,
      atRiskStudentsCount,
      atRiskStudentsNote,
      entryProgress,
      totalClasses,
      totalStudents,
      pendingSubmissions,
      submittedGrades,
    });
  } catch (err) {
    console.error('Error in /summary endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/assigned-classes
 * Retrieves the teacher's assigned classes with progress, student counts, and status.
 */
router.get('/assigned-classes', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const classes = await getTeacherAssignedClasses(userId);
    res.json({ classes });
  } catch (err) {
    console.error('Error in /assigned-classes endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/subject-performance
 * Retrieves vertical bar chart data across sections for a given term.
 */
router.get('/subject-performance', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const term = normalizeTerm(req.query.term);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { teachingRows, advisoryRows } = await getTeacherClasses(userId);
    const allSections = Array.from(
      new Set([
        ...teachingRows.map((r) => JSON.stringify({ id: r.section_id, name: r.section_name })),
        ...advisoryRows.map((r) => JSON.stringify({ id: r.section_id, name: r.section_name })),
      ])
    ).map((s) => JSON.parse(s));

    if (allSections.length === 0) {
      return res.json({ performance: [] });
    }

    const offeringIds = teachingRows.map((r) => r.subject_offering_id).filter(Boolean);
    const performance = [];

    for (const sec of allSections) {
      let score = 0;
      if (offeringIds.length > 0) {
        const placeholders = offeringIds.map(() => '?').join(',');
        const [rows] = await db.execute(
          `SELECT AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS avg_score
           FROM STUDENT_GRADE sg
           INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
           WHERE so.section_id = ?
             AND sg.subject_offering_id IN (${placeholders})
             AND UPPER(sg.term) LIKE ?`,
          [sec.id, ...offeringIds, `%${term}%`]
        ).catch(() => [[{ avg_score: 0 }]]);

        if (rows[0]?.avg_score) {
          score = Math.round(Number(rows[0].avg_score) * 10) / 10;
        } else {
          // Fallback to draft score average from SCORE
          const termNum = term.replace(/[^0-9]/g, '');
          const [draftRows] = await db.execute(
            `SELECT AVG((sc.raw_score / NULLIF(ga.highest_possible_score, 0)) * 100) AS draft_avg
             FROM SCORE sc
             JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
             JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
             JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
             JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
             WHERE so.section_id = ?
               AND gs.subject_offering_id IN (${placeholders})
               AND (UPPER(at.term_name) LIKE ? OR gs.term_id IN (SELECT term_id FROM ACADEMIC_TERM WHERE term_name LIKE ?))
               AND sc.raw_score IS NOT NULL
               AND ga.highest_possible_score > 0`,
            [sec.id, ...offeringIds, `%${termNum}%`, `%${termNum}%`]
          ).catch(() => [[{ draft_avg: null }]]);

          if (draftRows[0]?.draft_avg !== null && draftRows[0]?.draft_avg !== undefined) {
            const rawPct = Number(draftRows[0].draft_avg);
            const estGrade = Math.min(100, Math.max(60, 60 + (rawPct * 0.4)));
            score = Math.round(estGrade * 10) / 10;
          }
        }
      }

      const advisoryMatch = advisoryRows.find((r) => r.section_id === sec.id);
      const teachingMatch = teachingRows.find((r) => r.section_id === sec.id);
      const assignmentType = advisoryMatch ? 'advisory' : 'teaching';
      const assignmentId = advisoryMatch?.adviser_assignment_id || teachingMatch?.teacher_assignment_id || sec.id;

      performance.push({
        section_id: sec.id,
        section: sec.name,
        sectionName: sec.name,
        assignmentId,
        assignmentType,
        adviser_assignment_id: advisoryMatch?.adviser_assignment_id || null,
        teacher_assignment_id: teachingMatch?.teacher_assignment_id || null,
        isAdviser: Boolean(advisoryMatch),
        score,
        isHighlight: false,
      });
    }

    // Highlight highest score
    const maxScore = Math.max(...performance.map((p) => p.score), 0);
    if (maxScore > 0) {
      const topItem = performance.find((p) => p.score === maxScore);
      if (topItem) topItem.isHighlight = true;
    }

    res.json({ performance });
  } catch (err) {
    console.error('Error in /subject-performance endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/grade-distribution
 * Retrieves 5-axis radar data for grade ranges: ["60-74", "90-100", "85-89", "80-84", "75-79"].
 */
router.get('/grade-distribution', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const sectionParam = req.query.section || 'All';
    const term = normalizeTerm(req.query.term);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { teachingRows } = await getTeacherClasses(userId);
    const offeringIds = teachingRows.map((r) => r.subject_offering_id).filter(Boolean);

    if (offeringIds.length === 0) {
      return res.json({ distribution: [0, 0, 0, 0, 0] });
    }

    let sql = `
      SELECT COALESCE(sg.quarterly_grade, sg.initial_grade) AS grade
      FROM STUDENT_GRADE sg
      INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = sg.subject_offering_id
      INNER JOIN SECTION sec ON sec.section_id = so.section_id
      WHERE sg.subject_offering_id IN (${offeringIds.map(() => '?').join(',')})
        AND UPPER(sg.term) LIKE ?
        AND COALESCE(sg.quarterly_grade, sg.initial_grade) IS NOT NULL
    `;
    const params = [...offeringIds, `%${term}%`];

    if (sectionParam && sectionParam !== 'All') {
      sql += ` AND (sec.section_name = ? OR sec.section_id = ?)`;
      params.push(sectionParam, Number(sectionParam) || 0);
    }

    const [rows] = await db.execute(sql, params).catch(() => [[]]);

    let count60_74 = 0;
    let count90_100 = 0;
    let count85_89 = 0;
    let count80_84 = 0;
    let count75_79 = 0;

    rows.forEach((r) => {
      const g = Number(r.grade);
      if (g < 75) count60_74++;
      else if (g >= 90) count90_100++;
      else if (g >= 85) count85_89++;
      else if (g >= 80) count80_84++;
      else if (g >= 75) count75_79++;
    });

    res.json({
      distribution: [count60_74, count90_100, count85_89, count80_84, count75_79],
    });
  } catch (err) {
    console.error('Error in /grade-distribution endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/attendance-trend
 * Retrieves 5-week attendance counts for the wave chart.
 */
router.get('/attendance-trend', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { teachingRows, advisoryRows } = await getTeacherClasses(userId);
    const teacherAssignmentIds = teachingRows.map((r) => r.teacher_assignment_id).filter(Boolean);
    const adviserAssignmentIds = advisoryRows.map((r) => r.adviser_assignment_id).filter(Boolean);

    const trend = [
      { week: 'Week 1', label: 'Week 1', count: 0 },
      { week: 'Week 2', label: 'Week 2', count: 0 },
      { week: 'Week 3', label: 'Week 3', count: 0 },
      { week: 'Week 4', label: 'Week 4', count: 0 },
      { week: 'Week 5', label: 'Week 5', count: 0 },
    ];

    if (teacherAssignmentIds.length > 0 || adviserAssignmentIds.length > 0) {
      let filterClauses = [];
      let params = [];

      if (teacherAssignmentIds.length > 0) {
        filterClauses.push(`ash.teacher_assignment_id IN (${teacherAssignmentIds.map(() => '?').join(',')})`);
        params.push(...teacherAssignmentIds);
      }
      if (adviserAssignmentIds.length > 0) {
        filterClauses.push(`ash.adviser_assignment_id IN (${adviserAssignmentIds.map(() => '?').join(',')})`);
        params.push(...adviserAssignmentIds);
      }

      const [attRows] = await db.execute(
        `SELECT
           ash.attendance_date,
           COUNT(*) AS present_count
         FROM ATTENDANCE att
         INNER JOIN ATTENDANCE_SHEET ash ON ash.attendance_sheet_id = att.attendance_sheet_id
         WHERE (${filterClauses.join(' OR ')})
           AND att.status = 'P'
           AND ash.no_class_reason IS NULL
         GROUP BY ash.attendance_date
         ORDER BY ash.attendance_date ASC
         LIMIT 5`,
        params
      ).catch(() => [[]]);

      attRows.forEach((r, idx) => {
        if (trend[idx]) {
          trend[idx].count = Number(r.present_count || 0);
        }
      });
    }

    res.json({ trend });
  } catch (err) {
    console.error('Error in /attendance-trend endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/test-exam-results
 * Retrieves test distributions (ST1, ST2, TE) and score metrics filtered by section.
 */
router.get('/test-exam-results', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const sectionParam = req.query.section || 'All';
    const termParam = req.query.term || 'T1';

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let sql = `
      SELECT
        sec.section_id,
        sec.section_name,
        ga.activity_name,
        ga.highest_possible_score,
        sc.raw_score,
        gs.term_id,
        at.term_name
      FROM SCORE sc
      JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
      JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
      JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
      JOIN SECTION sec ON sec.section_id = so.section_id
      LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
      WHERE sc.raw_score IS NOT NULL
    `;
    const params = [];

    // Filter by section
    if (sectionParam && sectionParam !== 'All') {
      sql += ` AND (sec.section_name = ? OR sec.section_id = ?)`;
      params.push(sectionParam, Number(sectionParam) || 0);
    } else {
      // All sections where teacher is adviser OR teacher
      sql += ` AND (
        so.section_id IN (SELECT section_id FROM SECTION_ADVISER_ASSIGNMENT WHERE user_id = ?)
        OR so.subject_offering_id IN (SELECT subject_offering_id FROM TEACHER_ASSIGNMENT WHERE user_id = ?)
        OR sc.teacher_assignment_id IN (SELECT teacher_assignment_id FROM TEACHER_ASSIGNMENT WHERE user_id = ?)
      )`;
      params.push(userId, userId, userId);
    }

    // Filter by term if available
    const termNum = termParam.replace(/[^0-9]/g, '');
    if (termNum) {
      sql += ` AND (
        gs.term_id = ?
        OR at.term_name LIKE ?
        OR gs.term_id IN (SELECT term_id FROM ACADEMIC_TERM WHERE term_name LIKE ?)
      )`;
      params.push(Number(termNum), `${termNum}%`, `${termNum}%`);
    }

    const [scoreRows] = await db.execute(sql, params).catch((err) => {
      console.error('Error executing test-exam query:', err);
      return [[]];
    });

    let scoresObj = {
      ST1: { highest: 0, lowest: 0 },
      ST2: { highest: 0, lowest: 0 },
      TE: { highest: 0, lowest: 0 },
    };

    let above75 = [
      { label: 'ST1', count: 0, percent: 0, color: '#162D4D', radius: 40 },
      { label: 'ST2', count: 0, percent: 0, color: '#2E5884', radius: 40 },
      { label: 'TE', count: 0, percent: 0, color: '#5F83AA', radius: 40 },
    ];
    let below75 = [
      { label: 'ST1', count: 0, percent: 0, color: '#162D4D', radius: 40 },
      { label: 'ST2', count: 0, percent: 0, color: '#2E5884', radius: 40 },
      { label: 'TE', count: 0, percent: 0, color: '#5F83AA', radius: 40 },
    ];

    if (scoreRows.length > 0) {
      // Categorize into ST1, ST2, TE
      const st1Rows = scoreRows.filter((r) =>
        /summative test 1|\bst1\b/i.test(r.activity_name || '')
      );
      const st2Rows = scoreRows.filter((r) =>
        /summative test 2|\bst2\b/i.test(r.activity_name || '')
      );
      const teRows = scoreRows.filter((r) =>
        /term exam|quarterly exam|\bte\b/i.test(r.activity_name || '')
      );

      // Helper to compute stats
      const computeStats = (items) => {
        if (!items || items.length === 0) {
          return { highest: 0, lowest: 0, passCount: 0, failCount: 0, total: 0, passPct: 0, failPct: 0 };
        }
        const numeric = items.map((i) => Number(i.raw_score));
        const highest = Math.max(...numeric);
        const lowest = Math.min(...numeric);
        let passCount = 0;
        let failCount = 0;

        items.forEach((item) => {
          const score = Number(item.raw_score);
          const max = Number(item.highest_possible_score) || (highest > 50 ? 100 : highest > 25 ? 50 : 25);
          const pct = (score / max) * 100;
          if (pct >= 75) {
            passCount++;
          } else {
            failCount++;
          }
        });

        const total = passCount + failCount;
        const passPct = total > 0 ? Math.round((passCount / total) * 100) : 0;
        const failPct = total > 0 ? Math.round((failCount / total) * 100) : 0;

        return { highest, lowest, passCount, failCount, total, passPct, failPct };
      };

      const s1 = computeStats(st1Rows);
      const s2 = computeStats(st2Rows);
      const s3 = computeStats(teRows);

      scoresObj = {
        ST1: { highest: s1.highest, lowest: s1.lowest },
        ST2: { highest: s2.highest, lowest: s2.lowest },
        TE: { highest: s3.highest, lowest: s3.lowest },
      };

      above75 = [
        { label: 'ST1', count: s1.passCount, total: s1.total, percent: s1.passPct, color: '#162D4D', radius: Math.max(30, Math.min(100, s1.passPct)) },
        { label: 'ST2', count: s2.passCount, total: s2.total, percent: s2.passPct, color: '#2E5884', radius: Math.max(30, Math.min(100, s2.passPct)) },
        { label: 'TE', count: s3.passCount, total: s3.total, percent: s3.passPct, color: '#5F83AA', radius: Math.max(30, Math.min(100, s3.passPct)) },
      ];

      below75 = [
        { label: 'ST1', count: s1.failCount, total: s1.total, percent: s1.failPct, color: '#162D4D', radius: Math.max(30, Math.min(100, s1.failPct)) },
        { label: 'ST2', count: s2.failCount, total: s2.total, percent: s2.failPct, color: '#2E5884', radius: Math.max(30, Math.min(100, s2.failPct)) },
        { label: 'TE', count: s3.failCount, total: s3.total, percent: s3.failPct, color: '#5F83AA', radius: Math.max(30, Math.min(100, s3.failPct)) },
      ];
    }

    res.json({
      above75,
      below75,
      scores: scoresObj,
    });
  } catch (err) {
    console.error('Error in /test-exam-results endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/subject-area-performance
 * Retrieves horizontal bar breakdown for all subjects taken by the teacher's assigned advisory section.
 */
router.get('/subject-area-performance', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const rawTerm = req.query.term || 'T1';
    const normTerm = normalizeTerm(rawTerm);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // 1. Get adviser's assigned advisory section
    const [advSection] = await db.execute(
      `SELECT saa.section_id, sec.section_name
       FROM SECTION_ADVISER_ASSIGNMENT saa
       JOIN SECTION sec ON sec.section_id = saa.section_id
       WHERE saa.user_id = ?
       LIMIT 1`,
      [userId]
    ).catch(() => [[]]);

    if (!advSection || advSection.length === 0) {
      return res.json({
        sectionName: '',
        advisorySectionName: '',
        subjects: [],
        adviserSectionSubjects: [],
        breakdown: [],
        handledSubjects: [],
      });
    }

    const sectionId = advSection[0].section_id;
    const advisorySectionName = advSection[0].section_name;

    // 2. Query all subjects offered in this advisory section and their class averages for the given term
    const [advRows] = await db.execute(
      `SELECT
         s.subject_name,
         s.subject_code,
         COUNT(DISTINCT st.student_id) AS student_count,
         AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS avg_grade
       FROM SUBJECT_OFFERING so
       JOIN SUBJECT s ON s.subject_id = so.subject_id
       LEFT JOIN STUDENT_SECTION ss ON ss.section_id = so.section_id
       LEFT JOIN STUDENT st ON st.student_id = ss.student_id AND (st.status = 'ACTIVE' OR st.status IS NULL)
       LEFT JOIN STUDENT_GRADE sg ON sg.subject_offering_id = so.subject_offering_id
         AND sg.student_id = st.student_id
         AND (UPPER(sg.term) LIKE ? OR UPPER(sg.term) LIKE ?)
       WHERE so.section_id = ?
       GROUP BY s.subject_id, s.subject_name, s.subject_code
       ORDER BY s.subject_name ASC`,
      [`%${rawTerm}%`, `%${normTerm}%`, sectionId]
    ).catch(() => [[]]);

    const subjects = advRows.map((r) => ({
      subject: r.subject_code || r.subject_name,
      subjectName: r.subject_name,
      count: Number(r.student_count || 0),
      grade: r.avg_grade ? Math.round(Number(r.avg_grade) * 10) / 10 : 0,
    }));

    res.json({
      sectionName: advisorySectionName,
      advisorySectionName,
      subjects,
      adviserSectionSubjects: subjects,
      breakdown: subjects,
      handledSubjects: [],
    });
  } catch (err) {
    console.error('Error in /subject-area-performance endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/core-values
 * Retrieves core values percentages dynamically computed for an Adviser's advisory section.
 */
router.get('/core-values', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const rawTerm = req.query.term || 'T1';
    const normTerm = normalizeTerm(rawTerm);

    let baseValues = {
      maka_diyos: 86,
      makatao: 86,
      makakalikasan: 86,
      makabansa: 86,
    };

    if (userId) {
      // Find adviser's advisory section
      const [advSection] = await db.execute(
        `SELECT saa.section_id, sec.section_name
         FROM SECTION_ADVISER_ASSIGNMENT saa
         JOIN SECTION sec ON sec.section_id = saa.section_id
         WHERE saa.user_id = ?
         LIMIT 1`,
        [userId]
      ).catch(() => [[]]);

      if (advSection && advSection.length > 0) {
        const sectionId = advSection[0].section_id;

        const [grades] = await db.execute(
          `SELECT
             s.subject_code,
             AVG(COALESCE(sg.quarterly_grade, sg.initial_grade)) AS avg_grade
           FROM SUBJECT_OFFERING so
           JOIN SUBJECT s ON s.subject_id = so.subject_id
           JOIN STUDENT_GRADE sg ON sg.subject_offering_id = so.subject_offering_id
           WHERE so.section_id = ?
             AND (UPPER(sg.term) LIKE ? OR UPPER(sg.term) LIKE ?)
           GROUP BY s.subject_code`,
          [sectionId, `%${rawTerm}%`, `%${normTerm}%`]
        ).catch(() => [[]]);

        if (grades && grades.length > 0) {
          const map = {};
          grades.forEach((g) => {
            map[g.subject_code] = Number(g.avg_grade) || 80;
          });
          const allGrades = Object.values(map);
          const gpa = allGrades.reduce((a, b) => a + b, 0) / (allGrades.length || 1);

          baseValues.maka_diyos = Math.round(map['ESP'] || gpa);
          baseValues.makatao = Math.round(0.6 * (map['ESP'] || gpa) + 0.4 * gpa);
          baseValues.makakalikasan = Math.round(0.7 * (map['SCI'] || gpa) + 0.3 * (map['AP'] || gpa));
          baseValues.makabansa = Math.round(0.5 * (map['AP'] || gpa) + 0.5 * (map['FIL'] || gpa));
        } else {
          // If term has no specific grades recorded yet, apply slight deterministic variation
          const offset = rawTerm === 'T2' ? 2 : rawTerm === 'T3' ? 4 : 0;
          baseValues.maka_diyos = Math.min(95, 86 + offset);
          baseValues.makatao = Math.min(96, 88 + offset);
          baseValues.makakalikasan = Math.min(94, 84 + offset);
          baseValues.makabansa = Math.min(95, 87 + offset);
        }
      }
    }

    const values = [
      { key: 'maka_diyos', label: 'Maka-Diyos', percent: baseValues.maka_diyos, color: '#7B661F' },
      { key: 'makatao', label: 'Makatao', percent: baseValues.makatao, color: '#C19B26' },
      { key: 'makakalikasan', label: 'Makakalikasan', percent: baseValues.makakalikasan, color: '#E8B82B' },
      { key: 'makabansa', label: 'Makabansa', percent: baseValues.makabansa, color: '#F6D339' },
    ];

    res.json({ values });
  } catch (err) {
    console.error('Error in /core-values endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/performance-filters
 * Returns terms (1, 2, 3) and distinct subjects handled by teacher / adviser dynamically from MySQL
 */
router.get('/performance-filters', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    let schoolYearId = req.query.schoolYearId;

    const [syRows] = await db.execute(
      `SELECT school_year_id, starts_on, ends_on, status FROM SCHOOL_YEAR ORDER BY starts_on DESC`
    ).catch(() => [[]]);

    const schoolYears = (syRows || []).map((sy) => ({
      school_year_id: String(sy.school_year_id),
      label: `S.Y. ${sy.starts_on}-${sy.ends_on}${sy.status === 'ongoing' ? ' (Active)' : ''}`,
      starts_on: sy.starts_on,
      ends_on: sy.ends_on,
      status: sy.status,
      is_active: sy.status === 'ongoing',
    }));

    // Target school year defaults to the ongoing/active year, or first available
    const activeSy = schoolYears.find((sy) => sy.is_active) || schoolYears[0];
    const targetSyId = schoolYearId && schoolYearId !== 'all' ? schoolYearId : (activeSy ? activeSy.school_year_id : null);

    // Dynamic academic terms for the school year
    let currentTermValue = '1';
    let termOptions = [
      { value: '1', label: 'Term 1', is_active: false, is_current: false },
      { value: '2', label: 'Term 2', is_active: false, is_current: false },
      { value: '3', label: 'Term 3', is_active: false, is_current: false },
    ];

    if (targetSyId) {
      const [termRows] = await db.execute(
        `SELECT term_id, school_year_id, term_name, status FROM ACADEMIC_TERM WHERE school_year_id = ? ORDER BY term_id ASC`,
        [targetSyId]
      ).catch(() => [[]]);

      if (termRows && termRows.length > 0) {
        termOptions = [1, 2, 3].map((pos) => {
          const matched = termRows.find((tr) => {
            const name = String(tr.term_name || '').toLowerCase();
            if (pos === 1) return name.includes('1') || name.startsWith('first') || name.startsWith('1st');
            if (pos === 2) return name.includes('2') || name.startsWith('second') || name.startsWith('2nd');
            if (pos === 3) return name.includes('3') || name.startsWith('third') || name.startsWith('3rd');
            return false;
          });

          const isOngoing = matched?.status === 'ongoing';
          if (isOngoing) {
            currentTermValue = String(pos);
          }

          return {
            value: String(pos),
            label: `Term ${pos}`,
            term_name: matched?.term_name || `${pos}`,
            status: matched?.status || null,
            is_active: isOngoing,
            is_current: isOngoing,
          };
        });

        if (!termOptions.some((t) => t.is_current)) {
          const completedCount = termRows.filter((r) => r.status === 'completed').length;
          if (completedCount > 0 && completedCount < 3) {
            currentTermValue = String(completedCount + 1);
            if (termOptions[completedCount]) {
              termOptions[completedCount].is_current = true;
              termOptions[completedCount].is_active = true;
            }
          } else {
            currentTermValue = '1';
            termOptions[0].is_current = true;
            termOptions[0].is_active = true;
          }
        }
      }
    }

    let subjects = [];
    if (userId) {
      const [taCount] = await db.execute(
        `SELECT COUNT(*) as cnt FROM TEACHER_ASSIGNMENT WHERE user_id = ?`,
        [userId]
      ).catch(() => [[{ cnt: 0 }]]);
      const hasTeachingAssignments = (taCount?.[0]?.cnt || 0) > 0;

      let subjSql = '';
      let subjParams = [];

      if (hasTeachingAssignments) {
        subjSql = `
          SELECT DISTINCT s.subject_id, s.subject_name, s.subject_code
          FROM SUBJECT s
          JOIN SUBJECT_OFFERING so ON so.subject_id = s.subject_id
          JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
          WHERE ta.user_id = ? ${targetSyId && targetSyId !== 'all' ? 'AND so.school_year_id = ?' : ''}
          ORDER BY s.subject_name ASC
        `;
        subjParams = [userId];
        if (targetSyId && targetSyId !== 'all') subjParams.push(targetSyId);
      } else {
        subjSql = `
          SELECT DISTINCT s.subject_id, s.subject_name, s.subject_code
          FROM SUBJECT s
          JOIN SUBJECT_OFFERING so ON so.subject_id = s.subject_id
          JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = so.section_id AND (saa.school_year_id = so.school_year_id OR saa.school_year_id IS NULL)
          WHERE saa.user_id = ? ${targetSyId && targetSyId !== 'all' ? 'AND so.school_year_id = ?' : ''}
          ORDER BY s.subject_name ASC
        `;
        subjParams = [userId];
        if (targetSyId && targetSyId !== 'all') subjParams.push(targetSyId);
      }

      const [rows] = await db.execute(subjSql, subjParams).catch((err) => {
        console.error('Error fetching teacher subjects:', err.message);
        return [[]];
      });

      subjects = (rows || []).map((r) => ({
        subject_id: String(r.subject_id),
        subject_name: r.subject_name,
        subject_code: r.subject_code,
        label: r.subject_code ? `${r.subject_name} (${r.subject_code})` : r.subject_name,
      }));
    }

    res.json({
      schoolYears,
      currentSchoolYearId: activeSy ? activeSy.school_year_id : (schoolYears[0]?.school_year_id || null),
      currentTerm: currentTermValue,
      terms: termOptions,
      subjects,
    });
  } catch (err) {
    console.error('Error in /performance-filters endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/adviser/dashboard/grade-range-report
 * Returns dynamic grade range counts per section based on quarterly_grade in STUDENT_GRADE
 */
router.get('/grade-range-report', async (req, res) => {
  try {
    const userId = req.query.userId || req.headers['x-user-id'];
    const rawTerm = String(req.query.term || '1').trim();
    const subjectId = req.query.subjectId;
    const schoolYearId = req.query.schoolYearId;

    let termCodes = [];
    if (rawTerm === '1' || rawTerm === 'T1' || rawTerm.includes('1')) {
      termCodes = ['T1', '1', '1st Term', 'Term 1', 'Quarter 1', '1st Quarter', 'Q1'];
    } else if (rawTerm === '2' || rawTerm === 'T2' || rawTerm.includes('2')) {
      termCodes = ['T2', '2', '2nd Term', 'Term 2', 'Quarter 2', '2nd Quarter', 'Q2'];
    } else if (rawTerm === '3' || rawTerm === 'T3' || rawTerm.includes('3')) {
      termCodes = ['T3', '3', '3rd Term', 'Term 3', 'Quarter 3', '3rd Quarter', 'Q3'];
    } else {
      termCodes = [rawTerm];
    }

    // Resolve academic term for target school year to find the accurate term_id
    const termPos = parseInt(rawTerm, 10) || 1;
    const termIdNum = termPos;
    let targetTermId = null;
    let targetTermName = null;

    if (schoolYearId && schoolYearId !== 'all') {
      const [termRows] = await db.execute(
        `SELECT term_id, term_name, status FROM ACADEMIC_TERM WHERE school_year_id = ?`,
        [schoolYearId]
      ).catch(() => [[]]);

      const matched = (termRows || []).find((tr) => {
        const name = String(tr.term_name || '').toLowerCase();
        if (termPos === 1) return name.includes('1') || name.startsWith('1st') || name.startsWith('first');
        if (termPos === 2) return name.includes('2') || name.startsWith('2nd') || name.startsWith('second');
        if (termPos === 3) return name.includes('3') || name.startsWith('3rd') || name.startsWith('third');
        return false;
      });

      if (matched) {
        targetTermId = matched.term_id;
        targetTermName = matched.term_name;
      }
    }

    let sectionSql = '';
    const sectionParams = [];

    if (userId) {
      const [taCount] = await db.execute(
        `SELECT COUNT(*) as cnt FROM TEACHER_ASSIGNMENT WHERE user_id = ?`,
        [userId]
      ).catch(() => [[{ cnt: 0 }]]);
      const hasTeachingAssignments = (taCount?.[0]?.cnt || 0) > 0;

      if (hasTeachingAssignments) {
        sectionSql = `
          SELECT DISTINCT
            gl.grade_level_id,
            sec.section_id,
            sec.section_name,
            gl.grade_level_name,
            so.subject_offering_id,
            s.subject_id,
            s.subject_name
          FROM TEACHER_ASSIGNMENT ta
          JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
          JOIN SECTION sec ON sec.section_id = so.section_id
          JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
          JOIN SUBJECT s ON s.subject_id = so.subject_id
          WHERE ta.user_id = ?
          ${schoolYearId && schoolYearId !== 'all' ? 'AND so.school_year_id = ?' : ''}
          ${subjectId && subjectId !== 'all' ? 'AND s.subject_id = ?' : ''}
          ORDER BY gl.grade_level_id ASC, sec.section_name ASC
        `;
        sectionParams.push(userId);
        if (schoolYearId && schoolYearId !== 'all') sectionParams.push(schoolYearId);
        if (subjectId && subjectId !== 'all') sectionParams.push(subjectId);
      } else {
        sectionSql = `
          SELECT DISTINCT
            gl.grade_level_id,
            sec.section_id,
            sec.section_name,
            gl.grade_level_name,
            so.subject_offering_id,
            s.subject_id,
            s.subject_name
          FROM SECTION_ADVISER_ASSIGNMENT saa
          JOIN SECTION sec ON sec.section_id = saa.section_id
          JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
          LEFT JOIN SUBJECT_OFFERING so ON so.section_id = sec.section_id AND (so.school_year_id = saa.school_year_id OR so.school_year_id IS NULL)
          LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
          WHERE saa.user_id = ?
          ${schoolYearId && schoolYearId !== 'all' ? 'AND saa.school_year_id = ?' : ''}
          ${subjectId && subjectId !== 'all' ? 'AND s.subject_id = ?' : ''}
          ORDER BY gl.grade_level_id ASC, sec.section_name ASC
        `;
        sectionParams.push(userId);
        if (schoolYearId && schoolYearId !== 'all') sectionParams.push(schoolYearId);
        if (subjectId && subjectId !== 'all') sectionParams.push(subjectId);
      }
    } else {
      sectionSql = `
        SELECT DISTINCT
          gl.grade_level_id,
          sec.section_id,
          sec.section_name,
          gl.grade_level_name,
          so.subject_offering_id,
          s.subject_id,
          s.subject_name
        FROM SUBJECT_OFFERING so
        JOIN SECTION sec ON sec.section_id = so.section_id
        JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        JOIN SUBJECT s ON s.subject_id = so.subject_id
      `;
      const whereConditions = [];
      if (subjectId && subjectId !== 'all') {
        whereConditions.push(`s.subject_id = ?`);
        sectionParams.push(subjectId);
      }
      if (schoolYearId && schoolYearId !== 'all') {
        whereConditions.push(`so.school_year_id = ?`);
        sectionParams.push(schoolYearId);
      }
      if (whereConditions.length > 0) {
        sectionSql += ` WHERE ` + whereConditions.join(' AND ');
      }
      sectionSql += ` ORDER BY gl.grade_level_id ASC, sec.section_name ASC`;
    }

    let [sections] = await db.execute(sectionSql, sectionParams).catch((err) => {
      console.error('Error querying sections in grade-range-report:', err.message);
      return [[]];
    });

    if (!sections || sections.length === 0) {
      return res.json({ sections: [], averageRow: null });
    }

    const reportSections = [];

    for (const secRow of sections) {
      const { section_id, section_name, subject_offering_id } = secRow;

      // 1. Get enrolled students for this section
      const studentSql = schoolYearId && schoolYearId !== 'all'
        ? `SELECT DISTINCT ss.student_id, ss.student_section_id
           FROM STUDENT_SECTION ss
           INNER JOIN STUDENT s ON s.student_id = ss.student_id
           WHERE ss.section_id = ? AND ss.school_year_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)`
        : `SELECT DISTINCT ss.student_id, ss.student_section_id
           FROM STUDENT_SECTION ss
           INNER JOIN STUDENT s ON s.student_id = ss.student_id
           WHERE ss.section_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)`;
      const studentParams = schoolYearId && schoolYearId !== 'all'
        ? [section_id, schoolYearId]
        : [section_id];

      const [students] = await db.execute(studentSql, studentParams).catch((err) => {
        console.error('Error querying students for section:', err.message);
        return [[]];
      });

      // 2. Query quarterly_grade from STUDENT_GRADE for this subject offering and term
      const termPlaceholders = termCodes.map(() => 'UPPER(sg.term) = UPPER(?)').join(' OR ');
      const gradeParams = [subject_offering_id, ...termCodes];

      const [grades] = await db.execute(
        `SELECT sg.student_id, sg.quarterly_grade, sg.initial_grade
         FROM STUDENT_GRADE sg
         WHERE sg.subject_offering_id = ? AND (${termPlaceholders})`,
        gradeParams
      ).catch(() => [[]]);

      const gradeMap = new Map();
      const validGradesList = [];

      (grades || []).forEach((g) => {
        const finalGrade = g.quarterly_grade !== null && g.quarterly_grade !== undefined
          ? g.quarterly_grade
          : g.initial_grade;

        if (finalGrade !== null && finalGrade !== undefined && !isNaN(Number(finalGrade))) {
          const numGrade = Number(finalGrade);
          gradeMap.set(g.student_id, numGrade);
          validGradesList.push(numGrade);
        }
      });
      // 2b. Check if this section's grade sheet for this term has been officially SUBMITTED
      const [sheetCheck] = await db.execute(
        `SELECT gs.grade_sheet_id, gs.workflow_status, gs.submitted_at
         FROM GRADE_SHEET gs
         LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
         WHERE gs.subject_offering_id = ?
           AND (
             gs.term_id = ?
             OR gs.term_id = ?
             OR at.term_name LIKE ?
             OR UPPER(at.term_name) = UPPER(?)
           )
         LIMIT 1`,
        [
          subject_offering_id,
          targetTermId || termIdNum,
          termIdNum,
          `%${termIdNum}%`,
          targetTermName || (rawTerm === '1' ? '1st' : rawTerm === '2' ? '2nd' : '3rd'),
        ]
      ).catch(() => [[]]);

      const matchedSheet = sheetCheck && sheetCheck.length > 0 ? sheetCheck[0] : null;
      const isSubmitted = matchedSheet
        ? (matchedSheet.workflow_status === 'SUBMITTED' || matchedSheet.submitted_at !== null)
        : (validGradesList.length > 0);

      let noGrade = 0;
      let r60_74 = 0;
      let r75_79 = 0;
      let r80_84 = 0;
      let r85_89 = 0;
      let r90_100 = 0;
      let total = 0;

      // Grade Range data is only calculated and displayed if the section's grades have been officially submitted
      if (isSubmitted) {
        (students || []).forEach((st) => {
          if (!gradeMap.has(st.student_id)) {
            noGrade++;
          } else {
            const g = gradeMap.get(st.student_id);
            if (g < 75) r60_74++;
            else if (g >= 75 && g <= 79) r75_79++;
            else if (g >= 80 && g <= 84) r80_84++;
            else if (g >= 85 && g <= 89) r85_89++;
            else if (g >= 90 && g <= 100) r90_100++;
            else r60_74++;
          }
        });
        total = noGrade + r60_74 + r75_79 + r80_84 + r85_89 + r90_100;
      }

      // 3. Calculate Mean and MPS for this section using Terminal Examination (TE) raw scores
      let teTotalScore = 0;
      let teNumTakers = 0;
      let teScoreMean = 0;
      let teMps = 0;
      let teMaxScore = 50;

      const [sheets] = await db.execute(
        `SELECT gs.grade_sheet_id, gs.term_id
         FROM GRADE_SHEET gs
         LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
         WHERE gs.subject_offering_id = ?
           AND (
             gs.term_id = ?
             OR gs.term_id = ?
             OR at.term_name LIKE ?
             OR UPPER(at.term_name) = UPPER(?)
           )
         LIMIT 1`,
        [
          subject_offering_id,
          targetTermId || termIdNum,
          termIdNum,
          `%${termIdNum}%`,
          targetTermName || (rawTerm === '1' ? '1st' : rawTerm === '2' ? '2nd' : '3rd'),
        ]
      ).catch(() => [[]]);

      if (sheets && sheets.length > 0) {
        const gradeSheetId = sheets[0].grade_sheet_id;

        const [activities] = await db.execute(
          `SELECT ga.activity_id, ga.activity_name, ga.highest_possible_score, ct.component_code
           FROM GRADE_ACTIVITY ga
           LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
           LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
           WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL) AND ga.status != 'ARCHIVED'`,
          [gradeSheetId]
        ).catch(() => [[]]);

        // Prioritize Terminal Exam / Quarterly Exam over regular daily works
        let teAct = (activities || []).find((a) => {
          const aName = String(a.activity_name || '').toUpperCase();
          const code = String(a.component_code || '').toUpperCase();
          return (code === 'QA' || code === 'EX' || /\b(TERM\s*EXAM|QUARTERLY\s*ASSESSMENT|QUARTERLY\s*EXAM|PERIODICAL\s*EXAM)\b/i.test(aName)) &&
                 !/\b(WRITTEN|WORK|PERFORMANCE|TASK|ST1|ST2|SUMMATIVE)\b/i.test(aName);
        });

        if (!teAct) {
          teAct = (activities || []).find((a) => {
            const aName = String(a.activity_name || '').toUpperCase();
            const code = String(a.component_code || '').toUpperCase();
            return (code === 'QA' || code === 'STE' || code === 'EX' || /\b(EXAM|QUARTERLY|TE)\b/i.test(aName)) &&
                   !/\b(WRITTEN|WORK|PERFORMANCE|TASK)\b/i.test(aName);
          });
        }

        if (!teAct && activities.length > 0) {
          teAct = activities[activities.length - 1];
        }

        if (teAct) {
          teMaxScore = Number(teAct.highest_possible_score) || 50;
          const [scoreRows] = await db.execute(
            `SELECT sc.raw_score
             FROM SCORE sc
             JOIN STUDENT_SECTION ss ON ss.student_section_id = sc.student_section_id
             WHERE sc.activity_id = ? AND ss.section_id = ? AND sc.raw_score IS NOT NULL AND sc.raw_score != ''`,
            [teAct.activity_id, section_id]
          ).catch(() => [[]]);

          (scoreRows || []).forEach((sc) => {
            const val = Number(sc.raw_score);
            if (!isNaN(val)) {
              teTotalScore += val;
              teNumTakers += 1;
            }
          });

          if (teNumTakers > 0) {
            teScoreMean = Math.round((teTotalScore / teNumTakers) * 100) / 100;
            teMps = Math.round(((teScoreMean / teMaxScore) * 100) * 100) / 100;
          }
        }
      }

      // Fallback: If no activity score rows, but valid quarterly grades exist in STUDENT_GRADE
      if (teNumTakers === 0 && validGradesList.length > 0) {
        const sumGrades = validGradesList.reduce((acc, g) => acc + g, 0);
        teTotalScore = Math.round(sumGrades * 100) / 100;
        teNumTakers = validGradesList.length;
        teScoreMean = Math.round((sumGrades / teNumTakers) * 100) / 100;
        teMps = teScoreMean; // Quarterly grade is already on a 0-100 percentage scale
      }

      const displaySectionName = (subjectId === 'all' || !subjectId) && secRow.subject_name
        ? `${secRow.section_name} (${secRow.subject_name})`
        : secRow.section_name;

      reportSections.push({
        section_id,
        section_name: displaySectionName,
        raw_section_name: secRow.section_name,
        subject_name: secRow.subject_name,
        is_submitted: Boolean(isSubmitted),
        submission_status: isSubmitted ? 'SUBMITTED' : (matchedSheet?.workflow_status || 'DRAFT'),
        submitted_at: matchedSheet?.submitted_at || null,
        no_grade: isSubmitted ? noGrade : null,
        r60_74: isSubmitted ? r60_74 : null,
        r75_79: isSubmitted ? r75_79 : null,
        r80_84: isSubmitted ? r80_84 : null,
        r85_89: isSubmitted ? r85_89 : null,
        r90_100: isSubmitted ? r90_100 : null,
        total: isSubmitted ? total : (students.length || 0),
        total_score: Math.round(teTotalScore * 100) / 100,
        num_takers: teNumTakers,
        score_mean: teScoreMean,
        mps: teMps,
      });
    }

    const sectionCount = reportSections.length;
    let averageRow = null;

    if (sectionCount > 0) {
      const submittedSections = reportSections.filter((s) => s.is_submitted);
      const sumNoGrade = submittedSections.reduce((a, b) => a + (Number(b.no_grade) || 0), 0);
      const sum60_74 = submittedSections.reduce((a, b) => a + (Number(b.r60_74) || 0), 0);
      const sum75_79 = submittedSections.reduce((a, b) => a + (Number(b.r75_79) || 0), 0);
      const sum80_84 = submittedSections.reduce((a, b) => a + (Number(b.r80_84) || 0), 0);
      const sum85_89 = submittedSections.reduce((a, b) => a + (Number(b.r85_89) || 0), 0);
      const sum90_100 = submittedSections.reduce((a, b) => a + (Number(b.r90_100) || 0), 0);
      const sumTotal = submittedSections.reduce((a, b) => a + (Number(b.total) || 0), 0);

      const sumTotalScore = reportSections.reduce((a, b) => a + (Number(b.total_score) || 0), 0);
      const sumNumTakers = reportSections.reduce((a, b) => a + (Number(b.num_takers) || 0), 0);
      const overallMean = sumNumTakers > 0 ? Math.round((sumTotalScore / sumNumTakers) * 100) / 100 : 0;
      
      const weightedMpsSum = reportSections.reduce((acc, sec) => acc + (sec.mps * sec.num_takers), 0);
      const overallMps = sumNumTakers > 0 ? Math.round((weightedMpsSum / sumNumTakers) * 100) / 100 : 0;

      const sectionsWithScores = reportSections.filter((s) => (Number(s.num_takers) || 0) > 0 || (Number(s.score_mean) || 0) > 0);
      const meanTargetList = sectionsWithScores.length > 0 ? sectionsWithScores : reportSections;
      const avgScoreMean = meanTargetList.length > 0
        ? Math.round((meanTargetList.reduce((acc, s) => acc + (Number(s.score_mean) || 0), 0) / meanTargetList.length) * 100) / 100
        : 0;
      const avgMps = meanTargetList.length > 0
        ? Math.round((meanTargetList.reduce((acc, s) => acc + (Number(s.mps) || 0), 0) / meanTargetList.length) * 100) / 100
        : 0;

      averageRow = {
        section_name: submittedSections.length === reportSections.length ? 'Total' : 'Total (Submitted)',
        has_submitted_data: submittedSections.length > 0,
        submitted_count: submittedSections.length,
        total_sections: reportSections.length,
        no_grade: sumNoGrade,
        r60_74: sum60_74,
        r75_79: sum75_79,
        r80_84: sum80_84,
        r85_89: sum85_89,
        r90_100: sum90_100,
        total: sumTotal,
        total_score: Math.round(sumTotalScore * 100) / 100,
        num_takers: sumNumTakers,
        score_mean: overallMean,
        mps: overallMps,
        avg_score_mean: avgScoreMean,
        avg_mps: avgMps,
      };
    }

    res.json({ sections: reportSections, averageRow });
  } catch (err) {
    console.error('Error in /grade-range-report endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
