const db = require('../config/db');

class GradeSheetReview {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM GRADE_SHEET_REVIEW');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM GRADE_SHEET_REVIEW WHERE review_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { grade_sheet_id, adviser_assignment_id, decision, reason } = data;
    const [result] = await db.execute(
      `INSERT INTO GRADE_SHEET_REVIEW (grade_sheet_id, adviser_assignment_id, decision, reason) 
       VALUES (?, ?, ?, ?)`,
      [grade_sheet_id, adviser_assignment_id, decision, reason]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(`UPDATE GRADE_SHEET_REVIEW SET ${setClause} WHERE review_id = ?`, [...values, id]);
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_SHEET_REVIEW WHERE review_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeSheetReview;