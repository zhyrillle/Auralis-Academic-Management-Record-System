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
        mapeh_component ENUM('MA', 'PEH') NULL,
        mapeh_key VARCHAR(10) GENERATED ALWAYS AS (COALESCE(mapeh_component, 'ALL')) STORED,
        initial_grade DECIMAL(6,2),
        quarterly_grade DECIMAL(6,2),
        remarks VARCHAR(50),
        created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uq_offering_student_term_comp (subject_offering_id, student_id, term, mapeh_key),
        INDEX idx_offering_term (subject_offering_id, term)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    try {
      await db.execute(createTableQuery);
    } catch (err) {
      console.error('Error initializing STUDENT_GRADE table:', err.message);
    }
  }

  static async findByOfferingAndTerm(subjectOfferingId, term, mapehComponent = null) {
    await this.initTable();
    const isOverall = !mapehComponent || mapehComponent === 'ALL';
    const compCondition = isOverall ? 'mapeh_component IS NULL' : 'mapeh_component = ?';
    const params = isOverall ? [subjectOfferingId, String(term)] : [subjectOfferingId, String(term), mapehComponent];
    const [rows] = await db.execute(
      `SELECT * FROM STUDENT_GRADE 
       WHERE subject_offering_id = ? AND term = ? AND ${compCondition}`,
      params
    );
    return rows;
  }

  static async upsert({ subject_offering_id, student_id, student_section_id, term, mapeh_component = null, initial_grade, quarterly_grade, remarks }) {
    await this.initTable();
    const finalComp = (mapeh_component && mapeh_component !== 'ALL') ? mapeh_component : null;
    const [result] = await db.execute(
      `INSERT INTO STUDENT_GRADE (
        subject_offering_id,
        student_id,
        student_section_id,
        term,
        mapeh_component,
        initial_grade,
        quarterly_grade,
        remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        finalComp,
        initial_grade !== undefined && initial_grade !== null ? initial_grade : null,
        quarterly_grade !== undefined && quarterly_grade !== null ? quarterly_grade : null,
        remarks || (quarterly_grade >= 75 ? 'Passed' : (quarterly_grade !== null ? 'Failed' : null)),
      ]
    );
    return result;
  }

  static async upsertGrade(params) {
    return this.upsert(params);
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
