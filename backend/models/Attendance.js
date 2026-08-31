const db = require('../config/db');

class Attendance {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ATTENDANCE WHERE attendance_id = ?', [id]);
    return rows[0];
  }

  // Get all attendance records for a sheet, joined with student info
  static async findBySheetId(sheetId) {
    const [rows] = await db.execute(
      `SELECT
        a.attendance_id,
        a.attendance_sheet_id,
        a.student_section_id,
        a.status,
        a.remarks,
        st.first_name,
        st.last_name,
        st.sex,
        st.student_id
      FROM ATTENDANCE a
      INNER JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
      INNER JOIN STUDENT st ON st.student_id = ss.student_id
      WHERE a.attendance_sheet_id = ?
      ORDER BY st.last_name, st.first_name`,
      [sheetId]
    );
    return rows;
  }

  // Get all attendance records for a section
  static async findBySectionId(sectionId) {
    const [rows] = await db.execute(
      `SELECT
        a.attendance_id,
        a.attendance_sheet_id,
        ash.attendance_date,
        a.student_section_id,
        a.status,
        a.remarks,
        st.student_id,
        st.first_name,
        st.last_name,
        st.sex
      FROM ATTENDANCE a
      INNER JOIN ATTENDANCE_SHEET ash ON ash.attendance_sheet_id = a.attendance_sheet_id
      INNER JOIN STUDENT_SECTION ss ON ss.student_section_id = a.student_section_id
      INNER JOIN STUDENT st ON st.student_id = ss.student_id
      WHERE ss.section_id = ?
      ORDER BY ash.attendance_date ASC, st.last_name ASC, st.first_name ASC`,
      [sectionId]
    );
    return rows;
  }

  static async resolveStudentSectionId(sheetId, rawId) {
    if (!rawId) return null;
    const numId = Number(rawId);
    if (isNaN(numId)) return null;

    // Check if rawId is already a valid student_section_id
    const [exactMatch] = await db.execute(
      `SELECT student_section_id FROM STUDENT_SECTION WHERE student_section_id = ?`,
      [numId]
    );
    if (exactMatch.length > 0) {
      return exactMatch[0].student_section_id;
    }

    // Check if rawId is a student_id linked to this sheet's section
    const [bySheetSec] = await db.execute(
      `SELECT ss.student_section_id 
       FROM STUDENT_SECTION ss
       LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = ss.section_id
       LEFT JOIN ATTENDANCE_SHEET ash ON ash.adviser_assignment_id = saa.adviser_assignment_id
       WHERE ash.attendance_sheet_id = ? AND ss.student_id = ?
       LIMIT 1`,
      [sheetId, numId]
    );
    if (bySheetSec.length > 0) {
      return bySheetSec[0].student_section_id;
    }

    // Fallback: check if rawId is a student_id anywhere
    const [anyMatch] = await db.execute(
      `SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ? LIMIT 1`,
      [numId]
    );
    return anyMatch[0]?.student_section_id || numId;
  }

  // Upsert a single attendance record (or delete if status is empty)
  static async upsert(sheetId, rawStudentSectionId, status = 'P', remarks = null) {
    if (!sheetId || !rawStudentSectionId) {
      throw new Error(`attendance_sheet_id (${sheetId}) and student_section_id (${rawStudentSectionId}) are required`);
    }
    const studentSectionId = await this.resolveStudentSectionId(sheetId, rawStudentSectionId);
    if (!studentSectionId) {
      throw new Error(`Could not resolve student_section_id for ${rawStudentSectionId}`);
    }

    if (!status || status === 'BLANK' || status === 'NONE') {
      await db.execute(
        `DELETE FROM ATTENDANCE WHERE attendance_sheet_id = ? AND student_section_id = ?`,
        [sheetId, studentSectionId]
      );
      return null;
    }

    const normalizedStatus = ['P', 'A', 'L'].includes(status) ? status : 'P';
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks)`,
      [sheetId, studentSectionId, normalizedStatus, remarks || null]
    );
    if (result.insertId) return result.insertId;
    const [row] = await db.execute(
      `SELECT attendance_id FROM ATTENDANCE WHERE attendance_sheet_id = ? AND student_section_id = ?`,
      [sheetId, studentSectionId]
    );
    return row[0]?.attendance_id;
  }

  // Bulk save multiple attendance records
  static async bulkUpsert(records) {
    if (!Array.isArray(records) || records.length === 0) return [];
    const results = [];
    for (const rec of records) {
      const rawId = rec.student_section_id || rec.student_id || rec.id;
      if (!rec.attendance_sheet_id || !rawId) continue;
      const id = await this.upsert(
        rec.attendance_sheet_id,
        rawId,
        rec.status || null,
        rec.remarks || null
      );
      results.push(id);
    }
    return results;
  }

  static async create(data) {
    const { attendance_sheet_id, student_section_id, status = 'P', remarks = null } = data;
    return await this.upsert(attendance_sheet_id, student_section_id, status, remarks);
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE ATTENDANCE SET ${setClause} WHERE attendance_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ATTENDANCE WHERE attendance_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Attendance;