const db = require('../config/db');
const { encryptLrn, decryptLrn, hashLrn, maskLrn } = require('../utils/encryption');

let isTableInitialized = false;

class Student {
  static formatRow(row) {
    if (!row) return null;
    const rawLrn = row.LRN || row.lrn;
    const plainLrn = decryptLrn(rawLrn);
    return {
      ...row,
      LRN: plainLrn,
      lrn: plainLrn,
      masked_lrn: maskLrn(plainLrn),
    };
  }

  static async initTable() {
    if (isTableInitialized) return;
    try {
      // 1. Ensure LRN column is VARCHAR(255) for encrypted string
      await db.execute('ALTER TABLE STUDENT MODIFY COLUMN LRN VARCHAR(255) NOT NULL');
    } catch (_) {}

    try {
      // 2. Ensure lrn_hash column exists for blind index
      await db.execute('ALTER TABLE STUDENT ADD COLUMN lrn_hash VARCHAR(64) NULL');
    } catch (_) {}

    try {
      // 3. Ensure blind index is indexed
      await db.execute('CREATE INDEX idx_student_lrn_hash ON STUDENT (lrn_hash)');
    } catch (_) {}

    try {
      // 4. Backfill any unencrypted LRNs
      const [rows] = await db.execute("SELECT student_id, LRN FROM STUDENT WHERE LRN IS NOT NULL AND LRN NOT LIKE 'enc:v1:%' LIMIT 500");
      for (const row of rows) {
        if (row.LRN && !String(row.LRN).startsWith('enc:v1:')) {
          const enc = encryptLrn(row.LRN);
          const hash = hashLrn(row.LRN);
          await db.execute('UPDATE STUDENT SET LRN = ?, lrn_hash = ? WHERE student_id = ?', [enc, hash, row.student_id]);
        }
      }
    } catch (e) {
      console.warn('Student LRN backfill notice:', e.message);
    }
    isTableInitialized = true;
  }

  static async findAll() {
    await this.initTable();
    const [rows] = await db.execute(`
      SELECT 
        s.student_id,
        s.student_id AS id,
        s.LRN,
        s.LRN AS lrn,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.extension_name,
        TRIM(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name, ' ', COALESCE(s.extension_name, ''))) AS name,
        s.sex,
        s.birthdate,
        s.street,
        s.barangay,
        s.city,
        s.province,
        s.country,
        s.postal_code,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND sec.program_id IS NOT NULL THEN sec.program_id END,
          s.program_id,
          4
        ) AS program_id,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.program_code IS NOT NULL THEN p_sec.program_code END,
          p_stu.program_code,
          'EBEC'
        ) AS program_code,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.program_name IS NOT NULL THEN p_sec.program_name END,
          p_stu.program_name,
          'Enhanced Basic Education Curriculum'
        ) AS program_name,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.is_specialized IS NOT NULL THEN p_sec.is_specialized END,
          p_stu.is_specialized,
          0
        ) AS is_specialized,
        COALESCE(s.status, 'Active') AS status,
        latest_ss.student_section_id,
        latest_ss.section_id,
        latest_ss.school_year_id,
        sec.section_name,
        COALESCE(sec.section_name, 'Unassigned') AS section,
        sec.grade_level_id,
        COALESCE(gl.grade_level_name, 'Unassigned') AS grade_level_name,
        COALESCE(gl.grade_level_name, 'Unassigned') AS gradeLevel
      FROM STUDENT s
      LEFT JOIN (
        SELECT ss1.*
        FROM STUDENT_SECTION ss1
        INNER JOIN (
          SELECT student_id, MAX(student_section_id) as max_id
          FROM STUDENT_SECTION
          GROUP BY student_id
        ) ss2 ON ss1.student_section_id = ss2.max_id
      ) latest_ss ON latest_ss.student_id = s.student_id
      LEFT JOIN SECTION sec ON sec.section_id = latest_ss.section_id
      LEFT JOIN PROGRAM p_sec ON p_sec.program_id = sec.program_id
      LEFT JOIN PROGRAM p_stu ON p_stu.program_id = s.program_id
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      ORDER BY s.last_name ASC, s.first_name ASC
    `);
    return rows.map((r) => this.formatRow(r));
  }

