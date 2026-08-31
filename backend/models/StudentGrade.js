const db = require('../config/db');

class StudentGrade {
  static async initTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS STUDENT_GRADE (
        student_grade_id BIGINT PRIMARY KEY AUTO_INCREMENT,
        subject_offering_id BIGINT NOT NULL,
        student_id BIGINT NOT NULL,
        student_section_id BIGINT,
        term VARCHAR(20) NOT NULL,
        initial_grade DECIMAL(6,2),
        quarterly_grade DECIMAL(6,2),
        remarks VARCHAR(50),
        created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uq_offering_student_term (subject_offering_id, student_id, term),
        INDEX idx_offering_term (subject_offering_id, term)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    try {
      await db.execute(createTableQuery);
    } catch (err) {
      console.error('Error initializing STUDENT_GRADE table:', err.message);
    }
  }

  static async findByOfferingAndTerm(subjectOfferingId, term) {
    await this.initTable();
    const [rows] = await db.execute(
      `SELECT * FROM STUDENT_GRADE 
       WHERE subject_offering_id = ? AND term = ?`,
      [subjectOfferingId, String(term)]
    );
    return rows;
  }

  static async upsert({ subject_offering_id, student_id, student_section_id, term, initial_grade, quarterly_grade, remarks }) {
    await this.initTable();
    const [result] = await db.execute(
      `INSERT INTO STUDENT_GRADE (
        subject_offering_id,
        student_id,
        student_section_id,
        term,
        initial_grade,
        quarterly_grade,
        remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        student_section_id = VALUES(student_section_id),
        initial_grade = VALUES(initial_grade),
        quarterly_grade = VALUES(quarterly_grade),
        remarks = VALUES(remarks),
        updated_at = NOW(6)`,
      [
        subject_offering_id,
        student_id,
        student_section_id || null,
        String(term),
        initial_grade !== undefined && initial_grade !== null ? initial_grade : null,
        quarterly_grade !== undefined && quarterly_grade !== null ? quarterly_grade : null,
        remarks || (quarterly_grade >= 75 ? 'Passed' : (quarterly_grade !== null ? 'Failed' : null)),
      ]
    );
    return result;
  }

  static async upsertBatch(records) {
    if (!Array.isArray(records) || records.length === 0) return;
    await this.initTable();

    for (const record of records) {
      await this.upsert(record);
    }
  }
}

module.exports = StudentGrade;
