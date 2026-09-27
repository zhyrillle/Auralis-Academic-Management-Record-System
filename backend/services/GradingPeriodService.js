const db = require('../config/db');
const AcademicTerm = require('../models/AcademicTerm');
const GradeSheet = require('../models/GradeSheet');
const GradeReopenRequest = require('../models/GradeReopenRequest');
const TemporaryReopening = require('../models/TemporaryReopening');
const {
  CALENDAR_RULE,
  buildSuggestedTerms,
} = require('./AcademicCalendarSuggestionService');

const MAX_REOPENING_MINUTES = 7 * 24 * 60;
const REOPENING_REQUEST_DAYS = 7;

function deriveReopeningWindow(deadlineValue) {
  const opensAt = new Date(deadlineValue);
  if (Number.isNaN(opensAt.getTime())) {
    return { opensAt: null, closesAt: null };
  }
  const closesAt = new Date(opensAt.getTime());
  closesAt.setUTCDate(closesAt.getUTCDate() + REOPENING_REQUEST_DAYS);
  return { opensAt, closesAt };
}

function isSubmittedWorkflow(status) {
  return status === 'SUBMITTED';
}

function serviceError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function toSqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function computedTermStatus(term, now = new Date()) {
  const startsAt = new Date(term.starts_at);
  const deadline = new Date(term.grade_submission_deadline_at);
  if (now < startsAt) return 'upcoming';
  if (now < deadline) return 'open';
  return 'finalized';
}

function normalizeTermName(termName) {
  const normalized = String(termName || '').trim().toLowerCase();
  const names = {
    '1': '1st', '1st': '1st', 'term 1': '1st',
    '2': '2nd', '2nd': '2nd', 'term 2': '2nd',
    '3': '3rd', '3rd': '3rd', 'term 3': '3rd',
  };
  return names[normalized] || null;
}

async function recordAudit(connection, {
  userId,
  eventType,
  entityType,
  entityId,
  beforeData = null,
  afterData = null,
  metadata = null,
}) {
  await connection.execute(
    `INSERT INTO AUDIT_EVENT (
      user_id, actor_context, event_type, module_name, entity_type,
      entity_id, before_data, after_data, metadata
    ) VALUES (?, ?, ?, 'GRADING_PERIOD', ?, ?, ?, ?, ?)`,
    [
      userId || null,
      JSON.stringify({ source: userId ? 'user' : 'system' }),
      eventType,
      entityType,
      entityId,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      metadata ? JSON.stringify(metadata) : null,
    ]
  );
}

async function expireTemporaryReopenings() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [expiredRows] = await connection.execute(
      `SELECT
        tr.temporary_reopening_id,
        grr.grade_sheet_id
      FROM TEMPORARY_REOPENING tr
      INNER JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
      WHERE tr.status = 'ACTIVE'
        AND tr.expires_at <= UTC_TIMESTAMP(6)
      FOR UPDATE`
    );

    for (const row of expiredRows) {
      await TemporaryReopening.update(
        row.temporary_reopening_id,
        { status: 'EXPIRED' },
        connection
      );
      await GradeSheet.restoreTermLock(row.grade_sheet_id, connection);
      await recordAudit(connection, {
        eventType: 'TEMPORARY_REOPENING_EXPIRED',
        entityType: 'TEMPORARY_REOPENING',
        entityId: row.temporary_reopening_id,
        afterData: { status: 'EXPIRED', grade_sheet_id: row.grade_sheet_id },
      });
    }

    await connection.commit();
    return expiredRows.length;
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_NO_SUCH_TABLE' || (error.message && error.message.includes("doesn't exist"))) {
      return 0;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function finalizePastDeadlineSheets() {
  const [result] = await db.execute(
    `UPDATE GRADE_SHEET gs
    INNER JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
    SET
      gs.lock_status = 'TERM_LOCKED',
      gs.locked_at = COALESCE(gs.locked_at, UTC_TIMESTAMP(6)),
      gs.updated_at = UTC_TIMESTAMP(6)
    WHERE at.grade_submission_deadline_at <= UTC_TIMESTAMP(6)
      AND gs.lock_status <> 'TERM_LOCKED'
      AND NOT EXISTS (
        SELECT 1
        FROM GRADE_REOPEN_REQUEST grr
        INNER JOIN TEMPORARY_REOPENING tr ON tr.request_id = grr.request_id
        WHERE grr.grade_sheet_id = gs.grade_sheet_id
          AND tr.status = 'ACTIVE'
          AND tr.expires_at > UTC_TIMESTAMP(6)
      )`
  );
  return result.affectedRows;
}