  static async findById(id) {
    await this.initTable();
    const [rows] = await db.execute(`
      SELECT 
        s.student_id,
        s.student_id AS id,
        s.LRN,
        s.LRN AS lrn,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.extension_name,
        TRIM(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name, ' ', COALESCE(s.extension_name, ''))) AS name,
        s.sex,
        s.birthdate,
        s.street,
        s.barangay,
        s.city,
        s.province,
        s.country,
        s.postal_code,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND sec.program_id IS NOT NULL THEN sec.program_id END,
          s.program_id,
          4
        ) AS program_id,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.program_code IS NOT NULL THEN p_sec.program_code END,
          p_stu.program_code,
          'EBEC'
        ) AS program_code,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.program_name IS NOT NULL THEN p_sec.program_name END,
          p_stu.program_name,
          'Enhanced Basic Education Curriculum'
        ) AS program_name,
        COALESCE(
          CASE WHEN sec.is_specialized = 1 AND p_sec.is_specialized IS NOT NULL THEN p_sec.is_specialized END,
          p_stu.is_specialized,
          0
        ) AS is_specialized,
        COALESCE(s.status, 'Active') AS status,
        latest_ss.student_section_id,
        latest_ss.section_id,
        latest_ss.school_year_id,
        sec.section_name,
        COALESCE(sec.section_name, 'Unassigned') AS section,
        sec.grade_level_id,
        COALESCE(gl.grade_level_name, 'Unassigned') AS grade_level_name,
        COALESCE(gl.grade_level_name, 'Unassigned') AS gradeLevel
      FROM STUDENT s
      LEFT JOIN (
        SELECT ss1.*
        FROM STUDENT_SECTION ss1
        INNER JOIN (
          SELECT student_id, MAX(student_section_id) as max_id
          FROM STUDENT_SECTION
          GROUP BY student_id
        ) ss2 ON ss1.student_section_id = ss2.max_id
      ) latest_ss ON latest_ss.student_id = s.student_id
      LEFT JOIN SECTION sec ON sec.section_id = latest_ss.section_id
      LEFT JOIN PROGRAM p_sec ON p_sec.program_id = sec.program_id
      LEFT JOIN PROGRAM p_stu ON p_stu.program_id = s.program_id
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      WHERE s.student_id = ?
    `, [id]);
    return rows.length > 0 ? this.formatRow(rows[0]) : null;
  }

  static async findAllPrograms() {
    const [rows] = await db.execute(`
      SELECT program_id, program_code, program_name, is_specialized
      FROM PROGRAM
      ORDER BY program_id ASC
    `);
    return rows;
  }

  static async findByLRN(lrn) {
    await this.initTable();
    const searchHash = hashLrn(lrn);
    const cleanLrn = String(lrn).trim();
    const [rows] = await db.execute(
      'SELECT * FROM STUDENT WHERE lrn_hash = ? OR LRN = ?',
      [searchHash, cleanLrn]
    );
    return rows.length > 0 ? this.formatRow(rows[0]) : null;
  }

  static async create(data) {
    await this.initTable();
    const {
      LRN,
      first_name,
      middle_name = null,
      last_name,
      extension_name = null,
      birthdate = null,
      sex = 'M',
      street = null,
      barangay = null,
      city = null,
      province = null,
      country = null,
      postal_code = null,
      status = 'ACTIVE',
      program_id = null,
    } = data;

    const cleanLrn = String(LRN).trim();
    const encryptedLrn = encryptLrn(cleanLrn);
    const lrnHash = hashLrn(cleanLrn);

    const [result] = await db.execute(
      `INSERT INTO STUDENT (LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        encryptedLrn,
        lrnHash,
        first_name,
        middle_name || null,
        last_name,
        extension_name || null,
        birthdate || null,
        sex || 'M',
        street || null,
        barangay || null,
        city || null,
        province || null,
        country || null,
        postal_code || null,
        status || 'ACTIVE',
        program_id || null,
      ]
    );
    return result.insertId;
  }

  static async update(id, data) {
    await this.initTable();
    const allowedKeys = [
      'LRN', 'first_name', 'middle_name', 'last_name', 'extension_name', 
      'birthdate', 'sex', 'street', 'barangay', 'city', 'province', 
      'country', 'postal_code', 'status', 'program_id'
    ];
    const updates = [];
    const values = [];

    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        if (key === 'LRN') {
          const clean = String(data.LRN).trim();
          updates.push('LRN = ?', 'lrn_hash = ?');
          values.push(encryptLrn(clean), hashLrn(clean));
        } else {
          updates.push(`${key} = ?`);
          values.push(data[key] === '' ? null : data[key]);
        }
      }
    }

    if (updates.length > 0) {
      values.push(id);
      await db.execute(`UPDATE STUDENT SET ${updates.join(', ')} WHERE student_id = ?`, values);
    }
    return this.findById(id);
  }

  static async delete(id) {
    const q = (sql, params) => db.execute(sql, params).catch(() => {});
    const [ssRows] = await db.execute('SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ?', [id]).catch(() => [[]]);
    for (const ss of ssRows) {
      await q('DELETE FROM ATTENDANCE WHERE student_section_id = ?', [ss.student_section_id]);
      await q('DELETE FROM PHIL_IRI_ASSESSMENT WHERE student_section_id = ?', [ss.student_section_id]);
      await q('DELETE FROM PHIL_IRI_SCREENING WHERE student_section_id = ?', [ss.student_section_id]);
      await q('DELETE FROM SCORE WHERE student_section_id = ?', [ss.student_section_id]);
    }
    await q('DELETE FROM STUDENT_GRADE WHERE student_id = ?', [id]);
    await q('DELETE FROM STUDENT_SECTION WHERE student_id = ?', [id]);
    const [result] = await db.execute('DELETE FROM STUDENT WHERE student_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Student;