const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const db = require("../config/db");

const User = require("../models/User");
const UserManagementOptions = require("../models/UserManagementOptions");
const UserClassAssignments = require("../services/UserClassAssignments");
const AuditEvent = require("../models/AuditEvent");
const AuditDetails = require("../services/AuditDetailsService");
const OtpStore = require("../services/otpStore");
const { sendPasswordResetOtpEmail } = require("../services/emailService");
const {
  hashPassword,
  verifyPassword,
  isBcryptHash,
} = require("../utils/passwordUtils");

const isValidUserId = (id) => /^\d+$/.test(String(id));

const ROLE_MAP = {
  "Subject Teacher": "subject teacher",
  "Adviser": "subject teacher",
  "Principal": "principal",
  "Department Head": "department head",
  "Admin": "admin",
  "subject_teacher": "subject teacher",
  "department_head": "department head",
  "subject teacher": "subject teacher",
  "department head": "department head",
  "principal": "principal",
  "admin": "admin",
};

const normalizeRole = (role) => {
  if (!role) return null;
  return ROLE_MAP[String(role).trim()] || null;
};

const sendDatabaseError = (res, err) => {
  console.error("Database error:", err);
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "That email address is already in use." });
  }
  return res.status(err.statusCode || 500).json({ error: err.message });
};

const toNullable = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return value;
};

const getCurrentSchoolYear = async (connection, schoolYearId = null) => {
  if (schoolYearId != null && schoolYearId !== '') {
    if (!/^[1-9]\d*$/.test(String(schoolYearId)) || !Number.isSafeInteger(Number(schoolYearId))) {
      throw Object.assign(new Error('Choose a valid school year.'), { statusCode: 400 });
    }
    const [selected] = await connection.execute('SELECT school_year_id,school_id,starts_on,ends_on,curriculum,status FROM SCHOOL_YEAR WHERE school_year_id = ?', [Number(schoolYearId)]);
    if (selected.length !== 1) throw Object.assign(new Error('The selected school year does not exist.'), { statusCode: 400 });
    return selected[0];
  }
  const [rows] = await connection.execute(`
    SELECT school_year_id, school_id, starts_on, ends_on, curriculum, status
    FROM SCHOOL_YEAR
    WHERE LOWER(status) IN ('active', 'ongoing')
    ORDER BY school_year_id DESC
    LIMIT 1
  `);
  return rows[0] || null;
};