async function runLifecycleGuard() {
  await expireTemporaryReopenings();
  await finalizePastDeadlineSheets();
}

async function ensureUpcomingSchoolYear() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existingUpcoming] = await connection.execute(
      `SELECT school_year_id
       FROM SCHOOL_YEAR
       WHERE LOWER(status) = 'upcoming'
       ORDER BY starts_on ASC
       LIMIT 1
       FOR UPDATE`
    );
    if (existingUpcoming[0]) {
      await connection.commit();
      return existingUpcoming[0].school_year_id;
    }

    const [sourceRows] = await connection.execute(
      `SELECT * FROM SCHOOL_YEAR
       ORDER BY
         CASE WHEN LOWER(status) IN ('active', 'ongoing') THEN 0 ELSE 1 END,
         ends_on DESC
       LIMIT 1
       FOR UPDATE`
    );
    const source = sourceRows[0];
    if (!source) {
      await connection.commit();
      return null;
    }

    const nextStartYear = Number(source.starts_on) + 1;
    const nextEndYear = Number(source.ends_on) + 1;
    if (!Number.isInteger(nextStartYear) || !Number.isInteger(nextEndYear)) {
      throw serviceError(
        500,
        'INVALID_SCHOOL_YEAR',
        'The current school year does not contain valid year values.'
      );
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO SCHOOL_YEAR (
        school_id, starts_on, ends_on, curriculum, status
      ) VALUES (?, ?, ?, ?, 'upcoming')`,
      [source.school_id, nextStartYear, nextEndYear, source.curriculum || null]
    );
    const upcomingId = insertResult.insertId;

    const suggestedTerms = buildSuggestedTerms(nextStartYear, upcomingId);
    for (const term of suggestedTerms) {
      await AcademicTerm.create(term, connection);
    }

    await recordAudit(connection, {
      eventType: 'UPCOMING_SCHOOL_YEAR_CREATED',
      entityType: 'SCHOOL_YEAR',
      entityId: upcomingId,
      afterData: {
        generated_from_school_year_id: source.school_year_id,
        calendar_rule_version: CALENDAR_RULE.version,
      },
    });
    await connection.commit();
    return upcomingId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getSchoolYears() {
  const [rows] = await db.execute(
    `SELECT school_year_id, starts_on, ends_on, curriculum, status
     FROM SCHOOL_YEAR
     ORDER BY starts_on DESC`
  );
  return rows;
}

async function getTerms(schoolYearId) {
  const [rows] = await db.execute(
    `SELECT
      at.*,
      COUNT(gs.grade_sheet_id) AS total_grade_sheets,
      SUM(gs.workflow_status = 'SUBMITTED') AS submitted_grade_sheets,
      SUM(gs.workflow_status = 'DRAFT') AS draft_count,
      SUM(gs.workflow_status = 'SUBMITTED') AS submitted_count,
      SUM(gs.lock_status = 'TERM_LOCKED') AS locked_count
    FROM ACADEMIC_TERM at
    LEFT JOIN GRADE_SHEET gs ON gs.term_id = at.term_id
    WHERE at.school_year_id = ?
    GROUP BY at.term_id
    ORDER BY at.starts_at`,
    [schoolYearId]
  );

  return rows.map((term) => {
    const total = Number(term.total_grade_sheets || 0);
    const submitted = Number(term.submitted_grade_sheets || 0);
    return {
      ...term,
      computed_status: computedTermStatus(term),
      progress: total ? Math.round((submitted / total) * 100) : 0,
      total_grade_sheets: total,
      submitted_grade_sheets: submitted,
      draft_count: Number(term.draft_count || 0),
      submitted_count: Number(term.submitted_count || 0),
      locked_count: Number(term.locked_count || 0),
      reopening_requests_open_at: deriveReopeningWindow(term.grade_submission_deadline_at).opensAt,
      reopening_requests_close_at: deriveReopeningWindow(term.grade_submission_deadline_at).closesAt,
    };
  });
}

async function getDepartmentStatus(termId) {
  const [rows] = await db.execute(
    `SELECT
      d.department_id,
      d.department_name,
      COUNT(gs.grade_sheet_id) AS total,
      SUM(gs.workflow_status = 'SUBMITTED') AS submitted,
      SUM(gs.workflow_status = 'DRAFT') AS overdue
    FROM SUBJECT_OFFERING so
    INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
    INNER JOIN DEPARTMENT d ON d.department_id = s.department_id
    INNER JOIN ACADEMIC_TERM at
      ON at.school_year_id = so.school_year_id AND at.term_id = ?
    LEFT JOIN GRADE_SHEET gs
      ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = at.term_id
    GROUP BY d.department_id, d.department_name
    ORDER BY d.department_name`,
    [termId]
  );
  return rows.map((row) => {
    const total = Number(row.total || 0);
    const submitted = Number(row.submitted || 0);
    return {
      id: String(row.department_id),
      name: row.department_name,
      total,
      submitted,
      overdue: Number(row.overdue || 0),
      progress: total ? Math.round((submitted / total) * 100) : 0,
    };
  });
}

async function getReopeningRequests(termId) {
  const [rows] = await db.execute(
    `SELECT
      grr.request_id,
      grr.grade_sheet_id,
      gs.term_id,
      grr.teacher_assignment_id,
      grr.reason,
      grr.status,
      grr.requested_at,
      grr.reviewed_at,
      requester.user_id AS teacher_id,
      CONCAT(requester.first_name, ' ', requester.last_name) AS teacher_name,
      s.subject_id,
      s.subject_name,
      d.department_name,
      sec.section_id,
      sec.section_name,
      gl.grade_level_name
    FROM GRADE_REOPEN_REQUEST grr
    INNER JOIN GRADE_SHEET gs ON gs.grade_sheet_id = grr.grade_sheet_id
    INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
    INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
    INNER JOIN DEPARTMENT d ON d.department_id = s.department_id
    INNER JOIN SECTION sec ON sec.section_id = so.section_id
    INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    INNER JOIN TEACHER_ASSIGNMENT ta
      ON ta.teacher_assignment_id = grr.teacher_assignment_id
    INNER JOIN \`USER\` requester ON requester.user_id = ta.user_id
    WHERE gs.term_id = ?
    ORDER BY grr.requested_at DESC`,
    [termId]
  );
  return rows;
}

