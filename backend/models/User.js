const db = require("../config/db");

const DB_ROLES = [
  "system_admin",
  "principal",
  "department_head",
  "subject_teacher",
];

const PUBLIC_USER_COLUMNS = `
  u.user_id,
  u.role,
  u.department_id,
  u.first_name,
  u.middle_name,
  u.last_name,
  u.extension_name,
  u.email,
  u.pfp_url,
  u.account_status,
  u.last_login_at
`;

class User {
  // GET ALL USERS EXCEPT SYSTEM ADMIN

  static async findAll() {
    const [rows] = await db.execute(`
      SELECT
        u.user_id,
        u.role,
        u.department_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.extension_name,
        u.email,
        u.pfp_url,
        u.account_status,
        u.last_login_at,

        /* Assigned Department */
        d.department_name,

        /* Department Head department */
        dh.department_id AS head_department_id,
        dh_department.department_name AS head_department_name,

        /* Teacher department */
        teacher_department.department_id AS teacher_department_id,
        teacher_department.department_name AS teacher_department_name,

        /* Adviser assignment */
        saa.adviser_assignment_id,
        saa.section_id AS adviser_section_id,
        saa.section_name AS adviser_section_name,
        saa.grade_level_id AS adviser_grade_level_id,
        saa.grade_level_name AS adviser_grade_level_name

      FROM \`USER\` u

      /* Direct department link */
      LEFT JOIN DEPARTMENT d
        ON d.department_id = u.department_id

      /* Department Head */
      LEFT JOIN DEPARTMENT_HEAD dh
        ON dh.user_id = u.user_id

      LEFT JOIN DEPARTMENT dh_department
        ON dh_department.department_id = dh.department_id

      /* Teacher assignment -> subject -> department */
      LEFT JOIN (
        SELECT
          ta.user_id,
          d.department_id,
          d.department_name
        FROM TEACHER_ASSIGNMENT ta

        INNER JOIN SUBJECT_OFFERING so
          ON so.subject_offering_id = ta.subject_offering_id

        INNER JOIN SUBJECT s
          ON s.subject_id = so.subject_id

        INNER JOIN DEPARTMENT d
          ON d.department_id = s.department_id

        INNER JOIN SCHOOL_YEAR sy
          ON sy.school_year_id = so.school_year_id

        WHERE sy.status = 'ACTIVE'

        GROUP BY
          ta.user_id,
          d.department_id,
          d.department_name
      ) teacher_department
        ON teacher_department.user_id = u.user_id

      /* Adviser assignment */
      LEFT JOIN (
        SELECT
          saa.adviser_assignment_id,
          saa.user_id,
          saa.section_id,
          s.section_name,
          gl.grade_level_id,
          gl.grade_level_name
        FROM SECTION_ADVISER_ASSIGNMENT saa

        INNER JOIN SECTION s
          ON s.section_id = saa.section_id

        INNER JOIN GRADE_LEVEL gl
          ON gl.grade_level_id = s.grade_level_id

        INNER JOIN SCHOOL_YEAR sy
          ON sy.school_year_id = saa.school_year_id

        WHERE sy.status = 'ACTIVE'
      ) saa
        ON saa.user_id = u.user_id

      WHERE u.role <> 'system_admin'

      ORDER BY u.last_name, u.first_name
    `);

    return rows.map((user) => {
      let displayRole = user.role;

      if (user.role === "department_head" || user.role === "department head") {
        displayRole = "Department Head";
      } else if (user.role === "subject_teacher" || user.role === "subject teacher") {
        if (user.adviser_assignment_id) {
          displayRole = "Adviser";
        } else {
          displayRole = "Subject Teacher";
        }
      } else if (user.role === "principal") {
        displayRole = "Principal";
      }

      let departmentDisplay = user.department_name || user.head_department_name || user.teacher_department_name || "";
      if (user.role === "principal") {
        departmentDisplay = "School Administration";
      }

      return {
        ...user,

        username: `${user.first_name} ${user.last_name}`.trim(),
        display_role: displayRole,
        department: departmentDisplay,
        is_adviser: !!user.adviser_assignment_id,

        adviser_assignment: user.adviser_assignment_id
          ? {
              adviser_assignment_id: user.adviser_assignment_id,
              section_id: user.adviser_section_id,
              section_name: user.adviser_section_name,
              grade_level_id: user.adviser_grade_level_id,
              grade_level_name: user.adviser_grade_level_name,
            }
          : null,
      };
    });
  }

