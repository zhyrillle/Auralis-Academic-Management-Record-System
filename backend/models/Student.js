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
      LEFT JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
      WHERE s.student_id = ?
    `, [id]);
    return rows[0];
  }

  static async findByLRN(lrn) {
    const [rows] = await db.execute('SELECT * FROM STUDENT WHERE LRN = ?', [lrn]);
    return rows[0];
  }

  static async create(data) {
    const { LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status } = data;
    const [result] = await db.execute(
      `INSERT INTO STUDENT (LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [LRN, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status || 'ACTIVE']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE STUDENT SET ${setClause} WHERE student_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM STUDENT WHERE student_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = Student;