async function getActiveReopenings(termId) {
  const [rows] = await db.execute(
    `SELECT
      tr.temporary_reopening_id,
      tr.request_id,
      tr.starts_at,
      tr.expires_at,
      tr.status,
      grr.grade_sheet_id,
      gs.term_id,
      grr.reason,
      reviewer.user_id AS reviewed_by_user_id,
      CONCAT(reviewer.first_name, ' ', reviewer.last_name) AS approved_by,
      teacher.user_id AS teacher_id,
      CONCAT(teacher.first_name, ' ', teacher.last_name) AS teacher_name,
      s.subject_id,
      s.subject_name,
      d.department_name,
      sec.section_id,
      sec.section_name,
      gl.grade_level_name
    FROM TEMPORARY_REOPENING tr
    INNER JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
    INNER JOIN GRADE_SHEET gs ON gs.grade_sheet_id = grr.grade_sheet_id
    INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
    INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
    INNER JOIN DEPARTMENT d ON d.department_id = s.department_id
    INNER JOIN SECTION sec ON sec.section_id = so.section_id
    INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    INNER JOIN TEACHER_ASSIGNMENT ta
      ON ta.teacher_assignment_id = grr.teacher_assignment_id
    INNER JOIN \`USER\` teacher ON teacher.user_id = ta.user_id
    LEFT JOIN \`USER\` reviewer ON reviewer.user_id = grr.reviewed_by_user_id
    WHERE gs.term_id = ? AND tr.status = 'ACTIVE'
    ORDER BY tr.expires_at ASC`,
    [termId]
  );
  return rows;
}

