const express = require('express');
const router = express.Router();
const db = require('../config/db');
const StudentGrade = require('../models/StudentGrade');
const {
  DEFAULT_JHS_WEIGHTS,
  calculateStudentSummary,
  calculateStudentGrades,
  transmuteGrade,
} = require('../utils/depedTransmutation');

/**
 * Normalizes term string ('T1', '1st Term', 'Quarter 1', 1) to standard code 'T1' and label '1st Term'
 */
function normalizeTerm(rawTerm) {
  const str = String(rawTerm || 'T1').trim().toUpperCase();
  if (str.includes('1') || str.includes('T1') || str.includes('FIRST') || str.includes('Q1')) {
    return { termCode: 'T1', termName: '1st Term' };
  }
  if (str.includes('2') || str.includes('T2') || str.includes('SECOND') || str.includes('Q2')) {
    return { termCode: 'T2', termName: '2nd Term' };
  }
  if (str.includes('3') || str.includes('T3') || str.includes('THIRD') || str.includes('Q3')) {
    return { termCode: 'T3', termName: '3rd Term' };
  }
  if (str.includes('4') || str.includes('T4') || str.includes('FOURTH') || str.includes('Q4')) {
    return { termCode: 'T4', termName: '4th Term' };
  }
  return { termCode: 'T1', termName: '1st Term' };
}

/**
 * Normalizes assessment category/type to standard code ('WW' | 'PT' | 'QA') and camelCase type ('writtenWork' | 'performanceTask' | 'quarterlyAssessment').
 */
function normalizeAssessmentType(rawType) {
  if (!rawType) return { code: 'WW', type: 'writtenWork', name: 'Written Work' };
  const str = String(rawType).trim();
  const lower = str.toLowerCase();

  if (
    lower === 'writtenwork' ||
    lower === 'writtenworks' ||
    lower === 'written_work' ||
    lower === 'written_works' ||
    lower === 'ww' ||
    lower.includes('written') ||
    lower.includes('quiz')
  ) {
    return { code: 'WW', type: 'writtenWork', name: 'Written Work' };
  }
  if (
    lower === 'performancetask' ||
    lower === 'performancetasks' ||
    lower === 'performance_task' ||
    lower === 'performance_tasks' ||
    lower === 'pt' ||
    lower.includes('performance') ||
    lower.includes('task')
  ) {
    return { code: 'PT', type: 'performanceTask', name: 'Performance Task' };
  }
  if (
    lower === 'quarterlyassessment' ||
    lower === 'quarterlyassessments' ||
    lower === 'quarterly_assessment' ||
    lower === 'quarterly_assessments' ||
    lower === 'qa' ||
    lower === 'ste' ||
    lower.includes('quarterly') ||
    lower.includes('assessment') ||
    lower.includes('exam')
  ) {
    return { code: 'QA', type: 'quarterlyAssessment', name: 'Quarterly Assessment' };
  }
  return { code: 'WW', type: 'writtenWork', name: 'Written Work' };
}

/**
 * Resolves the school's currently active ACADEMIC_TERM.
 * 1. Query ACADEMIC_TERM where CURRENT_TIMESTAMP() falls between starts_at and ends_at for the school_year_id.
 * 2. Fallback to status = 'ongoing' or 'open'.
 * 3. Fallback to the first term of the school year.
 */
async function resolveActiveAcademicTerm(schoolYearId) {
  try {
    if (schoolYearId) {
      // 1. Check current timestamp within starts_at and ends_at
      const [rangeRows] = await db.execute(
        `SELECT term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
         FROM ACADEMIC_TERM
         WHERE school_year_id = ?
           AND starts_at IS NOT NULL
           AND ends_at IS NOT NULL
           AND CURRENT_TIMESTAMP() BETWEEN starts_at AND ends_at
         ORDER BY term_id ASC
         LIMIT 1`,
        [schoolYearId]
      );

      if (rangeRows.length > 0) {
        const term = rangeRows[0];
        const { termCode, termName } = normalizeTerm(term.term_name);
        return {
          term_id: term.term_id,
          term_name: term.term_name,
          termCode,
          termName,
          starts_at: term.starts_at,
          ends_at: term.ends_at,
          grade_submission_deadline_at: term.grade_submission_deadline_at,
          status: term.status,
        };
      }

      // 2. Check status = 'ongoing' or 'open'
      const [statusRows] = await db.execute(
        `SELECT term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
         FROM ACADEMIC_TERM
         WHERE school_year_id = ?
           AND (LOWER(status) = 'ongoing' OR LOWER(status) = 'open')
         ORDER BY term_id ASC
         LIMIT 1`,
        [schoolYearId]
      );

      if (statusRows.length > 0) {
        const term = statusRows[0];
        const { termCode, termName } = normalizeTerm(term.term_name);
        return {
          term_id: term.term_id,
          term_name: term.term_name,
          termCode,
          termName,
          starts_at: term.starts_at,
          ends_at: term.ends_at,
          grade_submission_deadline_at: term.grade_submission_deadline_at,
          status: term.status,
        };
      }

      // 3. Fallback: First term of this school year
      const [firstTermRows] = await db.execute(
        `SELECT term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
         FROM ACADEMIC_TERM
         WHERE school_year_id = ?
         ORDER BY term_id ASC
         LIMIT 1`,
        [schoolYearId]
      );

      if (firstTermRows.length > 0) {
        const term = firstTermRows[0];
        const { termCode, termName } = normalizeTerm(term.term_name);
        return {
          term_id: term.term_id,
          term_name: term.term_name,
          termCode,
          termName,
          starts_at: term.starts_at,
          ends_at: term.ends_at,
          grade_submission_deadline_at: term.grade_submission_deadline_at,
          status: term.status,
        };
      }
    }
  } catch (err) {
    console.warn('Error resolving active academic term:', err.message);
  }

  return {
    term_id: 1,
    term_name: '1st Term',
    termCode: 'T1',
    termName: '1st Term',
    status: 'ongoing',
  };
}

/**
 * Ensures GRADE_SHEET entry exists for the offering and term.
 */
async function ensureGradeSheet(subjectOfferingId, schoolYearId, termName) {
  const shortName = String(termName || '').replace(/\s*Term/i, '').trim(); // e.g. "1st", "2nd", "3rd"

  let [termRows] = await db.execute(
    `SELECT term_id, term_name FROM ACADEMIC_TERM 
     WHERE school_year_id = ? AND (term_name = ? OR term_name = ? OR term_name LIKE ?) 
     ORDER BY term_id ASC LIMIT 1`,
    [schoolYearId, termName, shortName, `${shortName}%`]
  );

  let termId = termRows.length > 0 ? termRows[0].term_id : null;
  let resolvedTermName = termRows.length > 0 ? termRows[0].term_name : termName;

  if (!termId) {
    const [anyTerm] = await db.execute(
      `SELECT term_id, term_name FROM ACADEMIC_TERM 
       WHERE term_name = ? OR term_name = ? OR term_name LIKE ? 
       ORDER BY term_id ASC LIMIT 1`,
      [termName, shortName, `${shortName}%`]
    );
    if (anyTerm.length > 0) {
      termId = anyTerm[0].term_id;
      resolvedTermName = anyTerm[0].term_name;
    } else {
      const [allTerms] = await db.execute('SELECT term_id, term_name FROM ACADEMIC_TERM ORDER BY term_id ASC LIMIT 1');
      if (allTerms.length > 0) {
        termId = allTerms[0].term_id;
        resolvedTermName = allTerms[0].term_name;
      }
    }
  }

  let [sheetRows] = await db.execute(
    'SELECT grade_sheet_id, term_id, lock_status, workflow_status FROM GRADE_SHEET WHERE subject_offering_id = ? AND term_id = ? LIMIT 1',
    [subjectOfferingId, termId || 1]
  );

  if (sheetRows.length > 0) {
    return {
      gradeSheetId: sheetRows[0].grade_sheet_id,
      lockStatus: sheetRows[0].lock_status || 'EDITABLE',
      workflowStatus: sheetRows[0].workflow_status || 'DRAFT',
      termId: sheetRows[0].term_id || termId || 1,
      termName: resolvedTermName,
    };
  }

  const [insertRes] = await db.execute(
    'INSERT INTO GRADE_SHEET (subject_offering_id, term_id, lock_status, workflow_status) VALUES (?, ?, ?, ?)',
    [subjectOfferingId, termId || 1, 'EDITABLE', 'DRAFT']
  );

  return {
    gradeSheetId: insertRes.insertId,
    lockStatus: 'EDITABLE',
    workflowStatus: 'DRAFT',
    termId: termId || 1,
    termName: resolvedTermName,
  };
}

