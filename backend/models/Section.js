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
    let advisoryRows = [];
    try {
      // 1. Advisory Sections for user (via SECTION_ADVISER_ASSIGNMENT)
      const [rows] = await db.execute(
        `SELECT DISTINCT
           sec.section_id,
           sec.section_name,
           sec.is_specialized,
           gl.grade_level_id,
           gl.grade_level_name,
           'Advisory Class' AS class_type,
           sy.ends_on AS school_year_end
         FROM SECTION_ADVISER_ASSIGNMENT saa
         INNER JOIN SECTION sec ON sec.section_id = saa.section_id
         INNER JOIN GRADE_LEVEL gl ON gl.grade_level_id = sec.grade_level_id
         LEFT JOIN SCHOOL_YEAR sy ON sy.school_year_id = saa.school_year_id
         WHERE saa.user_id = ?
         ORDER BY gl.grade_level_id ASC, sec.section_name ASC`,
        [userId]
      );
      advisoryRows = rows;
    } catch (err) {
      console.warn('Advisory sections query error:', err.message);
    }

    let teacherRows = [];
    try {
      // 2. Regular / Teaching Classes for user (via TEACHER_ASSIGNMENT)
      const [rows] = await db.execute(
        `SELECT DISTINCT
           ta.teacher_assignment_id,
           so.subject_offering_id,
           so.subject_id,
           sec.section_id,
           sec.section_name,
           sec.is_specialized,
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
      teacherRows = rows;
    } catch (err) {
      console.warn('Teacher sections query error:', err.message);
    }

    // Map section_id -> subject_name taught in that section
    const sectionSubjectMap = {};
    teacherRows.forEach((row) => {
      if (row.section_id && row.subject_name) {
        sectionSubjectMap[row.section_id] = row.subject_name;
      }
    });

    const checkIsSpecialized = (val) => {
      if (val === null || val === undefined) return false;
      if (val === 1 || val === "1" || val === true || val === "true") return true;
      if (typeof val === "number" && val > 0) return true;
      return false;
    };

    const result = [];
    const addedSectionIds = new Set();

    // 1. Process Advisory Classes first (one single card per advisory section)
    for (const row of advisoryRows) {
      if (!addedSectionIds.has(row.section_id)) {
        addedSectionIds.add(row.section_id);
        const gradeNum = parseInt(String(row.grade_level_name).replace(/\D/g, "")) || "";
        const subjectName = sectionSubjectMap[row.section_id] || "Mathematics";
        const isSpecialized = checkIsSpecialized(row.is_specialized);
        result.push({
          id: `sec-${row.section_id}`,
          section_id: row.section_id,
          sectionName: row.section_name,
          gradeLevel: gradeNum ? `G${gradeNum}` : row.grade_level_name,
          grade_level_name: row.grade_level_name,
          subject: subjectName,
          classType: isSpecialized ? "Special Program" : "Advisory Class",
          is_specialized: isSpecialized ? 1 : 0,
          isAdviser: true,
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
        const isSpecialized = checkIsSpecialized(row.is_specialized);
        result.push({
          id: `sec-${row.section_id}`,
          section_id: row.section_id,
          subject_id: row.subject_id,
          subject_offering_id: row.subject_offering_id,
          sectionName: row.section_name,
          gradeLevel: gradeNum ? `G${gradeNum}` : row.grade_level_name,
          grade_level_name: row.grade_level_name,
          subject: row.subject_name || "Mathematics",
          classType: isSpecialized ? "Special Program" : "Regular Class",
          is_specialized: isSpecialized ? 1 : 0,
          isAdviser: false,
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
         s.student_id,
         ss.student_section_id,
         s.LRN AS lrn,
         s.first_name AS firstName,
         s.last_name AS lastName,
         s.middle_name AS middleName,
         s.sex,
         MAX(CASE WHEN sg.term IN ('T1', '1st Term', 'Quarter 1', '1') THEN sg.quarterly_grade END) AS term1,
         MAX(CASE WHEN sg.term IN ('T2', '2nd Term', 'Quarter 2', '2') THEN sg.quarterly_grade END) AS term2,
         MAX(CASE WHEN sg.term IN ('T3', '3rd Term', 'Quarter 3', '3') THEN sg.quarterly_grade END) AS term3
       FROM STUDENT_SECTION ss
       INNER JOIN STUDENT s ON s.student_id = ss.student_id
       LEFT JOIN STUDENT_GRADE sg ON sg.student_id = s.student_id
       WHERE ss.section_id = ?
       GROUP BY ss.student_section_id, s.student_id, s.LRN, s.first_name, s.last_name, s.middle_name, s.sex
       ORDER BY s.last_name ASC, s.first_name ASC`,
      [sectionId]
    );
    return rows.map((r) => ({
      ...r,
      term1: r.term1 !== null && r.term1 !== undefined ? Number(r.term1) : "",
      term2: r.term2 !== null && r.term2 !== undefined ? Number(r.term2) : "",
      term3: r.term3 !== null && r.term3 !== undefined ? Number(r.term3) : "",
    }));
  }
}

module.exports = Section;