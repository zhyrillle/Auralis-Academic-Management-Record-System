const express = require('express');
const router = express.Router();
const db = require('../config/db');
const GradeSheet = require('../models/GradeSheet');
const StudentGrade = require('../models/StudentGrade');
const AuditEvent = require('../models/AuditEvent');
const NotificationService = require('../services/NotificationService');
const GradeComputationService = require('../services/GradeComputationService');
const { termCode, problem } = GradeComputationService;
const GradeTransmutationConfig = require('../models/GradeTransmutationConfig');
const { resolveCurrentUser } = require('../middleware/resolveCurrentUser');
const { decryptLrn } = require('../utils/encryption');
const {
  TRANSMUTATION_TABLE, DEFAULT_JHS_WEIGHTS, weightsFromRows, selectSavedSummary,
  calculateStudentSummary, calculateStudentGrades, transmuteGrade, getTransmutedGrade, getGradeDescriptor,
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
    /\b(st1|st2|te)\b/i.test(lower)
  ) {
    return { code: 'QA', type: 'quarterlyAssessment', name: 'Examinations' };
  }
  return { code: 'WW', type: 'writtenWork', name: 'Written Work' };
}

/**
 * Detects if a subject is MAPEH by checking subject_name or subject_code.
 */
function isMapehSubject(subjectName, subjectCode) {
  const str = `${subjectName || ''} ${subjectCode || ''}`.toLowerCase();
  return (
    str.includes('mapeh') ||
    str.includes('music') ||
    str.includes('arts') ||
    str.includes('physical education') ||
    str.includes('pe &') ||
    str.includes('health')
  );
}

/**
 * Normalizes MAPEH component to 'MA' (Music & Arts) or 'PEH' (PE & Health).
 * Defaults to 'MA'.
 */
