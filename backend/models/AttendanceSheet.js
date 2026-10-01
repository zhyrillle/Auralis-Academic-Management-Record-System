const db = require('../config/db');

class AttendanceSheet {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]);
    return rows[0];
  }

  // Find or create an ATTENDANCE_SHEET for a given date + adviser assignment or section
  static async findOrCreate({ section_id, adviser_assignment_id, teacher_assignment_id, attendance_scope = 'SECTION', attendance_date, user_id }) {
    const cleanDate = String(attendance_date).split('T')[0];

    // 1. If adviser_assignment_id is explicitly provided, check if sheet exists
    if (adviser_assignment_id) {
      const [existing] = await db.execute(
        `SELECT attendance_sheet_id FROM ATTENDANCE_SHEET
         WHERE adviser_assignment_id = ? AND attendance_date = ? AND attendance_scope = ?`,
        [adviser_assignment_id, cleanDate, attendance_scope]
      );
      if (existing.length > 0) {
        return { attendance_sheet_id: existing[0].attendance_sheet_id, created: false };
      }
      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)
         VALUES (?, ?, ?)`,
        [adviser_assignment_id, attendance_scope, cleanDate]
      );
      return { attendance_sheet_id: result.insertId, created: true };
    }

    // 2. If teacher_assignment_id is provided, check if sheet exists
    if (teacher_assignment_id) {
      const [existing] = await db.execute(
        `SELECT attendance_sheet_id FROM ATTENDANCE_SHEET
         WHERE teacher_assignment_id = ? AND attendance_date = ? AND attendance_scope = ?`,
        [teacher_assignment_id, cleanDate, attendance_scope]
      );
      if (existing.length > 0) {
        return { attendance_sheet_id: existing[0].attendance_sheet_id, created: false };
      }
      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE_SHEET (teacher_assignment_id, attendance_scope, attendance_date)
         VALUES (?, ?, ?)`,
        [teacher_assignment_id, attendance_scope, cleanDate]
      );
      return { attendance_sheet_id: result.insertId, created: true };
    }

    // 3. If section_id is provided (or if adviser_assignment_id was null):
    if (section_id) {
      // First check if an attendance sheet already exists for this section on this date
      const [existingBySec] = await db.execute(
        `SELECT ash.attendance_sheet_id 
         FROM ATTENDANCE_SHEET ash
         LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
         LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
         LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
         WHERE (saa.section_id = ? OR so.section_id = ?) AND ash.attendance_date = ? AND ash.attendance_scope = ?
         LIMIT 1`,
        [section_id, section_id, cleanDate, attendance_scope]
      );
      if (existingBySec.length > 0) {
        return { attendance_sheet_id: existingBySec[0].attendance_sheet_id, created: false };
      }

      // Find or create adviser_assignment for this section
      let targetAdviserAssignmentId = null;
      const [saaRows] = await db.execute(
        `SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? ORDER BY adviser_assignment_id DESC LIMIT 1`,
        [section_id]
      );
      if (saaRows.length > 0) {
        targetAdviserAssignmentId = saaRows[0].adviser_assignment_id;
      } else {
        // Find latest school year
        const [syRows] = await db.execute(`SELECT school_year_id FROM SCHOOL_YEAR ORDER BY school_year_id DESC LIMIT 1`);
        const schoolYearId = syRows[0]?.school_year_id || 1;

        // Find assigned user or section owner or passed user_id or admin
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
      }

      // Create attendance sheet
      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE_SHEET (adviser_assignment_id, attendance_scope, attendance_date)
         VALUES (?, ?, ?)`,
        [targetAdviserAssignmentId, attendance_scope, cleanDate]
      );
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

  // Get all attendance sheets for a section
  static async findBySectionId(sectionId) {
    const [rows] = await db.execute(
      `SELECT DISTINCT ash.*
       FROM ATTENDANCE_SHEET ash
       LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
       LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
       LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
       WHERE (saa.section_id = ? OR so.section_id = ?) AND ash.attendance_scope = 'SECTION'
       ORDER BY ash.attendance_date ASC`,
      [sectionId, sectionId]
    );
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
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE ATTENDANCE_SHEET SET ${setClause} WHERE attendance_sheet_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ATTENDANCE_SHEET WHERE attendance_sheet_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AttendanceSheet;