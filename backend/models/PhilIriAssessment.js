const db = require('../config/db');

class PhilIriAssessment {
  static async findBySection(sectionId, testType, subjectOfferingId = null) {
    let sql = `
      SELECT 
        pia.*,
        ss.student_id,
        ss.section_id,
        st.LRN AS lrn,
        st.first_name,
        st.last_name,
        st.middle_name,
        st.sex
      FROM PHIL_IRI_ASSESSMENT pia
      JOIN STUDENT_SECTION ss ON pia.student_section_id = ss.student_section_id
      JOIN STUDENT st ON ss.student_id = st.student_id
      WHERE ss.section_id = ? AND pia.test_type = ?
    `;
    const params = [sectionId, testType];

    if (subjectOfferingId) {
      sql += ` AND (pia.subject_offering_id = ? OR pia.subject_offering_id IS NULL)`;
      params.push(subjectOfferingId);
    }

    sql += ` ORDER BY st.sex ASC, st.last_name ASC, st.first_name ASC`;

    const [rows] = await db.execute(sql, params);
    return rows;
  }

  static async upsertBatch(records) {
    if (!Array.isArray(records) || records.length === 0) {
      return { affectedRows: 0 };
    }

    const validRecords = records.filter(r => r && r.student_section_id);
    if (validRecords.length === 0) {
      return { affectedRows: 0 };
    }

    const valueClauses = [];
    const params = [];

    for (const rec of validRecords) {
      valueClauses.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const oralPct = Number(rec.oral_reading_percent);
      const compPct = Number(rec.comp_score_percent);

      params.push(
        Number(rec.student_section_id),
        rec.subject_offering_id ? Number(rec.subject_offering_id) : null,
        rec.test_type === 'POST_TEST' ? 'POST_TEST' : 'PRE_TEST',
        Number(rec.passage_words_count) || 70,
        Number(rec.words_correct) || 0,
        isNaN(oralPct) ? 0.0 : oralPct,
        rec.oral_reading_level || 'FRUSTRATION',
        Number(rec.total_comp_items) || 5,
        Number(rec.comp_correct) || 0,
        isNaN(compPct) ? 0.0 : compPct,
        rec.comp_reading_level || 'FRUSTRATION',
        rec.overall_reading_level || 'FRUSTRATION',
        rec.user_id ? Number(rec.user_id) : (rec.recorded_by ? Number(rec.recorded_by) : null)
      );
    }

    const sql = `
      INSERT INTO PHIL_IRI_ASSESSMENT (
        student_section_id,
        subject_offering_id,
        test_type,
        passage_words_count,
        words_correct,
        oral_reading_percent,
        oral_reading_level,
        total_comp_items,
        comp_correct,
        comp_score_percent,
        comp_reading_level,
        overall_reading_level,
        user_id
      ) VALUES ${valueClauses.join(', ')}
      ON DUPLICATE KEY UPDATE
        subject_offering_id = COALESCE(VALUES(subject_offering_id), subject_offering_id),
        passage_words_count = VALUES(passage_words_count),
        words_correct = VALUES(words_correct),
        oral_reading_percent = VALUES(oral_reading_percent),
        oral_reading_level = VALUES(oral_reading_level),
        total_comp_items = VALUES(total_comp_items),
        comp_correct = VALUES(comp_correct),
        comp_score_percent = VALUES(comp_score_percent),
        comp_reading_level = VALUES(comp_reading_level),
        overall_reading_level = VALUES(overall_reading_level),
        user_id = COALESCE(VALUES(user_id), user_id),
        updated_at = CURRENT_TIMESTAMP
    `;

    const [result] = await db.execute(sql, params);
    return result;
  }
}

module.exports = PhilIriAssessment;
