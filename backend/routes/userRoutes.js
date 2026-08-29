const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const db = require("../config/db");

const User = require("../models/User");
const UserManagementOptions = require("../models/UserManagementOptions");
const AuditEvent = require("../models/AuditEvent");
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
  return res.status(500).json({ error: err.message });
};

const toNullable = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  return value;
};

const getCurrentSchoolYear = async (connection) => {
  const [rows] = await connection.execute(`
    SELECT school_year_id, school_id, starts_on, ends_on, curriculum, status
    FROM SCHOOL_YEAR
    WHERE status IN ('ACTIVE', 'ONGOING')
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
  const assignedFrom = formatDate(body.assigned_from) || new Date().toISOString().slice(0, 10);
  
  let assignedUntil = formatDate(body.assigned_until);

  if (!assignedUntil && schoolYear?.ends_on) {
    const rawEnd = String(schoolYear.ends_on).trim();
    assignedUntil = rawEnd.length === 4 ? `${rawEnd}-12-31` : formatDate(rawEnd);
  }

  return { assignedFrom, assignedUntil };
};

const getManagementUsers = async () => {
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
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS username,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM SECTION_ADVISER_ASSIGNMENT saa
          LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
          WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
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
          WHERE dh.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
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
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS gradeLevel,
      (
        SELECT sec.section_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS section,
      (
        SELECT sec.section_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_section_name,
      (
        SELECT gl.grade_level_name
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_grade_level_name,
      (
        SELECT saa.section_id
        FROM SECTION_ADVISER_ASSIGNMENT saa
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_section_id,
      (
        SELECT sec.grade_level_id
        FROM SECTION_ADVISER_ASSIGNMENT saa
        INNER JOIN SECTION sec ON sec.section_id = saa.section_id
        LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
        WHERE saa.user_id = u.user_id AND sy.status IN ('ACTIVE', 'ONGOING')
        ORDER BY saa.adviser_assignment_id DESC LIMIT 1
      ) AS adviser_grade_level_id
    FROM USER u
    WHERE u.role <> 'system_admin'
    ORDER BY u.last_name ASC, u.first_name ASC
  `);

  for (let user of rows) {
    const [assignments] = await db.execute(
      `
      SELECT 
        ta.teacher_assignment_id,
        ta.subject_offering_id,
        so.subject_id,
        so.section_id,
        sec.grade_level_id,
        s.subject_name,
        s.subject_code,
        sec.section_name,
        gl.grade_level_name
      FROM TEACHER_ASSIGNMENT ta
      INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      INNER JOIN SECTION sec ON sec.section_id = so.section_id
      INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
      WHERE ta.user_id = ? AND sy.status IN ('ACTIVE', 'ONGOING')
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

    const [users] = await db.execute(
      "SELECT * FROM `USER` WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [String(email).trim()]
    );

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
        gl.grade_level_id,
        gl.grade_level_name
      FROM SECTION_ADVISER_ASSIGNMENT saa
      INNER JOIN SECTION sec ON sec.section_id = saa.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
      WHERE saa.user_id = ? AND (sy.status IN ('ACTIVE', 'ONGOING') OR sy.school_year_id IS NULL)
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

    const hashedPassword = await hashPassword(cleanPassword);

    const [result] = await db.execute(
      "UPDATE `USER` SET password = ? WHERE LOWER(email) = LOWER(?)",
      [hashedPassword, cleanEmail]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User account not found." });
    }

    OtpStore.invalidate(cleanEmail);

    await AuditEvent.create({
      user_id: user.user_id,
      actor_context: { source: 'user', acting_as: 'User' },
      event_type: 'USER_PASSWORD_RESET',
      module_name: 'ACCOUNT_MANAGEMENT',
      entity_type: 'USER',
      entity_id: user.user_id,
      after_data: { email: cleanEmail },
      metadata: {
        target: `${user.first_name || ''} ${user.last_name || ''}`.trim() || cleanEmail,
        summary: `Reset password for ${cleanEmail}.`,
        impact: 'High',
      },
    }).catch((err) => console.error('Failed to log password reset audit:', err.message));

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
    const schoolYear = await UserManagementOptions.getActiveSchoolYear();
    const [gradeLevels] = await db.execute("SELECT grade_level_id, grade_level_name FROM GRADE_LEVEL ORDER BY grade_level_id ASC");
    const [departments] = await db.execute("SELECT department_id, department_name FROM DEPARTMENT ORDER BY department_name ASC");
    const [sections] = await db.execute("SELECT section_id, section_name, grade_level_id FROM SECTION ORDER BY section_name ASC");
    
    const [subjectOfferings] = await db.execute(`
      SELECT 
        so.subject_offering_id, 
        so.subject_id, 
        so.section_id, 
        sec.grade_level_id, 
        s.subject_name,
        s.subject_code,
        sec.section_name,
        gl.grade_level_name
      FROM SUBJECT_OFFERING so
      INNER JOIN SECTION sec ON sec.section_id = so.section_id
      INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
      INNER JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
      WHERE sy.status IN ('ACTIVE', 'ONGOING')
      ORDER BY gl.grade_level_id ASC, sec.section_name ASC, s.subject_name ASC
    `);

    res.json({ gradeLevels, sections, departments, subjectOfferings, schoolYear });
  } catch (err) {
    console.error("GET MANAGEMENT OPTIONS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/profile
router.get("/:id/profile", async (req, res) => {
  if (!isValidUserId(req.params.id)) {
    return res.status(400).json({ error: "Invalid user ID." });
  }
  try {
    const user = await User.findById(Number(req.params.id));
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
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
  try {
    const userId = Number(req.params.id);
    const { first_name, middle_name, last_name, extension_name, email } = req.body;
    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return res.status(400).json({ error: "Required fields missing." });
    }
    const updated = await User.updateProfile(userId, {
      first_name: first_name.trim(),
      middle_name: toNullable(middle_name),
      last_name: last_name.trim(),
      extension_name: toNullable(extension_name),
      email: email.trim().toLowerCase(),
    });

    await AuditEvent.create({
      user_id: userId,
      actor_context: { source: 'user', acting_as: 'User' },
      event_type: 'USER_PROFILE_UPDATED',
      module_name: 'ACCOUNT_MANAGEMENT',
      entity_type: 'USER',
      entity_id: userId,
      after_data: {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim().toLowerCase(),
      },
      metadata: {
        target: `${first_name.trim()} ${last_name.trim()}`,
        summary: `Updated profile details for ${first_name.trim()} ${last_name.trim()}.`,
        impact: 'Low',
      },
    }).catch((err) => console.error('Failed to log profile update audit:', err.message));

    res.json({ message: "Profile updated successfully.", user: updated });
  } catch (err) {
    sendDatabaseError(res, err);
  }
});

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
    await db.execute("UPDATE `USER` SET pfp_url = ? WHERE user_id = ?", [
      uploadResult.secureUrl,
      userId,
    ]);

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
    const users = await getManagementUsers();
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
    const users = await getManagementUsers();
    const user = users.find((item) => Number(item.user_id) === Number(req.params.id));
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
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
      AND (sy.status IN ('ACTIVE', 'ONGOING') OR sy.school_year_id = ?)
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
  const { assignedFrom, assignedUntil } = getAssignmentDates(body, schoolYear);
  const role = normalizeRole(body.role);

  if (role === "department head" && body.department_id) {
    await connection.execute(
      `INSERT INTO DEPARTMENT_HEAD (department_id, user_id, school_year_id, appointed_from, appointed_until) VALUES (?, ?, ?, ?, ?)`,
      [body.department_id, userId, schoolYear.school_year_id, assignedFrom, assignedUntil]
    );
  }

  if ((role === "subject teacher" || body.is_adviser) && body.adviser_section_id) {
    await connection.execute(
      `INSERT INTO SECTION_ADVISER_ASSIGNMENT (section_id, school_year_id, user_id, assigned_from, assigned_until) VALUES (?, ?, ?, ?, ?)`,
      [body.adviser_section_id, schoolYear.school_year_id, userId, assignedFrom, assignedUntil]
    );
  }

  if (Array.isArray(body.teaching_assignments)) {
    for (const assign of body.teaching_assignments) {
      if (assign.subject_offering_id) {
        await connection.execute(
          `INSERT INTO TEACHER_ASSIGNMENT (user_id, subject_offering_id, assigned_from, assigned_until) VALUES (?, ?, ?, ?)`,
          [userId, assign.subject_offering_id, assignedFrom, assignedUntil]
        );
      }
    }
  }
};

const deleteRoleAssignments = async (connection, userId) => {
  await connection.execute(`DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE user_id = ?`, [userId]);
  await connection.execute(`DELETE FROM TEACHER_ASSIGNMENT WHERE user_id = ?`, [userId]);
  await connection.execute(`DELETE FROM DEPARTMENT_HEAD WHERE user_id = ?`, [userId]);
};

router.post("/", async (req, res) => {
  let connection;
  try {
    const { first_name, middle_name, last_name, extension_name, email, password, role: requestedRole, department_id, account_status, status } = req.body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: "Required fields missing." });
    }

    const role = normalizeRole(requestedRole);
    if (!role) {
      return res.status(400).json({ error: "Invalid role specified." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const schoolYear = await getCurrentSchoolYear(connection);
    if (!schoolYear) throw new Error("No active school year found.");

    const effectiveDepartmentId = role === "principal" ? null : (department_id ? Number(department_id) : null);

    if (role === "department head" && effectiveDepartmentId) {
      await validateSingleDepartmentHead(connection, effectiveDepartmentId, 0, schoolYear);
    }

    const hashedPassword = await hashPassword(password);

    const [result] = await connection.execute(
      `INSERT INTO USER (role, department_id, first_name, middle_name, last_name, extension_name, email, password, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), email.trim().toLowerCase(), hashedPassword, account_status || status || "active"]
    );

    const userId = result.insertId;
    await saveRoleAssignments(connection, userId, req.body, schoolYear);

    await AuditEvent.create({
      user_id: req.headers['x-auralis-user-id'] ? Number(req.headers['x-auralis-user-id']) : null,
      actor_context: { source: 'user', acting_as: 'System Administrator' },
      event_type: 'USER_ACCOUNT_CREATED',
      module_name: 'ACCOUNT_MANAGEMENT',
      entity_type: 'USER',
      entity_id: userId,
      after_data: {
        role,
        email: email.trim().toLowerCase(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        account_status: account_status || status || "active",
      },
      metadata: {
        target: `${first_name.trim()} ${last_name.trim()}`,
        summary: `Created a ${role} account for ${first_name.trim()} ${last_name.trim()}.`,
        impact: 'Medium',
      },
    }, connection);

    await connection.commit();

    const users = await getManagementUsers();
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
    const { first_name, middle_name, last_name, extension_name, email, password, role: requestedRole, department_id, account_status, status } = req.body;

    const existingUser = await User.findById(userId);
    if (!existingUser) return res.status(404).json({ error: "User not found." });

    const role = normalizeRole(requestedRole);
    if (!role) return res.status(400).json({ error: "Invalid role." });

    connection = await db.getConnection();
    await connection.beginTransaction();

    const schoolYear = await getCurrentSchoolYear(connection);
    if (!schoolYear) throw new Error("No active school year found.");

    const effectiveDepartmentId = role === "principal" ? null : (department_id ? Number(department_id) : null);

    // 1 Department Head per department
    if (role === "department head" && effectiveDepartmentId) {
      await validateSingleDepartmentHead(connection, effectiveDepartmentId, userId, schoolYear);
    }

    if (password && password.trim()) {
      const hashedPassword = await hashPassword(password);
      await connection.execute(
        `UPDATE USER SET role = ?, department_id = ?, first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, email = ?, password = ?, account_status = ? WHERE user_id = ?`,
        [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), email.trim().toLowerCase(), hashedPassword, account_status || status || "active", userId]
      );
    } else {
      await connection.execute(
        `UPDATE USER SET role = ?, department_id = ?, first_name = ?, middle_name = ?, last_name = ?, extension_name = ?, email = ?, account_status = ? WHERE user_id = ?`,
        [role, effectiveDepartmentId, first_name.trim(), toNullable(middle_name), last_name.trim(), toNullable(extension_name), email.trim().toLowerCase(), account_status || status || "active", userId]
      );
    }

    await deleteRoleAssignments(connection, userId);
    await saveRoleAssignments(connection, userId, req.body, schoolYear);

    const isStatusChanged = existingUser.account_status !== (account_status || status || "active");
    await AuditEvent.create({
      user_id: req.headers['x-auralis-user-id'] ? Number(req.headers['x-auralis-user-id']) : null,
      actor_context: { source: 'user', acting_as: 'System Administrator' },
      event_type: isStatusChanged ? 'USER_STATUS_UPDATED' : 'USER_ACCOUNT_UPDATED',
      module_name: 'ACCOUNT_MANAGEMENT',
      entity_type: 'USER',
      entity_id: userId,
      before_data: {
        role: existingUser.role,
        email: existingUser.email,
        first_name: existingUser.first_name,
        last_name: existingUser.last_name,
        account_status: existingUser.account_status,
      },
      after_data: {
        role,
        email: email.trim().toLowerCase(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        account_status: account_status || status || "active",
      },
      metadata: {
        target: `${first_name.trim()} ${last_name.trim()}`,
        summary: isStatusChanged
          ? `Changed account status to ${account_status || status || 'active'} for ${first_name.trim()} ${last_name.trim()}.`
          : `Updated account details for ${first_name.trim()} ${last_name.trim()}.`,
        impact: 'Medium',
      },
    }, connection);

    await connection.commit();

    const users = await getManagementUsers();
    const updatedUser = users.find((u) => Number(u.user_id) === Number(userId));

    res.json({ message: "User updated successfully.", user: updatedUser });
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

    await deleteRoleAssignments(connection, userId);
    await connection.execute(`DELETE FROM USER WHERE user_id = ?`, [userId]);
    await connection.commit();

    res.json({ message: "User deleted successfully." });
  } catch (err) {
    if (connection) await connection.rollback();
    sendDatabaseError(res, err);
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;