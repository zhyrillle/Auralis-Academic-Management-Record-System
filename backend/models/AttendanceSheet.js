const db = require('../config/db');
const { withWritableSheet } = require('../services/AttendanceDayService');
const cloudSync = require('../services/cloudSyncService');

class AttendanceSheet {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]);
    return rows[0];
  }

  // Find or create an ATTENDANCE_SHEET for a given date + adviser assignment or teacher assignment
  static async findOrCreate({ section_id, adviser_assignment_id, teacher_assignment_id, attendance_scope, attendance_date, user_id }) {
    const cleanDate = String(attendance_date).split('T')[0];
    const isSubject = attendance_scope === 'SUBJECT' || Boolean(teacher_assignment_id);

    // 1. Subject Teacher Attendance (attendance_scope = 'SUBJECT')
    if (isSubject) {
      let targetTeacherAssignmentId = teacher_assignment_id ? Number(teacher_assignment_id) : null;

      if (!targetTeacherAssignmentId && section_id && user_id) {
        const [taRows] = await db.execute(
          `SELECT ta.teacher_assignment_id
           FROM TEACHER_ASSIGNMENT ta
           JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
           WHERE so.section_id = ? AND ta.user_id = ?
           ORDER BY ta.teacher_assignment_id DESC LIMIT 1`,
          [section_id, user_id]
        );
        if (taRows.length > 0) {
          targetTeacherAssignmentId = taRows[0].teacher_assignment_id;
        }
      }

      if (targetTeacherAssignmentId) {
        const [existing] = await db.execute(
          `SELECT attendance_sheet_id FROM ATTENDANCE_SHEET
           WHERE teacher_assignment_id = ? AND attendance_date = ? AND attendance_scope = 'SUBJECT'`,
          [targetTeacherAssignmentId, cleanDate]
        );
        if (existing.length > 0) {
          return { attendance_sheet_id: existing[0].attendance_sheet_id, created: false };
        }
        const [result] = await db.execute(
          `INSERT INTO ATTENDANCE_SHEET (teacher_assignment_id, attendance_scope, attendance_date)
           VALUES (?, 'SUBJECT', ?)`,
          [targetTeacherAssignmentId, cleanDate]
        );
        cloudSync.forwardAttendanceSheetToCloud(result.insertId, {
          teacher_assignment_id: targetTeacherAssignmentId,
          attendance_scope: 'SUBJECT',
          attendance_date: cleanDate,
        }).catch(() => {});
        return { attendance_sheet_id: result.insertId, created: true };
      }

      throw new Error('A valid teacher_assignment_id is required to record subject attendance.');
    }

    // 2. Adviser Section Attendance (attendance_scope = 'SECTION')
    let targetAdviserAssignmentId = adviser_assignment_id ? Number(adviser_assignment_id) : null;

    if (!targetAdviserAssignmentId && section_id) {
      if (user_id) {
        const [userSaa] = await db.execute(
          `SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? AND user_id = ? ORDER BY adviser_assignment_id DESC LIMIT 1`,
          [section_id, user_id]
        );
        if (userSaa.length > 0) {
          targetAdviserAssignmentId = userSaa[0].adviser_assignment_id;
        }
      }
      if (!targetAdviserAssignmentId) {
        const [saaRows] = await db.execute(
          `SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? ORDER BY adviser_assignment_id DESC LIMIT 1`,
          [section_id]
        );
        if (saaRows.length > 0) {
          targetAdviserAssignmentId = saaRows[0].adviser_assignment_id;
        }
      }
    }

    if (targetAdviserAssignmentId) {
      const [existing] = await db.execute(
        `SELECT attendance_sheet_id FROM ATTENDANCE_SHEET
         WHERE adviser_assignment_id = ? AND attendance_date = ? AND attendance_scope = 'SECTION'`,
        [targetAdviserAssignmentId, cleanDate]
      );
      if (existing.length > 0) {
        return { attendance_sheet_id: existing[0].attendance_sheet_id, created: false };
      }
      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)
         VALUES (?, 'SECTION', ?)`,
        [targetAdviserAssignmentId, cleanDate]
      );
      cloudSync.forwardAttendanceSheetToCloud(result.insertId, {
        adviser_assignment_id: targetAdviserAssignmentId,
        attendance_scope: 'SECTION',
        attendance_date: cleanDate,
      }).catch(() => {});
      return { attendance_sheet_id: result.insertId, created: true };
    }

    // 3. Fallback: create adviser assignment if section exists but no assignment
    if (section_id) {
      const [syRows] = await db.execute(`SELECT school_year_id FROM SCHOOL_YEAR ORDER BY school_year_id DESC LIMIT 1`);
      const schoolYearId = syRows[0]?.school_year_id || 1;

      let assignUserId = user_id;
      if (!assignUserId) {
        const [secRows] = await db.execute(`SELECT user_id FROM SECTION WHERE section_id = ?`, [section_id]);
        assignUserId = secRows[0]?.user_id;
      }
      if (!assignUserId) {
        const [uRows] = await db.execute(`SELECT user_id FROM USER WHERE role IN ('3', '2', 'adviser', 'subject teacher') LIMIT 1`);
        assignUserId = uRows[0]?.user_id || 1;
      }

      const [insSaa] = await db.execute(
        `INSERT INTO SECTION_ADVISER_ASSIGNMENT (section_id, school_year_id, user_id, assigned_from, assigned_until)
         VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR))`,
        [section_id, schoolYearId, assignUserId]
      );
      targetAdviserAssignmentId = insSaa.insertId;

      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)
         VALUES (?, 'SECTION', ?)`,
        [targetAdviserAssignmentId, cleanDate]
      );
      cloudSync.forwardAttendanceSheetToCloud(result.insertId, {
        adviser_assignment_id: targetAdviserAssignmentId,
        attendance_scope: 'SECTION',
        attendance_date: cleanDate,
      }).catch(() => {});
      return { attendance_sheet_id: result.insertId, created: true };
    }

    throw new Error('Either adviser_assignment_id, teacher_assignment_id, or section_id is required along with attendance_date');
  }

  // Get all attendance sheet dates for a given adviser assignment
  static async findByAdviserAssignmentId(adviserAssignmentId) {
    const [rows] = await db.execute(
      `SELECT * FROM ATTENDANCE_SHEET
       WHERE adviser_assignment_id = ? AND attendance_scope = 'SECTION'
       ORDER BY attendance_date ASC`,
      [adviserAssignmentId]
    );
    return rows;
  }

  // Get all attendance sheet dates for a given teacher assignment
  static async findByTeacherAssignmentId(teacherAssignmentId) {
    const [rows] = await db.execute(
      `SELECT * FROM ATTENDANCE_SHEET
       WHERE teacher_assignment_id = ? AND attendance_scope = 'SUBJECT'
       ORDER BY attendance_date ASC`,
      [teacherAssignmentId]
    );
    return rows;
  }

  // Get all attendance sheets for a section, scoped to adviser or subject teacher
  static async findBySectionId(sectionId, schoolYearId = null, options = {}) {
    const { attendance_scope, adviser_assignment_id, teacher_assignment_id, user_id } = options;
    const isSubject = attendance_scope === 'SUBJECT' || Boolean(teacher_assignment_id);

    if (isSubject) {
      const params = [sectionId];
      let query = `
        SELECT DISTINCT ash.*
        FROM ATTENDANCE_SHEET ash
        LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
        LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
        LEFT JOIN ATTENDANCE a ON a.attendance_sheet_id = ash.attendance_sheet_id
        LEFT JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
        WHERE COALESCE(so.section_id, ss.section_id) = ? AND ash.attendance_scope = 'SUBJECT'
      `;
      if (teacher_assignment_id) {
        query += ` AND ash.teacher_assignment_id = ?`;
        params.push(teacher_assignment_id);
      } else if (user_id) {
        query += ` AND ta.user_id = ?`;
        params.push(user_id);
      }
      if (schoolYearId) {
        query += ` AND (so.school_year_id = ? OR ss.school_year_id = ?)`;
        params.push(schoolYearId, schoolYearId);
      }
      query += ` ORDER BY ash.attendance_date ASC`;
      const [rows] = await db.execute(query, params);
      return rows;
    }

    const params = [sectionId];
    let query = `
      SELECT DISTINCT ash.*
      FROM ATTENDANCE_SHEET ash
      LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      LEFT JOIN ATTENDANCE a ON a.attendance_sheet_id = ash.attendance_sheet_id
      LEFT JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
      WHERE COALESCE(saa.section_id, ss.section_id) = ? AND ash.attendance_scope = 'SECTION'
    `;
    if (adviser_assignment_id) {
      query += ` AND (ash.adviser_assignment_id = ? OR ash.adviser_assignment_id IS NULL)`;
      params.push(adviser_assignment_id);
    }
    if (schoolYearId) {
      query += ` AND (saa.school_year_id = ? OR ss.school_year_id = ?)`;
      params.push(schoolYearId, schoolYearId);
    }
    query += ` ORDER BY ash.attendance_date ASC`;
    const [rows] = await db.execute(query, params);
    return rows;
  }

  static async create(data) {
    const { teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date } = data;
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE_SHEET (teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date)
       VALUES (?, ?, ?, ?)`,
      [teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length || keys.some(key => !['teacher_assignment_id', 'adviser_assignment_id', 'attendance_scope', 'attendance_date'].includes(key))) {
      throw Object.assign(new Error('Use the day-marker action to change no-class days.'), { statusCode: 400 });
    }
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await withWritableSheet(id, connection =>
      connection.execute(`UPDATE ATTENDANCE_SHEET SET ${setClause} WHERE attendance_sheet_id = ?`, [...values, id]));
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await withWritableSheet(id, connection =>
      connection.execute('DELETE FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]));
    return result.affectedRows > 0;
  }
}

module.exports = AttendanceSheet;