async function getContext(requestedSchoolYearId) {
  await runLifecycleGuard();
  const schoolYears = await getSchoolYears();
  if (!schoolYears.length) {
    return { schoolYears: [], selectedSchoolYearId: null, terms: [], departmentsByTerm: {}, reopeningRequests: [], activeReopenings: [] };
  }

  const requestedId = Number(requestedSchoolYearId);
  const selected = schoolYears.find((year) => year.school_year_id === requestedId)
    || schoolYears.find((year) => ['active', 'ongoing'].includes(String(year.status).toLowerCase()))
    || schoolYears[0];
  const terms = await getTerms(selected.school_year_id);
  const upcomingSchoolYear = schoolYears.find(
    (year) => String(year.status).toLowerCase() === 'upcoming'
  ) || null;
  const upcomingTerms = upcomingSchoolYear
    ? await getTerms(upcomingSchoolYear.school_year_id)
    : [];
  const suggestedUpcomingTerms = upcomingSchoolYear
    ? buildSuggestedTerms(
        upcomingSchoolYear.starts_on,
        upcomingSchoolYear.school_year_id
      )
    : [];
  const departmentsByTerm = {};
  const reopeningRequests = [];
  const activeReopenings = [];

  for (const term of terms) {
    departmentsByTerm[String(term.term_id)] = await getDepartmentStatus(term.term_id);
    reopeningRequests.push(...await getReopeningRequests(term.term_id));
    activeReopenings.push(...await getActiveReopenings(term.term_id));
  }

  return {
    schoolYears,
    selectedSchoolYearId: selected.school_year_id,
    terms,
    upcomingSchoolYear,
    upcomingTerms,
    upcomingCalendarRule: upcomingSchoolYear ? CALENDAR_RULE : null,
    suggestedUpcomingTerms,
    departmentsByTerm,
    reopeningRequests,
    activeReopenings,
  };
}

function validateTimeline(term, data) {
  const next = {
    term_name: data.term_name ?? term.term_name,
    starts_at: toSqlDateTime(data.starts_at ?? term.starts_at),
    ends_at: toSqlDateTime(data.ends_at ?? term.ends_at),
    grade_submission_deadline_at: toSqlDateTime(
      data.grade_submission_deadline_at ?? term.grade_submission_deadline_at
    ),
  };
  const start = new Date(`${next.starts_at}Z`);
  const end = new Date(`${next.ends_at}Z`);
  const deadline = new Date(`${next.grade_submission_deadline_at}Z`);

  if ([start, end, deadline].some((date) => Number.isNaN(date.getTime()))) {
    throw serviceError(400, 'INVALID_TIMELINE', 'Start, end, and submission deadline are required.');
  }
  if (end <= start || deadline < start) {
    throw serviceError(400, 'INVALID_TIMELINE', 'The term end and deadline must occur after the term begins.');
  }
  const reopeningWindow = deriveReopeningWindow(deadline);
  next.reopening_requests_open_at = toSqlDateTime(reopeningWindow.opensAt);
  next.reopening_requests_close_at = toSqlDateTime(reopeningWindow.closesAt);

  const status = computedTermStatus(term);
  if (status === 'finalized') {
    throw serviceError(409, 'TERM_FINALIZED', 'A finalized grading period is read-only.');
  }
  if (status === 'open') {
    next.term_name = term.term_name;
    next.starts_at = term.starts_at;
    next.ends_at = term.ends_at;
    if (deadline < new Date(term.grade_submission_deadline_at)) {
      throw serviceError(409, 'DEADLINE_CANNOT_MOVE_EARLIER', 'An active term deadline may only be extended.');
    }
  }
  return next;
}

