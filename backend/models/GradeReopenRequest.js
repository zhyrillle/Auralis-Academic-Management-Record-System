const db = require('../config/db');

class GradeReopenRequest {
  static async findAll() {
    try {
      const [rows] = await db.execute('SELECT * FROM GRADE_REOPEN_REQUEST ORDER BY request_id DESC');
      return rows;
    } catch (err) {
      console.error("DEBUG [GradeReopenRequest.findAll] Error:", err.message, err.stack);
      return [];
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute('SELECT * FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
      return rows[0];
    } catch (err) {
      console.error(`DEBUG [GradeReopenRequest.findById] Error for id ${id}:`, err.message);
      return null;
    }
  }

  static async findByUserId(userId) {
    try {
      const [rows] = await db.execute(
        `
      SELECT
        grr.*,
        sec.section_name,
        s.subject_name,
        gs.term_id

      FROM GRADE_REOPEN_REQUEST grr

      INNER JOIN TEACHER_ASSIGNMENT ta
        ON grr.teacher_assignment_id =
           ta.teacher_assignment_id

      INNER JOIN SUBJECT_OFFERING so
        ON ta.subject_offering_id =
           so.subject_offering_id

      INNER JOIN GRADE_SHEET gs
        ON grr.grade_sheet_id =
           gs.grade_sheet_id

      INNER JOIN SUBJECT s
        ON so.subject_id =
           s.subject_id

      INNER JOIN SECTION sec
        ON so.section_id =
           sec.section_id

      WHERE ta.user_id = ?

      ORDER BY grr.request_id DESC
      `,
        [userId]
      );

      return rows;

    } catch (err) {

      console.error(
        `DEBUG [GradeReopenRequest.findByUserId] Error for user ${userId}:`,
        err.message
      );

      return [];
    }
  }

  static async checkExistingRequest(teacherAssignmentId) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM GRADE_REOPEN_REQUEST
         WHERE teacher_assignment_id = ? 
           AND status = 'PENDING';`,
        [teacherAssignmentId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error(`DEBUG [GradeReopenRequest.checkExistingRequest] Error:`, err.message);
      return null;
    }
  }

  static async create(data) {
    try {
      const allowedKeys = [
        'grade_sheet_id',
        'teacher_assignment_id',
        'reviewed_by_user_id',
        'reason',
        'status',
        'file_name',
        'file_path',
        'file_type',
        'file_size',
        'requested_at',
        'reviewed_at'
      ];

      const fields = [];
      const placeholders = [];
      const values = [];

      for (const key of allowedKeys) {
        if (data[key] !== undefined) {
          fields.push(key);
          placeholders.push('?');
          values.push(data[key]);
        }
      }

      if (fields.length === 0) {
        throw new Error("No valid fields provided for GradeReopenRequest create");
      }

      const query = `
      INSERT INTO GRADE_REOPEN_REQUEST
      (${fields.join(', ')})
      VALUES (${placeholders.join(', ')})
    `;

      console.log("DEBUG CREATE DATA:", data);
      console.log("DEBUG INSERT QUERY:", query);
      console.log("DEBUG INSERT VALUES:", values);

      const [result] = await db.execute(query, values);

      return result.insertId;

    } catch (err) {

      throw err;
    }
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    if (keys.length === 0) return this.findById(id);

    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.execute(
      `UPDATE GRADE_REOPEN_REQUEST SET ${setClause} WHERE request_id = ?`,
      [...values, id]
    );

    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM GRADE_REOPEN_REQUEST WHERE request_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = GradeReopenRequest;