/**
 * Ensures default assessment columns exist for a grade sheet so every column
 * (Written Work, Performance Task, and Quarterly Assessment) always has a valid assessment_id in DB.
 */
async function ensureDefaultActivitiesForSheet(gradeSheetId, subjectId, schoolYearId) {
  const [existing] = await db.execute(
    `SELECT ga.activity_id, ga.activity_name, ct.component_code
     FROM GRADE_ACTIVITY ga
     LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
     LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
     WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
    [gradeSheetId]
  );

  let hasWW = false;
  let hasPT = false;
  let hasQA = false;

  existing.forEach((a) => {
    const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
    if (code === 'WW') hasWW = true;
    if (code === 'PT') hasPT = true;
    if (code === 'QA') hasQA = true;
  });

  const [weights] = await db.execute(
    `SELECT scw.subj_comp_weight_id, ct.component_code
     FROM SUBJECT_COMPONENT_WEIGHT scw
     JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
     WHERE scw.subject_id = ? AND scw.school_year_id = ?`,
    [subjectId, schoolYearId]
  );

  let wwWeightId = null;
  let ptWeightId = null;
  let qaWeightId = null;

  weights.forEach((w) => {
    const { code } = normalizeAssessmentType(w.component_code);
    if (code === 'WW') wwWeightId = w.subj_comp_weight_id;
    if (code === 'PT') ptWeightId = w.subj_comp_weight_id;
    if (code === 'QA') qaWeightId = w.subj_comp_weight_id;
  });

  const today = new Date().toISOString().slice(0, 10);

  // If no WW columns exist, insert 5 default WW
  // If no WW columns exist, insert 1 default WW (reduced from 5)
  if (!hasWW) {
    const defaultWW = [
      { name: 'Written Work 1', max: 20 },
    ];
    for (const ww of defaultWW) {
      await db.execute(
        `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [gradeSheetId, wwWeightId, ww.name, ww.max, today]
      );
    }
  }

  // If no PT columns exist, insert 1 default PT (reduced from 5)
  if (!hasPT) {
    const defaultPT = [
      { name: 'Performance Task 1', max: 50 },
    ];
    for (const pt of defaultPT) {
      await db.execute(
        `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [gradeSheetId, ptWeightId, pt.name, pt.max, today]
      );
    }
  }

  // If no QA column exists, insert 1 default QA
  if (!hasQA) {
    await db.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, 'Quarterly Assessment 1', 50, today]
    );
  }
}

/**
 * GET /api/class-record/:subject_offering_id?term=T1
 * Requirement 1: Data Retrieval Endpoint for JHS Class Record
 */
router.get('/class-record/:subject_offering_id', async (req, res) => {
  try {
    const subjectOfferingId = Number(req.params.subject_offering_id);
    const requestedSectionId = req.query.section_id ? Number(req.query.section_id) : null;

    // 1. Fetch class context from SUBJECT_OFFERING, SECTION, SUBJECT, GRADE_LEVEL, SCHOOL_YEAR
    let contextRows = [];

    if (requestedSectionId) {
      const [secMatchRows] = await db.execute(
        `SELECT 
           so.subject_offering_id,
           so.subject_id,
           so.section_id,
           so.school_year_id,
           s.subject_name,
           s.subject_code,
           sec.section_name,
           sec.grade_level_id,
           gl.grade_level_name,
           sy.starts_on AS sy_starts_on,
           sy.ends_on AS sy_ends_on,
           sch.school_name,
           sch.school_code,
           sch.region,
           sch.division,
           CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         WHERE so.section_id = ?
         ORDER BY so.subject_offering_id ASC LIMIT 1`,
        [requestedSectionId]
      );
      contextRows = secMatchRows;
    }

    if (!contextRows || contextRows.length === 0) {
      const [offeringMatchRows] = await db.execute(
        `SELECT 
           so.subject_offering_id,
           so.subject_id,
           so.section_id,
           so.school_year_id,
           s.subject_name,
           s.subject_code,
           sec.section_name,
           sec.grade_level_id,
           gl.grade_level_name,
           sy.starts_on AS sy_starts_on,
           sy.ends_on AS sy_ends_on,
           sch.school_name,
           sch.school_code,
           sch.region,
           sch.division,
           CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         WHERE so.subject_offering_id = ?`,
        [subjectOfferingId]
      );
      contextRows = offeringMatchRows;
    }

    if (!contextRows || contextRows.length === 0) {
      // Fallback: check by section_id if param itself was section_id
      const [secFallbackRows] = await db.execute(
        `SELECT 
           so.subject_offering_id,
           so.subject_id,
           so.section_id,
           so.school_year_id,
           s.subject_name,
           s.subject_code,
           sec.section_name,
           sec.grade_level_id,
           gl.grade_level_name,
           sy.starts_on AS sy_starts_on,
           sy.ends_on AS sy_ends_on,
           sch.school_name,
           sch.school_code,
           sch.region,
           sch.division,
           CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         WHERE so.section_id = ?
         ORDER BY so.subject_offering_id ASC LIMIT 1`,
        [subjectOfferingId]
      );
      contextRows = secFallbackRows;
    }

    if (!contextRows || contextRows.length === 0) {
      // Fallback: fetch section directly and create a subject offering if missing
      const targetSecId = requestedSectionId || subjectOfferingId;
      const [secRows] = await db.execute(
        `SELECT sec.section_id, sec.section_name, sec.grade_level_id, gl.grade_level_name, sy.school_year_id
         FROM SECTION sec
         JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.status = 'ACTIVE' OR sy.is_active = 1
         WHERE sec.section_id = ? LIMIT 1`,
        [targetSecId]
      );

      if (secRows.length > 0) {
        const sec = secRows[0];
        const [subjRows] = await db.execute(`SELECT subject_id, subject_name FROM SUBJECT LIMIT 1`);
        const subjId = subjRows[0]?.subject_id || 1;
        const syId = sec.school_year_id || 1;

        const [insSo] = await db.execute(
          `INSERT INTO SUBJECT_OFFERING (subject_id, section_id, school_year_id) VALUES (?, ?, ?)`,
          [subjId, sec.section_id, syId]
        );
        const newSoId = insSo.insertId;

        contextRows = [{
          subject_offering_id: newSoId,
          subject_id: subjId,
          section_id: sec.section_id,
          school_year_id: syId,
          subject_name: subjRows[0]?.subject_name || "Mathematics",
          section_name: sec.section_name,
          grade_level_id: sec.grade_level_id,
          grade_level_name: sec.grade_level_name,
        }];
      }
    }

    if (!contextRows || contextRows.length === 0) {
      return res.status(404).json({ error: 'Class / Subject Offering not found.' });
    }

    const classContext = contextRows[0];
    const actualOfferingId = classContext.subject_offering_id;
    const schoolYearId = classContext.school_year_id || 1;
    const subjectId = classContext.subject_id;
    const sectionId = classContext.section_id;

    // Resolve active ongoing term for this school year from ACADEMIC_TERM
    const activeTerm = await resolveActiveAcademicTerm(schoolYearId);
    const activeOngoingTermCode = activeTerm?.termCode || 'T1';

    const rawTerm = req.query.term || activeOngoingTermCode || 'T1';
    const { termCode, termName } = normalizeTerm(rawTerm);

    // 2. Ensure GRADE_SHEET exists
    const sheetData = await ensureGradeSheet(actualOfferingId, schoolYearId, termName);
    const { gradeSheetId, lockStatus, termId: sheetTermId } = sheetData;

    // Validate GRADE_SHEET against Active Term
    // A grade sheet is considered ACTIVE / OPEN if grade_sheet.term_id === active_term.term_id AND grade_sheet.lock_status === 'EDITABLE' (or 'OPEN' or 'TEMPORARILY_REOPENED')
    const isTermActive = Boolean(activeTerm && Number(sheetTermId) === Number(activeTerm.term_id));
    const isEditable = isTermActive && (
      lockStatus === 'EDITABLE' ||
      lockStatus === 'OPEN' ||
      lockStatus === 'TEMPORARILY_REOPENED'
    );
    const isLocked = !isEditable;
    const lockReason = !isTermActive
      ? 'CLOSED_TERM'
      : (lockStatus === 'TERM_LOCKED' ? 'TERM_LOCKED' : (isLocked ? 'LOCKED' : null));

    // Ensure default assessment activities (WW, PT, QA) exist for this sheet
    await ensureDefaultActivitiesForSheet(gradeSheetId, subjectId, schoolYearId);

    // 3. Fetch component weights from SUBJECT_COMPONENT_WEIGHT + COMPONENT_TYPE
    let weights = { ...DEFAULT_JHS_WEIGHTS };
    let componentTypes = [];

    const [weightRows] = await db.execute(
      `SELECT 
         scw.subj_comp_weight_id,
         scw.component_type_id,
         scw.percentage AS weight_percentage,
         ct.component_code,
         ct.component_name
       FROM SUBJECT_COMPONENT_WEIGHT scw
       JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE scw.subject_id = ? AND scw.school_year_id = ?`,
      [subjectId, schoolYearId]
    );

    if (weightRows.length > 0) {
      weightRows.forEach((w) => {
        const { code } = normalizeAssessmentType(w.component_code);
        if (code === 'WW' || code === 'PT' || code === 'QA') {
          weights[code] = Number(w.weight_percentage);
        }
      });
      componentTypes = weightRows;
    } else {
      const [allCt] = await db.execute('SELECT * FROM COMPONENT_TYPE');
      componentTypes = allCt;
    }

    // 4. Fetch active assessment columns from GRADE_ACTIVITY for this grade_sheet_id
    const [activityRows] = await db.execute(
      `SELECT 
         ga.activity_id,
         ga.activity_id AS assessment_id,
         ga.grade_sheet_id,
         ga.subj_comp_weight_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ga.activity_date,
         ga.status,
         ct.component_code,
         ct.component_name,
         scw.component_type_id
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)
       ORDER BY ga.activity_id ASC`,
      [gradeSheetId]
    );

    const assessments = activityRows.map((a) => {
      const { code, type: normType, name: defaultName } = normalizeAssessmentType(a.component_code || a.activity_name);

      return {
        assessment_id: a.activity_id,
        activity_id: a.activity_id,
        grade_sheet_id: a.grade_sheet_id,
        subj_comp_weight_id: a.subj_comp_weight_id,
        component_type_id: a.component_type_id,
        component_code: code,
        type: normType,
        assessment_type: normType,
        title: a.activity_name || defaultName,
        activity_name: a.activity_name || defaultName,
        max_score: Number(a.max_score || 0),
        highest_possible_score: Number(a.max_score || 0),
        activity_date: a.activity_date ? String(a.activity_date).slice(0, 10) : null,
        status: a.status || 'ACTIVE',
      };
    });

    // Calculate Total Highest Possible Scores (HPS)
    const totalHps = { WW: 0, PT: 0, QA: 0 };
    assessments.forEach((ass) => {
      if (totalHps[ass.component_code] !== undefined) {
        totalHps[ass.component_code] += ass.max_score;
      }
    });

    // 5. Fetch enrolled students from STUDENT_SECTION table in the DB
    const [studentRows] = await db.execute(
      `SELECT 
         s.student_id,
         ss.student_section_id,
         s.LRN,
         s.first_name,
         s.middle_name,
         s.last_name,
         s.extension_name,
         s.sex,
         s.status AS student_status
       FROM STUDENT_SECTION ss
       JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)
       ORDER BY 
         CASE WHEN UPPER(s.sex) IN ('M', 'MALE') THEN 0 ELSE 1 END ASC,
         s.last_name ASC,
         s.first_name ASC`,
      [sectionId]
    );

    // 6. Fetch student raw scores from SCORE
    let scoreMapByStudentSec = {};
    let scoreMapByStudentId = {};

    if (activityRows.length > 0) {
      const activityIds = activityRows.map((a) => a.activity_id);
      const placeholders = activityIds.map(() => '?').join(',');

      const [scoreRows] = await db.execute(
        `SELECT score_id, activity_id, student_section_id, raw_score, score_status
         FROM SCORE
         WHERE activity_id IN (${placeholders})`,
        activityIds
      );

      const [secMap] = await db.execute(
        'SELECT student_section_id, student_id FROM STUDENT_SECTION WHERE section_id = ?',
        [sectionId]
      );
      const secToSt = {};
      const stToSec = {};
      secMap.forEach((m) => {
        secToSt[m.student_section_id] = m.student_id;
        stToSec[m.student_id] = m.student_section_id;
      });

      scoreRows.forEach((sc) => {
        const val = sc.raw_score !== null ? Number(sc.raw_score) : null;
        if (sc.student_section_id) {
          if (!scoreMapByStudentSec[sc.student_section_id]) {
            scoreMapByStudentSec[sc.student_section_id] = {};
          }
          scoreMapByStudentSec[sc.student_section_id][sc.activity_id] = val;

          const sId = secToSt[sc.student_section_id];
          if (sId) {
            if (!scoreMapByStudentId[sId]) {
              scoreMapByStudentId[sId] = {};
            }
            scoreMapByStudentId[sId][sc.activity_id] = val;
          }
        }
      });
    }

    // 7. Fetch existing grades from STUDENT_GRADE
    const savedGrades = await StudentGrade.findByOfferingAndTerm(subjectOfferingId, termCode);
    const gradeMap = {};
    savedGrades.forEach((g) => {
      gradeMap[g.student_id] = g;
    });

    // 8. Build student payload with computed DepEd grades
    const computedStudents = studentRows.map((student) => {
      const studentSecId = student.student_section_id;
      const studentId = student.student_id;

      const rawScores = {
        ...(studentSecId && scoreMapByStudentSec[studentSecId] ? scoreMapByStudentSec[studentSecId] : {}),
        ...(studentId && scoreMapByStudentId[studentId] ? scoreMapByStudentId[studentId] : {}),
      };

      const summary = calculateStudentSummary({
        assessments,
        scores: rawScores,
        weights,
      });

      const savedGrade = gradeMap[studentId];
      const initialGrade = savedGrade?.initial_grade !== null && savedGrade?.initial_grade !== undefined
        ? Number(savedGrade.initial_grade)
        : summary.initialGrade;

      const quarterlyGrade = savedGrade?.quarterly_grade !== null && savedGrade?.quarterly_grade !== undefined
        ? Number(savedGrade.quarterly_grade)
        : summary.quarterlyGrade;

      const remarks = savedGrade?.remarks || summary.remarks;

      return {
        student_id: student.student_id,
        student_section_id: student.student_section_id,
        LRN: student.LRN,
        first_name: student.first_name,
        middle_name: student.middle_name,
        last_name: student.last_name,
        extension_name: student.extension_name,
        sex: (student.sex || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
        scores: rawScores,
        computed: summary,
        initial_grade: initialGrade,
        quarterly_grade: quarterlyGrade,
        remarks,
      };
    });

    res.json({
      subject_offering_id: subjectOfferingId,
      term: termCode,
      term_name: termName,
      active_term: activeOngoingTermCode,
      active_term_id: activeTerm?.term_id,
      active_term_name: activeTerm?.term_name,
      current_term: termCode,
      current_term_name: termName,
      grade_sheet_id: gradeSheetId,
      lock_status: lockStatus,
      is_locked: isLocked,
      is_editable: isEditable,
      is_active_term: isTermActive,
      lock_reason: lockReason,
      grade_sheet: {
        grade_sheet_id: gradeSheetId,
        term_id: sheetTermId,
        term_name: sheetData.termName || termName,
        lock_status: lockStatus,
        workflow_status: sheetData.workflowStatus,
        is_active_term: isTermActive,
        is_editable: isEditable,
        is_locked: isLocked,
        lock_reason: lockReason,
      },
      class_context: {
        subject_offering_id: classContext.subject_offering_id,
        section_id: classContext.section_id,
        section_name: classContext.section_name,
        grade_level_id: classContext.grade_level_id,
        grade_level_name: classContext.grade_level_name,
        subject_id: classContext.subject_id,
        subject_name: classContext.subject_name,
        subject_code: classContext.subject_code,
        school_year_id: classContext.school_year_id,
        school_year_label: classContext.sy_starts_on ? `${classContext.sy_starts_on}-${classContext.sy_ends_on}` : '2023-2024',
        school_name: classContext.school_name || 'Gingoog City Comprehensive National High School',
        school_code: classContext.school_code || '304130',
        region: classContext.region || 'REGION X',
        division: classContext.division || 'GINGOOG CITY',
        teacher_name: classContext.teacher_name || '',
      },
      component_weights: weights,
      component_types: componentTypes,
      total_highest_possible_scores: totalHps,
      assessments,
      students: computedStudents,
    });
  } catch (err) {
    console.error('Error in GET /api/class-record/:subject_offering_id:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assessments & POST /api/class-record/assessments
 * Requirement 2: Assessment & Highest Possible Score (HPS) Setup
 */
async function handleCreateAssessment(req, res) {
  try {
    const {
      subject_offering_id,
      term = 'T1',
      component_type_id,
      component_code,
      type: rawInputType,
      activity_name,
      title,
      max_score,
      highest_possible_score,
      activity_date,
    } = req.body;

    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }

    const effectiveMax = max_score !== undefined ? max_score : highest_possible_score;
    const numericMaxScore = Number(effectiveMax);
    if (isNaN(numericMaxScore) || numericMaxScore <= 0) {
      return res.status(400).json({ error: 'max_score (Highest Possible Score) must be a positive number.' });
    }

    const { termCode, termName } = normalizeTerm(term);
    const { code, type: normalizedType, name: defaultTypeName } = normalizeAssessmentType(
      component_code || rawInputType || req.body.category
    );

    const [offering] = await db.execute(
      'SELECT subject_id, section_id, school_year_id FROM SUBJECT_OFFERING WHERE subject_offering_id = ?',
      [subject_offering_id]
    );

    if (offering.length === 0) {
      return res.status(404).json({ error: 'Subject offering not found.' });
    }

    const { school_year_id, subject_id } = offering[0];
    const activeTerm = await resolveActiveAcademicTerm(school_year_id);
    const sheetData = await ensureGradeSheet(subject_offering_id, school_year_id, termName);
    const { gradeSheetId, lockStatus, termId: sheetTermId } = sheetData;

    const isTermActive = Boolean(activeTerm && Number(sheetTermId) === Number(activeTerm.term_id));
    const isEditable = isTermActive && (
      lockStatus === 'EDITABLE' ||
      lockStatus === 'OPEN' ||
      lockStatus === 'TEMPORARILY_REOPENED'
    );

    if (!isEditable) {
      return res.status(403).json({
        error: `Cannot add assessments. This class record belongs to a closed term (${termName}) and is read-only.`,
        is_locked: true,
      });
    }

    let targetSubjCompWeightId = null;
    let targetComponentTypeId = component_type_id;

    if (!targetComponentTypeId) {
      let lookupCodes = [code];
      if (code === 'QA') lookupCodes.push('STE');
      const [ctRows] = await db.execute(
        `SELECT component_type_id FROM COMPONENT_TYPE 
         WHERE UPPER(component_code) IN (${lookupCodes.map(() => '?').join(',')}) 
            OR UPPER(component_name) LIKE ? LIMIT 1`,
        [...lookupCodes, `%${code}%`]
      );
      if (ctRows.length > 0) targetComponentTypeId = ctRows[0].component_type_id;
    }

    if (targetComponentTypeId) {
      const [weightRow] = await db.execute(
        `SELECT subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT 
         WHERE subject_id = ? AND component_type_id = ? AND school_year_id = ? LIMIT 1`,
        [subject_id, targetComponentTypeId, school_year_id]
      );
      if (weightRow.length > 0) {
        targetSubjCompWeightId = weightRow[0].subj_comp_weight_id;
      }
    }

    if (!targetSubjCompWeightId) {
      const [firstWeight] = await db.execute(
        `SELECT subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT WHERE subject_id = ? LIMIT 1`,
        [subject_id]
      );
      if (firstWeight.length > 0) {
        targetSubjCompWeightId = firstWeight[0].subj_comp_weight_id;
      }
    }

    const defaultTitle = activity_name || title || `${defaultTypeName}`;
    const parsedDate = (activity_date && String(activity_date).trim() !== '') ? String(activity_date).trim() : null;

    const [insertResult] = await db.execute(
      `INSERT INTO GRADE_ACTIVITY (
        grade_sheet_id, 
        subj_comp_weight_id, 
        activity_name, 
        highest_possible_score, 
        activity_date, 
        status
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
      [gradeSheetId, targetSubjCompWeightId, defaultTitle, numericMaxScore, parsedDate]
    );

    const activityId = insertResult.insertId;

    // Fetch updated component total HPS
    const [allActivities] = await db.execute(
      `SELECT 
         ga.activity_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
      [gradeSheetId]
    );

    const totalHps = { WW: 0, PT: 0, QA: 0 };
    allActivities.forEach((a) => {
      const { code: aCode } = normalizeAssessmentType(a.component_code || a.activity_name);
      if (totalHps[aCode] !== undefined) {
        totalHps[aCode] += Number(a.max_score || 0);
      }
    });

    res.status(201).json({
      message: 'Assessment created successfully',
      assessment: {
        assessment_id: activityId,
        activity_id: activityId,
        grade_sheet_id: gradeSheetId,
        subj_comp_weight_id: targetSubjCompWeightId,
        component_type_id: targetComponentTypeId,
        component_code: code,
        type: normalizedType,
        assessment_type: normalizedType,
        activity_name: defaultTitle,
        title: defaultTitle,
        max_score: numericMaxScore,
        highest_possible_score: numericMaxScore,
        activity_date: parsedDate,
        status: 'ACTIVE',
      },
      total_highest_possible_scores: totalHps,
    });
  } catch (err) {
    console.error('Error in handleCreateAssessment:', err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/assessments', handleCreateAssessment);
router.post('/class-record/assessments', handleCreateAssessment);

function sanitizeDateForSql(val) {
  if (!val) return null;
  const str = String(val).trim();
  if (str === '' || str === 'null' || str === 'undefined') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return str;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    try {
      return d.toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * PUT & PATCH /api/assessments/:id
 * Supports updating Highest Possible Score (HPS) and activity details without requiring an activity date.
 */
async function handleUpdateAssessment(req, res) {
  try {
    const assessmentId = Number(req.params.id);
    const { activity_name, max_score, highest_possible_score, activity_date, status } = req.body;

    // Check if the assessment belongs to a locked grade sheet
    const [actSheetRows] = await db.execute(
      `SELECT ga.grade_sheet_id, gs.lock_status, gs.term_id, so.school_year_id, at.term_name
       FROM GRADE_ACTIVITY ga
       JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
       JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
       LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
       WHERE ga.activity_id = ? LIMIT 1`,
      [assessmentId]
    );

    if (actSheetRows.length > 0) {
      const row = actSheetRows[0];
      const activeTerm = await resolveActiveAcademicTerm(row.school_year_id);
      const isTermActive = Boolean(activeTerm && Number(row.term_id) === Number(activeTerm.term_id));
      const isEditable = isTermActive && (
        row.lock_status === 'EDITABLE' ||
        row.lock_status === 'OPEN' ||
        row.lock_status === 'TEMPORARILY_REOPENED'
      );
      if (!isEditable) {
        return res.status(403).json({
          error: `Cannot edit assessment. This class record belongs to a closed term (${row.term_name || 'Closed Term'}) and is read-only.`,
          is_locked: true,
        });
      }
    }

    const newMaxScore = max_score !== undefined ? max_score : highest_possible_score;
    const updateFields = [];
    const updateValues = [];

    if (activity_name !== undefined && activity_name !== null && String(activity_name).trim() !== '') {
      updateFields.push('activity_name = ?');
      updateValues.push(String(activity_name).trim());
    }

    if (newMaxScore !== undefined && newMaxScore !== null) {
      const numMax = Number(newMaxScore);
      if (isNaN(numMax) || numMax <= 0) {
        return res.status(400).json({ error: 'max_score must be a positive number.' });
      }
      updateFields.push('highest_possible_score = ?');
      updateValues.push(numMax);
    }

    // Handles optional / missing activity_date cleanly:
    // If provided and valid YYYY-MM-DD, updates to it; otherwise preserves existing date or defaults to CURRENT_DATE
    if (activity_date !== undefined) {
      const dateVal = sanitizeDateForSql(activity_date);
      updateFields.push(`activity_date = CASE 
        WHEN ? IS NOT NULL AND ? != '' THEN ? 
        ELSE COALESCE(activity_date, CURRENT_DATE) 
      END`);
      updateValues.push(dateVal, dateVal, dateVal);
    }

    if (status !== undefined && status !== null) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updateValues.push(assessmentId);
    await db.execute(
      `UPDATE GRADE_ACTIVITY SET ${updateFields.join(', ')}, updated_at = NOW(6) WHERE activity_id = ?`,
      updateValues
    );

    const [rows] = await db.execute('SELECT * FROM GRADE_ACTIVITY WHERE activity_id = ?', [assessmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assessment not found.' });
    }

    res.status(200).json({
      message: 'Assessment updated successfully',
      assessment: {
        assessment_id: rows[0].activity_id,
        activity_id: rows[0].activity_id,
        activity_name: rows[0].activity_name,
        max_score: Number(rows[0].highest_possible_score),
        highest_possible_score: Number(rows[0].highest_possible_score),
        activity_date: rows[0].activity_date ? String(rows[0].activity_date).slice(0, 10) : null,
        status: rows[0].status,
      },
    });
  } catch (err) {
    console.error('Error in handleUpdateAssessment:', err);
    res.status(500).json({ error: err.message });
  }
}

router.put('/assessments/:id', handleUpdateAssessment);
router.patch('/assessments/:id', handleUpdateAssessment);
router.put('/class-record/assessments/:id', handleUpdateAssessment);
router.patch('/class-record/assessments/:id', handleUpdateAssessment);

/**
 * DELETE /api/assessments/:id
 */
router.delete('/assessments/:id', async (req, res) => {
  try {
    const assessmentId = Number(req.params.id);

    // Check if the assessment belongs to a locked grade sheet
    const [actSheetRows] = await db.execute(
      `SELECT ga.grade_sheet_id, gs.lock_status, gs.term_id, so.school_year_id, at.term_name
       FROM GRADE_ACTIVITY ga
       JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
       JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
       LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
       WHERE ga.activity_id = ? LIMIT 1`,
      [assessmentId]
    );

    if (actSheetRows.length > 0) {
      const row = actSheetRows[0];
      const activeTerm = await resolveActiveAcademicTerm(row.school_year_id);
      const isTermActive = Boolean(activeTerm && Number(row.term_id) === Number(activeTerm.term_id));
      const isEditable = isTermActive && (
        row.lock_status === 'EDITABLE' ||
        row.lock_status === 'OPEN' ||
        row.lock_status === 'TEMPORARILY_REOPENED'
      );
      if (!isEditable) {
        return res.status(403).json({
          error: `Cannot delete assessment. This class record belongs to a closed term (${row.term_name || 'Closed Term'}) and is read-only.`,
          is_locked: true,
        });
      }
    }

    await db.execute('DELETE FROM SCORE WHERE activity_id = ?', [assessmentId]);
    const [result] = await db.execute('DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?', [assessmentId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assessment not found.' });
    }
    res.json({ message: 'Assessment deleted successfully' });
  } catch (err) {
    console.error('Error in DELETE /api/assessments/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scores/batch & POST /api/class-record/scores/batch
 * Requirement 3: Score Entry Endpoint & Requirement 4: Auto-Calculation & Persistence
 */
async function handleBatchScores(req, res) {
  const connection = await db.getConnection();
  try {
    const { subject_offering_id, term = 'T1', scores } = req.body;

    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }

    const { termCode, termName } = normalizeTerm(term);

    const [offeringRows] = await connection.execute(
      `SELECT subject_id, section_id, school_year_id FROM SUBJECT_OFFERING WHERE subject_offering_id = ?`,
      [subject_offering_id]
    );

    if (offeringRows.length === 0) {
      return res.status(404).json({ error: 'Subject offering not found.' });
    }

    const { school_year_id, subject_id, section_id } = offeringRows[0];
    const activeTerm = await resolveActiveAcademicTerm(school_year_id);
    const sheetData = await ensureGradeSheet(subject_offering_id, school_year_id, termName);
    const { gradeSheetId, lockStatus, termId: sheetTermId } = sheetData;

    const isTermActive = Boolean(activeTerm && Number(sheetTermId) === Number(activeTerm.term_id));
    const isEditable = isTermActive && (
      lockStatus === 'EDITABLE' ||
      lockStatus === 'OPEN' ||
      lockStatus === 'TEMPORARILY_REOPENED'
    );

    if (!isEditable) {
      return res.status(403).json({
        error: `This class record belongs to a closed term (${termName}) and is read-only.`,
        is_locked: true,
      });
    }

    // Normalize scores input (handles flat array, student-keyed object, or nested categories)
    let scoreEntries = [];
    if (Array.isArray(scores)) {
      scoreEntries = scores;
    } else if (scores && typeof scores === 'object') {
      for (const [stId, sData] of Object.entries(scores)) {
        if (!sData || typeof sData !== 'object') continue;
        if (sData.writtenWorks || sData.performanceTasks || sData.quarterlyAssessment !== undefined) {
          if (sData.writtenWorks && typeof sData.writtenWorks === 'object') {
            for (const [colKey, val] of Object.entries(sData.writtenWorks)) {
              const cleanId = String(colKey).replace(/^ww_/, '');
              scoreEntries.push({ assessment_id: cleanId, student_id: stId, raw_score: val, type: 'writtenWork' });
            }
          }
          if (sData.performanceTasks && typeof sData.performanceTasks === 'object') {
            for (const [colKey, val] of Object.entries(sData.performanceTasks)) {
              const cleanId = String(colKey).replace(/^pt_/, '');
              scoreEntries.push({ assessment_id: cleanId, student_id: stId, raw_score: val, type: 'performanceTask' });
            }
          }
          if (sData.quarterlyAssessment !== undefined && sData.quarterlyAssessment !== '') {
            scoreEntries.push({ assessment_id: 'qa', student_id: stId, raw_score: sData.quarterlyAssessment, type: 'quarterlyAssessment' });
          }
        } else {
          for (const [assId, val] of Object.entries(sData)) {
            scoreEntries.push({ assessment_id: assId, student_id: stId, raw_score: val });
          }
        }
      }
    }

    // Fetch active activities for this sheet to resolve QA and match IDs
    const [sheetActivities] = await connection.execute(
      `SELECT ga.activity_id, ga.activity_name, ga.highest_possible_score, ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
      [gradeSheetId]
    );

    const hpsByActivityId = {};
    let qaActivityId = null;
    sheetActivities.forEach((a) => {
      hpsByActivityId[a.activity_id] = Number(a.highest_possible_score || 0);
      const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
      if (code === 'QA') qaActivityId = a.activity_id;
    });

    if (!qaActivityId) {
      // Find QA subj_comp_weight_id
      const [qaWeightRows] = await connection.execute(
        `SELECT scw.subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT scw
         JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
         WHERE scw.subject_id = ? AND scw.school_year_id = ? AND (ct.component_code IN ('QA', 'STE') OR ct.component_name LIKE '%Quarter%') LIMIT 1`,
        [subject_id, school_year_id]
      );
      const targetWeightId = qaWeightRows.length > 0 ? qaWeightRows[0].subj_comp_weight_id : null;
      const [insertQa] = await connection.execute(
        `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
         VALUES (?, ?, 'Quarterly Assessment 1', 50, NOW(), 'ACTIVE')`,
        [gradeSheetId, targetWeightId]
      );
      qaActivityId = insertQa.insertId;
      hpsByActivityId[qaActivityId] = 50;
    }

    const [secMapRows] = await connection.execute(
      `SELECT student_section_id, student_id FROM STUDENT_SECTION WHERE section_id = ?`,
      [section_id]
    );

    const secIdByStudentId = {};
    const studentIdBySecId = {};
    secMapRows.forEach((r) => {
      secIdByStudentId[r.student_id] = r.student_section_id;
      studentIdBySecId[r.student_section_id] = r.student_id;
    });

    let teacherAssignmentId = null;
    const [taRows] = await connection.execute(
      `SELECT teacher_assignment_id FROM TEACHER_ASSIGNMENT WHERE subject_offering_id = ? ORDER BY teacher_assignment_id DESC LIMIT 1`,
      [subject_offering_id]
    );
    if (taRows.length > 0) {
      teacherAssignmentId = taRows[0].teacher_assignment_id;
    } else {
      const [anyTa] = await connection.execute(`SELECT teacher_assignment_id FROM TEACHER_ASSIGNMENT LIMIT 1`);
      if (anyTa.length > 0) {
        teacherAssignmentId = anyTa[0].teacher_assignment_id;
      }
    }

    await connection.beginTransaction();

    for (const item of scoreEntries) {
      let assessmentId = Number(item.assessment_id || item.activity_id);
      const isQAItem =
        item.type === 'quarterlyAssessment' ||
        item.assessment_id === 'qa' ||
        item.activity_id === 'qa' ||
        (isNaN(assessmentId) && String(item.assessment_id).toLowerCase().includes('qa'));

      if (isQAItem) {
        assessmentId = qaActivityId;
      }

      let studentSectionId = item.student_section_id ? Number(item.student_section_id) : null;
      let studentId = item.student_id ? Number(item.student_id) : null;

      if (!studentSectionId && studentId) {
        studentSectionId = secIdByStudentId[studentId] || null;
      }
      if (!studentId && studentSectionId) {
        studentId = studentIdBySecId[studentSectionId] || null;
      }

      if (!studentSectionId && studentId) {
        const [existingSS] = await connection.execute(
          'SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ? AND section_id = ? LIMIT 1',
          [studentId, section_id]
        );
        if (existingSS.length > 0) {
          studentSectionId = existingSS[0].student_section_id;
          secIdByStudentId[studentId] = studentSectionId;
          studentIdBySecId[studentSectionId] = studentId;
        } else {
          const [newSS] = await connection.execute(
            'INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)',
            [studentId, section_id, school_year_id]
          );
          studentSectionId = newSS.insertId;
          secIdByStudentId[studentId] = studentSectionId;
          studentIdBySecId[studentSectionId] = studentId;
        }
      }

      if (!assessmentId) continue;

      const rawScore = item.raw_score !== null && item.raw_score !== undefined && item.raw_score !== ''
        ? Number(item.raw_score)
        : null;

      // Backend Guard: Validate raw_score does not exceed highest_possible_score
      if (rawScore !== null) {
        if (rawScore < 0) {
          await connection.rollback();
          return res.status(400).json({
            error: `Score cannot be negative (received: ${rawScore}).`,
          });
        }
        const maxHPS = hpsByActivityId[assessmentId];
        if (maxHPS !== undefined && maxHPS > 0 && rawScore > maxHPS) {
          await connection.rollback();
          return res.status(400).json({
            error: `Score (${rawScore}) cannot exceed the Highest Possible Score (${maxHPS}).`,
          });
        }
      }

      const scoreStatus = rawScore !== null ? 'ENCODED' : 'NOT_ENCODED';
      const itemTeacherAssId = item.teacher_assignment_id || teacherAssignmentId;

      let existingScore = [];
      if (studentSectionId) {
        [existingScore] = await connection.execute(
          `SELECT score_id FROM SCORE WHERE activity_id = ? AND student_section_id = ? LIMIT 1 FOR UPDATE`,
          [assessmentId, studentSectionId]
        );
      }

      if (existingScore.length > 0) {
        await connection.execute(
          `UPDATE SCORE 
           SET raw_score = ?, score_status = ?, updated_at = NOW(6)
           WHERE score_id = ?`,
          [rawScore, scoreStatus, existingScore[0].score_id]
        );
      } else {
        await connection.execute(
          `INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at)
           VALUES (?, ?, ?, ?, ?, NOW(6))
           ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score), score_status = VALUES(score_status), updated_at = NOW(6)`,
          [assessmentId, studentSectionId, rawScore, scoreStatus, itemTeacherAssId]
        );
      }
    }

    let weights = { ...DEFAULT_JHS_WEIGHTS };
    const [weightRows] = await connection.execute(
      `SELECT scw.percentage AS weight_percentage, ct.component_code
       FROM SUBJECT_COMPONENT_WEIGHT scw
       JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE scw.subject_id = ? AND scw.school_year_id = ?`,
      [subject_id, school_year_id]
    );

    if (weightRows.length > 0) {
      weightRows.forEach((w) => {
        const { code } = normalizeAssessmentType(w.component_code);
        if (code === 'WW' || code === 'PT' || code === 'QA') {
          weights[code] = Number(w.weight_percentage);
        }
      });
    }

    const [assessments] = await connection.execute(
      `SELECT 
         ga.activity_id AS assessment_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
      [gradeSheetId]
    );

    const [allStudents] = await connection.execute(
      `SELECT s.student_id, ss.student_section_id
       FROM STUDENT_SECTION ss
       JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)`,
      [section_id]
    );

    let allRawScores = {};
    if (assessments.length > 0) {
      const actIds = assessments.map((a) => a.assessment_id);
      const ph = actIds.map(() => '?').join(',');
      const [scoreData] = await connection.execute(
        `SELECT activity_id, student_section_id, raw_score FROM SCORE WHERE activity_id IN (${ph})`,
        actIds
      );

      scoreData.forEach((s) => {
        if (s.student_section_id) {
          if (!allRawScores[s.student_section_id]) allRawScores[s.student_section_id] = {};
          allRawScores[s.student_section_id][s.activity_id] = s.raw_score !== null ? Number(s.raw_score) : null;

          const sId = studentIdBySecId[s.student_section_id];
          if (sId) {
            if (!allRawScores[`st_${sId}`]) allRawScores[`st_${sId}`] = {};
            allRawScores[`st_${sId}`][s.activity_id] = s.raw_score !== null ? Number(s.raw_score) : null;
          }
        }
      });
    }

    const gradesToUpsert = [];
    const calculatedResults = {};

    allStudents.forEach((student) => {
      const sSecId = student.student_section_id;
      const sId = student.student_id;
      const studentScores = {
        ...(sSecId && allRawScores[sSecId] ? allRawScores[sSecId] : {}),
        ...(sId && allRawScores[`st_${sId}`] ? allRawScores[`st_${sId}`] : {}),
      };

      const summary = calculateStudentSummary({
        assessments: assessments.map((a) => ({
          assessment_id: a.assessment_id,
          component_code: normalizeAssessmentType(a.component_code || a.activity_name).code,
          max_score: Number(a.max_score || 0),
        })),
        scores: studentScores,
        weights,
      });

      calculatedResults[sId] = summary;

      if (summary.initialGrade !== null) {
        gradesToUpsert.push({
          subject_offering_id,
          student_id: sId,
          student_section_id: sSecId,
          term: termCode,
          initial_grade: summary.initialGrade,
          quarterly_grade: summary.quarterlyGrade,
          remarks: summary.remarks,
        });
      }
    });

    for (const g of gradesToUpsert) {
      await connection.execute(
        `INSERT INTO STUDENT_GRADE (
          subject_offering_id,
          student_id,
          student_section_id,
          term,
          initial_grade,
          quarterly_grade,
          remarks,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
        ON DUPLICATE KEY UPDATE
          student_section_id = VALUES(student_section_id),
          initial_grade = VALUES(initial_grade),
          quarterly_grade = VALUES(quarterly_grade),
          remarks = VALUES(remarks),
          updated_at = NOW(6)`,
        [
          g.subject_offering_id,
          g.student_id,
          g.student_section_id || null,
          g.term,
          g.initial_grade,
          g.quarterly_grade,
          g.remarks,
        ]
      );
    }

    await connection.commit();

    res.json({
      message: 'Scores batch saved and grades calculated successfully',
      subject_offering_id,
      term: termCode,
      recalculated_grades_count: gradesToUpsert.length,
      students: calculatedResults,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error in POST /api/scores/batch:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
}

router.post('/scores/batch', handleBatchScores);
router.post('/class-record/scores/batch', handleBatchScores);

/**
 * POST /api/class-record/calculate-and-save
 */
router.post('/class-record/calculate-and-save', async (req, res) => {
  try {
    const { subject_offering_id, term = 'T1' } = req.body;
    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }
    await handleBatchScores({ body: { subject_offering_id, term, scores: [] } }, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/class-record/:subject_offering_id/export
 * Requirement 4: Official DepEd Order No. 8, s. 2015 Excel / Spreadsheet Export
 */
router.get('/class-record/:subject_offering_id/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const subjectOfferingId = Number(req.params.subject_offering_id);
    const rawTerm = req.query.term || 'T1';
    const { termCode, termName } = normalizeTerm(rawTerm);

    // 1. Fetch class context & metadata
    const [contextRows] = await db.execute(
      `SELECT 
         so.subject_offering_id,
         so.subject_id,
         so.section_id,
         so.school_year_id,
         s.subject_name,
         s.subject_code,
         sec.section_name,
         sec.grade_level_id,
         gl.grade_level_name,
         sy.starts_on AS sy_starts_on,
         sy.ends_on AS sy_ends_on,
         sch.school_name,
         sch.school_code,
         sch.region,
         sch.division,
         CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
       FROM SUBJECT_OFFERING so
       LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
       LEFT JOIN SECTION sec ON sec.section_id = so.section_id
       LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
       LEFT JOIN SCHOOL sch ON 1=1
       LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
       LEFT JOIN USER u ON u.user_id = ta.user_id
       WHERE so.subject_offering_id = ?
       LIMIT 1`,
      [subjectOfferingId]
    );

    if (contextRows.length === 0) {
      return res.status(404).json({ error: 'Class record offering not found.' });
    }

    const ctx = contextRows[0];
    const schoolYearId = ctx.school_year_id;
    const subjectId = ctx.subject_id;
    const sectionId = ctx.section_id;

    // 2. Fetch weights
    let weights = { ...DEFAULT_JHS_WEIGHTS };
    const [weightRows] = await db.execute(
      `SELECT scw.percentage AS weight_percentage, ct.component_code
       FROM SUBJECT_COMPONENT_WEIGHT scw
       JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE scw.subject_id = ? AND scw.school_year_id = ?`,
      [subjectId, schoolYearId]
    );
    if (weightRows.length > 0) {
      weightRows.forEach((w) => {
        let code = (w.component_code || '').toUpperCase();
        if (code === 'STE') code = 'QA';
        if (code === 'WW' || code === 'PT' || code === 'QA') {
          weights[code] = Number(w.weight_percentage);
        }
      });
    }

    // 3. Fetch assessments
    const { gradeSheetId } = await ensureGradeSheet(subjectOfferingId, schoolYearId, termName);
    const [activityRows] = await db.execute(
      `SELECT 
         ga.activity_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)
       ORDER BY ga.activity_id ASC`,
      [gradeSheetId]
    );

    const wwCols = [];
    const ptCols = [];
    let qaAssessment = null;

    activityRows.forEach((a) => {
      let code = (a.component_code || '').toUpperCase();
      if (!code) {
        const name = (a.activity_name || '').toUpperCase();
        if (name.includes('WW') || name.includes('WRITTEN') || name.includes('QUIZ')) code = 'WW';
        else if (name.includes('PT') || name.includes('PERFORMANCE') || name.includes('TASK')) code = 'PT';
        else code = 'QA';
      }
      if (code === 'STE') code = 'QA';

      const item = {
        id: a.activity_id,
        name: a.activity_name || `Assessment ${a.activity_id}`,
        max_score: Number(a.max_score || 0),
        component_code: code,
      };

      if (code === 'WW') wwCols.push(item);
      else if (code === 'PT') ptCols.push(item);
      else qaAssessment = item;
    });

    // Fallback default columns if none in DB
    if (wwCols.length === 0) {
      for (let i = 1; i <= 5; i++) wwCols.push({ id: `ww${i}`, name: `Written Work ${i}`, max_score: 20, component_code: 'WW' });
    }
    if (ptCols.length === 0) {
      for (let i = 1; i <= 5; i++) ptCols.push({ id: `pt${i}`, name: `Performance Task ${i}`, max_score: 50, component_code: 'PT' });
    }
    if (!qaAssessment) {
      qaAssessment = { id: 'qa1', name: 'Quarterly Assessment 1', max_score: 50, component_code: 'QA' };
    }

    // 4. Fetch students & scores
    const [studentRows] = await db.execute(
      `SELECT 
         s.student_id,
         ss.student_section_id,
         s.LRN,
         s.first_name,
         s.middle_name,
         s.last_name,
         s.sex
       FROM STUDENT_SECTION ss
       JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)
       ORDER BY 
         CASE WHEN UPPER(s.sex) IN ('M', 'MALE') THEN 0 ELSE 1 END ASC,
         s.last_name ASC,
         s.first_name ASC`,
      [sectionId]
    );

    let allRawScores = {};
    if (activityRows.length > 0) {
      const actIds = activityRows.map((a) => a.activity_id);
      const ph = actIds.map(() => '?').join(',');
      const [scoreData] = await db.execute(
        `SELECT activity_id, student_section_id, student_id, raw_score FROM SCORE WHERE activity_id IN (${ph})`,
        actIds
      );
      scoreData.forEach((s) => {
        if (s.student_section_id) {
          if (!allRawScores[s.student_section_id]) allRawScores[s.student_section_id] = {};
          allRawScores[s.student_section_id][s.activity_id] = s.raw_score !== null ? Number(s.raw_score) : null;
        }
        if (s.student_id) {
          if (!allRawScores[`st_${s.student_id}`]) allRawScores[`st_${s.student_id}`] = {};
          allRawScores[`st_${s.student_id}`][s.activity_id] = s.raw_score !== null ? Number(s.raw_score) : null;
        }
      });
    }

    // 5. Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Auralis Academic Management Record System';
    workbook.lastModifiedBy = 'DepEd Order No. 8, s. 2015 Standard Module';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Class Record', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    // Top DepEd Header Block
    sheet.mergeCells('A1:O1');
    sheet.getCell('A1').value = 'DEPARTMENT OF EDUCATION - REGION X - DIVISION OF GINGOOG CITY';
    sheet.getCell('A1').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF102F55' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:O2');
    sheet.getCell('A2').value = 'CLASS RECORD (DepEd Order No. 8, s. 2015)';
    sheet.getCell('A2').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0D2949' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Metadata Row
    sheet.getCell('A4').value = `School Name: ${ctx.school_name || 'Gingoog City Comprehensive NHS'}`;
    sheet.getCell('A4').font = { bold: true };
    sheet.getCell('F4').value = `School ID: ${ctx.school_code || '304033'}`;
    sheet.getCell('F4').font = { bold: true };
    sheet.getCell('K4').value = `School Year: ${ctx.sy_starts_on ? `${ctx.sy_starts_on}-${ctx.sy_ends_on}` : '2026-2027'}`;
    sheet.getCell('K4').font = { bold: true };

    sheet.getCell('A5').value = `Grade & Section: ${ctx.grade_level_name || 'Grade 7'} - ${ctx.section_name || 'Mahogany'}`;
    sheet.getCell('A5').font = { bold: true };
    sheet.getCell('F5').value = `Teacher: ${ctx.teacher_name || 'Subject Teacher'}`;
    sheet.getCell('F5').font = { bold: true };
    sheet.getCell('K5').value = `Subject: ${ctx.subject_name || 'Mathematics'} (${termCode})`;
    sheet.getCell('K5').font = { bold: true };

    // Headers Construction
    const headerRow1 = ['No.', 'LRN', "Learners' Name"];
    const headerRow2 = ['', '', ''];
    const hpsRow = ['HIGHEST POSSIBLE SCORE', '', ''];

    // Written Works columns
    const wwStartCol = headerRow1.length + 1;
    wwCols.forEach((col, idx) => {
      headerRow1.push(`Written Works (${weights.WW}%)`);
      headerRow2.push(String(idx + 1));
      hpsRow.push(col.max_score);
    });
    headerRow1.push(`Written Works (${weights.WW}%)`, `Written Works (${weights.WW}%)`, `Written Works (${weights.WW}%)`);
    headerRow2.push('Total', 'PS', 'WS');
    const totalWWHps = wwCols.reduce((sum, c) => sum + c.max_score, 0);
    hpsRow.push(totalWWHps, '100%', `${weights.WW}%`);
    const wwEndCol = headerRow1.length;

    // Performance Tasks columns
    const ptStartCol = headerRow1.length + 1;
    ptCols.forEach((col, idx) => {
      headerRow1.push(`Performance Tasks (${weights.PT}%)`);
      headerRow2.push(String(idx + 1));
      hpsRow.push(col.max_score);
    });
    headerRow1.push(`Performance Tasks (${weights.PT}%)`, `Performance Tasks (${weights.PT}%)`, `Performance Tasks (${weights.PT}%)`);
    headerRow2.push('Total', 'PS', 'WS');
    const totalPTHps = ptCols.reduce((sum, c) => sum + c.max_score, 0);
    hpsRow.push(totalPTHps, '100%', `${weights.PT}%`);
    const ptEndCol = headerRow1.length;

    // Quarterly Assessment columns
    const qaStartCol = headerRow1.length + 1;
    headerRow1.push(`Quarterly Assessment (${weights.QA}%)`, `Quarterly Assessment (${weights.QA}%)`, `Quarterly Assessment (${weights.QA}%)`);
    headerRow2.push('1', 'PS', 'WS');
    const totalQAHps = qaAssessment.max_score || 50;
    hpsRow.push(totalQAHps, '100%', `${weights.QA}%`);
    const qaEndCol = headerRow1.length;

    // Final Grades columns
    headerRow1.push('Initial Grade', 'Quarterly Grade');
    headerRow2.push('', '');
    hpsRow.push(100, 100);

    const r7 = sheet.addRow(headerRow1);
    const r8 = sheet.addRow(headerRow2);
    const r9 = sheet.addRow(hpsRow);

    // Styling Header Rows
    r7.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    r7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102F55' } };
    r7.alignment = { horizontal: 'center', vertical: 'middle' };

    r8.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E293B' } };
    r8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    r8.alignment = { horizontal: 'center', vertical: 'middle' };

    r9.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
    r9.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    r9.alignment = { horizontal: 'center', vertical: 'middle' };

    // Merging category spans
    sheet.mergeCells(7, 1, 8, 1); // No
    sheet.mergeCells(7, 2, 8, 2); // LRN
    sheet.mergeCells(7, 3, 8, 3); // Name
    sheet.mergeCells(7, wwStartCol, 7, wwEndCol); // WW
    sheet.mergeCells(7, ptStartCol, 7, ptEndCol); // PT
    sheet.mergeCells(7, qaStartCol, 7, qaEndCol); // QA
    sheet.mergeCells(7, headerRow1.length - 1, 8, headerRow1.length - 1); // Initial Grade
    sheet.mergeCells(7, headerRow1.length, 8, headerRow1.length); // Quarterly Grade
    sheet.mergeCells(9, 1, 9, 3); // HPS Label

    // Add Students grouped by Sex
    const males = studentRows.filter((s) => (s.sex || 'M').toUpperCase().startsWith('M'));
    const females = studentRows.filter((s) => (s.sex || 'M').toUpperCase().startsWith('F'));

    const addStudentGroup = (list, groupLabel, startIndex) => {
      // Gender divider row
      const divRow = sheet.addRow([groupLabel]);
      sheet.mergeCells(divRow.number, 1, divRow.number, headerRow1.length);
      divRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      divRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B566E' } };
      divRow.alignment = { horizontal: 'left', indent: 1 };

      list.forEach((st, idx) => {
        const studentSecId = st.student_section_id;
        const studentId = st.student_id;
        const scores = (studentSecId && allRawScores[studentSecId]) || allRawScores[`st_${studentId}`] || {};

        const assessmentsPayload = [
          ...wwCols.map((c) => ({ assessment_id: c.id, component_code: 'WW', max_score: c.max_score })),
          ...ptCols.map((c) => ({ assessment_id: c.id, component_code: 'PT', max_score: c.max_score })),
          { assessment_id: qaAssessment.id, component_code: 'QA', max_score: qaAssessment.max_score },
        ];

        const summary = calculateStudentGrades({ assessments: assessmentsPayload, scores, weights });

        const rowValues = [
          startIndex + idx,
          st.LRN,
          `${st.last_name}, ${st.first_name} ${st.middle_name ? st.middle_name[0] + '.' : ''}`,
        ];

        // WW
        wwCols.forEach((c) => {
          const val = scores[c.id];
          rowValues.push(val !== undefined && val !== null ? val : '');
        });
        rowValues.push(summary.components.WW.totalRaw || 0, `${summary.components.WW.ps}%`, summary.components.WW.ws);

        // PT
        ptCols.forEach((c) => {
          const val = scores[c.id];
          rowValues.push(val !== undefined && val !== null ? val : '');
        });
        rowValues.push(summary.components.PT.totalRaw || 0, `${summary.components.PT.ps}%`, summary.components.PT.ws);

        // QA
        const qaVal = scores[qaAssessment.id];
        rowValues.push(qaVal !== undefined && qaVal !== null ? qaVal : '', `${summary.components.QA.ps}%`, summary.components.QA.ws);

        // Final Grades
        rowValues.push(summary.initialGrade !== null ? summary.initialGrade : '-', summary.quarterlyGrade !== null ? summary.quarterlyGrade : '-');

        const studentRow = sheet.addRow(rowValues);
        studentRow.alignment = { horizontal: 'center', vertical: 'middle' };
        studentRow.getCell(3).alignment = { horizontal: 'left', indent: 1 };

        // Highlight failing individual grades softly
        if (summary.isFailing) {
          const qgCell = studentRow.getCell(headerRow1.length);
          qgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          qgCell.font = { bold: true, color: { argb: 'FF991B1B' } };
        }
      });
    };

    addStudentGroup(males, 'MALE', 1);
    addStudentGroup(females, 'FEMALE', males.length + 1);

    // Apply borders and column widths
    sheet.columns.forEach((column, colIdx) => {
      if (colIdx === 0) column.width = 6;
      else if (colIdx === 1) column.width = 16;
      else if (colIdx === 2) column.width = 28;
      else column.width = 8;
    });

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 7) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
        });
      }
    });

    const safeSecName = (ctx.section_name || 'Section').replace(/[^a-zA-Z0-9]/g, '_');
    const safeSubjName = (ctx.subject_name || 'Subject').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Class_Record_${safeSubjName}_${safeSecName}_${termCode}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting Class Record Excel:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

