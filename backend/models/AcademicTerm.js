const db = require('../config/db');

class AcademicTerm {
  static async synchronizeStatuses(connection = db, termId = null) {
    // Match Academic Period's date-based status without changing its timeline.
    // The stored enum uses ongoing/completed for the UI's open/finalized states.
    const [result] = await connection.execute(
      `UPDATE ACADEMIC_TERM
       SET status = CASE
         WHEN starts_at > UTC_TIMESTAMP(6) THEN 'upcoming'
         WHEN grade_submission_deadline_at > UTC_TIMESTAMP(6) THEN 'ongoing'
         ELSE 'completed'
       END
       WHERE starts_at IS NOT NULL
         AND grade_submission_deadline_at IS NOT NULL
         AND grade_submission_deadline_at >= starts_at
         AND NOT (status <=> CASE
           WHEN starts_at > UTC_TIMESTAMP(6) THEN 'upcoming'
           WHEN grade_submission_deadline_at > UTC_TIMESTAMP(6) THEN 'ongoing'
           ELSE 'completed'
         END)
         ${termId === null ? '' : 'AND term_id = ?'}`,
      termId === null ? [] : [termId]
    );
    return result.affectedRows;
  }

  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM ACADEMIC_TERM');
    return rows;
  }

  static async findById(id, connection = db) {
    const [rows] = await connection.execute('SELECT * FROM ACADEMIC_TERM WHERE term_id = ?', [id]);
    return rows[0];
  }

  static async findBySchoolYear(schoolYearId) {
    const [rows] = await db.execute('SELECT * FROM ACADEMIC_TERM WHERE school_year_id = ?', [schoolYearId]);
    return rows;
  }

  static async create(data, connection = db) {
    const {
      school_year_id,
      term_name,
      starts_at,
      ends_at,
      grade_submission_deadline_at,
      reopening_requests_open_at,
      reopening_requests_close_at,
      status,
    } = data;
    const [result] = await connection.execute(
      `INSERT INTO ACADEMIC_TERM (
        school_year_id, term_name, starts_at, ends_at,
        grade_submission_deadline_at, reopening_requests_open_at,
        reopening_requests_close_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        school_year_id,
        term_name,
        starts_at,
        ends_at,
        grade_submission_deadline_at,
        reopening_requests_open_at || null,
        reopening_requests_close_at || null,
        status || 'upcoming',
      ]
    );
    await this.synchronizeStatuses(connection, result.insertId);
    return result.insertId;
  }

  static async update(id, data, connection = db) {
    const allowedFields = [
      'term_name',
      'starts_at',
      'ends_at',
      'grade_submission_deadline_at',
      'reopening_requests_open_at',
      'reopening_requests_close_at',
      'status',
    ];
    const entries = Object.entries(data).filter(([key]) => allowedFields.includes(key));
    if (!entries.length) return this.findById(id, connection);
    const keys = entries.map(([key]) => key);
    const values = entries.map(([, value]) => value);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await connection.execute(`UPDATE ACADEMIC_TERM SET ${setClause} WHERE term_id = ?`, [...values, id]);
    await this.synchronizeStatuses(connection, id);
    return this.findById(id, connection);
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM ACADEMIC_TERM WHERE term_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AcademicTerm;
