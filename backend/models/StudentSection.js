const db = require('../config/db');

class StudentSection {
  static async getActiveSchoolYearId() {
    try {
      const [rows] = await db.execute(
        `SELECT school_year_id FROM SCHOOL_YEAR WHERE status IN ('ACTIVE', 'ONGOING') ORDER BY school_year_id DESC LIMIT 1`
      );
      if (rows.length > 0) return rows[0].school_year_id;
      const [allRows] = await db.execute(`SELECT school_year_id FROM SCHOOL_YEAR ORDER BY school_year_id DESC LIMIT 1`);
      if (allRows.length > 0) return allRows[0].school_year_id;
    } catch (err) {
      console.warn('Could not determine active school year:', err.message);
    }
    return 1;
  }

  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM STUDENT_SECTION');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM STUDENT_SECTION WHERE student_section_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { student_id, section_id, school_year_id } = data;
    const syId = school_year_id || await this.getActiveSchoolYearId();
    const [result] = await db.execute(
      `INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)`,
      [student_id, section_id, syId]
    );
    return result.insertId;
  }

  static async assign(studentId, sectionId, schoolYearId) {
    const syId = schoolYearId || await this.getActiveSchoolYearId();
    const [existing] = await db.execute(
      `SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ? LIMIT 1`,
      [studentId, syId]
    );

    if (existing.length > 0) {
      await db.execute(
        `UPDATE STUDENT_SECTION SET section_id = ? WHERE student_section_id = ?`,
        [sectionId, existing[0].student_section_id]
      );
      return existing[0].student_section_id;
    } else {
      const [result] = await db.execute(
        `INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)`,
        [studentId, sectionId, syId]
      );
      return result.insertId;
    }
  }

  static async bulkAssign(studentIds, sectionId, schoolYearId) {
    const syId = schoolYearId || await this.getActiveSchoolYearId();
    const results = [];
    for (const studentId of studentIds) {
      const id = await this.assign(studentId, sectionId, syId);
      results.push({ student_id: studentId, student_section_id: id });
    }
    return results;
  }

  static async unassign(studentId, sectionId, schoolYearId, studentSectionId) {
    if (studentSectionId) {
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_section_id = ?`,
        [studentSectionId]
      );
      return result.affectedRows > 0;
    }
    if (studentId && sectionId) {
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND section_id = ?`,
        [studentId, sectionId]
      );
      return result.affectedRows > 0;
    }
    if (studentId) {
      const syId = schoolYearId || await this.getActiveSchoolYearId();
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ?`,
        [studentId, syId]
      );
      return result.affectedRows > 0;
    }
    return false;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE STUDENT_SECTION SET ${setClause} WHERE student_section_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM STUDENT_SECTION WHERE student_section_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = StudentSection;