function normalizeMapehComponent(rawComponent) {
  if (!rawComponent) return 'MA';
  const str = String(rawComponent).trim().toUpperCase();
  if (str === 'PEH' || str === 'PE' || str.includes('HEALTH') || str.includes('PHYSICAL')) {
    return 'PEH';
  }
  return 'MA';
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
async function ensureGradeSheet(subjectOfferingId, schoolYearId, termName, connection = db, { create = true } = {}) {
  const selected = selectSubmissionTerm(await loadClassTerms({ school_year_id: schoolYearId }, connection), termCode(termName));
  const [sheets] = await connection.execute(
    'SELECT * FROM GRADE_SHEET WHERE subject_offering_id = ? AND term_id = ?',
    [subjectOfferingId, selected.term_id]);
  if (sheets.length > 1) throw problem('DUPLICATE_GRADE_SHEET', 'This class and term have duplicate grade sheets. Please request a configuration review.');
  let sheet = sheets[0];
  if (!sheet && !create) {
    return { gradeSheetId: null, termId: selected.term_id, termName: selected.term_name,
      lockStatus: 'NOT_CREATED', workflowStatus: 'DRAFT' };
  }
  if (!sheet) {
    const [result] = await connection.execute(
      'INSERT INTO GRADE_SHEET (subject_offering_id, term_id, lock_status, workflow_status) VALUES (?, ?, ?, ?)',
      [subjectOfferingId, selected.term_id, 'EDITABLE', 'DRAFT']);
    sheet = { grade_sheet_id: result.insertId, term_id: selected.term_id, lock_status: 'EDITABLE', workflow_status: 'DRAFT' };
  }
  return { gradeSheetId: sheet.grade_sheet_id, termId: sheet.term_id, termName: selected.term_name,
    lockStatus: sheet.lock_status, workflowStatus: sheet.workflow_status };
}

/**
 * Ensures default assessment columns exist for a grade sheet so every column
 * (Written Work, Performance Task, and Quarterly Assessment) always has a valid assessment_id in DB.
 */
async function ensureDefaultActivitiesForSheet(gradeSheetId, subjectId, schoolYearId, mapehComponent = null, connection = db) {
  if (mapehComponent) {
    // Safeguard: backfill any legacy unassigned activities for this grade sheet to 'MA'
    await connection.execute(
      `UPDATE GRADE_ACTIVITY SET mapeh_component = 'MA' WHERE grade_sheet_id = ? AND mapeh_component IS NULL`,
      [gradeSheetId]
    );
  }

  const compCondition = mapehComponent ? 'ga.mapeh_component = ?' : 'ga.mapeh_component IS NULL';
  const compParams = mapehComponent ? [gradeSheetId, mapehComponent] : [gradeSheetId];

  const [existing] = await connection.execute(
    `SELECT ga.activity_id, ga.activity_name, ct.component_code
     FROM GRADE_ACTIVITY ga
     LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
     LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
     WHERE ga.grade_sheet_id = ? AND ${compCondition} AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
    compParams
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
      if (/\b(ST1|SUMMATIVE\s*TEST\s*1|SUMMATIVE\s*1)\b/i.test(name)) {
        hasST1 = true;
      } else if (/\b(ST2|SUMMATIVE\s*TEST\s*2|SUMMATIVE\s*2)\b/i.test(name)) {
        hasST2 = true;
      } else if (/\b(TE|TERM\s*EXAM|QUARTERLY)\b/i.test(name)) {
        hasTE = true;
      } else {
        legacyQAActivity = a;
      }
    }
  });

  const [weights] = await connection.execute(
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
      await connection.execute(
        `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [gradeSheetId, wwWeightId, mapehComponent || null, ww.name, ww.max, today]
      );
    }
  }

  // If no PT columns exist, insert 1 default PT
  if (!hasPT) {
    const defaultPT = [
      { name: 'Performance Task 1', max: 50 },
    ];
    for (const pt of defaultPT) {
      await connection.execute(
        `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [gradeSheetId, ptWeightId, mapehComponent || null, pt.name, pt.max, today]
      );
    }
  }

  // If a legacy QA activity exists (e.g. "Quarterly Assessment 1") and we don't have a TE yet, migrate/rename it to "Term Exam"
  if (legacyQAActivity && !hasTE) {
    await connection.execute(
      `UPDATE GRADE_ACTIVITY SET activity_name = 'Term Exam' WHERE activity_id = ?`,
      [legacyQAActivity.activity_id]
    );
    hasTE = true;
  }

  const defaultSt1Hps = mapehComponent ? 25 : 30;
  const defaultSt2Hps = mapehComponent ? 25 : 30;
  const defaultTeHps = mapehComponent ? 25 : 40;

  // Ensure ST1, ST2, and TE all exist individually
  if (!hasST1) {
    await connection.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, ?, 'Summative Test 1', ?, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, mapehComponent || null, defaultSt1Hps, today]
    );
  }

  if (!hasST2) {
    await connection.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, ?, 'Summative Test 2', ?, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, mapehComponent || null, defaultSt2Hps, today]
    );
  }

  if (!hasTE) {
    await connection.execute(
      `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
       VALUES (?, ?, ?, 'Term Exam', ?, ?, 'ACTIVE')`,
      [gradeSheetId, qaWeightId, mapehComponent || null, defaultTeHps, today]
    );
  }
}

/**
 * GET /api/class-record/:subject_offering_id?term=T1
 * Requirement 1: Data Retrieval Endpoint for JHS Class Record
 */
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const httpError = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

async function submissionContext(input, user, connection) {
  if (!id(user?.user_id)) throw httpError(401, 'SIGN_IN_REQUIRED', 'Sign in before loading or submitting grades.');
  if (![input.subject_offering_id, input.section_id, input.school_year_id].every(id)) throw httpError(400, 'INVALID_CLASS_CONTEXT', 'Select a valid subject offering, section, and school year.');
  const [rows] = await connection.execute(`SELECT so.subject_offering_id, so.subject_id, so.section_id, so.school_year_id,
      s.subject_name, s.subject_code, sec.section_name, ta.teacher_assignment_id
      FROM SUBJECT_OFFERING so JOIN SUBJECT s ON s.subject_id = so.subject_id
      JOIN SECTION sec ON sec.section_id = so.section_id
      JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
      WHERE so.subject_offering_id = ? AND so.section_id = ? AND so.school_year_id = ? AND ta.user_id = ?
        AND (ta.assigned_from IS NULL OR ta.assigned_from <= UTC_DATE())
        AND (ta.assigned_until IS NULL OR ta.assigned_until >= UTC_DATE())`,
    [Number(input.subject_offering_id), Number(input.section_id), Number(input.school_year_id), Number(user.user_id)]);
  if (rows.length !== 1) throw httpError(403, 'CLASS_ASSIGNMENT_REQUIRED', 'This subject class is not uniquely assigned to your account.');
  return rows[0];
}

// Monitoring access is read-only and must never authorize teacher mutations.
async function classRecordReadAccess(input, user, connection, { readOnly = false } = {}) {
  if (!readOnly || user?.normalized_role !== 'department_head') {
    try {
      await submissionContext(input, user, connection);
      return { teacher: !readOnly };
    } catch (error) {
      if (error.code !== 'CLASS_ASSIGNMENT_REQUIRED' || user?.normalized_role !== 'department_head') throw error;
    }
  }
  const [rows] = await connection.execute(`SELECT so.subject_offering_id
      FROM SUBJECT_OFFERING so JOIN SUBJECT s ON s.subject_id = so.subject_id
      WHERE so.subject_offering_id = ? AND so.section_id = ? AND so.school_year_id = ?
        AND s.department_id = COALESCE(
          (SELECT dh.department_id FROM DEPARTMENT_HEAD dh WHERE dh.user_id = ?
            AND (dh.appointed_from IS NULL OR dh.appointed_from <= CURDATE())
            AND (dh.appointed_until IS NULL OR dh.appointed_until >= CURDATE())
            ORDER BY dh.department_head_id DESC LIMIT 1), ?)`,
    [input.subject_offering_id, input.section_id, input.school_year_id, user.user_id, user.department_id || null]);
  if (rows.length !== 1) throw httpError(403, 'DEPARTMENT_CLASS_ACCESS_REQUIRED',
    'You can only review class records for your assigned department.');
  return { teacher: false };
}
async function loadGradeInputs(offering, sheetId, connection, lock = false) {
  const suffix = lock ? ' FOR UPDATE' : '';
  const [students] = await connection.execute(`SELECT ss.student_section_id, st.student_id, st.first_name, st.middle_name,
      st.last_name, st.extension_name, st.sex, st.LRN AS lrn
      FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id = ss.student_id
      WHERE ss.section_id = ? AND ss.school_year_id = ? AND (st.status = 'ACTIVE' OR st.status IS NULL)
      ORDER BY st.last_name, st.first_name${suffix}`, [offering.section_id, offering.school_year_id]);
  const [weights] = await connection.execute(`SELECT scw.percentage, ct.component_code
      FROM SUBJECT_COMPONENT_WEIGHT scw JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
      WHERE scw.subject_id = ? AND scw.school_year_id = ?${suffix}`, [offering.subject_id, offering.school_year_id]);
  const [activities] = await connection.execute(`SELECT ga.activity_id, ga.activity_name, ga.mapeh_component,
      ga.highest_possible_score, ga.status, ct.component_code, scw.subject_id AS weight_subject_id, scw.school_year_id AS weight_school_year_id
      FROM GRADE_ACTIVITY ga LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
      LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
      WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL)
        ORDER BY ga.activity_id${suffix}`, [sheetId]);
  if (activities.some(a => Object.hasOwn(a, 'weight_subject_id')
    && (Number(a.weight_subject_id) !== Number(offering.subject_id) || Number(a.weight_school_year_id) !== Number(offering.school_year_id)))) {
    throw problem('INVALID_ACTIVITY_WEIGHT', 'An assessment is linked to another subject or school-year configuration.');
  }
  const [scores] = await connection.execute(`SELECT sc.activity_id, sc.student_section_id, sc.raw_score, sc.score_status
      FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
      WHERE ga.grade_sheet_id = ? ORDER BY sc.score_id${suffix}`, [sheetId]);
  const [configs] = await connection.execute(`SELECT is_custom_enabled, ranges_json, updated_at
      FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1${suffix}`);
  if (configs.length !== 1) throw problem('TRANSMUTATION_NOT_CONFIGURED', 'Save the transmutation configuration before submitting.');
  let ranges = TRANSMUTATION_TABLE;
  if (configs[0].ranges_json) {
    try { ranges = JSON.parse(configs[0].ranges_json); }
    catch { throw problem('INVALID_TRANSMUTATION', 'The saved transmutation configuration needs review.'); }
  }
  if (!Array.isArray(ranges) || !ranges.length || ranges.some(r => ![r.min, r.max, r.transmuted ?? r.grade].every(v => Number.isFinite(Number(v))))) {
    throw problem('INVALID_TRANSMUTATION', 'The saved transmutation configuration needs review.');
  }
  return { offering, students, weights, activities, scores,
    config: { is_custom_enabled: Boolean(Number(configs[0].is_custom_enabled)), ranges: ranges.map(r => ({ min: Number(r.min), max: Number(r.max), transmuted: Number(r.transmuted ?? r.grade) })),
      updated_at: configs[0].updated_at || null } };
}
async function loadClassTerms(offering, connection) {
  const [rows] = await connection.execute(`SELECT term_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status
      FROM ACADEMIC_TERM WHERE school_year_id = ? ORDER BY starts_at, term_id`, [offering.school_year_id]);
  return rows;
}
function selectSubmissionTerm(rows, code) {
  if (!/^T[123]$/.test(String(code))) throw httpError(400, 'INVALID_TERM', 'Choose Term 1, Term 2, or Term 3 explicitly.');
  const matches = rows.filter(row => termCode(row.term_name) === code);
  if (matches.length !== 1) throw problem('AMBIGUOUS_TERM', 'This school year does not have a unique matching term.');
  return matches[0];
}
function submissionPublicContext(offering) {
  return { subjectOfferingId: Number(offering.subject_offering_id), sectionId: Number(offering.section_id), schoolYearId: Number(offering.school_year_id) };
}

async function submitClassGrades(input, user, database = db) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const offering = await submissionContext(input, user, connection);
    const selected = selectSubmissionTerm(await loadClassTerms(offering, connection), input.term);
    const [sheets] = await connection.execute(`SELECT * FROM GRADE_SHEET
        WHERE subject_offering_id = ? AND term_id = ? FOR UPDATE`, [offering.subject_offering_id, selected.term_id]);
    if (sheets.length !== 1) throw problem('GRADE_SHEET_REQUIRED', 'Open a uniquely configured class record before submitting.');
    const sheet = sheets[0];
    if (sheet.workflow_status === 'SUBMITTED') {
      await connection.commit();
      return { submitted: true, submissionVersion: 2, term: input.term, ...submissionPublicContext(offering),
        submittedAt: sheet.submitted_at, alreadySubmitted: true };
    }
    const window = await GradeSheet.editingWindow(sheet, user, connection, { lock: true });
    if (!window.editable) throw httpError(403, 'SUBMISSION_WINDOW_CLOSED', 'This sheet is not open for your account. Use the approved reopening process.');
    const data = await loadGradeInputs(offering, sheet.grade_sheet_id, connection, true);
    const grades = GradeComputationService.calculateGrades(data);
    const [clocks] = await connection.execute('SELECT UTC_TIMESTAMP(6) AS submitted_at');
    const submittedAt = clocks[0].submitted_at;
    for (const grade of grades) await StudentGrade.upsert({
      subject_offering_id: offering.subject_offering_id, student_id: grade.studentId, student_section_id: grade.studentSectionId,
      term: input.term, mapeh_component: grade.mapehComponent, initial_grade: grade.initialGrade, quarterly_grade: grade.termGrade,
      remarks: grade.termGrade >= 75 ? 'Passed' : 'Failed',
    }, connection);
    await GradeSheet.update(sheet.grade_sheet_id, { workflow_status: 'SUBMITTED', submitted_at: submittedAt,
      lock_status: window.correction ? 'TERM_LOCKED' : sheet.lock_status }, connection);
    await AuditEvent.create({ user_id: user.user_id,
      event_type: sheet.submitted_at ? 'GRADE_SHEET_CORRECTION_RESUBMITTED' : 'GRADE_SHEET_SUBMITTED',
      module_name: 'GRADING', entity_type: 'GRADE_SHEET', entity_id: sheet.grade_sheet_id,
      before_data: { workflow_status: sheet.workflow_status, submitted_at: sheet.submitted_at },
      after_data: { workflow_status: 'SUBMITTED', submitted_at: submittedAt, term: input.term },
      metadata: { subject: offering.subject_name, section: offering.section_name, term: input.term,
        school_year_id: offering.school_year_id, learner_count: data.students.length } }, connection);
    const notifications = await NotificationService.prepareGradePublicationNotifications({
      offering, sheetId: sheet.grade_sheet_id, term: input.term, correction: Boolean(sheet.submitted_at),
      teacherName: [user.first_name, user.last_name].filter(Boolean).join(' '),
    }, connection);
    await connection.commit();
    try { NotificationService.emitCommittedGradePublications(notifications); }
    catch (error) { console.warn('Submission saved; live notification delivery is unavailable:', error.message); }
    return { submitted: true, submissionVersion: 2, term: input.term, ...submissionPublicContext(offering),
      submittedAt, learnerCount: data.students.length, message: 'Term grades submitted to the adviser.' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function gradingSummary(input, user, database = db) {
    const offering = await submissionContext(input, user, database);
    const periods = await loadClassTerms(offering, database);
    const [sheets] = await database.execute('SELECT * FROM GRADE_SHEET WHERE subject_offering_id = ? ORDER BY grade_sheet_id', [offering.subject_offering_id]);
    const [roster] = await database.execute(`SELECT ss.student_section_id, st.student_id, st.first_name, st.middle_name, st.last_name,
        st.extension_name, st.sex, st.LRN AS lrn FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id = ss.student_id
        WHERE ss.section_id = ? AND ss.school_year_id = ? AND (st.status = 'ACTIVE' OR st.status IS NULL) ORDER BY st.last_name, st.first_name`,
      [offering.section_id, offering.school_year_id]);
    const [saved] = await database.execute('SELECT * FROM STUDENT_GRADE WHERE subject_offering_id = ?', [offering.subject_offering_id]);
    const result = roster.map(s => ({ id: Number(s.student_id), student_id: Number(s.student_id), student_section_id: Number(s.student_section_id),
      firstName: s.first_name, middleName: s.middle_name || '', lastName: s.last_name, extensionName: s.extension_name || '', sex: s.sex,
      lrn: decryptLrn(s.lrn), term1: '', term2: '', term3: '', term1_ma: '', term2_ma: '', term3_ma: '', term1_peh: '', term2_peh: '', term3_peh: '' }));
    const warnings = [];
    const submissionTerms = [];
    for (const position of [1, 2, 3]) {
      const code = `T${position}`, matchingTerms = periods.filter(t => termCode(t.term_name) === code);
      if (matchingTerms.length !== 1) { warnings.push(`${code}: term configuration needs review.`); continue; }
      const matchingSheets = sheets.filter(s => Number(s.term_id) === Number(matchingTerms[0].term_id));
      if (!matchingSheets.length) continue;
      if (matchingSheets.length !== 1) { warnings.push(`${code}: duplicate grade sheets need review.`); continue; }
      const sheet = matchingSheets[0];
      const window = await GradeSheet.editingWindow(sheet, user, database);
      if (window.editable) submissionTerms.push({ term: code, deadline: window.deadline, correction: window.correction });
      let grades;
      if (sheet.workflow_status === 'SUBMITTED') {
        grades = saved.filter(g => termCode(g.term) === code).map(g => ({ studentId: Number(g.student_id),
          studentSectionId: g.student_section_id ? Number(g.student_section_id) : null,
          mapehComponent: g.mapeh_component || null, termGrade: g.quarterly_grade == null || g.quarterly_grade === '' ? null : Number(g.quarterly_grade) }));
      } else if (sheet.workflow_status === 'DRAFT') {
        const data = await loadGradeInputs(offering, sheet.grade_sheet_id, database);
        // An incomplete learner does not hide complete classmates' draft grades.
        grades = data.students.flatMap(student => {
          try { return GradeComputationService.calculateGrades({ ...data, students: [student] }); }
          catch (error) {
            if (!error.statusCode) throw error;
            if (!GradeComputationService.isMapehSubject(offering)) return [];
            return ['MA', 'PEH'].flatMap(componentOnly => {
              try { return GradeComputationService.calculateGrades({ ...data, students: [student], componentOnly }); }
              catch (componentError) { if (!componentError.statusCode) throw componentError; return []; }
            });
          }
        });
      } else { warnings.push(`${code}: grade workflow needs review.`); continue; }
      for (const row of result) for (const component of [null, 'MA', 'PEH']) {
        const candidates = grades.filter(g => g.studentId === row.student_id && (!g.studentSectionId || g.studentSectionId === row.student_section_id)
          && (g.mapehComponent || null) === component);
        if (candidates.length !== 1 || !Number.isFinite(candidates[0].termGrade) || candidates[0].termGrade < 0 || candidates[0].termGrade > 100) continue;
        row[`term${position}${component ? `_${component.toLowerCase()}` : ''}`] = candidates[0].termGrade;
      }
    }
    const now = Date.now();
    const current = periods.filter(p => new Date(p.starts_at).getTime() <= now && new Date(p.ends_at).getTime() > now);
    return { summaryVersion: 2, context: { ...submissionPublicContext(offering), activeTerm: current.length === 1 ? termCode(current[0].term_name) : null,
      isMapeh: GradeComputationService.isMapehSubject(offering), submissionTerms }, students: result, warnings };
  }

router.get('/class-record/:subject_offering_id', resolveCurrentUser, async (req, res) => {
  try {
    await GradeTransmutationConfig.getActiveTiers();
    const subjectOfferingId = Number(req.params.subject_offering_id);
    const requestedSectionId = req.query.section_id ? Number(req.query.section_id) : null;
    const requestedSubjectId = req.query.subject_id ? Number(req.query.subject_id) : null;

    // 1. Fetch class context from SUBJECT_OFFERING, SECTION, SUBJECT, GRADE_LEVEL, SCHOOL_YEAR
    let contextRows = [];

    // Step A: Priority 1 - Match by subject_offering_id if valid
    if (subjectOfferingId && !isNaN(subjectOfferingId)) {
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
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = (
           SELECT MAX(ta2.teacher_assignment_id) FROM TEACHER_ASSIGNMENT ta2
           WHERE ta2.subject_offering_id = so.subject_offering_id
             AND (ta2.assigned_from IS NULL OR ta2.assigned_from <= UTC_DATE())
             AND (ta2.assigned_until IS NULL OR ta2.assigned_until >= UTC_DATE()))
         LEFT JOIN USER u ON u.user_id = ta.user_id
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = (
           SELECT MAX(saa2.adviser_assignment_id) FROM SECTION_ADVISER_ASSIGNMENT saa2
           WHERE saa2.section_id = sec.section_id AND saa2.school_year_id = so.school_year_id)
         LEFT JOIN USER u_adv ON u_adv.user_id = saa.user_id
         WHERE so.subject_offering_id = ?`,
        [subjectOfferingId]
      );
      if (offeringMatchRows && offeringMatchRows.length > 0) {
        contextRows = offeringMatchRows;
      }
    }

    if (!contextRows?.length) return res.status(404).json({ error: 'Class / Subject Offering not found. No class was created.' });

    const classContext = contextRows[0];
    const actualOfferingId = classContext.subject_offering_id;
    const schoolYearId = classContext.school_year_id;
    if ((requestedSectionId && requestedSectionId !== Number(classContext.section_id))
      || (requestedSubjectId && requestedSubjectId !== Number(classContext.subject_id))) {
      throw httpError(409, 'CLASS_CONTEXT_MISMATCH', 'The selected section or subject does not match this class.');
    }
    const access = await classRecordReadAccess({ subject_offering_id: actualOfferingId,
      section_id: classContext.section_id, school_year_id: schoolYearId }, req.currentUser, db,
      { readOnly: req.query.read_only === '1' });
    const subjectId = classContext.subject_id;
    const sectionId = classContext.section_id;

    // Resolve active ongoing term for this school year from ACADEMIC_TERM
    const activeTerm = await resolveActiveAcademicTerm(schoolYearId);
    const activeOngoingTermCode = activeTerm?.termCode || 'T1';

    const rawTerm = req.query.term || activeOngoingTermCode || 'T1';
    const { termCode, termName } = normalizeTerm(rawTerm);

    // Only the assigned teacher may initialize a missing sheet while opening it.
    const sheetData = await ensureGradeSheet(actualOfferingId, schoolYearId, termName, db, { create: access.teacher });
    const { gradeSheetId, lockStatus, termId: sheetTermId } = sheetData;

    // Validate GRADE_SHEET against Active Term
    // A grade sheet is considered ACTIVE / OPEN if grade_sheet.term_id === active_term.term_id AND grade_sheet.lock_status === 'EDITABLE' (or 'OPEN' or 'TEMPORARILY_REOPENED')
    const isTermActive = Boolean(activeTerm && Number(sheetTermId) === Number(activeTerm.term_id));
    const isEditable = access.teacher && await GradeSheet.canEdit(sheetData, req.currentUser, db);
    const isLocked = !isEditable;
    const lockReason = !access.teacher ? 'READ_ONLY_ACCESS' : !isEditable && !isTermActive
      ? 'CLOSED_TERM'
      : (isLocked ? (lockStatus === 'TERM_LOCKED' ? 'TERM_LOCKED' : 'LOCKED') : null);

    // MAPEH sub-component resolution
    const isMapeh = isMapehSubject(classContext.subject_name, classContext.subject_code);
    const rawComponent = req.query.mapeh_component || req.query.component;
    const activeMapehComponent = isMapeh ? normalizeMapehComponent(rawComponent) : null;

    // Ensure default assessment activities (WW, PT, QA) exist for this sheet
    if (isEditable) {
      const setup = await db.getConnection();
      try {
        await setup.beginTransaction();
        if (!await GradeSheet.canEdit({ gradeSheetId }, req.currentUser, setup, { lock: true })) {
          throw httpError(409, 'SHEET_CHANGED', 'The submission status changed. Reload this class record.');
        }
        await ensureDefaultActivitiesForSheet(gradeSheetId, subjectId, schoolYearId, activeMapehComponent, setup);
        await setup.commit();
      } catch (error) { await setup.rollback(); throw error; }
      finally { setup.release(); }
    }

    // 3. Fetch component weights from SUBJECT_COMPONENT_WEIGHT + COMPONENT_TYPE
    let weights;
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
      componentTypes = weightRows;
    } else {
      const [allCt] = await db.execute('SELECT * FROM COMPONENT_TYPE');
      componentTypes = allCt;
    }

    weights = weightsFromRows(weightRows);

    // 4. Fetch active assessment columns from GRADE_ACTIVITY for this grade_sheet_id
    const activityCondition = isMapeh ? 'ga.mapeh_component = ?' : '(ga.mapeh_component IS NULL OR ga.mapeh_component = \'\')';
    const activityParams = isMapeh ? [gradeSheetId, activeMapehComponent] : [gradeSheetId];

    const [activityRows] = await db.execute(
      `SELECT
         ga.activity_id,
         ga.activity_id AS assessment_id,
         ga.grade_sheet_id,
         ga.subj_comp_weight_id,
         ga.mapeh_component,
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
       WHERE ga.grade_sheet_id = ? AND ${activityCondition} AND (ga.status = 'ACTIVE' OR ga.status IS NULL) AND ga.status != 'ARCHIVED'
       ORDER BY ga.activity_id ASC`,
      activityParams
    );

    const assessments = activityRows.map((a) => {
      const { code, type: normType, name: defaultName } = normalizeAssessmentType(a.component_code || a.activity_name);

      return {
        assessment_id: a.activity_id,
        activity_id: a.activity_id,
        grade_sheet_id: a.grade_sheet_id,
        subj_comp_weight_id: a.subj_comp_weight_id,
        mapeh_component: a.mapeh_component || activeMapehComponent,
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

    // 5. Fetch enrolled students from STUDENT_SECTION + STUDENT
    const [studentRows] = await db.execute(
      `SELECT
         ss.student_section_id,
         ss.student_id,
         s.LRN,
         s.first_name,
         s.middle_name,
         s.last_name,
         s.extension_name,
         s.sex,
         s.status AS student_status
       FROM STUDENT_SECTION ss
       JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ? AND ss.school_year_id = ? AND (s.status = 'ACTIVE' OR s.status IS NULL)
       ORDER BY
         CASE WHEN UPPER(s.sex) IN ('M', 'MALE') THEN 0 ELSE 1 END ASC,
         s.last_name ASC,
         s.first_name ASC`,
      [sectionId, schoolYearId]
    );

    // 6. Fetch student raw scores from SCORE
    let scoreMapByStudentSec = {};
    let scoreMapByStudentId = {};

    if (activityRows.length > 0) {
      const activityIds = activityRows.map((a) => a.activity_id);
      const placeholders = activityIds.map(() => '?').join(',');

      const [scoreRows] = await db.execute(
        `SELECT sc.score_id, sc.activity_id, sc.student_section_id, sc.raw_score, sc.score_status, ss.student_id
         FROM SCORE sc
         LEFT JOIN STUDENT_SECTION ss ON ss.student_section_id = sc.student_section_id
         WHERE sc.activity_id IN (${placeholders})`,
        activityIds
      );

      scoreRows.forEach((sc) => {
        const val = sc.raw_score !== null ? Number(sc.raw_score) : null;
        if (sc.student_section_id) {
          if (!scoreMapByStudentSec[sc.student_section_id]) {
            scoreMapByStudentSec[sc.student_section_id] = {};
          }
          scoreMapByStudentSec[sc.student_section_id][sc.activity_id] = val;
        }

        const sId = sc.student_id;
        if (sId) {
          if (!scoreMapByStudentId[sId]) {
            scoreMapByStudentId[sId] = {};
          }
          scoreMapByStudentId[sId][sc.activity_id] = val;
        }
      });
    }

    // 7. Fetch existing grades from STUDENT_GRADE scoped to active sub-component
    const [allSavedGrades] = await db.execute('SELECT * FROM STUDENT_GRADE WHERE subject_offering_id = ? AND term = ?', [actualOfferingId, termCode]);
    const savedForComponent = component => allSavedGrades.filter(g => (g.mapeh_component || null) === (component || null));
    const savedGrades = savedForComponent(activeMapehComponent);
    const gradeMap = {};
    savedGrades.forEach((g) => {
      gradeMap[g.student_id] = g;
    });

    let otherGradeMap = {};
    const combinedGradeMap = {};
    if (isMapeh) {
      const otherMapehComp = activeMapehComponent === 'MA' ? 'PEH' : 'MA';
      const otherSaved = savedForComponent(otherMapehComp);
      otherSaved.forEach((g) => {
        otherGradeMap[g.student_id] = g;
      });
      if (!isEditable) {
        const combinedSaved = savedForComponent(null);
        combinedSaved.forEach((g) => { combinedGradeMap[g.student_id] = g; });
      }
    }

    // Saved summaries are accepted output; draft previews never update them.
    const readSavedSummary = grade => selectSavedSummary(grade, sheetData.workflowStatus === 'SUBMITTED');

    // Resolve specific activity IDs for ST1, ST2, and TE
    let st1ActId = null;
    let st2ActId = null;
    let teActId = null;
    assessments.forEach((a) => {
      const aName = String(a.activity_name || '').toUpperCase();
      const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
      if (code === 'QA' || code === 'EX') {
        if (/\b(ST1|SUMMATIVE\s*TEST\s*1|SUMMATIVE\s*1)\b/i.test(aName)) st1ActId = a.assessment_id;
        else if (/\b(ST2|SUMMATIVE\s*TEST\s*2|SUMMATIVE\s*2)\b/i.test(aName)) st2ActId = a.assessment_id;
        else if (/\b(TE|TERM\s*EXAM|QUARTERLY\s*ASSESSMENT|QUARTERLY)\b/i.test(aName) || !teActId) teActId = a.assessment_id;
      }
    });

    // Draft previews and Submit use the same validated saved inputs and configuration.
    let previewInputs = null, previewError = null;
    if (sheetData.workflowStatus !== 'SUBMITTED') {
      try { previewInputs = await loadGradeInputs(classContext, gradeSheetId, db); }
      catch (error) { if (!error.statusCode) throw error; previewError = error.code; }
    }
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

      const savedGrade = gradeMap[studentId];
      let summary, finalMapehQuarterly = null;
      if (sheetData.workflowStatus === 'SUBMITTED') {
        summary = { ...readSavedSummary(savedGrade), descriptor: getGradeDescriptor(savedGrade?.quarterly_grade) };
        if (isMapeh) finalMapehQuarterly = readSavedSummary(combinedGradeMap[studentId]).termGrade;
      } else {
        let grades = [];
        try {
          if (previewInputs) grades = GradeComputationService.calculateGrades({ ...previewInputs, students: [student] });
        } catch (error) {
          if (!error.statusCode) throw error;
          previewError = error.code;
          if (isMapeh) {
            try { grades = GradeComputationService.calculateGrades({ ...previewInputs, students: [student], componentOnly: activeMapehComponent }); }
            catch (componentError) { if (!componentError.statusCode) throw componentError; }
          }
        }
        const grade = grades.find(g => (g.mapehComponent || null) === activeMapehComponent);
        summary = grade ? { initialGrade: grade.initialGrade, quarterlyGrade: grade.termGrade, termGrade: grade.termGrade,
          remarks: grade.termGrade >= 75 ? 'Passed' : 'Failed', descriptor: getGradeDescriptor(grade.termGrade) }
          : { initialGrade: null, quarterlyGrade: null, termGrade: null, remarks: null, calculationError: previewError || 'INCOMPLETE_GRADES' };
        if (isMapeh) finalMapehQuarterly = grades.find(g => !g.mapehComponent)?.termGrade ?? null;
      }
      const initialGrade = summary.initialGrade, quarterlyGrade = summary.quarterlyGrade, remarks = summary.remarks;

      const plainLrn = decryptLrn(student.LRN);
      return {
        student_id: student.student_id,
        student_section_id: student.student_section_id,
        LRN: plainLrn,
        lrn: plainLrn,
        first_name: student.first_name,
        middle_name: student.middle_name,
        last_name: student.last_name,
        extension_name: student.extension_name,
        sex: (student.sex || 'M').toUpperCase().startsWith('F') ? 'F' : 'M',
        scores: rawScores,
        examinations: studentExaminations,
        computed: summary,
        saved_summary: sheetData.workflowStatus === 'SUBMITTED' ? readSavedSummary(savedGrade) : undefined,
        calculation_review: summary.calculationError || null,
        initial_grade: initialGrade,
        quarterly_grade: quarterlyGrade,
        remarks,
        final_mapeh_quarterly_grade: finalMapehQuarterly,
      };
    });

    res.json({
      subject_offering_id: subjectOfferingId,
      is_mapeh: isMapeh,
      mapeh_component: activeMapehComponent,
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
      exam_config: {
        ...(isMapeh ? { st1Weight: 25, st2Weight: 25, teWeight: 25 }
          : { st1Weight: 30, st2Weight: 30, teWeight: 40 }),
        st1HPS: assessments.find((a) => a.assessment_id === st1ActId)?.max_score ?? (isMapeh ? 25 : 30),
        st2HPS: assessments.find((a) => a.assessment_id === st2ActId)?.max_score ?? (isMapeh ? 25 : 30),
        teHPS: assessments.find((a) => a.assessment_id === teActId)?.max_score ?? (isMapeh ? 25 : 40),
        st1Id: st1ActId, st2Id: st2ActId, teId: teActId, isMapeh },
      assessments,
      transmutation_config: {
        is_custom_enabled: GradeTransmutationConfig.isCustomEnabledSync(),
        ranges: GradeTransmutationConfig.getActiveTiersSync(),
      },
      students: computedStudents,
    });
  } catch (err) {
    console.error('Error in GET /api/class-record/:subject_offering_id:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * POST /api/assessments & POST /api/class-record/assessments
 * Requirement 2: Assessment & Highest Possible Score (HPS) Setup
 */
async function handleCreateAssessment(req, res) {
  let connection;
  let committed = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
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
      mapeh_component,
    } = req.body;

    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }

    const effectiveMax = max_score !== undefined ? max_score : highest_possible_score;
    const numericMaxScore = Number(effectiveMax);
    if (!Number.isFinite(numericMaxScore) || numericMaxScore <= 0) {
      return res.status(400).json({ error: 'max_score (Highest Possible Score) must be a positive number.' });
    }

    if (!/^T[123]$/.test(String(term))) return res.status(400).json({ error: 'Choose the term explicitly.' });
    const { termCode, termName } = normalizeTerm(term);
    const { code, type: normalizedType, name: defaultTypeName } = normalizeAssessmentType(
      component_code || rawInputType || req.body.category
    );

    const [offering] = await connection.execute(
      `SELECT so.subject_id, so.section_id, so.school_year_id, s.subject_name, s.subject_code
       FROM SUBJECT_OFFERING so
       LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
       WHERE so.subject_offering_id = ?`,
      [subject_offering_id]
    );

    if (offering.length === 0) {
      return res.status(404).json({ error: 'Subject offering not found.' });
    }

    const { school_year_id, subject_id } = offering[0];
    const isMapeh = isMapehSubject(offering[0].subject_name, offering[0].subject_code);
    const finalMapehComponent = isMapeh ? normalizeMapehComponent(mapeh_component || req.body.component) : null;

    await submissionContext({ subject_offering_id, section_id: offering[0].section_id, school_year_id }, req.currentUser, connection);
    const sheetData = await ensureGradeSheet(subject_offering_id, school_year_id, termName, connection);
    const { gradeSheetId } = sheetData;
    const isEditable = await GradeSheet.canEdit(sheetData, req.currentUser, connection, { lock: true });

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
      if (code === 'QA') lookupCodes.push('STE', 'EX');
      const [ctRows] = await connection.execute(
        `SELECT component_type_id FROM COMPONENT_TYPE
         WHERE UPPER(component_code) IN (${lookupCodes.map(() => '?').join(',')})
            OR UPPER(component_name) LIKE ? LIMIT 1`,
        [...lookupCodes, `%${code}%`]
      );
      if (ctRows.length > 0) targetComponentTypeId = ctRows[0].component_type_id;
    }

    if (targetComponentTypeId) {
      const [weightRow] = await connection.execute(
        `SELECT subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT
         WHERE subject_id = ? AND component_type_id = ? AND school_year_id = ? LIMIT 1`,
        [subject_id, targetComponentTypeId, school_year_id]
      );
      if (weightRow.length > 0) {
        targetSubjCompWeightId = weightRow[0].subj_comp_weight_id;
      }
    }

    if (!targetSubjCompWeightId) {
      const [allWeights] = await connection.execute(
        `SELECT scw.subj_comp_weight_id, ct.component_code
         FROM SUBJECT_COMPONENT_WEIGHT scw
         JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
         WHERE scw.subject_id = ? AND scw.school_year_id = ?`,
        [subject_id, school_year_id]
      );
      const match = allWeights.find(w => normalizeAssessmentType(w.component_code).code === code);
      if (match) targetSubjCompWeightId = match.subj_comp_weight_id;

    }

    if (!targetSubjCompWeightId) return res.status(409).json({ error: 'Configure the matching subject component weight before adding this assessment.' });

    // Component-Aware Activity Counter: filter count strictly by category (WW vs PT vs QA) and active mapeh_component ('MA' vs 'PEH')
    let componentActivityCount = 0;
    const actCompCondition = isMapeh ? 'ga.mapeh_component = ?' : '(ga.mapeh_component IS NULL OR ga.mapeh_component = \'\')';
    const actCompParams = isMapeh ? [gradeSheetId, finalMapehComponent] : [gradeSheetId];

    const activityCodes = code === 'QA' ? ['QA', 'STE', 'EX'] : [code];
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ?
         AND ${actCompCondition}
         AND (UPPER(ct.component_code) IN (${activityCodes.map(() => '?').join(',')}) OR (ct.component_code IS NULL AND (ga.subj_comp_weight_id = ? OR ga.activity_name LIKE ?)))
         AND (ga.status = 'ACTIVE' OR ga.status IS NULL)
         AND ga.status != 'ARCHIVED'`,
      [...actCompParams, ...activityCodes, targetSubjCompWeightId, `${defaultTypeName}%`]
    );
    componentActivityCount = Number(countRows[0]?.total || 0);

    const nextActivityIndex = componentActivityCount + 1;
    let defaultTitle = activity_name || title;
    const genericPattern = new RegExp(`^${defaultTypeName}\\s*\\d*$`, 'i');
    if (!defaultTitle || String(defaultTitle).trim() === '' || genericPattern.test(String(defaultTitle).trim())) {
      defaultTitle = `${defaultTypeName} ${nextActivityIndex}`;
    }

    const parsedDate = (activity_date && String(activity_date).trim() !== '') ? String(activity_date).trim() : null;

    const [insertResult] = await connection.execute(
      `INSERT INTO GRADE_ACTIVITY (
        grade_sheet_id,
        subj_comp_weight_id,
        mapeh_component,
        activity_name,
        highest_possible_score,
        activity_date,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [gradeSheetId, targetSubjCompWeightId, finalMapehComponent, defaultTitle, numericMaxScore, parsedDate]
    );

    const activityId = insertResult.insertId;


    // Fetch updated component total HPS for the active sub-component
    const activityCondition = isMapeh ? 'ga.mapeh_component = ?' : 'ga.mapeh_component IS NULL';
    const activityParams = isMapeh ? [gradeSheetId, finalMapehComponent] : [gradeSheetId];

    const [allActivities] = await connection.execute(
      `SELECT
         ga.activity_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND ${activityCondition} AND (ga.status = 'ACTIVE' OR ga.status IS NULL)`,
      activityParams
    );

    const totalHps = { WW: 0, PT: 0, QA: 0 };
    allActivities.forEach((a) => {
      const { code: aCode } = normalizeAssessmentType(a.component_code || a.activity_name);
      if (totalHps[aCode] !== undefined) {
        totalHps[aCode] += Number(a.max_score || 0);
      }
    });

    await connection.commit();
    committed = true;
    if (db.cloudPool) {
      db.cloudPool.query(
        `INSERT INTO GRADE_ACTIVITY (
          activity_id,
          grade_sheet_id,
          subj_comp_weight_id,
          mapeh_component,
          activity_name,
          highest_possible_score,
          activity_date,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        ON DUPLICATE KEY UPDATE
          activity_name = VALUES(activity_name),
          highest_possible_score = VALUES(highest_possible_score),
          activity_date = VALUES(activity_date),
          status = VALUES(status)`,
        [activityId, gradeSheetId, targetSubjCompWeightId, finalMapehComponent, defaultTitle, numericMaxScore, parsedDate]
      ).catch((err) => console.warn('[CloudDualWrite] Failed to dual-write activity creation to Aiven:', err.message));
    }

    res.status(201).json({
      message: 'Assessment created successfully',
      assessment: {
        assessment_id: activityId,
        activity_id: activityId,
        grade_sheet_id: gradeSheetId,
        subj_comp_weight_id: targetSubjCompWeightId,
        mapeh_component: finalMapehComponent,
        component_type_id: targetComponentTypeId,
        component_code: code,
        type: normalizedType,
        assessment_type: normalizedType,
        activity_name: defaultTitle,
        title: defaultTitle,
        activity_number: nextActivityIndex,
        max_score: numericMaxScore,
        highest_possible_score: numericMaxScore,
        activity_date: parsedDate,
        status: 'ACTIVE',
      },
      total_highest_possible_scores: totalHps,
    });
  } catch (err) {
    console.error('Error in handleCreateAssessment:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (connection) {
      if (!committed) await connection.rollback().catch(() => {});
      connection.release();
    }
  }
}

