const db = require('../config/db');
const GradeSheet = require('../models/GradeSheet');

function workflowError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isSubmittedStatus(status) {
  return ['SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'ADVISER_APPROVED'].includes(status);
}

async function getAccessibleSheet(connection, gradeSheetId, userId) {
  const [rows] = await connection.execute(
    `SELECT
      gs.*,
      at.grade_submission_deadline_at,
      ta.teacher_assignment_id
    FROM GRADE_SHEET gs
    INNER JOIN ACADEMIC_TERM at ON at.term_id = gs.term_id
    INNER JOIN TEACHER_ASSIGNMENT ta
      ON ta.subject_offering_id = gs.subject_offering_id
      AND ta.user_id = ?
    WHERE gs.grade_sheet_id = ?
      AND LOWER(ta.status) = 'active'
      AND (ta.assigned_until IS NULL OR ta.assigned_until >= UTC_DATE())
    LIMIT 1
    FOR UPDATE`,
    [userId, gradeSheetId]
  );
  if (!rows[0]) {
    throw workflowError(404, 'GRADE_SHEET_NOT_FOUND', 'No accessible grade sheet was found.');
  }
  return rows[0];
}

async function recordAudit(connection, userId, eventType, gradeSheetId, beforeData, afterData) {
  await connection.execute(
    `INSERT INTO AUDIT_EVENT (
      user_id, actor_context, event_type, module_name, entity_type,
      entity_id, before_data, after_data
    ) VALUES (?, ?, ?, 'GRADING', 'GRADE_SHEET', ?, ?, ?)`,
    [
      userId,
      JSON.stringify({ source: 'user' }),
      eventType,
      gradeSheetId,
      JSON.stringify(beforeData),
      JSON.stringify(afterData),
    ]
  );
}

async function hasActiveTemporaryAccess(connection, gradeSheetId) {
  const [rows] = await connection.execute(
    `SELECT tr.temporary_reopening_id
     FROM TEMPORARY_REOPENING tr
     INNER JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
     WHERE grr.grade_sheet_id = ?
       AND tr.status = 'ACTIVE'
       AND tr.starts_at <= UTC_TIMESTAMP(6)
       AND tr.expires_at > UTC_TIMESTAMP(6)
     LIMIT 1
     FOR UPDATE`,
    [gradeSheetId]
  );
  return rows[0] || null;
}

async function submit(gradeSheetId, actor) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const sheet = await getAccessibleSheet(connection, gradeSheetId, actor.user_id);
    if (sheet.workflow_status !== 'DRAFT') {
      throw workflowError(409, 'GRADE_SHEET_NOT_DRAFT', 'Only a draft grade sheet can be submitted.');
    }

    const deadlineReached = new Date(sheet.grade_submission_deadline_at).getTime() <= Date.now();
    let temporaryAccess = null;
    if (deadlineReached) {
      temporaryAccess = await hasActiveTemporaryAccess(connection, gradeSheetId);
      if (sheet.lock_status !== 'TEMPORARILY_REOPENED' || !temporaryAccess) {
        throw workflowError(
          409,
          'TEMPORARY_ACCESS_REQUIRED',
          'The submission deadline has passed. Approved temporary access is required.'
        );
      }
    } else if (sheet.lock_status !== 'EDITABLE') {
      throw workflowError(409, 'GRADE_SHEET_READ_ONLY', 'This grade sheet is currently read-only.');
    }

    const nextLockStatus = deadlineReached ? 'TERM_LOCKED' : 'SUBMISSION_READ_ONLY';
    const updated = await GradeSheet.update(gradeSheetId, {
      workflow_status: 'SUBMITTED',
      lock_status: nextLockStatus,
      submitted_at: new Date(),
      approved_at: null,
    }, connection);

    if (temporaryAccess) {
      await connection.execute(
        `UPDATE TEMPORARY_REOPENING
         SET status = 'EXPIRED', expires_at = UTC_TIMESTAMP(6)
         WHERE temporary_reopening_id = ?`,
        [temporaryAccess.temporary_reopening_id]
      );
    }

    await recordAudit(
      connection,
      actor.user_id,
      deadlineReached ? 'GRADE_SHEET_CORRECTION_RESUBMITTED' : 'GRADE_SHEET_SUBMITTED',
      gradeSheetId,
      { workflow_status: sheet.workflow_status, lock_status: sheet.lock_status },
      { workflow_status: 'SUBMITTED', lock_status: nextLockStatus }
    );
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recall(gradeSheetId, actor) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const sheet = await getAccessibleSheet(connection, gradeSheetId, actor.user_id);
    if (!isSubmittedStatus(sheet.workflow_status) || sheet.lock_status !== 'SUBMISSION_READ_ONLY') {
      throw workflowError(409, 'GRADE_SHEET_NOT_RECALLABLE', 'Only a submitted grade sheet can be recalled.');
    }
    if (new Date(sheet.grade_submission_deadline_at).getTime() <= Date.now()) {
      throw workflowError(
        409,
        'SUBMISSION_DEADLINE_REACHED',
        'The deadline has passed. Submit a reopening request instead.'
      );
    }

    const updated = await GradeSheet.update(gradeSheetId, {
      workflow_status: 'DRAFT',
      lock_status: 'EDITABLE',
      submitted_at: null,
      approved_at: null,
    }, connection);
    await recordAudit(
      connection,
      actor.user_id,
      'GRADE_SHEET_RECALLED',
      gradeSheetId,
      { workflow_status: sheet.workflow_status, lock_status: sheet.lock_status },
      { workflow_status: 'DRAFT', lock_status: 'EDITABLE' }
    );
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { submit, recall };
