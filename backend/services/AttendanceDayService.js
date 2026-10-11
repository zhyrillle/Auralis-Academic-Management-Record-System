const db = require('../config/db');

const error = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const todayInManila = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
};

async function contextFor(sheetId, connection) {
  const [rows] = await connection.execute(`SELECT ash.attendance_sheet_id, ash.attendance_scope,
    DATE_FORMAT(ash.attendance_date, '%Y-%m-%d') AS attendance_date,
    saa.section_id AS adviser_section_id, saa.school_year_id AS adviser_year_id, saa.user_id AS adviser_user_id,
    so.section_id AS teacher_section_id, so.school_year_id AS teacher_year_id
    FROM ATTENDANCE_SHEET ash
    LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
    LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
    LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
    WHERE ash.attendance_sheet_id = ?`, [sheetId]);
  const row = rows[0];
  if (!row) throw error(404, 'ATTENDANCE_SHEET_NOT_FOUND', 'Attendance sheet not found.');
  if (row.adviser_section_id && row.teacher_section_id &&
    (Number(row.adviser_section_id) !== Number(row.teacher_section_id) || Number(row.adviser_year_id) !== Number(row.teacher_year_id))) {
    throw error(409, 'AMBIGUOUS_ATTENDANCE_DAY', 'Attendance assignments do not identify the same section and school year.');
  }
  const sectionId = row.adviser_section_id || row.teacher_section_id;
  const schoolYearId = row.adviser_year_id || row.teacher_year_id;
  if (!sectionId || !schoolYearId) throw error(409, 'ATTENDANCE_CONTEXT_MISSING', 'Attendance section and school year need review.');
  return { ...row, sectionId, schoolYearId };
}

// Serialize day marking and learner writes for the section. The second read and
// FOR UPDATE read see current data, including markers committed while waiting.
async function onDay(sheetId, operation, database = db) {
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    let context = await contextFor(sheetId, connection);
    await connection.execute('SELECT section_id FROM SECTION WHERE section_id = ? FOR UPDATE', [context.sectionId]);
    context = await contextFor(sheetId, connection);
    const [sheets] = await connection.execute(`SELECT ash.attendance_sheet_id, ash.no_class_reason
      FROM ATTENDANCE_SHEET ash
      LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
      LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      WHERE COALESCE(saa.section_id, so.section_id) = ?
        AND COALESCE(saa.school_year_id, so.school_year_id) = ? AND ash.attendance_date = ?
      ORDER BY ash.attendance_sheet_id FOR UPDATE`, [context.sectionId, context.schoolYearId, context.attendance_date]);
    const result = await operation(connection, context, sheets);
    await connection.commit();
    return result;
  } catch (failure) {
    await connection.rollback();
    throw failure;
  } finally {
    connection.release();
  }
}

async function withWritableSheet(sheetId, operation, database = db) {
  return onDay(sheetId, async (connection, context, sheets) => {
    if (sheets.some(sheet => sheet.no_class_reason)) {
      throw error(409, 'NO_CLASSES_DAY', 'This day is marked as no classes. Remove the marker before changing attendance or remarks.');
    }
    return operation(connection, context);
  }, database);
}

async function setNoClasses({ sheetId, reason, confirmExistingRecords = false, userId }, database = db, now = new Date()) {
  if (reason !== null && !['HOLIDAY', 'SUSPENSION'].includes(reason)) {
    throw error(400, 'INVALID_DAY_REASON', 'Choose Holiday or Suspension, or remove the marker.');
  }
  return onDay(sheetId, async (connection, context, sheets) => {
    if (context.attendance_scope !== 'SECTION' || Number(context.adviser_user_id) !== Number(userId)) {
      throw error(403, 'DAY_MARKER_FORBIDDEN', 'Only the assigned class adviser can mark this section’s day.');
    }
    if (context.attendance_date !== todayInManila(now)) {
      throw error(409, 'ATTENDANCE_DATE_LOCKED', 'Past and future dates are read-only. Only today can be marked or unmarked.');
    }
    const ids = sheets.map(sheet => sheet.attendance_sheet_id);
    const placeholders = ids.map(() => '?').join(',');
    const [counts] = await connection.execute(`SELECT COUNT(*) AS record_count FROM ATTENDANCE
      WHERE attendance_sheet_id IN (${placeholders})`, ids);
    const retainedRecordCount = Number(counts[0]?.record_count || 0);
    if (reason && retainedRecordCount && confirmExistingRecords !== true) {
      throw error(409, 'DAY_MARKER_CONFIRMATION_REQUIRED', 'Existing attendance will be preserved but excluded from totals. Confirm before marking this day.');
    }
    await connection.execute(`UPDATE ATTENDANCE_SHEET SET no_class_reason = ?
      WHERE attendance_sheet_id IN (${placeholders})`, [reason, ...ids]);
    return { attendance_date: context.attendance_date, no_class_reason: reason, retainedRecordCount, sheetIds: ids };
  }, database);
}

module.exports = { setNoClasses, withWritableSheet, todayInManila };
