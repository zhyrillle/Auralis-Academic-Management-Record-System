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

  // Get all attendance sheets + their attendance records for a section
  static async findBySectionId(sectionId) {
    const [rows] = await db.execute(
      `SELECT
        ash.attendance_sheet_id,
        ash.attendance_date,
        a.attendance_id,
        a.student_section_id,
        a.status,
        a.remarks,
        st.first_name,
        st.last_name,
        st.sex,
        st.student_id,
        ss.student_section_id AS ss_id
      FROM ATTENDANCE_SHEET ash
      CROSS JOIN STUDENT_SECTION ss
      LEFT JOIN ATTENDANCE a
        ON a.attendance_sheet_id = ash.attendance_sheet_id
        AND a.student_section_id = ss.student_section_id
      INNER JOIN STUDENT st ON st.student_id = ss.student_id
      WHERE ash.attendance_scope = 'SECTION'
        AND ss.section_id = ?
        AND (
          ash.adviser_assignment_id IN (
            SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ?
          )
        )
      ORDER BY ash.attendance_date DESC, st.last_name, st.first_name`,
      [sectionId, sectionId]
    );
    return rows;
  }

  // Upsert a single attendance record
  static async upsert(sheetId, studentSectionId, status, remarks = null) {
    const [existing] = await db.execute(
      `SELECT attendance_id FROM ATTENDANCE
       WHERE attendance_sheet_id = ? AND student_section_id = ?`,
      [sheetId, studentSectionId]
    );
    if (existing.length > 0) {
      await db.execute(
        `UPDATE ATTENDANCE SET status = ?, remarks = ? WHERE attendance_id = ?`,
        [status, remarks, existing[0].attendance_id]
      );
      return existing[0].attendance_id;
    } else {
      const [result] = await db.execute(
        `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks) VALUES (?, ?, ?, ?)`,
        [sheetId, studentSectionId, status, remarks]
      );
      return result.insertId;
    }
  }

  // Bulk save multiple attendance records
  static async bulkUpsert(records) {
    const results = [];
    for (const rec of records) {
      const id = await this.upsert(
        rec.attendance_sheet_id,
        rec.student_section_id,
        rec.status,
        rec.remarks || null
      );
      results.push(id);
    }
    return results;
  }

  static async create(data) {
    const { attendance_sheet_id, student_section_id, status, remarks } = data;
    const [result] = await db.execute(
      `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks) 
       VALUES (?, ?, ?, ?)`,
      [attendance_sheet_id, student_section_id, status, remarks]
    );
    return result.insertId;
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