  // FIND USER
  static async findById(id) {
    const [rows] = await db.execute(
      `
      SELECT
        u.user_id,
        u.role,
        u.department_id,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.extension_name,
        u.email,
        u.pfp_url,
        u.account_status,
        u.last_login_at
      FROM \`USER\` u
      WHERE u.user_id = ?
      `,
      [id]
    );

    return rows[0];
  }

  // FIND BY EMAIL

  static async findByEmail(email) {
    const [rows] = await db.execute(
      "SELECT * FROM `USER` WHERE email = ?",
      [email]
    );

    return rows[0];
  }

  // CREATE

  static async create(data, connection = db) {
    const {
      role,
      department_id,
      first_name,
      middle_name,
      last_name,
      extension_name,
      email,
      password,
      pfp_url,
      account_status,
    } = data;

    if (!DB_ROLES.includes(role)) {
      throw new Error(`Invalid database role '${role}'.`);
    }

    const [result] = await connection.execute(
      `
      INSERT INTO \`USER\`
      (
        role,
        department_id,
        first_name,
        middle_name,
        last_name,
        extension_name,
        email,
        password,
        pfp_url,
        account_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        role,
        department_id || null,
        first_name,
        middle_name || null,
        last_name,
        extension_name || null,
        email,
        password,
        pfp_url || null,
        account_status || "active",
      ]
    );

    return result.insertId;
  }

  // UPDATE

  static async update(id, data, connection = db) {
    if (data.role && !DB_ROLES.includes(data.role)) {
      throw new Error(`Invalid database role '${data.role}'.`);
    }

    const allowedFields = [
      "role",
      "department_id",
      "first_name",
      "middle_name",
      "last_name",
      "extension_name",
      "email",
      "password",
      "pfp_url",
      "account_status",
    ];

    const entries = Object.entries(data).filter(([key]) =>
      allowedFields.includes(key)
    );

    if (entries.length === 0) {
      return this.findById(id);
    }

    const setClause = entries
      .map(([key]) => `\`${key}\` = ?`)
      .join(", ");

    const values = entries.map(([, value]) => value);

    await connection.execute(
      `
      UPDATE \`USER\`
      SET ${setClause}
      WHERE user_id = ?
      `,
      [...values, id]
    );

    return this.findById(id);
  }

  // DELETE

  static async delete(id, connection = db) {
    const [result] = await connection.execute(
      "DELETE FROM `USER` WHERE user_id = ?",
      [id]
    );

    return result.affectedRows > 0;
  }

  // PROFILE

  static async updateProfile(id, data) {
    const {
      first_name,
      middle_name,
      last_name,
      extension_name,
      email,
    } = data;

    await db.execute(
      `
      UPDATE \`USER\`
      SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        extension_name = ?,
        email = ?
      WHERE user_id = ?
      `,
      [
        first_name,
        middle_name || null,
        last_name,
        extension_name || null,
        email,
        id,
      ]
    );

    return this.findById(id);
  }

  static async updateProfilePicture(id, profilePictureUrl) {
    await db.execute(
      `
      UPDATE \`USER\`
      SET pfp_url = ?
      WHERE user_id = ?
      `,
      [profilePictureUrl, id]
    );

    return this.findById(id);
  }

  static async updateLastLogin(id) {
    return this.findById(id);
  }
}

module.exports = User;