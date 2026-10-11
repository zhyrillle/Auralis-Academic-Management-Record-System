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

  static async getEligibleStudents(sectionId) {
    const [secRows] = await db.execute(
      `SELECT section_id, section_name, grade_level_id, is_specialized, program_id FROM SECTION WHERE section_id = ?`,
      [sectionId]
    );
    if (secRows.length === 0) {
      throw new Error(`Section with ID ${sectionId} not found.`);
    }
    const section = secRows[0];
    const isSectionSpec = Boolean(
      section.is_specialized == 1 &&
      section.program_id &&
      [1, 2, 3].includes(Number(section.program_id))
    );

    let query = `
      SELECT s.student_id, s.LRN, s.first_name, s.middle_name, s.last_name, s.extension_name,
             s.sex, s.birthdate, s.program_id, p.program_code, p.program_name
      FROM STUDENT s
      LEFT JOIN PROGRAM p ON p.program_id = s.program_id
      LEFT JOIN STUDENT_SECTION ss ON ss.student_id = s.student_id
      WHERE ss.section_id IS NULL
    `;
    const params = [];

    if (isSectionSpec) {
      query += ` AND (s.program_id = ? OR s.program_id IS NULL OR s.program_id = 4 OR p.is_specialized = 0)`;
      params.push(section.program_id);
    } else {
      query += ` AND (s.program_id IS NULL OR s.program_id = 4 OR p.is_specialized = 0)`;
    }

    query += ` ORDER BY s.last_name ASC, s.first_name ASC`;
    const [rows] = await db.execute(query, params);
    return rows;
  }

  static async assign(studentId, sectionId, schoolYearId) {
    const syId = schoolYearId || await this.getActiveSchoolYearId();

    // Fetch section details to verify specialization
    const [secRows] = await db.execute(
      `SELECT section_id, section_name, is_specialized, program_id FROM SECTION WHERE section_id = ?`,
      [sectionId]
    );
    if (secRows.length === 0) {
      throw new Error(`Section with ID ${sectionId} not found.`);
    }
    const section = secRows[0];

    // Fetch student details
    const [stuRows] = await db.execute(
      `SELECT student_id, program_id FROM STUDENT WHERE student_id = ?`,
      [studentId]
    );
    if (stuRows.length === 0) {
      throw new Error(`Student with ID ${studentId} not found.`);
    }
    const student = stuRows[0];

    const isSectionSpec = Boolean(
      section.is_specialized == 1 &&
      section.program_id &&
      [1, 2, 3].includes(Number(section.program_id))
    );

    const targetProgId = isSectionSpec ? Number(section.program_id) : 4;

    if (isSectionSpec) {
      // If student is explicitly enrolled in a DIFFERENT specialized program, reject
      if (
        student.program_id &&
        [1, 2, 3].includes(Number(student.program_id)) &&
        Number(student.program_id) !== targetProgId
      ) {
        throw new Error(
          `Cannot assign student to specialized section "${section.section_name}". Student is enrolled in a different specialized program.`
        );
      }
    } else {
      // Regular section: cannot assign a student who is enrolled in a specialized track
      if (student.program_id && [1, 2, 3].includes(Number(student.program_id))) {
        throw new Error(
          `Cannot assign student from a specialized program to regular section "${section.section_name}".`
        );
      }
    }

    const [existing] = await db.execute(
      `SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ? LIMIT 1`,
      [studentId, syId]
    );

    let assignedId;
    if (existing.length > 0) {
      await db.execute(
        `UPDATE STUDENT_SECTION SET section_id = ? WHERE student_section_id = ?`,
        [sectionId, existing[0].student_section_id]
      );
      assignedId = existing[0].student_section_id;
    } else {
      const [result] = await db.execute(
        `INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)`,
        [studentId, sectionId, syId]
      );
      assignedId = result.insertId;
    }

    // Automatically synchronize student's program to match section track
    await db.execute(`UPDATE STUDENT SET program_id = ? WHERE student_id = ?`, [targetProgId, studentId]);

    return assignedId;
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
    let resolvedStudentId = studentId;
    if (!resolvedStudentId && studentSectionId) {
      const [ssRows] = await db.execute('SELECT student_id FROM STUDENT_SECTION WHERE student_section_id = ?', [studentSectionId]);
      if (ssRows.length > 0) resolvedStudentId = ssRows[0].student_id;
    }

    let success = false;
    if (studentSectionId) {
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_section_id = ?`,
        [studentSectionId]
      );
      success = result.affectedRows > 0;
    } else if (studentId && sectionId) {
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND section_id = ?`,
        [studentId, sectionId]
      );
      success = result.affectedRows > 0;
    } else if (studentId) {
      const syId = schoolYearId || await this.getActiveSchoolYearId();
      const [result] = await db.execute(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ?`,
        [studentId, syId]
      );
      success = result.affectedRows > 0;
    }

    if (resolvedStudentId) {
      await db.execute('UPDATE STUDENT SET program_id = 4 WHERE student_id = ?', [resolvedStudentId]);
    }

    return success;
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