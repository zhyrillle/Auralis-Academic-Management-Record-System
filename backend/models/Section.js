const db = require('../config/db');

class Section {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM SECTION');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM SECTION WHERE section_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { section_name, grade_level_id } = data;
    const [result] = await db.execute(
      `INSERT INTO SECTION (section_name, grade_level_id) VALUES (?, ?)`,
      [section_name, grade_level_id]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE SECTION SET ${setClause} WHERE section_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM SECTION WHERE section_id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async findAdviserSections(userId) {
    // 1. Advisory Sections for user (via SECTION_ADVISER_ASSIGNMENT or direct SECTION.user_id)
    const [advisoryRows] = await db.execute(
      `SELECT DISTINCT
         sec.section_id,
         sec.section_name,
         gl.grade_level_id,
         gl.grade_level_name,
         'Advisory Class' AS class_type,
         sy.ends_on AS school_year_end
       FROM SECTION sec
       INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id
       LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
       WHERE (saa.user_id = ? OR sec.user_id = ?)
       ORDER BY gl.grade_level_id ASC, sec.section_name ASC`,
      [userId, userId]
    );

    // 2. Regular / Teaching Classes for user (via TEACHER_ASSIGNMENT)
    const [teacherRows] = await db.execute(
      `SELECT DISTINCT
         ta.teacher_assignment_id,
         so.subject_offering_id,
         so.subject_id,
         sec.section_id,
         sec.section_name,
         gl.grade_level_id,
         gl.grade_level_name,
         s.subject_name,
         'Regular Class' AS class_type,
         sy.ends_on AS school_year_end
       FROM TEACHER_ASSIGNMENT ta
       INNER JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
       INNER JOIN SECTION sec ON sec.section_id = so.section_id
       INNER JOIN SUBJECT s ON s.subject_id = so.subject_id
       INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
       LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = so.school_year_id
       WHERE ta.user_id = ?
       ORDER BY gl.grade_level_id ASC, sec.section_name ASC`,
      [userId]
    );

    // Map section_id -> subject_name taught in that section
    const sectionSubjectMap = {};
    teacherRows.forEach((row) => {
      if (row.section_id && row.subject_name) {
        sectionSubjectMap[row.section_id] = row.subject_name;
      }
    });

    const result = [];
    const addedSectionIds = new Set();

    // 1. Process Advisory Classes first (one single card per advisory section)
    for (const row of advisoryRows) {
      if (!addedSectionIds.has(row.section_id)) {
        addedSectionIds.add(row.section_id);
        const gradeNum = parseInt(String(row.grade_level_name).replace(/\D/g, "")) || "";
        const subjectName = sectionSubjectMap[row.section_id] || "Mathematics";
        result.push({
          id: `sec-${row.section_id}`,
          section_id: row.section_id,
          sectionName: row.section_name,
          gradeLevel: gradeNum ? `G${gradeNum}` : row.grade_level_name,
          grade_level_name: row.grade_level_name,
          subject: subjectName,
          classType: "Advisory Class",
          deadline: row.school_year_end ? String(row.school_year_end).slice(0, 10) : "2026-07-31",
          submitted: false,
        });
      }
    }

    // 2. Process Regular Teaching Classes for other sections (deduplicated by section_id)
    for (const row of teacherRows) {
      if (!addedSectionIds.has(row.section_id)) {
        addedSectionIds.add(row.section_id);
        const gradeNum = parseInt(String(row.grade_level_name).replace(/\D/g, "")) || "";
        result.push({
          id: `sec-${row.section_id}`,
          section_id: row.section_id,
          subject_id: row.subject_id,
          subject_offering_id: row.subject_offering_id,
          sectionName: row.section_name,
          gradeLevel: gradeNum ? `G${gradeNum}` : row.grade_level_name,
          grade_level_name: row.grade_level_name,
          subject: row.subject_name || "Mathematics",
          classType: "Regular Class",
          deadline: row.school_year_end ? String(row.school_year_end).slice(0, 10) : "2026-08-15",
          submitted: false,
        });
      }
    }

    return result;
  }

  static async findStudentsBySection(sectionId) {
    const [rows] = await db.execute(
      `SELECT 
         s.student_id AS id,
         s.LRN AS lrn,
         s.first_name AS firstName,
         s.last_name AS lastName,
         s.middle_name AS middleName,
         s.sex
       FROM STUDENT_SECTION ss
       INNER JOIN STUDENT s ON s.student_id = ss.student_id
       WHERE ss.section_id = ?
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [sectionId]
    );
    return rows;
  }
}

module.exports = Section;