async function updateTimeline(termId, data, actor) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT * FROM ACADEMIC_TERM WHERE term_id = ? FOR UPDATE',
      [termId]
    );
    const term = rows[0];
    if (!term) throw serviceError(404, 'TERM_NOT_FOUND', 'Academic term not found.');
    const next = validateTimeline(term, data);
    const updated = await AcademicTerm.update(termId, next, connection);
    await recordAudit(connection, {
      userId: actor.user_id,
      eventType: 'GRADING_PERIOD_TIMELINE_UPDATED',
      entityType: 'ACADEMIC_TERM',
      entityId: termId,
      beforeData: term,
      afterData: updated,
    });
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createTerm(data, actor) {
  const schoolYearId = Number(data.school_year_id);
  const termName = normalizeTermName(data.term_name);
  if (!Number.isInteger(schoolYearId) || !termName) {
    throw serviceError(400, 'INVALID_TERM', 'A valid school year and Term 1, 2, or 3 are required.');
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existingRows] = await connection.execute(
      'SELECT term_id, term_name FROM ACADEMIC_TERM WHERE school_year_id = ? FOR UPDATE',
      [schoolYearId]
    );
    if (existingRows.some((term) => normalizeTermName(term.term_name) === termName)) {
      throw serviceError(409, 'TERM_ALREADY_EXISTS', 'That grading period is already configured.');
    }

    const draftTerm = {
      term_name: termName,
      starts_at: toSqlDateTime(data.starts_at),
      ends_at: toSqlDateTime(data.ends_at),
      grade_submission_deadline_at: toSqlDateTime(data.grade_submission_deadline_at),
    };
    const validated = validateTimeline({ ...draftTerm, status: 'upcoming' }, draftTerm);
    const termId = await AcademicTerm.create({
      school_year_id: schoolYearId,
      ...validated,
      status: 'upcoming',
    }, connection);
    const created = await AcademicTerm.findById(termId, connection);
    await recordAudit(connection, {
      userId: actor.user_id,
      eventType: 'GRADING_PERIOD_CREATED',
      entityType: 'ACADEMIC_TERM',
      entityId: termId,
      afterData: created,
    });
    await connection.commit();
    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function approveRequest(requestId, data, actor) {
  const durationMinutes = Number(data.duration_minutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > MAX_REOPENING_MINUTES) {
    throw serviceError(400, 'INVALID_DURATION', 'Temporary access must be between 30 minutes and 7 days.');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT grr.*, gs.workflow_status, gs.lock_status
       FROM GRADE_REOPEN_REQUEST grr
       INNER JOIN GRADE_SHEET gs ON gs.grade_sheet_id = grr.grade_sheet_id
       WHERE grr.request_id = ? FOR UPDATE`,
      [requestId]
    );
    const request = rows[0];
    if (!request) throw serviceError(404, 'REQUEST_NOT_FOUND', 'Reopening request not found.');
    if (request.status !== 'PENDING') {
      throw serviceError(409, 'REQUEST_ALREADY_REVIEWED', 'This request has already been reviewed.');
    }
    if (request.lock_status !== 'TERM_LOCKED' || !isSubmittedWorkflow(request.workflow_status)) {
      throw serviceError(409, 'SHEET_NOT_ELIGIBLE', 'Only a submitted, term-locked grade sheet can be reopened.');
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO TEMPORARY_REOPENING (request_id, starts_at, expires_at, status)
       VALUES (?, UTC_TIMESTAMP(6), DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? MINUTE), 'ACTIVE')`,
      [requestId, durationMinutes]
    );
    await GradeReopenRequest.update(requestId, {
      status: 'APPROVED',
      reviewed_by_user_id: actor.user_id,
      reviewed_at: toSqlDateTime(new Date()),
    }, connection);
    await GradeSheet.openTemporaryCorrection(request.grade_sheet_id, connection);
    await recordAudit(connection, {
      userId: actor.user_id,
      eventType: 'GRADE_REOPEN_REQUEST_APPROVED',
      entityType: 'TEMPORARY_REOPENING',
      entityId: insertResult.insertId,
      beforeData: { request_status: request.status, lock_status: request.lock_status },
      afterData: { request_status: 'APPROVED', lock_status: 'TEMPORARILY_REOPENED' },
      metadata: { admin_note: data.admin_note || null, duration_minutes: durationMinutes },
    });
    await connection.commit();
    return TemporaryReopening.findById(insertResult.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function denyRequest(requestId, data, actor) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const request = await GradeReopenRequest.findById(requestId, connection);
    if (!request) throw serviceError(404, 'REQUEST_NOT_FOUND', 'Reopening request not found.');
    if (request.status !== 'PENDING') {
      throw serviceError(409, 'REQUEST_ALREADY_REVIEWED', 'This request has already been reviewed.');
    }
    await GradeReopenRequest.update(requestId, {
      status: 'DENIED',
      reviewed_by_user_id: actor.user_id,
      reviewed_at: toSqlDateTime(new Date()),
    }, connection);
    await recordAudit(connection, {
      userId: actor.user_id,
      eventType: 'GRADE_REOPEN_REQUEST_DENIED',
      entityType: 'GRADE_REOPEN_REQUEST',
      entityId: requestId,
      beforeData: { status: 'PENDING' },
      afterData: { status: 'DENIED' },
      metadata: { admin_note: data.admin_note || null },
    });
    await connection.commit();
    return { request_id: Number(requestId), status: 'DENIED' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getReopeningEligibility(gradeSheetId, userId) {
  await runLifecycleGuard();
  const [rows] = await db.execute(
    `SELECT
      gs.grade_sheet_id, gs.workflow_status, gs.lock_status,
      at.grade_submission_deadline_at,
      ta.teacher_assignment_id,
      EXISTS(
        SELECT 1 FROM GRADE_REOPEN_REQUEST pending
        WHERE pending.grade_sheet_id = gs.grade_sheet_id AND pending.status = 'PENDING'
      ) AS has_pending,
      EXISTS(
        SELECT 1 FROM GRADE_REOPEN_REQUEST approved
        INNER JOIN TEMPORARY_REOPENING active ON active.request_id = approved.request_id
        WHERE approved.grade_sheet_id = gs.grade_sheet_id
          AND active.status = 'ACTIVE' AND active.expires_at > UTC_TIMESTAMP(6)
      ) AS has_active
    FROM GRADE_SHEET gs
    INNER JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
    INNER JOIN TEACHER_ASSIGNMENT ta
      ON ta.subject_offering_id = gs.subject_offering_id AND ta.user_id = ?
    WHERE gs.grade_sheet_id = ?
      AND (ta.assigned_until IS NULL OR ta.assigned_until >= UTC_DATE())
    LIMIT 1`,
    [userId, gradeSheetId]
  );
  const sheet = rows[0];
  if (!sheet) throw serviceError(404, 'GRADE_SHEET_NOT_FOUND', 'No accessible grade sheet was found.');
  const now = Date.now();
  const reopeningWindow = deriveReopeningWindow(sheet.grade_submission_deadline_at);
  const opens = reopeningWindow.opensAt?.getTime();
  const closes = reopeningWindow.closesAt?.getTime();
  let reason = null;
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) reason = 'WINDOW_NOT_CONFIGURED';
  else if (now < opens) reason = 'WINDOW_NOT_OPEN';
  else if (now > closes) reason = 'WINDOW_CLOSED';
  else if (!isSubmittedWorkflow(sheet.workflow_status) || sheet.lock_status !== 'TERM_LOCKED') reason = 'SHEET_NOT_SUBMITTED_AND_LOCKED';
  else if (sheet.has_pending) reason = 'REQUEST_ALREADY_PENDING';
  else if (sheet.has_active) reason = 'TEMPORARY_ACCESS_ACTIVE';
  return {
    eligible: !reason,
    reason,
    teacher_assignment_id: sheet.teacher_assignment_id,
    reopening_requests_open_at: reopeningWindow.opensAt,
    reopening_requests_close_at: reopeningWindow.closesAt,
  };
}

async function getReopeningOptions(userId) {
  await runLifecycleGuard();
  const [rows] = await db.execute(
    `SELECT
      gs.grade_sheet_id,
      gs.workflow_status,
      gs.lock_status,
      at.term_id,
      at.term_name,
      at.grade_submission_deadline_at,
      sy.school_year_id,
      sy.starts_on AS school_year_starts_on,
      sy.ends_on AS school_year_ends_on,
      ta.teacher_assignment_id,
      s.subject_name,
      sec.section_name,
      gl.grade_level_name,
      EXISTS(
        SELECT 1 FROM GRADE_REOPEN_REQUEST pending
        WHERE pending.grade_sheet_id = gs.grade_sheet_id
          AND pending.status = 'PENDING'
      ) AS has_pending,
      EXISTS(
        SELECT 1
        FROM GRADE_REOPEN_REQUEST approved
        INNER JOIN TEMPORARY_REOPENING active ON active.request_id = approved.request_id
        WHERE approved.grade_sheet_id = gs.grade_sheet_id
          AND active.status = 'ACTIVE'
          AND active.expires_at > UTC_TIMESTAMP(6)
      ) AS has_active
    FROM GRADE_SHEET gs
    INNER JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
    INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = at.school_year_id
    INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
    INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
    INNER JOIN SECTION sec ON sec.section_id = so.section_id
    INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
    INNER JOIN TEACHER_ASSIGNMENT ta
      ON ta.subject_offering_id = gs.subject_offering_id
      AND ta.user_id = ?
    WHERE LOWER(ta.status) = 'active'
      AND (ta.assigned_until IS NULL OR ta.assigned_until >= UTC_DATE())
    ORDER BY at.grade_submission_deadline_at DESC, s.subject_name, sec.section_name`,
    [userId]
  );

  return rows.map((sheet) => {
    const reopeningWindow = deriveReopeningWindow(sheet.grade_submission_deadline_at);
    const now = Date.now();
    let reason = null;
    if (now < reopeningWindow.opensAt.getTime()) reason = 'WINDOW_NOT_OPEN';
    else if (now > reopeningWindow.closesAt.getTime()) reason = 'WINDOW_CLOSED';
    else if (!isSubmittedWorkflow(sheet.workflow_status) || sheet.lock_status !== 'TERM_LOCKED') {
      reason = 'SHEET_NOT_SUBMITTED_AND_LOCKED';
    } else if (sheet.has_pending) reason = 'REQUEST_ALREADY_PENDING';
    else if (sheet.has_active) reason = 'TEMPORARY_ACCESS_ACTIVE';

    return {
      ...sheet,
      eligible: !reason,
      reason,
      reopening_requests_open_at: reopeningWindow.opensAt,
      reopening_requests_close_at: reopeningWindow.closesAt,
    };
  });
}

async function createReopeningRequest(gradeSheetId, reason, actor) {
  if (!String(reason || '').trim()) {
    throw serviceError(400, 'REASON_REQUIRED', 'A correction reason is required.');
  }
  const eligibility = await getReopeningEligibility(gradeSheetId, actor.user_id);
  if (!eligibility.eligible) {
    throw serviceError(409, eligibility.reason, 'This grade sheet is not currently accepting reopening requests.');
  }
  const requestId = await GradeReopenRequest.create({
    grade_sheet_id: gradeSheetId,
    teacher_assignment_id: eligibility.teacher_assignment_id,
    reason: String(reason).trim(),
  });
  return GradeReopenRequest.findById(requestId);
}

async function getReopeningActivity(temporaryReopeningId) {
  const [rows] = await db.execute(
    `SELECT tr.*, grr.requested_at, grr.reviewed_at, grr.status AS request_status
     FROM TEMPORARY_REOPENING tr
     INNER JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
     WHERE tr.temporary_reopening_id = ?`,
    [temporaryReopeningId]
  );
  const row = rows[0];
  if (!row) throw serviceError(404, 'REOPENING_NOT_FOUND', 'Temporary reopening not found.');
  return [
    { id: `requested-${row.request_id}`, time: row.requested_at, label: 'Request submitted', state: 'completed' },
    { id: `approved-${row.request_id}`, time: row.reviewed_at, label: 'Temporary access approved', state: 'completed' },
    { id: `started-${row.temporary_reopening_id}`, time: row.starts_at, label: 'Temporary access started', state: 'completed' },
    { id: `expires-${row.temporary_reopening_id}`, time: row.expires_at, label: row.status === 'ACTIVE' ? 'Scheduled access end' : 'Temporary access ended', state: row.status === 'ACTIVE' ? 'scheduled' : 'completed' },
  ];
}

module.exports = {
  getContext,
  createTerm,
  updateTimeline,
  approveRequest,
  denyRequest,
  getReopeningEligibility,
  getReopeningOptions,
  createReopeningRequest,
  getReopeningActivity,
  runLifecycleGuard,
  ensureUpcomingSchoolYear,
};
