const express = require('express');
const router = express.Router();
const db = require('../config/db');
const StudentGrade = require('../models/StudentGrade');
const {
  DEFAULT_JHS_WEIGHTS,
  calculateStudentSummary,
  calculateStudentGrades,
  transmuteGrade,
  getTransmutedGrade,
  getGradeDescriptor,
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
    lower === 'ex' ||
    lower.includes('quarterly') ||
    lower.includes('assessment') ||
    lower.includes('exam') ||
    lower.includes('summative') ||
    lower.includes('st1') ||
    lower.includes('st2') ||
    lower.includes('te')
  ) {
    return { code: 'QA', type: 'quarterlyAssessment', name: 'Examinations' };
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
  let hasST1 = false;
  let hasST2 = false;
  let hasTE = false;
  let legacyQAActivity = null;

  existing.forEach((a) => {
    const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
    const name = String(a.activity_name || "").toUpperCase();
    if (code === 'WW') hasWW = true;
    if (code === 'PT') hasPT = true;
    if (code === 'QA' || code === 'EX') {
      if (name.includes('ST1') || name.includes('SUMMATIVE TEST 1') || name.includes('SUMMATIVE 1')) {
        hasST1 = true;
      } else if (name.includes('ST2') || name.includes('SUMMATIVE TEST 2') || name.includes('SUMMATIVE 2')) {
        hasST2 = true;
      } else if (name.includes('TE') || name.includes('TERM EXAM')) {
        hasTE = true;
      } else {
        legacyQAActivity = a;
      }
    }
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
    if (code === 'QA' || code === 'EX') qaWeightId = w.subj_comp_weight_id;
  });

  const today = new Date().toISOString().slice(0, 10);

  // If no WW columns exist, insert 1 default WW
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

  // If no PT columns exist, insert 1 default PT
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

  // If a legacy QA activity exists (e.g. "Quarterly Assessment 1") and we don't have a TE yet, migrate/rename it to "Term Exam"
  if (legacyQAActivity && !hasTE) {
    await db.execute(
      `UPDATE GRADE_ACTIVITY SET activity_name = 'Term Exam' WHERE activity_id = ?`,
      [legacyQAActivity.activity_id]
    );
    hasTE = true;
  }

  // Ensure ST1, ST2, and TE all exist individually
  if (!hasST1) {
    await db.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, 'Summative Test 1', 25, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, today]
    );
  }

  if (!hasST2) {
    await db.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, 'Summative Test 2', 25, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, today]
    );
  }

  if (!hasTE) {
    await db.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, 'Term Exam', 50, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, today]
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
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name, u.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u_adv.first_name, u_adv.middle_name, u_adv.last_name, u_adv.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')
           ) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id
         LEFT JOIN USER u_adv ON u_adv.user_id = saa.user_id
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
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name, u.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u_adv.first_name, u_adv.middle_name, u_adv.last_name, u_adv.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')
           ) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id
         LEFT JOIN USER u_adv ON u_adv.user_id = saa.user_id
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
           COALESCE(
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name, u.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u_adv.first_name, u_adv.middle_name, u_adv.last_name, u_adv.extension_name)), ''),
             NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')
           ) AS teacher_name
         FROM SUBJECT_OFFERING so
         LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
         LEFT JOIN SECTION sec ON sec.section_id = so.section_id
         LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
         LEFT JOIN SCHOOL sch ON 1=1
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
         LEFT JOIN USER u ON u.user_id = ta.user_id
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id
         LEFT JOIN USER u_adv ON u_adv.user_id = saa.user_id
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

    // Resolve specific activity IDs for ST1, ST2, and TE
    let st1ActId = null;
    let st2ActId = null;
    let teActId = null;
    assessments.forEach((a) => {
      const aName = String(a.activity_name || '').toUpperCase();
      const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
      if (code === 'QA' || code === 'EX') {
        if (aName.includes('ST1') || aName.includes('SUMMATIVE TEST 1') || aName.includes('SUMMATIVE 1')) st1ActId = a.assessment_id;
        else if (aName.includes('ST2') || aName.includes('SUMMATIVE TEST 2') || aName.includes('SUMMATIVE 2')) st2ActId = a.assessment_id;
        else if (aName.includes('TE') || aName.includes('TERM EXAM') || aName.includes('QUARTERLY ASSESSMENT')) teActId = a.assessment_id;
      }
    });

    // 8. Build student payload with computed DepEd grades
    const computedStudents = studentRows.map((student) => {
      const studentSecId = student.student_section_id;
      const studentId = student.student_id;

      const rawScores = {
        ...(studentSecId && scoreMapByStudentSec[studentSecId] ? scoreMapByStudentSec[studentSecId] : {}),
        ...(studentId && scoreMapByStudentId[studentId] ? scoreMapByStudentId[studentId] : {}),
      };

      const studentExaminations = {
        st1: (st1ActId && rawScores[st1ActId] !== undefined && rawScores[st1ActId] !== null) ? rawScores[st1ActId] : (rawScores.st1 ?? ''),
        st2: (st2ActId && rawScores[st2ActId] !== undefined && rawScores[st2ActId] !== null) ? rawScores[st2ActId] : (rawScores.st2 ?? ''),
        te: (teActId && rawScores[teActId] !== undefined && rawScores[teActId] !== null) ? rawScores[teActId] : (rawScores.te ?? rawScores.qa ?? ''),
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
        examinations: studentExaminations,
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
          if (sData.examinations && typeof sData.examinations === 'object') {
            for (const [examKey, val] of Object.entries(sData.examinations)) {
              scoreEntries.push({ assessment_id: examKey, student_id: stId, raw_score: val, type: 'examinations' });
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

    // Fetch active activities for this sheet to resolve QA/EX and match IDs
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
    let st1ActivityId = null;
    let st2ActivityId = null;
    let teActivityId = null;

    sheetActivities.forEach((a) => {
      hpsByActivityId[a.activity_id] = Number(a.highest_possible_score || 0);
      const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
      const aName = String(a.activity_name || '').toUpperCase();
      if (code === 'QA' || code === 'EX') {
        if (!qaActivityId) qaActivityId = a.activity_id;
        if (aName.includes('ST1') || aName.includes('SUMMATIVE TEST 1') || aName.includes('SUMMATIVE 1')) st1ActivityId = a.activity_id;
        else if (aName.includes('ST2') || aName.includes('SUMMATIVE TEST 2') || aName.includes('SUMMATIVE 2')) st2ActivityId = a.activity_id;
        else if (aName.includes('TE') || aName.includes('TERM EXAM')) teActivityId = a.activity_id;
      }
    });

    // Ensure ST1, ST2, and TE exist in GRADE_ACTIVITY so they each have a distinct activity_id
    if (!st1ActivityId || !st2ActivityId || !teActivityId) {
      const [qaWeightRows] = await connection.execute(
        `SELECT scw.subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT scw
         JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
         WHERE scw.subject_id = ? AND scw.school_year_id = ? AND (ct.component_code IN ('QA', 'STE', 'EX') OR ct.component_name LIKE '%Quarter%') LIMIT 1`,
        [subject_id, school_year_id]
      );
      const targetWeightId = qaWeightRows.length > 0 ? qaWeightRows[0].subj_comp_weight_id : null;

      if (!st1ActivityId) {
        const [insSt1] = await connection.execute(
          `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
           VALUES (?, ?, 'Summative Test 1', 25, NOW(), 'ACTIVE')`,
          [gradeSheetId, targetWeightId]
        );
        st1ActivityId = insSt1.insertId;
        hpsByActivityId[st1ActivityId] = 25;
      }

      if (!st2ActivityId) {
        const [insSt2] = await connection.execute(
          `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
           VALUES (?, ?, 'Summative Test 2', 25, NOW(), 'ACTIVE')`,
          [gradeSheetId, targetWeightId]
        );
        st2ActivityId = insSt2.insertId;
        hpsByActivityId[st2ActivityId] = 25;
      }

      if (!teActivityId) {
        if (qaActivityId && qaActivityId !== st1ActivityId && qaActivityId !== st2ActivityId) {
          await connection.execute(
            `UPDATE GRADE_ACTIVITY SET activity_name = 'Term Exam' WHERE activity_id = ?`,
            [qaActivityId]
          );
          teActivityId = qaActivityId;
        } else {
          const [insTe] = await connection.execute(
            `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, activity_date, status)
             VALUES (?, ?, 'Term Exam', 50, NOW(), 'ACTIVE')`,
            [gradeSheetId, targetWeightId]
          );
          teActivityId = insTe.insertId;
          hpsByActivityId[teActivityId] = 50;
        }
      }
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
      const rawAssId = String(item.assessment_id || item.activity_id || '').toLowerCase();
      const examKey = String(item.exam_key || '').toLowerCase();
      let assessmentId = Number(item.assessment_id || item.activity_id);

      if (examKey === 'st1' || rawAssId === 'st1' || rawAssId.includes('st1')) {
        assessmentId = st1ActivityId;
      } else if (examKey === 'st2' || rawAssId === 'st2' || rawAssId.includes('st2')) {
        assessmentId = st2ActivityId;
      } else if (examKey === 'te' || rawAssId === 'te' || rawAssId.includes('termexam') || rawAssId === 'qa' || item.type === 'quarterlyAssessment') {
        assessmentId = teActivityId;
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

      calculatedResults[sId] = {
        ...summary,
        examinations: {
          st1: st1ActivityId && studentScores[st1ActivityId] !== undefined ? studentScores[st1ActivityId] : '',
          st2: st2ActivityId && studentScores[st2ActivityId] !== undefined ? studentScores[st2ActivityId] : '',
          te: teActivityId && studentScores[teActivityId] !== undefined ? studentScores[teActivityId] : '',
        },
      };

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
    let st1Ass = null;
    let st2Ass = null;
    let teAss = null;

    activityRows.forEach((a) => {
      let code = (a.component_code || '').toUpperCase();
      const name = (a.activity_name || '').toUpperCase();
      if (!code) {
        if (name.includes('WW') || name.includes('WRITTEN') || name.includes('QUIZ')) code = 'WW';
        else if (name.includes('PT') || name.includes('PERFORMANCE') || name.includes('TASK')) code = 'PT';
        else code = 'QA';
      }
      if (code === 'STE' || code === 'EX') code = 'QA';

      const item = {
        id: a.activity_id,
        name: a.activity_name || `Assessment ${a.activity_id}`,
        max_score: Number(a.max_score || 0),
        component_code: code,
      };

      if (code === 'WW') {
        wwCols.push(item);
      } else if (code === 'PT') {
        ptCols.push(item);
      } else {
        if (name.includes('ST1') || name.includes('SUMMATIVE 1') || name.includes('SUMMATIVE TEST 1')) {
          st1Ass = item;
        } else if (name.includes('ST2') || name.includes('SUMMATIVE 2') || name.includes('SUMMATIVE TEST 2')) {
          st2Ass = item;
        } else {
          teAss = item;
        }
      }
    });

    // Fallback default columns if none in DB
    if (wwCols.length === 0) {
      for (let i = 1; i <= 4; i++) wwCols.push({ id: `ww${i}`, name: `Written Work ${i}`, max_score: 25, component_code: 'WW' });
    }
    if (ptCols.length === 0) {
      for (let i = 1; i <= 3; i++) ptCols.push({ id: `pt${i}`, name: `Performance Task ${i}`, max_score: 50, component_code: 'PT' });
    }
    if (!st1Ass) st1Ass = { id: 'st1', name: 'Summative Test 1', max_score: 25, component_code: 'QA' };
    if (!st2Ass) st2Ass = { id: 'st2', name: 'Summative Test 2', max_score: 25, component_code: 'QA' };
    if (!teAss) teAss = { id: 'te', name: 'Term Exam', max_score: 50, component_code: 'QA' };

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
        `SELECT activity_id, student_section_id, raw_score FROM SCORE WHERE activity_id IN (${ph})`,
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

    const termNum = termCode.replace(/\D/g, '') || '1';
    const termTitle = `CLASS RECORD - TERM ${termNum}`;
    const termHeader = termCode === 'T1' ? 'FIRST TERM' : (termCode === 'T2' ? 'SECOND TERM' : (termCode === 'T3' ? 'THIRD TERM' : 'FOURTH TERM'));

    const sheet = workbook.addWorksheet(termTitle, {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const wwColsCount = wwCols.length + 3;
    const ptColsCount = ptCols.length + 3;
    const exColsCount = 8;
    const summaryColsCount = 3;
    const totalCols = 2 + wwColsCount + ptColsCount + exColsCount + summaryColsCount;

    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };

    // Row 1: Title Header Banner
    sheet.mergeCells(1, 1, 1, totalCols);
    const titleCell = sheet.getCell('A1');
    titleCell.value = termTitle;
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F2E53' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    // Row 2: Metadata Row 1 (REGION, DIVISION, SCHOOL ID)
    sheet.getRow(2).height = 20;
    sheet.getCell(2, 2).value = 'REGION';
    sheet.getCell(2, 2).font = { bold: true, size: 9 };
    sheet.getCell(2, 2).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.mergeCells(2, 3, 2, 6);
    sheet.getCell(2, 3).value = ctx.region || 'Region X';
    sheet.getCell(2, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3; c <= 6; c++) sheet.getCell(2, c).border = thinBorder;

    sheet.getCell(2, 8).value = 'DIVISION';
    sheet.getCell(2, 8).font = { bold: true, size: 9 };
    sheet.getCell(2, 8).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.mergeCells(2, 9, 2, 12);
    sheet.getCell(2, 9).value = ctx.division || 'GINGOOG';
    sheet.getCell(2, 9).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 9; c <= 12; c++) sheet.getCell(2, c).border = thinBorder;

    sheet.getCell(2, 14).value = 'SCHOOL ID';
    sheet.getCell(2, 14).font = { bold: true, size: 9 };
    sheet.getCell(2, 14).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.mergeCells(2, 15, 2, 18);
    sheet.getCell(2, 15).value = ctx.school_code || '304130';
    sheet.getCell(2, 15).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 15; c <= 18; c++) sheet.getCell(2, c).border = thinBorder;

    // Row 3: Metadata Row 2 (SCHOOL NAME, SCHOOL YEAR)
    sheet.getRow(3).height = 20;
    sheet.getCell(3, 2).value = 'SCHOOL NAME';
    sheet.getCell(3, 2).font = { bold: true, size: 9 };
    sheet.getCell(3, 2).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.mergeCells(3, 3, 3, 12);
    sheet.getCell(3, 3).value = ctx.school_name || 'GINGOOG CITY COMPREHENSIVE NHS';
    sheet.getCell(3, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3; c <= 12; c++) sheet.getCell(3, c).border = thinBorder;

    sheet.getCell(3, 14).value = 'SCHOOL YEAR';
    sheet.getCell(3, 14).font = { bold: true, size: 9 };
    sheet.getCell(3, 14).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.mergeCells(3, 15, 2, 18); // fallback safe merge
    sheet.mergeCells(3, 15, 3, 18);
    sheet.getCell(3, 15).value = ctx.sy_starts_on ? `${ctx.sy_starts_on}-${ctx.sy_ends_on}` : '2026-2027';
    sheet.getCell(3, 15).alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 15; c <= 18; c++) sheet.getCell(3, c).border = thinBorder;

    // Row 4: Navy Accent Bar
    sheet.mergeCells(4, 1, 4, totalCols);
    sheet.getCell(4, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E53' } };
    sheet.getRow(4).height = 8;

    // Split calculations for stacked headers
    const wwHalf1 = Math.max(1, Math.floor(wwColsCount / 2));
    const wwHalf2 = Math.max(1, wwColsCount - wwHalf1);
    const ptHalf1 = Math.max(1, Math.floor(ptColsCount / 2));
    const ptHalf2 = Math.max(1, ptColsCount - ptHalf1);
    const subjHalf1 = 3;
    const subjHalf2 = Math.max(1, exColsCount + summaryColsCount - subjHalf1);

    // Row 5: Table Header Row 1 (GRADE LEVEL, TEACHER, SUBJECT)
    // Cols 1 & 2 merged across Rows 5 to 8 for FIRST TERM
    sheet.mergeCells(5, 1, 8, 2);
    const termColCell = sheet.getCell(5, 1);
    termColCell.value = termHeader;
    termColCell.font = { name: 'Arial', size: 13, bold: true };
    termColCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let r = 5; r <= 8; r++) {
      sheet.getCell(r, 1).border = thinBorder;
      sheet.getCell(r, 2).border = thinBorder;
    }

    // GRADE LEVEL
    sheet.mergeCells(5, 3, 5, 2 + wwHalf1);
    const lblGrade = sheet.getCell(5, 3);
    lblGrade.value = 'GRADE LEVEL';
    lblGrade.font = { bold: true, size: 8 };
    lblGrade.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let c = 3; c <= 2 + wwHalf1; c++) sheet.getCell(5, c).border = thinBorder;

    sheet.mergeCells(5, 3 + wwHalf1, 5, 2 + wwColsCount);
    const valGrade = sheet.getCell(5, 3 + wwHalf1);
    valGrade.value = (ctx.grade_level_name || '8').replace(/\D/g, '') || ctx.grade_level_name || '8';
    valGrade.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3 + wwHalf1; c <= 2 + wwColsCount; c++) sheet.getCell(5, c).border = thinBorder;

    // TEACHER (Spans Rows 5 & 6)
    const ptColStart = 3 + wwColsCount;
    sheet.mergeCells(5, ptColStart, 6, ptColStart + ptHalf1 - 1);
    const lblTeacher = sheet.getCell(5, ptColStart);
    lblTeacher.value = 'TEACHER';
    lblTeacher.font = { bold: true, size: 8 };
    lblTeacher.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let r = 5; r <= 6; r++) {
      for (let c = ptColStart; c <= ptColStart + ptHalf1 - 1; c++) sheet.getCell(r, c).border = thinBorder;
    }

    sheet.mergeCells(5, ptColStart + ptHalf1, 6, 2 + wwColsCount + ptColsCount);
    const valTeacher = sheet.getCell(5, ptColStart + ptHalf1);
    valTeacher.value = ctx.teacher_name ? ctx.teacher_name.toUpperCase() : 'HARVEY BABIA';
    valTeacher.font = { bold: true, size: 9 };
    valTeacher.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let r = 5; r <= 6; r++) {
      for (let c = ptColStart + ptHalf1; c <= 2 + wwColsCount + ptColsCount; c++) sheet.getCell(r, c).border = thinBorder;
    }

    // SUBJECT (Spans Rows 5 & 6)
    const exColStart = 3 + wwColsCount + ptColsCount;
    sheet.mergeCells(5, exColStart, 6, exColStart + subjHalf1 - 1);
    const lblSubj = sheet.getCell(5, exColStart);
    lblSubj.value = 'SUBJECT';
    lblSubj.font = { bold: true, size: 8 };
    lblSubj.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let r = 5; r <= 6; r++) {
      for (let c = exColStart; c <= exColStart + subjHalf1 - 1; c++) sheet.getCell(r, c).border = thinBorder;
    }

    sheet.mergeCells(5, exColStart + subjHalf1, 6, totalCols);
    const valSubj = sheet.getCell(5, exColStart + subjHalf1);
    valSubj.value = ctx.subject_name ? ctx.subject_name.toUpperCase() : 'ENGLISH';
    valSubj.font = { bold: true, size: 9 };
    valSubj.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let r = 5; r <= 6; r++) {
      for (let c = exColStart + subjHalf1; c <= totalCols; c++) sheet.getCell(r, c).border = thinBorder;
    }

    // Row 6: Table Header Row 2 (SECTION)
    sheet.mergeCells(6, 3, 6, 2 + wwHalf1);
    const lblSec = sheet.getCell(6, 3);
    lblSec.value = 'SECTION';
    lblSec.font = { bold: true, size: 8 };
    lblSec.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let c = 3; c <= 2 + wwHalf1; c++) sheet.getCell(6, c).border = thinBorder;

    sheet.mergeCells(6, 3 + wwHalf1, 6, 2 + wwColsCount);
    const valSec = sheet.getCell(6, 3 + wwHalf1);
    valSec.value = ctx.section_name || 'Carrots';
    valSec.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3 + wwHalf1; c <= 2 + wwColsCount; c++) sheet.getCell(6, c).border = thinBorder;

    // Row 7: Table Header Row 3 (Component Category Headers & Summary Headers)
    // WW Category Header
    sheet.mergeCells(7, 3, 7, 2 + wwColsCount);
    const wwCompHeader = sheet.getCell(7, 3);
    wwCompHeader.value = `WRITTEN / ORAL WORKS (WWs) (${weights.WW}%)`;
    wwCompHeader.font = { bold: true, size: 9 };
    wwCompHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 3; c <= 2 + wwColsCount; c++) sheet.getCell(7, c).border = thinBorder;

    // PT Category Header
    sheet.mergeCells(7, ptColStart, 7, 2 + wwColsCount + ptColsCount);
    const ptCompHeader = sheet.getCell(7, ptColStart);
    ptCompHeader.value = `PRODUCT / PERFORMANCE TASKS (PTs) (${weights.PT}%)`;
    ptCompHeader.font = { bold: true, size: 9 };
    ptCompHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = ptColStart; c <= 2 + wwColsCount + ptColsCount; c++) sheet.getCell(7, c).border = thinBorder;

    // EX Category Header
    sheet.mergeCells(7, exColStart, 7, exColStart + 7);
    const exCompHeader = sheet.getCell(7, exColStart);
    exCompHeader.value = `EXAMINATIONS (EXs) (${weights.EX || weights.QA || 30}%)`;
    exCompHeader.font = { bold: true, size: 9 };
    exCompHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = exColStart; c <= exColStart + 7; c++) sheet.getCell(7, c).border = thinBorder;

    // Summary Headers (Merged Rows 7 & 8)
    const initCol = exColStart + 8;
    sheet.mergeCells(7, initCol, 8, initCol);
    const lblInit = sheet.getCell(7, initCol);
    lblInit.value = 'Initial\nGrade';
    lblInit.font = { bold: true, size: 8 };
    lblInit.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getCell(7, initCol).border = thinBorder;
    sheet.getCell(8, initCol).border = thinBorder;

    const termCol = initCol + 1;
    sheet.mergeCells(7, termCol, 8, termCol);
    const lblTerm = sheet.getCell(7, termCol);
    lblTerm.value = 'Term\nGrade';
    lblTerm.font = { bold: true, size: 8 };
    lblTerm.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getCell(7, termCol).border = thinBorder;
    sheet.getCell(8, termCol).border = thinBorder;

    const descCol = initCol + 2;
    sheet.mergeCells(7, descCol, 8, descCol);
    const lblDesc = sheet.getCell(7, descCol);
    lblDesc.value = 'Descriptor';
    lblDesc.font = { bold: true, size: 8 };
    lblDesc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getCell(7, descCol).border = thinBorder;
    sheet.getCell(8, descCol).border = thinBorder;

    // Row 8: Table Header Row 4 (Sub-headers: 1, 2... Total, PS, WS, ST1, ST2, TE...)
    let subColIdx = 3;
    // WW Sub-headers
    wwCols.forEach((col, idx) => {
      const cell = sheet.getCell(8, subColIdx++);
      cell.value = idx + 1;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    ['Total', 'PS', 'WS'].forEach((lbl) => {
      const cell = sheet.getCell(8, subColIdx++);
      cell.value = lbl;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // PT Sub-headers
    ptCols.forEach((col, idx) => {
      const cell = sheet.getCell(8, subColIdx++);
      cell.value = idx + 1;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    ['Total', 'PS', 'WS'].forEach((lbl) => {
      const cell = sheet.getCell(8, subColIdx++);
      cell.value = lbl;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // EX Sub-headers
    ['ST1', 'ST2', 'TE', 'WS ST1', 'WS ST2', 'WS TE', 'PS', 'WS'].forEach((lbl) => {
      const cell = sheet.getCell(8, subColIdx++);
      cell.value = lbl;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // Row 9: Table Header Row 5 (HIGHEST POSSIBLE SCORE)
    sheet.mergeCells(9, 1, 9, 2);
    const hpsTitleCell = sheet.getCell(9, 1);
    hpsTitleCell.value = 'HIGHEST POSSIBLE SCORE';
    hpsTitleCell.font = { bold: true, italic: true, size: 8 };
    hpsTitleCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    sheet.getCell(9, 1).border = thinBorder;
    sheet.getCell(9, 2).border = thinBorder;

    let hpsColIdx = 3;
    // WW HPS
    const totalWWHps = wwCols.reduce((sum, c) => sum + c.max_score, 0);
    wwCols.forEach((c) => {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = c.max_score;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    [totalWWHps, 100, `${weights.WW}%`].forEach((val) => {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = val;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // PT HPS
    const totalPTHps = ptCols.reduce((sum, c) => sum + c.max_score, 0);
    ptCols.forEach((c) => {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = c.max_score;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    [totalPTHps, 100, `${weights.PT}%`].forEach((val) => {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = val;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // EX HPS (ST1, ST2, TE, WS ST1, WS ST2, WS TE, PS, WS)
    const st1HPS = st1Ass.max_score || 25;
    const st2HPS = st2Ass.max_score || 25;
    const teHPS = teAss.max_score || 50;
    [st1HPS, st2HPS, teHPS, 30, 30, 40, 100, `${weights.EX || weights.QA || 30}%`].forEach((val) => {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = val;
      cell.font = { bold: true, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    // 3 empty summary cells
    for (let s = 0; s < 3; s++) {
      const cell = sheet.getCell(9, hpsColIdx++);
      cell.value = '';
      cell.border = thinBorder;
    }

    // Row 10: LEARNERS' NAMES Divider Banner
    sheet.mergeCells(10, 1, 10, totalCols);
    const lnCell = sheet.getCell(10, 1);
    lnCell.value = "LEARNERS' NAMES";
    lnCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    lnCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2E53' } };
    lnCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(10).height = 18;

    // Student Grouping by Sex
    const males = studentRows.filter((s) => (s.sex || 'M').toUpperCase().startsWith('M'));
    const females = studentRows.filter((s) => (s.sex || 'M').toUpperCase().startsWith('F'));

    let currentRowIdx = 11;

    const renderStudentGroup = (list, groupLabel) => {
      // Gender divider row
      sheet.mergeCells(currentRowIdx, 1, currentRowIdx, totalCols);
      const divRow = sheet.getCell(currentRowIdx, 1);
      divRow.value = groupLabel;
      divRow.font = { bold: true, size: 8, color: { argb: 'FF0F172A' } };
      divRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
      divRow.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      sheet.getRow(currentRowIdx).height = 18;
      currentRowIdx++;

      list.forEach((st, idx) => {
        const studentSecId = st.student_section_id;
        const studentId = st.student_id;
        const scores = (studentSecId && allRawScores[studentSecId]) || allRawScores[`st_${studentId}`] || {};

        // WW Calculation
        let wwTotal = 0;
        let hasWw = false;
        const wwRowScores = wwCols.map((c) => {
          const val = scores[c.id];
          if (val !== undefined && val !== null && val !== '') {
            hasWw = true;
            wwTotal += Number(val);
            return Number(val);
          }
          return '';
        });
        const wwPS = hasWw && totalWWHps > 0 ? parseFloat(((wwTotal / totalWWHps) * 100).toFixed(2)) : 0;
        const wwWS = hasWw ? parseFloat((wwPS * (weights.WW / 100)).toFixed(2)) : 0;

        // PT Calculation
        let ptTotal = 0;
        let hasPt = false;
        const ptRowScores = ptCols.map((c) => {
          const val = scores[c.id];
          if (val !== undefined && val !== null && val !== '') {
            hasPt = true;
            ptTotal += Number(val);
            return Number(val);
          }
          return '';
        });
        const ptPS = hasPt && totalPTHps > 0 ? parseFloat(((ptTotal / totalPTHps) * 100).toFixed(2)) : 0;
        const ptWS = hasPt ? parseFloat((ptPS * (weights.PT / 100)).toFixed(2)) : 0;

        // EX Calculation (ST1, ST2, TE)
        const rawST1 = scores[st1Ass.id];
        const rawST2 = scores[st2Ass.id];
        const rawTE = scores[teAss.id];
        const hasST1 = rawST1 !== undefined && rawST1 !== null && rawST1 !== '';
        const hasST2 = rawST2 !== undefined && rawST2 !== null && rawST2 !== '';
        const hasTE = rawTE !== undefined && rawTE !== null && rawTE !== '';
        const hasEx = hasST1 || hasST2 || hasTE;

        const numST1 = hasST1 ? Number(rawST1) : 0;
        const numST2 = hasST2 ? Number(rawST2) : 0;
        const numTE = hasTE ? Number(rawTE) : 0;

        const wsST1 = hasST1 && st1HPS > 0 ? parseFloat(((numST1 / st1HPS) * 30).toFixed(2)) : 0;
        const wsST2 = hasST2 && st2HPS > 0 ? parseFloat(((numST2 / st2HPS) * 30).toFixed(2)) : 0;
        const wsTE = hasTE && teHPS > 0 ? parseFloat(((numTE / teHPS) * 40).toFixed(2)) : 0;

        const exPS = hasEx ? parseFloat((wsST1 + wsST2 + wsTE).toFixed(2)) : 0;
        const exWS = hasEx ? parseFloat((exPS * ((weights.EX || weights.QA || 30) / 100)).toFixed(2)) : 0;

        // Initial Grade, Term Grade, Descriptor
        const hasAny = hasWw || hasPt || hasEx;
        const totalWS = parseFloat((wwWS + ptWS + exWS).toFixed(2));
        const initialGrade = hasAny ? totalWS.toFixed(2) : '-';
        const termGrade = hasAny ? getTransmutedGrade(totalWS) : '-';
        const descriptor = typeof termGrade === 'number' ? getGradeDescriptor(termGrade) : '-';
        const isFailing = typeof termGrade === 'number' && termGrade < 75;

        const fullName = `${st.last_name}, ${st.first_name} ${st.middle_name ? st.middle_name[0] + '.' : ''}`.toUpperCase();

        const studentRowVals = [
          idx + 1,
          fullName,
          ...wwRowScores,
          hasWw ? wwTotal : '',
          hasWw ? wwPS.toFixed(2) : '',
          hasWw ? wwWS.toFixed(2) : '',
          ...ptRowScores,
          hasPt ? ptTotal : '',
          hasPt ? ptPS.toFixed(2) : '',
          hasPt ? ptWS.toFixed(2) : '',
          hasST1 ? numST1 : '',
          hasST2 ? numST2 : '',
          hasTE ? numTE : '',
          hasST1 ? wsST1.toFixed(2) : '',
          hasST2 ? wsST2.toFixed(2) : '',
          hasTE ? wsTE.toFixed(2) : '',
          hasEx ? exPS.toFixed(2) : '',
          hasEx ? exWS.toFixed(2) : '',
          initialGrade,
          termGrade,
          descriptor,
        ];

        const rowObj = sheet.addRow(studentRowVals);
        sheet.getRow(currentRowIdx).height = 18;

        rowObj.eachCell({ includeEmpty: true }, (cell, cNum) => {
          cell.border = thinBorder;
          cell.font = { size: 8 };
          if (cNum === 1) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { bold: true, size: 8 };
          } else if (cNum === 2) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            cell.font = { bold: true, size: 8 };
          } else if (cNum === totalCols - 1) { // Term Grade
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { bold: true, size: 8, color: { argb: isFailing ? 'FFB91C1C' : 'FF000000' } };
            if (isFailing) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            }
          } else if (cNum === totalCols) { // Descriptor
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { italic: true, bold: true, size: 8 };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });

        currentRowIdx++;
      });
    };

    renderStudentGroup(males, 'MALE');
    renderStudentGroup(females, 'FEMALE');

    // Apply explicit column widths
    sheet.columns.forEach((column, colIdx) => {
      if (colIdx === 0) column.width = 5; // No
      else if (colIdx === 1) column.width = 28; // Name
      else if (colIdx >= totalCols - 3 && colIdx < totalCols - 1) column.width = 9; // Initial Grade, Term Grade
      else if (colIdx === totalCols - 1) column.width = 14; // Descriptor
      else column.width = 6.5; // Assessment columns
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