router.post('/assessments', resolveCurrentUser, handleCreateAssessment);
router.post('/class-record/assessments', resolveCurrentUser, handleCreateAssessment);

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
  let connection;
  let committed = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const assessmentId = Number(req.params.id);
    const { activity_name, max_score, highest_possible_score, activity_date, status } = req.body;

    // Check if the assessment belongs to a locked grade sheet
    const [actSheetRows] = await connection.execute(
      `SELECT ga.grade_sheet_id, gs.lock_status, gs.workflow_status, gs.term_id, so.school_year_id, at.term_name
       FROM GRADE_ACTIVITY ga
       JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
       JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
       LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
       WHERE ga.activity_id = ? LIMIT 1`,
      [assessmentId]
    );

    if (actSheetRows.length !== 1) return res.status(404).json({ error: 'Assessment not found.' });
    if (actSheetRows.length === 1) {
      const row = actSheetRows[0];
      const isEditable = await GradeSheet.canEdit(row, req.currentUser, connection, { lock: true });
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
      if (!Number.isFinite(numMax) || numMax <= 0) {
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

    if (req.body.mapeh_component !== undefined) {
      const compVal = req.body.mapeh_component ? normalizeMapehComponent(req.body.mapeh_component) : null;
      updateFields.push('mapeh_component = ?');
      updateValues.push(compVal);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    updateValues.push(assessmentId);
    await connection.execute(
      `UPDATE GRADE_ACTIVITY SET ${updateFields.join(', ')}, updated_at = NOW(6) WHERE activity_id = ?`,
      updateValues
    );


    const [rows] = await connection.execute('SELECT * FROM GRADE_ACTIVITY WHERE activity_id = ?', [assessmentId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Assessment not found.' });
    }

    await connection.commit();
    committed = true;
    if (db.cloudPool) {
      db.cloudPool.query(
        `UPDATE GRADE_ACTIVITY SET ${updateFields.join(', ')}, updated_at = NOW(6) WHERE activity_id = ?`,
        updateValues
      ).catch((err) => console.warn('[CloudDualWrite] Failed to dual-write activity update to Aiven:', err.message));
    }

    res.status(200).json({
      message: 'Assessment updated successfully',
      assessment: {
        assessment_id: rows[0].activity_id,
        activity_id: rows[0].activity_id,
        mapeh_component: rows[0].mapeh_component || null,
        activity_name: rows[0].activity_name,
        max_score: Number(rows[0].highest_possible_score),
        highest_possible_score: Number(rows[0].highest_possible_score),
        activity_date: rows[0].activity_date ? String(rows[0].activity_date).slice(0, 10) : null,
        status: rows[0].status,
      },
    });
  } catch (err) {
    console.error('Error in handleUpdateAssessment:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (connection) {
      if (!committed) await connection.rollback().catch(() => {});
      connection.release();
    }
  }
}

router.put('/assessments/:id', resolveCurrentUser, handleUpdateAssessment);
router.patch('/assessments/:id', resolveCurrentUser, handleUpdateAssessment);
router.put('/class-record/assessments/:id', resolveCurrentUser, handleUpdateAssessment);
router.patch('/class-record/assessments/:id', resolveCurrentUser, handleUpdateAssessment);

/**
 * DELETE /api/assessments/:id
 */
router.delete('/assessments/:id', resolveCurrentUser, async (req, res) => {
  let connection;
  let committed = false;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const assessmentId = Number(req.params.id);

    // Check if the assessment belongs to a locked grade sheet
    const [actSheetRows] = await connection.execute(
      `SELECT ga.grade_sheet_id, gs.lock_status, gs.workflow_status, gs.term_id, so.school_year_id, at.term_name
       FROM GRADE_ACTIVITY ga
       JOIN GRADE_SHEET gs ON gs.grade_sheet_id = ga.grade_sheet_id
       JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
       LEFT JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
       WHERE ga.activity_id = ? LIMIT 1`,
      [assessmentId]
    );

    if (actSheetRows.length !== 1) return res.status(404).json({ error: 'Assessment not found.' });
    if (actSheetRows.length === 1) {
      const row = actSheetRows[0];
      const isEditable = await GradeSheet.canEdit(row, req.currentUser, connection, { lock: true });
      if (!isEditable) {
        return res.status(403).json({
          error: `Cannot delete assessment. This class record belongs to a closed term (${row.term_name || 'Closed Term'}) and is read-only.`,
          is_locked: true,
        });
      }
    }

    await connection.execute('DELETE FROM SCORE WHERE activity_id = ?', [assessmentId]);
    const [result] = await connection.execute('DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?', [assessmentId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Assessment not found.' });
    }


    await connection.commit();
    committed = true;
    if (db.cloudPool) {
      db.cloudPool.query('DELETE FROM SCORE WHERE activity_id = ?', [assessmentId]).catch(() => {});
      db.cloudPool.query('DELETE FROM GRADE_ACTIVITY WHERE activity_id = ?', [assessmentId]).catch(() => {});
    }

    res.json({ message: 'Assessment deleted successfully' });
  } catch (err) {
    console.error('Error in DELETE /api/assessments/:id:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    if (connection) {
      if (!committed) await connection.rollback().catch(() => {});
      connection.release();
    }
  }
});

/**
 * Asynchronously forward raw scores to Aiven Cloud (Dual-Write)
 */
async function forwardScoresToCloud(scoresToForward) {
  if (!db.cloudPool) return;
  try {
    for (const item of scoresToForward) {
      const { assessmentId, studentSectionId, rawScore, scoreStatus, itemTeacherAssId } = item;
      await db.cloudPool.query(
        `INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(6), NOW(6))
         ON DUPLICATE KEY UPDATE raw_score = VALUES(raw_score), score_status = VALUES(score_status), updated_at = NOW(6)`,
        [assessmentId, studentSectionId, rawScore, scoreStatus, itemTeacherAssId || null]
      );
    }

    console.log(`☁️ [CloudSync] Dual-write: Successfully forwarded ${scoresToForward.length} score(s) to Aiven Cloud!`);
  } catch (err) {
    console.warn('⚠️ [CloudSync] Could not forward scores to Aiven Cloud (saved locally):', err.message);
  }
}

/**
 * POST /api/scores/batch & POST /api/class-record/scores/batch
 * Requirement 3: Score Entry Endpoint & Requirement 4: Auto-Calculation & Persistence
 */
async function handleBatchScores(req, res) {
  const connection = await db.getConnection();
  try {
    const { subject_offering_id, term, scores } = req.body;
    if (!/^T[123]$/.test(String(term))) return res.status(400).json({ error: 'Choose the term explicitly.' });

    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }

    const { termCode, termName } = normalizeTerm(term);
    const scoresToForward = [];

    const [offeringRows] = await connection.execute(
      `SELECT so.subject_id, so.section_id, so.school_year_id, s.subject_name, s.subject_code
       FROM SUBJECT_OFFERING so
       LEFT JOIN SUBJECT s ON s.subject_id = so.subject_id
       WHERE so.subject_offering_id = ?`,
      [subject_offering_id]
    );

    if (offeringRows.length === 0) {
      return res.status(404).json({ error: 'Subject offering not found.' });
    }

    const { school_year_id, subject_id, section_id } = offeringRows[0];
    const isMapeh = isMapehSubject(offeringRows[0].subject_name, offeringRows[0].subject_code);
    const rawComponent = req.body.mapeh_component || req.body.component;
    const activeMapehComponent = isMapeh ? normalizeMapehComponent(rawComponent) : null;

    const [taRows] = await connection.execute(
      `SELECT teacher_assignment_id FROM TEACHER_ASSIGNMENT WHERE subject_offering_id = ? AND user_id = ?
        AND (assigned_from IS NULL OR assigned_from <= UTC_DATE()) AND (assigned_until IS NULL OR assigned_until >= UTC_DATE())`,
      [subject_offering_id, req.currentUser.user_id]);
    if (taRows.length !== 1) return res.status(403).json({ error: 'A unique current teacher assignment is required.' });
    const teacherAssignmentId = taRows[0].teacher_assignment_id;
    await connection.beginTransaction();
    const sheetData = await ensureGradeSheet(subject_offering_id, school_year_id, termName, connection);
    const { gradeSheetId } = sheetData;
    if (!await GradeSheet.canEdit({ gradeSheetId }, req.currentUser, connection, { lock: true })) {
      throw httpError(403, 'SHEET_CLOSED', 'This grade sheet is no longer open for editing. Reload its submission status.');
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

    if (isMapeh) {
      await connection.execute(
        `UPDATE GRADE_ACTIVITY SET mapeh_component = 'MA' WHERE grade_sheet_id = ? AND mapeh_component IS NULL`,
        [gradeSheetId]
      );
    }

    // Fetch active activities for this sheet to resolve QA/EX and match IDs
    const [sheetActivities] = await connection.execute(
      `SELECT ga.activity_id, ga.activity_name, ga.highest_possible_score, ga.mapeh_component, ga.subj_comp_weight_id, ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND (ga.status = 'ACTIVE' OR ga.status IS NULL) AND ga.status != 'ARCHIVED'`,
      [gradeSheetId]
    );

    const hpsByActivityId = {};
    const compExamMap = {
      MA: { st1: null, st2: null, te: null, qa: null },
      PEH: { st1: null, st2: null, te: null, qa: null },
      ALL: { st1: null, st2: null, te: null, qa: null },
    };

    sheetActivities.forEach((a) => {
      hpsByActivityId[a.activity_id] = Number(a.highest_possible_score || 0);
      const { code } = normalizeAssessmentType(a.component_code || a.activity_name);
      const aName = String(a.activity_name || '').toUpperCase();
      const compKey = a.mapeh_component ? a.mapeh_component : (isMapeh ? 'MA' : 'ALL');

      if (!compExamMap[compKey]) compExamMap[compKey] = { st1: null, st2: null, te: null, qa: null };

      if (code === 'QA' || code === 'EX') {
        if (!compExamMap[compKey].qa) compExamMap[compKey].qa = a.activity_id;
        if (/\b(ST1|SUMMATIVE\s*TEST\s*1|SUMMATIVE\s*1)\b/i.test(aName)) compExamMap[compKey].st1 = a.activity_id;
        else if (/\b(ST2|SUMMATIVE\s*TEST\s*2|SUMMATIVE\s*2)\b/i.test(aName)) compExamMap[compKey].st2 = a.activity_id;
        else if (/\b(TE|TERM\s*EXAM|QUARTERLY)\b/i.test(aName)) compExamMap[compKey].te = a.activity_id;
      }
    });

    const [qaWeightRows] = await connection.execute(
      `SELECT scw.subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT scw
       JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE scw.subject_id = ? AND scw.school_year_id = ? AND (ct.component_code IN ('QA', 'STE', 'EX') OR ct.component_name LIKE '%Quarter%') LIMIT 1`,
      [subject_id, school_year_id]
    );
    const targetWeightId = qaWeightRows.length > 0 ? qaWeightRows[0].subj_comp_weight_id : null;

    // Ensure ST1, ST2, and TE exist in GRADE_ACTIVITY so they each have a distinct activity_id per component
    const targetComps = isMapeh ? ['MA', 'PEH'] : ['ALL'];
    for (const c of targetComps) {
      const cKey = c;
      const cMap = compExamMap[cKey] || (compExamMap[cKey] = { st1: null, st2: null, te: null, qa: null });
      const cMapehComp = isMapeh ? c : null;
      const defaultSt1Hps = isMapeh ? 25 : 30;
      const defaultSt2Hps = isMapeh ? 25 : 30;
      const defaultTeHps = isMapeh ? 25 : 40;

      if (!cMap.st1) {
        const [insSt1] = await connection.execute(
          `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
           VALUES (?, ?, ?, 'Summative Test 1', ?, NOW(), 'ACTIVE')`,
          [gradeSheetId, targetWeightId, cMapehComp, defaultSt1Hps]
        );
        cMap.st1 = insSt1.insertId;
        hpsByActivityId[cMap.st1] = defaultSt1Hps;
      }

      if (!cMap.st2) {
        const [insSt2] = await connection.execute(
          `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
           VALUES (?, ?, ?, 'Summative Test 2', ?, NOW(), 'ACTIVE')`,
          [gradeSheetId, targetWeightId, cMapehComp, defaultSt2Hps]
        );
        cMap.st2 = insSt2.insertId;
        hpsByActivityId[cMap.st2] = defaultSt2Hps;
      }

      if (!cMap.te) {
        if (cMap.qa && cMap.qa !== cMap.st1 && cMap.qa !== cMap.st2) {
          await connection.execute(
            `UPDATE GRADE_ACTIVITY SET activity_name = 'Term Exam', highest_possible_score = ? WHERE activity_id = ?`,
            [defaultTeHps, cMap.qa]
          );
          cMap.te = cMap.qa;
          hpsByActivityId[cMap.te] = defaultTeHps;
        } else {
          const [insTe] = await connection.execute(
            `INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
             VALUES (?, ?, ?, 'Term Exam', ?, NOW(), 'ACTIVE')`,
            [gradeSheetId, targetWeightId, cMapehComp, defaultTeHps]
          );
          cMap.te = insTe.insertId;
          hpsByActivityId[cMap.te] = defaultTeHps;
        }
      }
    }

    const [secMapRows] = await connection.execute(
      `SELECT student_section_id, student_id FROM STUDENT_SECTION WHERE section_id = ? AND school_year_id = ?`,
      [section_id, school_year_id]
    );

    const secIdByStudentId = {};
    const studentIdBySecId = {};
    secMapRows.forEach((r) => {
      secIdByStudentId[r.student_id] = r.student_section_id;
      studentIdBySecId[r.student_section_id] = r.student_id;
    });

    for (const item of scoreEntries) {
      const rawAssId = String(item.assessment_id || item.activity_id || '').toLowerCase();
      const examKey = String(item.exam_key || '').toLowerCase();
      const cleanNumericStr = rawAssId.replace(/^(ww_|pt_)/, '');
      let assessmentId = !isNaN(Number(cleanNumericStr)) && cleanNumericStr !== '' ? Number(cleanNumericStr) : null;

      const itemComp = item.mapeh_component ? normalizeMapehComponent(item.mapeh_component) : (isMapeh ? activeMapehComponent : null);
      const cKey = isMapeh ? (itemComp || 'MA') : 'ALL';
      const cMap = compExamMap[cKey] || compExamMap['ALL'] || { st1: null, st2: null, te: null, qa: null };

      if (examKey === 'st1' || rawAssId === 'st1' || rawAssId.includes('st1')) {
        assessmentId = cMap.st1;
      } else if (examKey === 'st2' || rawAssId === 'st2' || rawAssId.includes('st2')) {
        assessmentId = cMap.st2;
      } else if (examKey === 'te' || rawAssId === 'te' || rawAssId.includes('termexam') || rawAssId === 'qa' || item.type === 'quarterlyAssessment') {
        assessmentId = cMap.te || cMap.qa;
      } else if (isMapeh && assessmentId) {
        if (assessmentId === compExamMap['MA']?.st1 || assessmentId === compExamMap['PEH']?.st1) assessmentId = cMap.st1;
        else if (assessmentId === compExamMap['MA']?.st2 || assessmentId === compExamMap['PEH']?.st2) assessmentId = cMap.st2;
        else if (assessmentId === compExamMap['MA']?.te || assessmentId === compExamMap['PEH']?.te) assessmentId = cMap.te;
      }

      let studentSectionId = item.student_section_id ? Number(item.student_section_id) : null;
      let studentId = item.student_id ? Number(item.student_id) : null;

      if (!studentSectionId && studentId) {
        studentSectionId = secIdByStudentId[studentId] || null;
      }
      if (!studentId && studentSectionId) {
        studentId = studentIdBySecId[studentSectionId] || null;
      }

      if (!studentSectionId || !studentId || Number(studentIdBySecId[studentSectionId]) !== studentId) {
        throw httpError(400, 'INVALID_ENROLLMENT', 'The learner is not enrolled in this section and school year.');
      }
      if (!assessmentId || !Object.hasOwn(hpsByActivityId, assessmentId)) {
        throw httpError(400, 'INVALID_ASSESSMENT', 'The assessment does not belong to this grade sheet.');
      }

      const rawScore = item.raw_score !== null && item.raw_score !== undefined && item.raw_score !== ''
        ? Number(item.raw_score)
        : null;

      // Backend Guard: Validate raw_score does not exceed highest_possible_score
      if (rawScore !== null) {
        if (!Number.isFinite(rawScore) || rawScore < 0) {
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
      const itemTeacherAssId = teacherAssignmentId;

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

      scoresToForward.push({ assessmentId, studentSectionId, rawScore, scoreStatus, itemTeacherAssId });
    }

    // A preview is returned for convenience; accepted STUDENT_GRADE rows only change on Submit.
    const calculatedResults = {};
    try {
      const previewInputs = await loadGradeInputs({ ...offeringRows[0], subject_offering_id }, gradeSheetId, connection);
      for (const student of previewInputs.students) {
        try {
          const grades = GradeComputationService.calculateGrades({ ...previewInputs, students: [student],
            componentOnly: isMapeh ? activeMapehComponent : null });
          const grade = grades.find(g => !isMapeh || g.mapehComponent === activeMapehComponent);
          calculatedResults[student.student_id] = { initialGrade: grade.initialGrade, quarterlyGrade: grade.termGrade, termGrade: grade.termGrade };
        } catch (error) {
          if (!error.statusCode) throw error;
          calculatedResults[student.student_id] = { initialGrade: null, quarterlyGrade: null, termGrade: null, calculationError: error.code };
        }
      }
    } catch (error) {
      if (!error.statusCode) throw error;
      // Incomplete grading configuration must not discard valid autosaved scores.
    }

    await connection.commit();

    // Keep existing raw-score mirroring separate from accepted grade submission.
    forwardScoresToCloud(scoresToForward);

    res.json({
      message: 'Scores saved. Grades remain a preview until submission.',
      subject_offering_id,
      is_mapeh: isMapeh,
      mapeh_component: activeMapehComponent,
      term: termCode,
      recalculated_grades_count: 0,
      students: calculatedResults,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    console.error('Error in POST /api/scores/batch:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  } finally {
    connection.release();
  }
}

router.post('/scores/batch', resolveCurrentUser, handleBatchScores);
router.post('/class-record/scores/batch', resolveCurrentUser, handleBatchScores);

/**
 * POST /api/class-record/calculate-and-save
 */
router.post('/class-record/calculate-and-save', resolveCurrentUser, async (req, res) => {
  try {
    const { subject_offering_id, term = 'T1' } = req.body;
    if (!subject_offering_id) {
      return res.status(400).json({ error: 'subject_offering_id is required.' });
    }
    await handleBatchScores({ ...req, currentUser: req.currentUser, body: { ...req.body, subject_offering_id, term, scores: [] } }, res);
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
    await GradeTransmutationConfig.getActiveTiers();
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
    const isMapeh = isMapehSubject(ctx.subject_name, ctx.subject_code);
    if (isMapeh) {
      weights.WW = 20;
      weights.PT = 60;
      weights.EX = 20;
      weights.QA = 20;
    }
    const rawComponent = req.query.mapeh_component || req.query.component;
    const activeMapehComponent = isMapeh ? normalizeMapehComponent(rawComponent) : null;

    const { gradeSheetId } = await ensureGradeSheet(subjectOfferingId, schoolYearId, termName);
    const actCondition = isMapeh ? 'ga.mapeh_component = ?' : 'ga.mapeh_component IS NULL';
    const actParams = isMapeh ? [gradeSheetId, activeMapehComponent] : [gradeSheetId];

    const [activityRows] = await db.execute(
      `SELECT
         ga.activity_id,
         ga.activity_name,
         ga.highest_possible_score AS max_score,
         ct.component_code
       FROM GRADE_ACTIVITY ga
       LEFT JOIN SUBJECT_COMPONENT_WEIGHT scw ON scw.subj_comp_weight_id = ga.subj_comp_weight_id
       LEFT JOIN COMPONENT_TYPE ct ON ct.component_type_id = scw.component_type_id
       WHERE ga.grade_sheet_id = ? AND ${actCondition} AND (ga.status = 'ACTIVE' OR ga.status IS NULL)
       ORDER BY ga.activity_id ASC`,
      actParams
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
    const compLabel = activeMapehComponent === 'PEH' ? 'PE & HEALTH' : 'MUSIC & ARTS';
    const termTitle = `CLASS RECORD - TERM ${termNum}`;
    const termHeader = `CLASS RECORD - TERM ${termNum}`;

    const sheetTabName = isMapeh
      ? `MAPEH (${activeMapehComponent}) - T${termNum}`
      : `Term ${termNum}`;

    const sheet = workbook.addWorksheet(sheetTabName, {
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

        let exPS = 0;
        let exWS = 0;
        let wsST1 = 0;
        let wsST2 = 0;
        let wsTE = 0;

        if (isMapeh) {
          const exTotalRaw = numST1 + numST2 + numTE;
          const exTotalHps = (st1HPS || 25) + (st2HPS || 25) + (teHPS || 25);
          exPS = hasEx && exTotalHps > 0 ? parseFloat(((exTotalRaw / exTotalHps) * 100).toFixed(2)) : 0;
          exWS = hasEx ? parseFloat((exPS * (20 / 100)).toFixed(2)) : 0;
        } else {
          wsST1 = hasST1 && st1HPS > 0 ? parseFloat(((numST1 / st1HPS) * 30).toFixed(2)) : 0;
          wsST2 = hasST2 && st2HPS > 0 ? parseFloat(((numST2 / st2HPS) * 30).toFixed(2)) : 0;
          wsTE = hasTE && teHPS > 0 ? parseFloat(((numTE / teHPS) * 40).toFixed(2)) : 0;
          exPS = hasEx ? parseFloat((wsST1 + wsST2 + wsTE).toFixed(2)) : 0;
          exWS = hasEx ? parseFloat((exPS * ((weights.EX || weights.QA || 30) / 100)).toFixed(2)) : 0;
        }

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

/**
 * POST /api/class-record/submit
 * Submits grades for a class / subject offering / section and term, setting GRADE_SHEET workflow_status = 'SUBMITTED'
 * and persisting student quarterly grades into STUDENT_GRADE so MasterSheetService reads them for the adviser's section.
 */
router.post('/class-record/submit', resolveCurrentUser, async (req, res) => {
  try {
    const result = await submitClassGrades(req.body, req.currentUser);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ code: error.code || 'GRADE_SUBMISSION_FAILED',
      error: error.statusCode ? error.message : 'Grades could not be submitted. No submission was confirmed. Please retry.' });
  }
});

router.get('/class-record/grading-summary/:subjectOfferingId', resolveCurrentUser, async (req, res) => {
  try {
    const result = await gradingSummary({
      subject_offering_id: req.params.subjectOfferingId, section_id: req.query.section_id, school_year_id: req.query.school_year_id,
    }, req.currentUser);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ code: error.code || 'GRADING_SUMMARY_FAILED',
      error: error.statusCode ? error.message : 'The grading sheet could not be loaded. Please retry.' });
  }
});

/**
 * POST /api/class-record/export-grading-sheet
 * Generates official DepEd CLASS RECORD - FINAL GRADES formatted Excel sheet
 */
const GradingSheetWorkbookService = require('../services/GradingSheetWorkbookService');
router.post('/class-record/export-grading-sheet', async (req, res) => {
  try {
    const { sectionName, gradeLevel, subjectName, teacherName, region, division, schoolId, schoolName, schoolYear, students } = req.body;

    const workbook = await GradingSheetWorkbookService.generateWorkbook({
      sectionName,
      gradeLevel,
      subjectName,
      teacherName,
      region,
      division,
      schoolId,
      schoolName,
      schoolYear,
      students,
    });

    const fileName = `Grading_Sheet_${(sectionName || 'Section').replace(/\s+/g, '_')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting grading sheet excel:', err);
    res.status(500).json({ error: err.message });
  }
});

router.__test = { submitClassGrades, gradingSummary, handleBatchScores };
module.exports = router;
