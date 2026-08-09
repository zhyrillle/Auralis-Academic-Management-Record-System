const db = require('../config/db');

class AcademicTerm {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ACADEMIC_TERM');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM ACADEMIC_TERM WHERE term_id = ?', [id]);
    return rows[0];
  }

  static async findBySchoolYear(schoolYearId) {
    const [rows] = await db.execute('SELECT * FROM ACADEMIC_TERM WHERE school_year_id = ?', [schoolYearId]);
    return rows;
  }

  static async create(data) {
    const { school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status } = data;
    const [result] = await db.execute(
      `INSERT INTO ACADEMIC_TERM (school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, status || 'upcoming']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE ACADEMIC_TERM SET ${setClause} WHERE term_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ACADEMIC_TERM WHERE term_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AcademicTerm;