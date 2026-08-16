const db = require("../config/db");

class UserManagementOptions {
  // =========================================================
  // GRADE LEVELS
  // =========================================================

  static async getGradeLevels() {
    const [rows] = await db.execute(`
      SELECT
        grade_level_id,
        grade_level_name
      FROM GRADE_LEVEL
      ORDER BY grade_level_id
    `);

    return rows;
  }

  // =========================================================
  // SECTIONS
  // =========================================================

  static async getSections(gradeLevelId) {
    const [rows] = await db.execute(
      `
      SELECT
        section_id,
        section_name,
        grade_level_id
      FROM SECTION
      WHERE grade_level_id = ?
      ORDER BY section_name
      `,
      [gradeLevelId]
    );

    return rows;
  }

  // =========================================================
  // DEPARTMENTS
  // =========================================================

  static async getDepartments() {
    const [rows] = await db.execute(`
      SELECT
        department_id,
        department_code,
        department_name
      FROM DEPARTMENT
      ORDER BY department_name
    `);

    return rows;
  }

  // =========================================================
  // SUBJECTS
  // =========================================================

  static async getSubjects() {
    const [rows] = await db.execute(`
      SELECT
        subject_id,
        subject_name,
        subject_code,
        department_id
      FROM SUBJECT
      WHERE status = 'ACTIVE'
      ORDER BY subject_name
    `);

    return rows;
  }

  // =========================================================
  // ACTIVE SCHOOL YEAR
  // =========================================================

  static async getActiveSchoolYear() {
    const [rows] = await db.execute(`
      SELECT
        school_year_id,
        starts_on,
        ends_on,
        curriculum,
        status
      FROM SCHOOL_YEAR
      WHERE status = 'ACTIVE'
      ORDER BY school_year_id DESC
      LIMIT 1
    `);

    return rows[0] || null;
  }

  // =========================================================
  // SUBJECT OFFERINGS
  // =========================================================

  static async getSubjectOfferings(sectionId) {
    const [rows] = await db.execute(
      `
      SELECT
        so.subject_offering_id,
        so.subject_id,
        so.section_id,
        so.school_year_id,

        s.subject_name,
        s.subject_code,

        sec.section_name,

        gl.grade_level_id,
        gl.grade_level_name

      FROM SUBJECT_OFFERING so

      INNER JOIN SUBJECT s
        ON s.subject_id = so.subject_id

      INNER JOIN SECTION sec
        ON sec.section_id = so.section_id

      INNER JOIN GRADE_LEVEL gl
        ON gl.grade_level_id =
           sec.grade_level_id

      INNER JOIN SCHOOL_YEAR sy
        ON sy.school_year_id =
           so.school_year_id

      WHERE so.section_id = ?
        AND sy.status = 'ACTIVE'
        AND s.status = 'ACTIVE'

      ORDER BY s.subject_name
      `,
      [sectionId]
    );

    return rows;
  }
}

module.exports = UserManagementOptions;