const db = require("../config/db");

class UserAssignment {
  // =========================================================
  // DELETE EXISTING ASSIGNMENTS
  // =========================================================

  static async deleteTeacherAssignments(userId, connection = db) {
    await connection.execute(
      `
      DELETE FROM TEACHER_ASSIGNMENT
      WHERE user_id = ?
      `,
      [userId]
    );
  }

  static async deleteAdviserAssignments(userId, connection = db) {
    await connection.execute(
      `
      DELETE FROM SECTION_ADVISER_ASSIGNMENT
      WHERE user_id = ?
      `,
      [userId]
    );
  }

  static async deleteDepartmentHeadAssignments(
    userId,
    connection = db
  ) {
    await connection.execute(
      `
      DELETE FROM DEPARTMENT_HEAD
      WHERE user_id = ?
      `,
      [userId]
    );
  }

  // =========================================================
  // DELETE ALL ASSIGNMENTS
  // =========================================================

  static async deleteAllAssignments(userId, connection = db) {
    await this.deleteTeacherAssignments(userId, connection);
    await this.deleteAdviserAssignments(userId, connection);
    await this.deleteDepartmentHeadAssignments(userId, connection);
  }

  // =========================================================
  // TEACHER ASSIGNMENT
  // =========================================================

  static async createTeacherAssignment(
    data,
    connection = db
  ) {
    const {
      user_id,
      subject_offering_id,
      assigned_from,
      assigned_until,
    } = data;

    const [result] = await connection.execute(
      `
      INSERT INTO TEACHER_ASSIGNMENT
      (
        user_id,
        subject_offering_id,
        assigned_from,
        assigned_until
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        user_id,
        subject_offering_id,
        assigned_from,
        assigned_until || null,
      ]
    );

    return result.insertId;
  }

  // =========================================================
  // ADVISER ASSIGNMENT
  // =========================================================

  static async createAdviserAssignment(
    data,
    connection = db
  ) {
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

  // =========================================================
  // DEPARTMENT HEAD
  // =========================================================

  static async createDepartmentHead(
    data,
    connection = db
  ) {
    const {
      department_id,
      user_id,
      school_year_id,
      appointed_from,
      appointed_until,
    } = data;

    const [result] = await connection.execute(
      `
      INSERT INTO DEPARTMENT_HEAD
      (
        department_id,
        user_id,
        school_year_id,
        appointed_from,
        appointed_until
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        department_id,
        user_id,
        school_year_id,
        appointed_from,
        appointed_until || null,
      ]
    );

    return result.insertId;
  }

  // =========================================================
  // GET ADVISER ASSIGNMENTS
  // =========================================================

  static async getAdviserAssignments(
    userId,
    connection = db
  ) {
    const [rows] = await connection.execute(
      `
      SELECT
        saa.adviser_assignment_id,
        saa.section_id,
        saa.school_year_id,
        saa.user_id,
        saa.assigned_from,
        saa.assigned_until,

        sec.section_name,

        gl.grade_level_id,
        gl.grade_level_name,

        sy.starts_on,
        sy.ends_on,
        sy.status AS school_year_status

      FROM SECTION_ADVISER_ASSIGNMENT saa

      INNER JOIN SECTION sec
        ON sec.section_id = saa.section_id

      INNER JOIN GRADE_LEVEL gl
        ON gl.grade_level_id = sec.grade_level_id

      INNER JOIN SCHOOL_YEAR sy
        ON sy.school_year_id = saa.school_year_id

      WHERE saa.user_id = ?

      ORDER BY saa.adviser_assignment_id DESC
      `,
      [userId]
    );

    return rows;
  }

  // =========================================================
  // GET TEACHER ASSIGNMENTS
  // =========================================================

  static async getTeacherAssignments(
    userId,
    connection = db
  ) {
    const [rows] = await connection.execute(
      `
      SELECT
        ta.teacher_assignment_id,
        ta.user_id,
        ta.subject_offering_id,
        ta.assigned_from,
        ta.assigned_until,

        so.subject_offering_id,

        s.subject_id,
        s.subject_name,
        s.subject_code,

        sec.section_id,
        sec.section_name,

        gl.grade_level_id,
        gl.grade_level_name,

        so.school_year_id,

        sy.starts_on,
        sy.ends_on,
        sy.status AS school_year_status

      FROM TEACHER_ASSIGNMENT ta

      INNER JOIN SUBJECT_OFFERING so
        ON so.subject_offering_id =
           ta.subject_offering_id

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

      WHERE ta.user_id = ?

      ORDER BY ta.teacher_assignment_id DESC
      `,
      [userId]
    );

    return rows;
  }

  // =========================================================
  // GET DEPARTMENT HEAD ASSIGNMENTS
  // =========================================================

  static async getDepartmentHeadAssignments(
    userId,
    connection = db
  ) {
    const [rows] = await connection.execute(
      `
      SELECT
        dh.department_head_id,
        dh.department_id,
        dh.user_id,
        dh.school_year_id,
        dh.appointed_from,
        dh.appointed_until,

        d.department_code,
        d.department_name,

        sy.starts_on,
        sy.ends_on,
        sy.status AS school_year_status

      FROM DEPARTMENT_HEAD dh

      INNER JOIN DEPARTMENT d
        ON d.department_id = dh.department_id

      INNER JOIN SCHOOL_YEAR sy
        ON sy.school_year_id = dh.school_year_id

      WHERE dh.user_id = ?

      ORDER BY dh.department_head_id DESC
      `,
      [userId]
    );

    return rows;
  }

  // =========================================================
  // GET ALL ASSIGNMENTS FOR A USER
  // =========================================================

  static async getAllAssignments(
    userId,
    connection = db
  ) {
    const [
      adviserAssignments,
      teacherAssignments,
      departmentHeadAssignments,
    ] = await Promise.all([
      this.getAdviserAssignments(
        userId,
        connection
      ),

      this.getTeacherAssignments(
        userId,
        connection
      ),

      this.getDepartmentHeadAssignments(
        userId,
        connection
      ),
    ]);

    return {
      adviserAssignments,
      teacherAssignments,
      departmentHeadAssignments,
    };
  }
}

module.exports = UserAssignment;