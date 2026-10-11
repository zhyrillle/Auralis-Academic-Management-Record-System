const db = require('../config/db');

class Student {
  static async findAll() {
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
    return rows;
  }

  static async findById(id) {
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
    return rows[0];
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
    const [rows] = await db.execute('SELECT * FROM STUDENT WHERE LRN = ?', [lrn]);
    return rows[0];
  }

  static async create(data) {
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

    const [result] = await db.execute(
      `INSERT INTO STUDENT (LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LRN,
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
    const allowedKeys = [
      'LRN', 'first_name', 'middle_name', 'last_name', 'extension_name', 
      'birthdate', 'sex', 'street', 'barangay', 'city', 'province', 
      'country', 'postal_code', 'status', 'program_id'
    ];
    const updates = [];
    const values = [];

    for (const key of allowedKeys) {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(data[key] === '' ? null : data[key]);
      }
    }

    if (updates.length > 0) {
      values.push(id);
      await db.execute(`UPDATE STUDENT SET ${updates.join(', ')} WHERE student_id = ?`, values);
    }
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM STUDENT WHERE student_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Student;