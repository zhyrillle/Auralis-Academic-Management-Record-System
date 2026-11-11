const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../config/db');
const Service = require('../services/SectionDetailsService');
const Monitoring = require('../services/StudentMonitoringService');
const { getTermPosition } = require('../services/MasterSheetService');

// Explicit opt-in: uses existing local records inside a read-only transaction.
test('local teaching results match Principal Student Monitoring on existing records', {
  skip: process.env.AURALIS_LOCAL_MONITORING_CHECK !== '1',
}, async () => {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(db.pool.config.connectionConfig.host), 'Local database required');
  const connection = await db.getConnection();
  let reads = 0;
  const readOnly = { execute: async (sql, params = []) => {
    assert.match(sql, /^\s*SELECT\b/i, 'Verification must not write records');
    reads++;
    return connection.execute(sql, params);
  } };
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [assignments] = await readOnly.execute(`SELECT ta.teacher_assignment_id, ta.user_id,
      so.school_year_id, so.subject_id, so.subject_offering_id, s.subject_code, s.subject_name, sec.section_name,
      t.term_name, COUNT(DISTINCT ga.activity_id) AS activity_count
      FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      JOIN SUBJECT s ON s.subject_id = so.subject_id
      JOIN SECTION sec ON sec.section_id = so.section_id
      JOIN STUDENT_SECTION enrollment ON enrollment.section_id = so.section_id AND enrollment.school_year_id = so.school_year_id
      JOIN STUDENT st ON st.student_id = enrollment.student_id AND (st.status = 'ACTIVE' OR st.status IS NULL)
      JOIN ACADEMIC_TERM t ON t.school_year_id = so.school_year_id
      LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = t.term_id
      LEFT JOIN GRADE_ACTIVITY ga ON ga.grade_sheet_id = gs.grade_sheet_id
      WHERE t.starts_at <= UTC_TIMESTAMP()
      GROUP BY ta.teacher_assignment_id, ta.user_id, so.school_year_id, so.subject_id,
        so.subject_offering_id, s.subject_code, s.subject_name, sec.section_name, t.term_name
      ORDER BY so.school_year_id DESC, activity_count DESC, ta.teacher_assignment_id`);
    const selected = ['ENG', 'MATH', 'FIL', 'MAPEH'].map(code => {
      const matches = assignments.filter(row =>
        (String(row.subject_code).toUpperCase() === code || (code === 'ENG' && /^english$/i.test(row.subject_name)))
        && [1, 2, 3].includes(getTermPosition(row.term_name)));
      return (code === 'ENG' && matches.find(row => row.section_name === 'Banana')) || matches[0];
    });
    assert.ok(selected.every(Boolean), 'Existing populated assignments are required for English, Mathematics, Filipino and MAPEH');
    for (const assignment of selected) {
      const term = `T${getTermPosition(assignment.term_name)}`;
      const teacher = await Service.getSectionDetails({ assignmentType: 'teaching',
        assignmentId: assignment.teacher_assignment_id, userId: assignment.user_id, term }, readOnly);
      const principal = await Monitoring.getPreview(readOnly, { schoolYear: String(assignment.school_year_id),
        subject: String(assignment.subject_id), term });
      const expected = new Map(principal.students.filter(row => row.subjectOfferingId === Number(assignment.subject_offering_id))
        .map(row => [row.studentSectionId, row.academic]));
      assert.ok(teacher.learners.length > 0, 'A nonempty existing class is required');
      for (const learner of teacher.learners) assert.deepEqual(learner.academic, expected.get(learner.studentSectionId));
      console.log(`Local ${assignment.subject_code} ${term}: ${teacher.learners.length} matching learners; ${teacher.summary.displayGradeCount} running previews.`);
    }
    console.log(`Read-only verification: ${reads} SELECT statements; no record writes.`);
  } finally {
    await connection.rollback(); connection.release();
    await db.end(); if (db.cloudPool) await db.cloudPool.end();
  }
});