const formatDate = (val) => {
  if (!val || String(val).trim() === "") return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const getAssignmentDates = (body, schoolYear) => {
  const start = String(schoolYear?.starts_on || '');
  const assignedFrom = formatDate(body.assigned_from) || (/^\d{4}$/.test(start) ? start + '-01-01' : formatDate(start)) || new Date().toISOString().slice(0, 10);
  
  let assignedUntil = formatDate(body.assigned_until);

  if (!assignedUntil && schoolYear?.ends_on) {
    const rawEnd = String(schoolYear.ends_on).trim();
    assignedUntil = rawEnd.length === 4 ? `${rawEnd}-12-31` : formatDate(rawEnd);
  }

  return { assignedFrom, assignedUntil };
};

const recentlyUpdatedStatusMap = new Map();

/**
 * Automatically pull latest users and their assignments from Aiven Cloud
 * into local database so teammates immediately see shared updates with 0 manual steps.
 */
async function syncUsersFromCloud() {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud user sync timeout (5s exceeded)')), 5000)
  );

  const syncWork = (async () => {
    await ensureCredentialsColumn();
    // 1. Fetch users from Aiven Cloud
    const [cloudUsers] = await db.cloudPool.query(
      `SELECT user_id, role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status, pfp_url, last_login_at
       FROM USER`
    );

    if (cloudUsers) {
      const now = Date.now();
      for (const u of cloudUsers) {
        const recentLocal = recentlyUpdatedStatusMap.get(Number(u.user_id));
        const effectiveStatus = recentLocal && now - recentLocal.updatedAt < 60000
          ? recentLocal.account_status
          : u.account_status;
        await db.execute(
          `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status, pfp_url, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             role = VALUES(role),
             department_id = VALUES(department_id),
             first_name = VALUES(first_name),
             middle_name = VALUES(middle_name),
             last_name = VALUES(last_name),
             extension_name = VALUES(extension_name),
             credentials = VALUES(credentials),
             password = VALUES(password),
             account_status = VALUES(account_status),
             pfp_url = VALUES(pfp_url),
             last_login_at = VALUES(last_login_at)`,
          [
            u.user_id,
            u.role,
            u.department_id,
            u.first_name,
            u.middle_name,
            u.last_name,
            u.extension_name,
            u.credentials || null,
            u.email,
            u.password,
            effectiveStatus,
            u.pfp_url,
            u.last_login_at,
          ]
        );
      }

      // Safely cascade-delete local users that were removed from cloud
      const cloudIdSet = new Set(cloudUsers.map((u) => Number(u.user_id)));
      const [localUsers] = await db.query(
        `SELECT user_id, email FROM USER WHERE user_id != 1 AND email != 'admin@gmail.com'`
      );
      for (const lu of localUsers) {
        if (!cloudIdSet.has(Number(lu.user_id))) {
          await deleteUserCascade(db, lu.user_id);
        }
      }
    }

    // 2. Sync role assignments
    const [cloudSaa] = await db.cloudPool.query(
      `SELECT adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until
       FROM SECTION_ADVISER_ASSIGNMENT`
    );
    if (cloudSaa) {
      for (const saa of cloudSaa) {
        try {
          const fromDate = saa.assigned_from ? String(saa.assigned_from).slice(0, 10) : null;
          const untilDate = saa.assigned_until ? String(saa.assigned_until).slice(0, 10) : null;
          await db.execute(
            `INSERT INTO SECTION_ADVISER_ASSIGNMENT (adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               section_id = VALUES(section_id),
               school_year_id = VALUES(school_year_id),
               user_id = VALUES(user_id),
               assigned_from = VALUES(assigned_from),
               assigned_until = VALUES(assigned_until)`,
            [saa.adviser_assignment_id, saa.section_id, saa.school_year_id, saa.user_id, fromDate, untilDate]
          );
        } catch (saaErr) {
          // ignore single assignment error
        }
      }
    }

    const [cloudTa] = await db.cloudPool.query(
      `SELECT teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until
       FROM TEACHER_ASSIGNMENT`
    );
    if (cloudTa) {
      for (const ta of cloudTa) {
        try {
          const fromDate = ta.assigned_from ? String(ta.assigned_from).slice(0, 10) : null;
          const untilDate = ta.assigned_until ? String(ta.assigned_until).slice(0, 10) : null;
          await db.execute(
            `INSERT INTO TEACHER_ASSIGNMENT (teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               user_id = VALUES(user_id),
               subject_offering_id = VALUES(subject_offering_id),
               assigned_from = VALUES(assigned_from),
               assigned_until = VALUES(assigned_until)`,
            [ta.teacher_assignment_id, ta.user_id, ta.subject_offering_id, fromDate, untilDate]
          );
        } catch (taErr) {
          // ignore single assignment error
        }
      }
    }

    const [cloudDh] = await db.cloudPool.query(
      `SELECT department_head_id, department_id, user_id, school_year_id, appointed_from, appointed_until
       FROM DEPARTMENT_HEAD`
    );
    if (cloudDh) {
      for (const dh of cloudDh) {
        try {
          const fromDate = dh.appointed_from ? String(dh.appointed_from).slice(0, 10) : null;
          const untilDate = dh.appointed_until ? String(dh.appointed_until).slice(0, 10) : null;
          await db.execute(
            `INSERT INTO DEPARTMENT_HEAD (department_head_id, department_id, user_id, school_year_id, appointed_from, appointed_until)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               department_id = VALUES(department_id),
               user_id = VALUES(user_id),
               school_year_id = VALUES(school_year_id),
               appointed_from = VALUES(appointed_from),
               appointed_until = VALUES(appointed_until)`,
            [dh.department_head_id, dh.department_id, dh.user_id, dh.school_year_id, fromDate, untilDate]
          );
        } catch (dhErr) {
          // ignore single assignment error
        }
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudUserSync] Bypassed cloud sync (${err.message}). Serving local database.`);
  }
}

async function forwardRoleAssignmentsToCloud(userId, body, schoolYear) {
  if (!db.cloudPool) return;
  const connection = await db.cloudPool.getConnection();
  try {
    await connection.beginTransaction();
    const selected = await getCurrentSchoolYear(connection, schoolYear.school_year_id);
    if (normalizeRole(body.role) === 'subject teacher') await UserClassAssignments.validate(connection,userId,body,selected.school_year_id);
    if (normalizeRole(body.role) === 'department head' && body.department_id) await validateSingleDepartmentHead(connection,body.department_id,userId,selected);
    await saveRoleAssignments(connection,userId,body,selected);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function deleteUserCascade(target, userId) {
  if (!target || !userId) return false;
  const q = (sql, params) => target.query(sql, params).catch(e => {
    console.warn(`[UserDeleteCascade] ${e.message}`);
  });

  await target.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
  try {
    // 1. Audit events: Nullify user_id to satisfy foreign key constraint while preserving audit log history
    await q(`UPDATE AUDIT_EVENT SET user_id = NULL WHERE user_id = ?`, [userId]);
    await q(`UPDATE AUDIT_LOG SET user_id = NULL WHERE user_id = ?`, [userId]);

    // 2. Notifications: Clean up notifications intended for this user
    await q(`DELETE FROM NOTIFICATION WHERE user_id = ?`, [userId]);

    // 3. Feedback: Remove feedback records where user was evaluator or evaluee
    await q(`DELETE FROM FEEDBACK WHERE evaluator_id = ? OR evaluee_id = ?`, [userId, userId]);

    // 4. Grade Transmutation Config
    await q(`UPDATE GRADE_TRANSMUTATION_CONFIG SET updated_by = NULL WHERE updated_by = ?`, [userId]);

    // 5. Phil-IRI Assessments & Screenings
    await q(`UPDATE PHIL_IRI_ASSESSMENT SET user_id = NULL WHERE user_id = ?`, [userId]);
    await q(`UPDATE PHIL_IRI_SCREENING SET recorded_by = NULL WHERE recorded_by = ?`, [userId]);

    // 6. Grade Reopen Requests: Unlink reviewed_by and clean requests for this teacher's assignments
    await q(`UPDATE GRADE_REOPEN_REQUEST SET reviewed_by_user_id = NULL WHERE reviewed_by_user_id = ?`, [userId]);
    await q(`
      DELETE tr FROM TEMPORARY_REOPENING tr
      JOIN GRADE_REOPEN_REQUEST grr ON grr.request_id = tr.request_id
      JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = grr.teacher_assignment_id
      WHERE ta.user_id = ?
    `, [userId]);
    await q(`
      DELETE grr FROM GRADE_REOPEN_REQUEST grr
      JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = grr.teacher_assignment_id
      WHERE ta.user_id = ?
    `, [userId]);

    // 7. Attendance Sheets & Scores: Nullify assignment references
    await q(`
      UPDATE ATTENDANCE_SHEET ash
      JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
      SET ash.teacher_assignment_id = NULL
      WHERE ta.user_id = ?
    `, [userId]);
    await q(`
      UPDATE ATTENDANCE_SHEET ash
      JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      SET ash.adviser_assignment_id = NULL
      WHERE saa.user_id = ?
    `, [userId]);
    await q(`
      UPDATE SCORE sc
      JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = sc.teacher_assignment_id
      SET sc.teacher_assignment_id = NULL
      WHERE ta.user_id = ?
    `, [userId]);

    // 8. Subject & Section: Legacy user_id assignment
    await q(`UPDATE SUBJECT SET user_id = NULL WHERE user_id = ?`, [userId]);
    await q(`UPDATE SECTION SET user_id = NULL WHERE user_id = ?`, [userId]);

    // 9. Role Assignments
    await q(`DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE user_id = ?`, [userId]);
    await q(`DELETE FROM TEACHER_ASSIGNMENT WHERE user_id = ?`, [userId]);
    await q(`DELETE FROM DEPARTMENT_HEAD WHERE user_id = ?`, [userId]);

    // 10. Delete the user
    const [result] = await target.query(`DELETE FROM USER WHERE user_id = ?`, [userId]);
    return result && result.affectedRows > 0;
  } finally {
    await target.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
  }
}

async function deleteUserOnCloud(userId) {
  if (!db.cloudPool) return;
  try {
    await deleteUserCascade(db.cloudPool, userId);
  } catch (err) {
    console.warn("[CloudUser] Failed to delete user from cloud:", err.message);
  }
}

let credentialsChecked = false;
async function ensureCredentialsColumn() {
  if (credentialsChecked) return;
  try {
    const [cols] = await db.query("SHOW COLUMNS FROM USER LIKE 'credentials'");
    if (!cols || cols.length === 0) {
      await db.query("ALTER TABLE USER ADD COLUMN credentials VARCHAR(255) NULL AFTER extension_name");
      console.log("Auto-migrated USER table: added 'credentials' column.");
    }
    credentialsChecked = true;
  } catch (err) {
    console.warn("Could not check/add credentials column on USER table:", err.message);
  }
}
ensureCredentialsColumn().catch(() => {});

const getManagementUsers = async (schoolYearId = null) => {
  if (schoolYearId !== null && (!Number.isSafeInteger(Number(schoolYearId)) || Number(schoolYearId) <= 0)) throw new Error('Invalid assignment school year.');
  // The only interpolated value is the validated numeric school-year ID.
  const schoolYearFilter = schoolYearId === null ? "(sy.status IS NULL OR LOWER(sy.status) IN ('active', 'ongoing'))" : 'sy.school_year_id = ' + Number(schoolYearId);
  await ensureCredentialsColumn();
  const sql = `
    SELECT
      u.user_id,
      u.role,
      COALESCE(
        u.department_id,
        (
          SELECT dh.department_id
          FROM DEPARTMENT_HEAD dh
          LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = dh.school_year_id
          WHERE dh.user_id = u.user_id AND ${schoolYearFilter}
          ORDER BY dh.department_head_id DESC LIMIT 1
        )
      ) AS department_id,
      u.first_name,
      u.middle_name,
      u.last_name,
      u.extension_name,
      u.credentials,
      u.email,
      u.pfp_url,
      u.account_status,
      u.last_login_at,
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS username,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM SECTION_ADVISER_ASSIGNMENT saa
          LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
          WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ) AND u.role IN ('subject_teacher', 'subject teacher') THEN 'adviser'
        WHEN u.role IN ('subject_teacher', 'subject teacher') THEN 'subject teacher'
        WHEN u.role IN ('department_head', 'department head') THEN 'department head'
        WHEN u.role = 'principal' THEN 'principal'
        ELSE u.role
      END AS display_role,
      CASE
        WHEN u.role = 'principal' THEN 'School Administration'
        WHEN u.department_id IS NOT NULL THEN (
          SELECT d.department_name
          FROM DEPARTMENT d
          WHERE d.department_id = u.department_id
          LIMIT 1
        )
        WHEN u.role IN ('department_head', 'department head') THEN (
          SELECT d.department_name
          FROM DEPARTMENT_HEAD dh
          INNER JOIN DEPARTMENT d ON d.department_id = dh.department_id
          LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = dh.school_year_id
          WHERE dh.user_id = u.user_id AND ${schoolYearFilter}
          ORDER BY dh.department_head_id DESC LIMIT 1
        )
        ELSE 'General Education'
      END AS department_name,
      (
        SELECT gl.grade_level_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS gradeLevel,
      (
        SELECT sec.section_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS section,
      (
        SELECT sec.section_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_section_name,
      (
        SELECT gl.grade_level_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_grade_level_name,
      (
        SELECT saa.section_id
        FROM SECTION_ADVISER_ASSIGNMENT saa
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_section_id,
      (SELECT saa.school_year_id FROM SECTION_ADVISER_ASSIGNMENT saa
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id=saa.school_year_id
        WHERE saa.user_id=u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1) AS adviser_school_year_id,
      (
        SELECT sec.grade_level_id
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_grade_level_id,
      (
        SELECT COALESCE(p.is_specialized, 0)
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND ${schoolYearFilter}
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS is_specialized
    FROM USER u
    WHERE u.role <> 'system_admin'
    ORDER BY u.last_name ASC, u.first_name ASC
  `;
  let rows;
  try {
    const [result] = await db.execute(sql);
    rows = result;
  } catch (err) {
    if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054) && String(err.message).includes('credentials')) {
      const fallbackSql = sql.replace(/\bu\.credentials\b/g, 'NULL AS credentials');
      const [result] = await db.execute(fallbackSql);
      rows = result;
    } else {
      throw err;
    }
  }

  for (let user of rows) {
    const [assignments] = await db.execute(
      `
      SELECT 
        ta.teacher_assignment_id,
        ta.subject_offering_id,
        so.subject_id,
        so.section_id,
        so.school_year_id,
        sec.grade_level_id,
        sec.program_id,
        p.program_code,
        p.program_name,
        COALESCE(p.is_specialized, 0) AS is_specialized,
        s.subject_name,
        s.subject_code,
        sec.section_name,
        gl.grade_level_name
      FROM TEACHER_ASSIGNMENT ta
      INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      INNER JOIN SECTION sec ON sec.section_id = so.section_id
      LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
      INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
      WHERE ta.user_id = ? AND ${schoolYearFilter}
      ORDER BY gl.grade_level_id ASC, sec.section_name ASC, s.subject_name ASC
      `,
      [user.user_id]
    );
    user.teaching_assignments = assignments;
  }

  return rows;
};

const { uploadProfilePicture } = require("../services/profilePictureStorage");

// POST /api/users/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    let [users] = await db.execute(
      "SELECT * FROM `USER` WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [String(email).trim()]
    );

    // If not found locally, check Aiven Cloud in case the account was created on another machine
    if (users.length === 0 && db.cloudPool) {
      try {
        const [cloudUsers] = await db.cloudPool.query(
          "SELECT * FROM `USER` WHERE LOWER(email) = LOWER(?) LIMIT 1",
          [String(email).trim()]
        );
        if (cloudUsers && cloudUsers.length > 0) {
          const cu = cloudUsers[0];
          await db.execute(
            `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, email, password, account_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE password = VALUES(password), account_status = VALUES(account_status)`,
            [cu.user_id, cu.role, cu.department_id, cu.first_name, cu.middle_name, cu.last_name, cu.extension_name, cu.email, cu.password, cu.account_status]
          );
          users = [cu];
        }
      } catch (cloudLoginErr) {
        // Proceed to normal invalid response
      }
    }

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = users[0];

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // If password was stored in plaintext, upgrade it to bcrypt hash transparently
    if (!isBcryptHash(user.password)) {
      const rehashed = await hashPassword(password);
      await db.execute("UPDATE `USER` SET password = ? WHERE user_id = ?", [
        rehashed,
        user.user_id,
      ]);
    }

    if (String(user.account_status).toLowerCase() === "inactive") {
      return res.status(403).json({ error: "Your account is inactive. Please contact the administrator." });
    }

    const [advisoryRows] = await db.execute(
      `
      SELECT 
        saa.adviser_assignment_id,
        saa.section_id,
        sec.section_name,
        sec.program_id,
        p.program_code,
        p.program_name,
        COALESCE(p.is_specialized, 0) AS is_specialized,
        gl.grade_level_id,
        gl.grade_level_name
      FROM SECTION_ADVISER_ASSIGNMENT saa
      INNER JOIN SECTION sec ON sec.section_id = saa.section_id
      LEFT JOIN PROGRAM p ON p.program_id = sec.program_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
      WHERE saa.user_id = ?
      ORDER BY saa.adviser_assignment_id DESC
      LIMIT 1
      `,
      [user.user_id]
    );

    const isAdviser = advisoryRows.length > 0;
    const advisoryAssignment = isAdviser ? advisoryRows[0] : null;

    let departmentName = "";
    if (user.department_id) {
      const [deptRows] = await db.execute(
        "SELECT department_name FROM DEPARTMENT WHERE department_id = ? LIMIT 1",
        [user.department_id]
      );
      if (deptRows.length > 0) {
        departmentName = deptRows[0].department_name;
      }
    }

    let displayRole = user.role;
    let canonicalRole = user.role;

    const rawRole = (user.role || "").toLowerCase().trim();
    if (rawRole === "admin" || rawRole === "system_admin") {
      displayRole = "System Administrator";
      canonicalRole = "admin";
    } else if (rawRole === "principal") {
      displayRole = "Principal";
      canonicalRole = "principal";
      departmentName = "School Administration";
    } else if (rawRole === "department_head" || rawRole === "department head") {
      displayRole = "Department Head";
      canonicalRole = "department head";
    } else if (isAdviser) {
      displayRole = "Adviser";
      canonicalRole = "adviser";
    } else {
      displayRole = "Subject Teacher";
      canonicalRole = "subject teacher";
    }

    await db.execute(
      "UPDATE `USER` SET last_login_at = NOW() WHERE user_id = ?",
      [user.user_id]
    );

    res.json({
      message: "Login successful.",
      user: {
        user_id: user.user_id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        extension_name: user.extension_name,
        email: user.email,
        role: canonicalRole,
        display_role: displayRole,
        is_adviser: isAdviser,
        department_id: user.department_id,
        department_name: departmentName,
        pfp_url: user.pfp_url,
        account_status: user.account_status,
        last_login_at: new Date().toISOString(),
        adviser_assignment: advisoryAssignment,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: err.message || "An error occurred during login." });
  }
});

// POST /api/users/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Verify if account exists
    const [users] = await db.execute(
      "SELECT user_id, first_name, last_name, email, account_status FROM `USER` WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "No registered account found with this email address." });
    }

    const user = users[0];
    if (String(user.account_status).toLowerCase() === "inactive") {
      return res.status(403).json({ error: "This account is inactive. Please contact your system administrator." });
    }

    // Generate 4-digit numeric OTP
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    OtpStore.createOtp(cleanEmail, otpCode, 10);

    const userName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    await sendPasswordResetOtpEmail(cleanEmail, otpCode, userName);

    res.json({
      success: true,
      message: "A 4-digit verification code has been sent to your registered email.",
      email: cleanEmail,
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to process forgot password request." });
  }
});

// POST /api/users/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{4}$/.test(cleanOtp)) {
      return res.status(400).json({ error: "Verification code must be 4 digits." });
    }

    const otpRecord = OtpStore.findValidOtp(cleanEmail, cleanOtp);
    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid or expired verification code. Please request a new one." });
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    OtpStore.markVerified(cleanEmail, resetToken);

    res.json({
      success: true,
      message: "Code verified successfully.",
      resetToken,
      email: cleanEmail,
    });
  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to verify code." });
  }
});

// POST /api/users/resend-otp
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const [users] = await db.execute(
      "SELECT user_id, first_name, last_name, email, account_status FROM `USER` WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [cleanEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "No registered account found with this email address." });
    }

    const user = users[0];
    if (String(user.account_status).toLowerCase() === "inactive") {
      return res.status(403).json({ error: "This account is inactive. Please contact your system administrator." });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    OtpStore.createOtp(cleanEmail, otpCode, 10);

    const userName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
    await sendPasswordResetOtpEmail(cleanEmail, otpCode, userName);

    res.json({
      success: true,
      message: "A new 4-digit verification code has been sent to your email.",
      email: cleanEmail,
    });
  } catch (err) {
    console.error("RESEND OTP ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to resend verification code." });
  }
});

// POST /api/users/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ error: "Email, reset token, and new password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(newPassword).trim();

    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const tokenRecord = OtpStore.findValidResetToken(cleanEmail, resetToken);
    if (!tokenRecord) {
      return res.status(400).json({ error: "Invalid or expired reset session. Please request a new code." });
    }

    const [targets] = await db.execute('SELECT user_id, first_name, last_name FROM USER WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
    const user = targets[0];
    if (!user) return res.status(404).json({ error: 'User account not found.' });
    const hashedPassword = await hashPassword(cleanPassword);

    await AuditDetails.saveCredential(db, { userId: user.user_id, hash: hashedPassword, actor: user.user_id,
      eventType: 'USER_PASSWORD_RESET', target: `${user.first_name || ''} ${user.last_name || ''}`.trim() || cleanEmail });
    OtpStore.invalidate(cleanEmail);

    res.json({
      success: true,
      message: "Your password has been successfully reset. You can now login with your new password.",
    });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to reset password." });
  }
});

router.get("/summary", async (req, res) => {
  try {
    const summary = await AuditEvent.getAccountSummary();
    res.json(summary);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

router.get("/management-options", async (req, res) => {
  try {
    const schoolYear = req.query?.school_year_id
      ? await getCurrentSchoolYear(db, req.query.school_year_id) : await UserManagementOptions.getActiveSchoolYear();
    const schoolYears = await UserManagementOptions.getSchoolYears();
    const [gradeLevels] = await db.execute("SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC");
    const [departments] = await db.execute(`
      SELECT 
        d.department_id, 
        d.department_name,
        COALESCE(
          (
            SELECT dh.user_id
            FROM DEPARTMENT_HEAD dh
            LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = dh.school_year_id
            WHERE dh.department_id = d.department_id
              AND (sy.status IS NULL OR LOWER(sy.status) IN ('active', 'ongoing'))
            ORDER BY dh.department_head_id DESC
            LIMIT 1
          ),
          (
            SELECT u.user_id
            FROM USER u
            WHERE u.department_id = d.department_id
              AND LOWER(u.role) IN ('department_head', 'department head', 'dept_head')
              AND LOWER(COALESCE(u.account_status, 'active')) = 'active'
            ORDER BY u.user_id DESC
            LIMIT 1
          )
        ) AS head_user_id
      FROM DEPARTMENT d 
      ORDER BY d.department_name ASC
    `);
    const [sections] = await db.execute(`
      SELECT 
        sec.section_id, 
        sec.section_name, 
        sec.grade_level_id,
        (
          SELECT saa.user_id
          FROM SECTION_ADVISER_ASSIGNMENT saa
          LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
          WHERE saa.section_id = sec.section_id
            AND saa.school_year_id = ?
          ORDER BY saa.adviser_assignment_id DESC
          LIMIT 1
        ) AS adviser_user_id
      FROM SECTION sec 
      ORDER BY sec.section_name ASC
    `, [schoolYear?.school_year_id || 0]);
    const [programs] = await db.execute("SELECT program_id, program_code, program_name, is_specialized FROM PROGRAM ORDER BY is_specialized DESC, program_code ASC");
    
    const [subjectOfferings] = await db.execute(`
      SELECT 
        so.subject_offering_id, 
        so.subject_id, 
        so.section_id,
        so.school_year_id,
        sec.grade_level_id, 
        s.subject_name,
        s.subject_code,
        sec.section_name,
        gl.grade_level_name,
        (
          SELECT ta.user_id
          FROM TEACHER_ASSIGNMENT ta
          LEFT JOIN USER u ON u.user_id = ta.user_id
          WHERE ta.subject_offering_id = so.subject_offering_id
            AND LOWER(COALESCE(u.account_status, 'active')) = 'active'
          ORDER BY ta.teacher_assignment_id DESC
          LIMIT 1
        ) AS teacher_user_id
      FROM SUBJECT_OFFERING so
      INNER JOIN SECTION sec ON sec.section_id = so.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
      INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
      WHERE so.school_year_id = ?
      ORDER BY gl.grade_level_id ASC, sec.section_name ASC, s.subject_name ASC
    `, [schoolYear?.school_year_id || 0]);

    res.json({ gradeLevels, sections, departments, programs, subjectOfferings, schoolYear, schoolYears });
  } catch (err) {
    console.error("GET MANAGEMENT OPTIONS ERROR:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// GET /api/users/:id/profile
router.get("/:id/profile", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    const userId = Number(req.params.id);
    if (db.cloudPool) {
      try {
        const [cloudRows] = await db.cloudPool.query(
          `SELECT user_id, role, department_id, first_name, middle_name, last_name, extension_name, email, account_status, pfp_url, last_login_at FROM USER WHERE user_id = ?`,
          [userId]
        );
        if (cloudRows && cloudRows.length > 0) {
          const u = cloudRows[0];
          await db.execute(
            `UPDATE USER SET role = ?, department_id = ?, first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, email = ?, account_status = ?, pfp_url = ? WHERE user_id = ?`,
            [u.role, u.department_id, u.first_name, u.middle_name, u.last_name, u.extension_name, u.email, u.account_status, u.pfp_url, userId]
          );
        }
      } catch (cloudErr) {
        // Fall back to local database if cloud is unreachable
      }
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.set('Cache-Control', 'no-store');
    res.json(user);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

// PUT /api/users/:id/profile
router.put("/:id/profile", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  let connection;
  let committed = false;
  try {
    const userId = Number(req.params.id);
    const {
      first_name,
      middle_name,
      last_name,
      extension_name,
      credentials,
      email,
      password,
      newPassword,
      new_password,
      currentPassword,
      current_password,
    } = req.body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Required fields missing." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute('SELECT user_id FROM USER WHERE user_id = ? FOR UPDATE', [userId]);
    const auditBefore = await AuditDetails.accountSnapshot(connection, userId);
    if (!auditBefore) return res.status(404).json({ error: 'User not found.' });
    let profilePasswordHash = null;
    const nxtPwd = newPassword || new_password || password;
    if (nxtPwd && String(nxtPwd).trim()) {
      const cleanNewPwd = String(nxtPwd).trim();
      if (cleanNewPwd.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
      }
      const curPwd = currentPassword || current_password;
      if (curPwd) {
        const [existing] = await connection.execute("SELECT password FROM `USER` WHERE user_id = ?", [userId]);
        if (existing.length > 0) {
          const isValid = await verifyPassword(String(curPwd), existing[0].password);
          if (!isValid) {
            return res.status(401).json({ error: "Current password is incorrect." });
          }
        }
      }
      const hashed = await hashPassword(cleanNewPwd);
      profilePasswordHash = hashed;
      await connection.execute("UPDATE `USER` SET password = ? WHERE user_id = ?", [hashed, userId]);

    }

    const profileData = {
      first_name: first_name.trim(),
      middle_name: toNullable(middle_name),
      last_name: last_name.trim(),
      extension_name: toNullable(extension_name),
      credentials: toNullable(credentials),
      email: email.trim().toLowerCase(),
    };
    await connection.execute(`UPDATE USER SET first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, credentials = ?, email = ? WHERE user_id = ?`,
      [profileData.first_name, profileData.middle_name, profileData.last_name, profileData.extension_name, profileData.credentials, profileData.email, userId]);
    const actor = AuditDetails.actorId(req, userId);
    await AuditDetails.record(connection, { actor, actor_context: { acting_as: 'User' },
      event_type: 'USER_PROFILE_UPDATED', module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
      before: auditBefore, after: await AuditDetails.accountSnapshot(connection, userId),
      metadata: { target: `${profileData.first_name} ${profileData.last_name}`, summary: 'Updated profile details.' } });
    if (nxtPwd && String(nxtPwd).trim()) await AuditEvent.create({ user_id: actor,
      actor_context: await AuditDetails.actorContext(connection, actor, { acting_as: 'User' }),
      event_type: 'USER_PASSWORD_CHANGED', module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
      metadata: { target: `${profileData.first_name} ${profileData.last_name}`, summary: 'Changed the account password. No password values are retained.' } }, connection);
    await connection.commit();
    committed = true;
    if (profilePasswordHash && db.cloudPool) db.cloudPool.query('UPDATE USER SET password = ? WHERE user_id = ?', [profilePasswordHash, userId]).catch(() => {});
    const updated = await User.findById(userId);

    if (db.cloudPool) {
      db.cloudPool.query(
        `UPDATE USER SET first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, credentials = ?, email = ? WHERE user_id = ?`,
        [profileData.first_name, profileData.middle_name, profileData.last_name, profileData.extension_name, profileData.credentials, profileData.email, userId]
      ).catch((err) => console.warn('[CloudUser] Failed to dual-write profile update to cloud:', err.message));
    }

    res.json({ message: "Profile updated successfully.", user: updated });
  } catch (err) {
    sendDatabaseError(res, err);
  } finally {
    if (connection) { if (!committed) await connection.rollback().catch(() => {}); connection.release(); }
  }
});

// POST or PUT /api/users/:id/change-password
const handlePasswordChangeRoute = async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    const userId = Number(req.params.id);
    const {
      currentPassword,
      current_password,
      newPassword,
      new_password,
      confirmPassword,
      confirm_password,
    } = req.body || {};

    const curPwd = currentPassword || current_password;
    const nxtPwd = newPassword || new_password;
    const cnfPwd = confirmPassword || confirm_password;

    if (!curPwd || !String(curPwd).trim()) {
      return res.status(400).json({ error: "Current password is required." });
    }
    if (!nxtPwd || !String(nxtPwd).trim()) {
      return res.status(400).json({ error: "New password is required." });
    }

    const cleanNewPwd = String(nxtPwd).trim();
    if (cleanNewPwd.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    if (cnfPwd !== undefined && cleanNewPwd !== String(cnfPwd).trim()) {
      return res.status(400).json({ error: "New passwords do not match." });
    }

    const [userRows] = await db.execute(
      "SELECT user_id, email, password, first_name, last_name FROM `USER` WHERE user_id = ?",
      [userId]
    );
    if (!userRows || userRows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const user = userRows[0];

    const isCurrentValid = await verifyPassword(String(curPwd), user.password);
    if (!isCurrentValid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    if (String(curPwd) === cleanNewPwd) {
      return res.status(400).json({ error: "New password must be different from current password." });
    }

    const hashedPassword = await hashPassword(cleanNewPwd);
    await AuditDetails.saveCredential(db, { userId, hash: hashedPassword, actor: AuditDetails.actorId(req, userId),
      eventType: 'USER_PASSWORD_CHANGED', target: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email });

    if (db.cloudPool) {
      db.cloudPool.query("UPDATE `USER` SET password = ? WHERE user_id = ?", [hashedPassword, userId])
        .catch((err) => console.warn('[CloudUser] Failed to dual-write password change to cloud:', err.message));
    }

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    sendDatabaseError(res, err);
  }
};

router.post("/:id/change-password", handlePasswordChangeRoute);
router.put("/:id/change-password", handlePasswordChangeRoute);

// PUT /api/users/:id/profile-picture
router.put("/:id/profile-picture", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    const userId = Number(req.params.id);
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: "No image data provided." });
    }

    let buffer;
    if (typeof imageData === "string" && imageData.startsWith("data:")) {
      const base64Data = imageData.split(",")[1];
      buffer = Buffer.from(base64Data, "base64");
    } else {
      buffer = Buffer.from(imageData, "base64");
    }

    const uploadResult = await uploadProfilePicture(buffer, userId);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT pfp_url FROM USER WHERE user_id = ? FOR UPDATE', [userId]);
      await connection.execute('UPDATE USER SET pfp_url = ? WHERE user_id = ?', [uploadResult.secureUrl, userId]);
      await AuditDetails.record(connection, { actor: AuditDetails.actorId(req, userId),
        event_type: 'USER_PROFILE_UPDATED', module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
        before: { profile_picture: rows[0]?.pfp_url || null }, after: { profile_picture: uploadResult.secureUrl },
        metadata: { target: `User #${userId}`, summary: 'Updated the profile picture.' } });
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }

    if (db.cloudPool) {
      db.cloudPool.query("UPDATE USER SET pfp_url = ? WHERE user_id = ?", [
        uploadResult.secureUrl,
        userId,
      ]).catch(() => {});
    }

    const updatedUser = await User.findById(userId);
    res.json({
      message: "Profile picture updated successfully.",
      pfp_url: uploadResult.secureUrl,
      user: updatedUser,
    });
  } catch (err) {
    console.error("PROFILE PICTURE UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message || "Failed to update profile picture." });
  }
});

router.get("/", async (req, res) => {
  try {
    await syncUsersFromCloud();
    const users = await getManagementUsers();
    res.set('Cache-Control', 'no-store');
    res.json(users);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

router.get("/:id", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    await syncUsersFromCloud();
    const userId = Number(req.params.id);
    const schoolYear = req.query?.school_year_id ? await getCurrentSchoolYear(db, req.query.school_year_id) : null;
    const users = await getManagementUsers(schoolYear?.school_year_id || null);
    const user = users.find((item) => Number(item.user_id) === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.set('Cache-Control', 'no-store');
    res.json(user);
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

const validateSingleDepartmentHead = async (connection, departmentId, userId, schoolYear) => {
  if (!departmentId) return;
  const [existing] = await connection.execute(
    `
    SELECT 
      dh.user_id,
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS head_name,
      d.department_name
    FROM DEPARTMENT_HEAD dh
    INNER JOIN USER u ON u.user_id = dh.user_id
    INNER JOIN DEPARTMENT d ON d.department_id = dh.department_id
    LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = dh.school_year_id
    WHERE dh.department_id = ?
      AND dh.user_id <> ?
      AND dh.school_year_id = ?
    LIMIT 1
    `,
    [departmentId, userId || 0, schoolYear?.school_year_id || 0]
  );

  if (existing.length > 0) {
    const head = existing[0];
    const name = head.head_name.trim() || `User #${head.user_id}`;
    throw new Error(
      `The ${head.department_name} department already has an assigned Department Head (${name}). Each department can only have 1 Department Head.`
    );
  }
};

const saveRoleAssignments = async (connection, userId, body, schoolYear) => {
  await UserClassAssignments.synchronize(connection,userId,body,schoolYear,normalizeRole(body.role),getAssignmentDates(body,schoolYear));
};

router.post("/", async (req, res) => {
  let connection;
  try {
    const { first_name, middle_name, last_name, extension_name, credentials, email, password, role: requestedRole, department_id, account_status, status } = req.body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Required fields missing." });
    }

    const role = normalizeRole(requestedRole);
    if (!role) {
      return res.status(400).json({ error: "Invalid role specified." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    if (role === "principal") {
      const [existingPrincipal] = await connection.execute(
        "SELECT user_id, first_name, last_name FROM `USER` WHERE role = 'principal' AND account_status = 'active' LIMIT 1"
      );
      if (existingPrincipal.length > 0) {
        return res.status(400).json({ error: "A Principal account already exists. Only 1 Principal is permitted." });
      }
    }

    const schoolYear = await getCurrentSchoolYear(connection, req.body.school_year_id);
    if (!schoolYear) throw new Error("No active school year found.");

    const effectiveDepartmentId = role === "principal" ? null : (department_id ? Number(department_id) : null);

    if (role === "department head" && effectiveDepartmentId) {
      await validateSingleDepartmentHead(connection, effectiveDepartmentId, 0, schoolYear);
    }

    if (role === "subject teacher") await UserClassAssignments.validate(connection,0,req.body,schoolYear.school_year_id);

    const hashedPassword = await hashPassword(password);

    // 1. If online and cloudPool is ready, insert into Aiven to get consistent authoritative userId
    let userId = null;
    if (db.cloudPool) {
      try {
        const [cloudResult] = await db.cloudPool.query(
          `INSERT INTO USER (role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), hashedPassword, account_status || status || "active"]
        );
        userId = cloudResult.insertId;
      } catch (cloudInsertErr) {
        console.warn("[CloudUser] Cloud insert failed, using local insert:", cloudInsertErr.message);
      }
    }

    if (userId) {
      await connection.execute(
        `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), department_id = VALUES(department_id), first_name = VALUES(first_name), last_name = VALUES(last_name), extension_name = VALUES(extension_name), credentials = VALUES(credentials), password = VALUES(password), account_status = VALUES(account_status)`,
        [userId, role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), hashedPassword, account_status || status || "active"]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO USER (role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), hashedPassword, account_status || status || "active"]
      );
      userId = result.insertId;
      if (db.cloudPool) {
        db.cloudPool.query(
          `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, credentials, email, password, account_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE role = VALUES(role), department_id = VALUES(department_id), first_name = VALUES(first_name), last_name = VALUES(last_name), extension_name = VALUES(extension_name), credentials = VALUES(credentials), password = VALUES(password), account_status = VALUES(account_status)`,
          [userId, role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), hashedPassword, account_status || status || "active"]
        ).catch(() => {});
      }
    }

    await saveRoleAssignments(connection, userId, req.body, schoolYear);

    await AuditDetails.record(connection, {
      actor: AuditDetails.actorId(req), actor_context: { acting_as: 'System Administrator' },
      event_type: 'USER_ACCOUNT_CREATED', module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
      before: null, after: await AuditDetails.accountSnapshot(connection, userId, schoolYear.school_year_id),
      metadata: { target: `${first_name.trim()} ${last_name.trim()}`, school_year: AuditDetails.yearLabel(schoolYear),
        summary: `Created a ${role} account for ${first_name.trim()} ${last_name.trim()}.` },
    });

    await connection.commit();

    if (db.cloudPool) {
      forwardRoleAssignmentsToCloud(userId, req.body, schoolYear).catch((err) =>
        console.warn("[CloudUser] Failed to dual-write role assignments to cloud:", err.message)
      );
    }

    const users = await getManagementUsers(schoolYear.school_year_id);
    const createdUser = users.find((u) => Number(u.user_id) === Number(userId));

    res.status(201).json({ message: "User created successfully.", user_id: userId, user: createdUser });
  } catch (err) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, err);
  } finally {
    if (connection) connection.release();
  }
});

router.put("/:id", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  let connection;
  try {
    const userId = Number(req.params.id);
    const { first_name, middle_name, last_name, extension_name, credentials, email, password, role: requestedRole, department_id, account_status, status } = req.body;

    const existingUser = await User.findById(userId);
    if (!existingUser) return res.status(404).json({ error: "User not found." });

    const role = normalizeRole(requestedRole);
    if (!role) return res.status(400).json({ error: "Invalid role." });

    connection = await db.getConnection();
    await connection.beginTransaction();

    if (role === "principal" && existingUser.role !== "principal") {
      const [existingPrincipal] = await connection.execute(
        "SELECT user_id, first_name, last_name FROM `USER` WHERE role = 'principal' AND account_status = 'active' AND user_id != ? LIMIT 1",
        [userId]
      );
      if (existingPrincipal.length > 0) {
        return res.status(400).json({ error: "A Principal account already exists. Only 1 Principal is permitted." });
      }
    }

    const schoolYear = await getCurrentSchoolYear(connection, req.body.school_year_id);
    if (!schoolYear) throw new Error("No active school year found.");

    const effectiveDepartmentId = role === "principal" ? null : (department_id ? Number(department_id) : null);

    await connection.execute('SELECT user_id FROM USER WHERE user_id = ? FOR UPDATE', [userId]);
    const auditBefore = await AuditDetails.accountSnapshot(connection, userId, schoolYear.school_year_id);

    // 1 Department Head per department
    if (role === "department head" && effectiveDepartmentId) {
      await validateSingleDepartmentHead(connection, effectiveDepartmentId, userId, schoolYear);
    }

    if (role === "subject teacher") await UserClassAssignments.validate(connection,userId,req.body,schoolYear.school_year_id);

    let hashedPassword = null;
    if (password && password.trim()) {
      hashedPassword = await hashPassword(password);
      await connection.execute(
        `UPDATE USER SET role = ?, department_id = ?, first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, credentials = ?, email = ?, password = ?, account_status = ? WHERE user_id = ?`,
        [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), hashedPassword, account_status || status || "active", userId]
      );
    } else {
      await connection.execute(
        `UPDATE USER SET role = ?, department_id = ?, first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, credentials = ?, email = ?, account_status = ? WHERE user_id = ?`,
        [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), account_status || status || "active", userId]
      );
    }

    await saveRoleAssignments(connection, userId, req.body, schoolYear);

    const auditAfter = await AuditDetails.accountSnapshot(connection, userId, schoolYear.school_year_id);
    const isStatusChanged = auditBefore.account_status !== auditAfter.account_status;
    await AuditDetails.record(connection, { actor: AuditDetails.actorId(req), actor_context: { acting_as: 'System Administrator' },
      event_type: isStatusChanged ? 'USER_STATUS_UPDATED' : 'USER_ACCOUNT_UPDATED', module_name: 'ACCOUNT_MANAGEMENT',
      entity_type: 'USER', entity_id: userId, before: auditBefore, after: auditAfter,
      metadata: { target: `${first_name.trim()} ${last_name.trim()}`, school_year: AuditDetails.yearLabel(schoolYear),
        summary: `Updated account details for ${first_name.trim()} ${last_name.trim()}.` } });
    if (hashedPassword) await AuditEvent.create({ user_id: AuditDetails.actorId(req),
      actor_context: await AuditDetails.actorContext(connection, AuditDetails.actorId(req), { acting_as: 'System Administrator' }),
      event_type: 'USER_PASSWORD_RESET', module_name: 'ACCOUNT_MANAGEMENT', entity_type: 'USER', entity_id: userId,
      metadata: { target: `${first_name.trim()} ${last_name.trim()}`, summary: 'Reset the account password. No password values are retained.' } }, connection);

    await connection.commit();
    recentlyUpdatedStatusMap.set(Number(userId), {
      account_status: account_status || status || "active",
      updatedAt: Date.now(),
    });

    if (db.cloudPool) {
      try {
        const updateCloudFields = ["role = ?", "department_id = ?", "first_name = ?", "middle_name = ?", "last_name = ?", "extension_name = ?", "credentials = ?", "email = ?", "account_status = ?"];
        const updateCloudParams = [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), toNullable(credentials), email.trim().toLowerCase(), account_status || status || "active"];
        if (hashedPassword) {
          updateCloudFields.push("password = ?");
          updateCloudParams.push(hashedPassword);
        }
        updateCloudParams.push(userId);
        await db.cloudPool.query(`UPDATE USER SET ${updateCloudFields.join(', ')} WHERE user_id = ?`, updateCloudParams);
        await forwardRoleAssignmentsToCloud(userId, req.body, schoolYear);
      } catch (cloudErr) {
        console.warn("[CloudUser] Failed to dual-write user update to Aiven:", cloudErr.message);
      }
    }

    const users = await getManagementUsers(schoolYear.school_year_id);
    const updatedUser = users.find((u) => Number(u.user_id) === Number(userId));

    res.json({ message: "User updated successfully.", user: updatedUser });
  } catch (err) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, err);
  } finally {
    if (connection) connection.release();
  }
});

router.put("/:id/status", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  let connection;
  try {
    const userId = Number(req.params.id);
    const rawStatus = String(req.body?.account_status || req.body?.status || "").trim().toLowerCase();
    if (rawStatus !== "active" && rawStatus !== "inactive") {
      return res.status(400).json({ error: "Invalid account status. Must be 'active' or 'inactive'." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    await connection.execute("SELECT user_id FROM USER WHERE user_id = ? FOR UPDATE", [userId]);
    const auditBefore = await AuditDetails.accountSnapshot(connection, userId);
    if (!auditBefore) {
      await connection.rollback();
      return res.status(404).json({ error: "User not found." });
    }

    await connection.execute(
      "UPDATE USER SET account_status = ? WHERE user_id = ?",
      [rawStatus, userId]
    );

    const auditAfter = await AuditDetails.accountSnapshot(connection, userId);
    const targetName = `${auditAfter.first_name || ""} ${auditAfter.last_name || ""}`.trim() || auditAfter.email;
    await AuditDetails.record(connection, {
      actor: AuditDetails.actorId(req),
      actor_context: { acting_as: "System Administrator" },
      event_type: "USER_STATUS_UPDATED",
      module_name: "ACCOUNT_MANAGEMENT",
      entity_type: "USER",
      entity_id: userId,
      before: auditBefore,
      after: auditAfter,
      metadata: {
        target: targetName,
        summary: `${rawStatus === "inactive" ? "Deactivated" : "Activated"} account for ${targetName}.`,
      },
    });

    await connection.commit();
    recentlyUpdatedStatusMap.set(Number(userId), {
      account_status: rawStatus,
      updatedAt: Date.now(),
    });

    if (db.cloudPool) {
      try {
        await db.cloudPool.query(
          "UPDATE USER SET account_status = ? WHERE user_id = ?",
          [rawStatus, userId]
        );
      } catch (cloudErr) {
        console.warn("[CloudUser] Failed to dual-write user status update to Aiven:", cloudErr.message);
      }
    }

    const users = await getManagementUsers();
    const updatedUser = users.find((u) => Number(u.user_id) === Number(userId));

    res.json({
      message: `User account ${rawStatus === "inactive" ? "deactivated" : "activated"} successfully.`,
      user: updatedUser || { ...auditAfter, user_id: userId, account_status: rawStatus },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, err);
  } finally {
    if (connection) connection.release();
  }
});

router.delete("/:id", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }

  let connection;
  try {
    const userId = Number(req.params.id);
    connection = await db.getConnection();
    await connection.beginTransaction();

    const deleted = await deleteUserCascade(connection, userId);
    if (!deleted) {
      await connection.rollback();
      return res.status(404).json({ error: "User not found." });
    }

    await connection.commit();

    if (db.cloudPool) {
      await deleteUserOnCloud(userId);
    }

    res.json({ message: "User deleted successfully." });
  } catch (err) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, err);
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
