const db = require("../config/db");

class SectionAdviserAssignment {
  static async findAll() {
    const [rows] = await db.execute(
      `SELECT
        saa.adviser_assignment_id,
        saa.section_id,
        saa.school_year_id,
        saa.user_id,
        saa.assigned_from,
        saa.assigned_until,
        s.section_name,
        gl.grade_level_id,
        gl.grade_level_name
      FROM SECTION_ADVISER_ASSIGNMENT saa
      INNER JOIN SECTION s ON s.section_id = saa.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = s.grade_level_id
      ORDER BY saa.assigned_from DESC`
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute(
      `SELECT
        saa.adviser_assignment_id,
        saa.section_id,
        saa.school_year_id,
        saa.user_id,
        saa.assigned_from,
        saa.assigned_until,
        s.section_name,
        gl.grade_level_id,
        gl.grade_level_name
      FROM SECTION_ADVISER_ASSIGNMENT saa
      INNER JOIN SECTION s ON s.section_id = saa.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = s.grade_level_id
      WHERE saa.adviser_assignment_id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findBySectionId(sectionId) {
    const [rows] = await db.execute(
      `SELECT
        saa.adviser_assignment_id,
        saa.section_id,
        saa.school_year_id,
        saa.user_id,
        saa.assigned_from,
        saa.assigned_until,
        s.section_name,
        gl.grade_level_id,
        gl.grade_level_name
      FROM SECTION_ADVISER_ASSIGNMENT saa
      INNER JOIN SECTION s ON s.section_id = saa.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = s.grade_level_id
      WHERE saa.section_id = ?
      ORDER BY saa.assigned_from DESC`,
      [sectionId]
    );
    return rows;
  }

  static async findByUserId(userId) {
    const [rows] = await db.execute(
      `
      SELECT
        saa.adviser_assignment_id,
        saa.section_id,
        saa.school_year_id,
        saa.user_id,
        saa.assigned_from,
        saa.assigned_until,

        s.section_name,

        gl.grade_level_id,
        gl.grade_level_name

      FROM SECTION_ADVISER_ASSIGNMENT saa

      INNER JOIN SECTION s
        ON s.section_id = saa.section_id

      INNER JOIN GRADE_LEVEL gl
        ON gl.grade_level_id = s.grade_level_id

      WHERE saa.user_id = ?

      ORDER BY saa.assigned_from DESC
      `,
      [userId]
    );

    return rows;
  }

  static async create(data, connection = db) {
    const {
      section_id,
      school_year_id,
      user_id,
      assigned_from,
      assigned_until,
    } = data;

    const [result] = await connection.execute(
      `
      INSERT INTO SECTION_ADVISER_ASSIGNMENT
      (
        section_id,
        school_year_id,
        user_id,
        assigned_from,
        assigned_until
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        section_id,
        school_year_id,
        user_id,
        assigned_from,
        assigned_until || null,
      ]
    );

    return result.insertId;
  }

  static async deleteByUserId(userId, connection = db) {
    await connection.execute(
      `
      DELETE FROM SECTION_ADVISER_ASSIGNMENT
      WHERE user_id = ?
      `,
      [userId]
    );
  }
}

module.exports = SectionAdviserAssignment;