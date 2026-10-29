// Read-only submission tracking shared by the department table and summary cards.
function summarizeSubmissions(rows) {
  const offerings = new Map();
  for (const row of rows) {
    let item = offerings.get(row.subject_offering_id);
    if (!item) {
      item = { subjectOfferingId: row.subject_offering_id, teacher: row.teacher_name,
        subject: row.subject_name, gradeSection: `${row.grade_level_name} - ${row.section_name}`,
        expectedTerms: 0, submittedTerms: 0, overdueTerms: 0, lateTerms: 0 };
      offerings.set(row.subject_offering_id, item);
    }
    if (row.term_id == null) continue;
    item.expectedTerms += 1;
    if (Number(row.is_submitted)) {
      item.submittedTerms += 1;
      if (Number(row.submitted_late)) item.lateTerms += 1;
    } else if (Number(row.deadline_passed)) {
      item.overdueTerms += 1;
    }
  }
  return [...offerings.values()].map(item => ({ ...item,
    status: !item.expectedTerms ? 'Not configured' : item.overdueTerms ? 'Overdue'
      : item.submittedTerms === item.expectedTerms ? (item.lateTerms ? 'Submitted late' : 'Submitted') : 'Pending',
    completion: item.expectedTerms ? Math.round(item.submittedTerms / item.expectedTerms * 100) : null,
  }));
}

function submissionTotals(items) {
  const total = items.reduce((sum, item) => ({
    expected: sum.expected + item.expectedTerms,
    submitted: sum.submitted + item.submittedTerms,
    overdue: sum.overdue + item.overdueTerms,
  }), { expected: 0, submitted: 0, overdue: 0 });
  return { submittedGrades: total.submitted,
    submittedGradesPercent: total.expected ? Math.round(total.submitted / total.expected * 100) : 0,
    delayedSubmissions: total.overdue };
}

async function getSubmissionMonitor(db, departmentId, filters = {}) {
  const quarter = String(filters.quarter || '').trim().toLowerCase();
  const termName = ['', 'all', 'overall'].includes(quarter) ? null
    : ({ '1': '1st', '2': '2nd', '3': '3rd' }[quarter] || quarter);
  const params = termName ? [termName, departmentId] : [departmentId];
  let sql = `SELECT so.subject_offering_id, s.subject_name, gl.grade_level_name, sec.section_name,
    GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.first_name, u.last_name SEPARATOR ', ') AS teacher_name,
    at.term_id,
    COALESCE(MAX(gs.workflow_status = 'SUBMITTED'), 0) AS is_submitted,
    at.grade_submission_deadline_at <= UTC_TIMESTAMP(6) AS deadline_passed,
    MIN(CASE WHEN gs.workflow_status = 'SUBMITTED' THEN gs.submitted_at END) > at.grade_submission_deadline_at AS submitted_late
    FROM SUBJECT_OFFERING so
    JOIN SUBJECT s ON so.subject_id = s.subject_id
    JOIN SECTION sec ON so.section_id = sec.section_id
    JOIN GRADE_LEVEL gl ON sec.grade_level_id = gl.grade_level_id
    JOIN SCHOOL_YEAR sy ON so.school_year_id = sy.school_year_id
    JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
    JOIN USER u ON ta.user_id = u.user_id
    LEFT JOIN ACADEMIC_TERM at ON at.school_year_id = sy.school_year_id ${termName ? 'AND at.term_name = ?' : ''}
    LEFT JOIN GRADE_SHEET gs ON gs.subject_offering_id = so.subject_offering_id AND gs.term_id = at.term_id
    WHERE s.department_id = ? AND u.first_name IS NOT NULL`;
  if (filters.schoolYear && filters.schoolYear !== 'All') {
    sql += ' AND sy.starts_on = ?';
    params.push(filters.schoolYear.split('-')[0]);
  }
  if (filters.gradeLevel && filters.gradeLevel !== 'All') {
    sql += ' AND gl.grade_level_name = ?';
    params.push(filters.gradeLevel);
  }
  // One row per offering and configured term, regardless of teacher/sheet duplicates.
  sql += ` GROUP BY so.subject_offering_id, s.subject_name, gl.grade_level_name, sec.section_name,
    at.term_id, at.grade_submission_deadline_at
    ORDER BY gl.grade_level_name, sec.section_name, s.subject_name, so.subject_offering_id, at.term_id`;
  const [rows] = await db.query(sql, params);
  return summarizeSubmissions(rows);
}

module.exports = { getSubmissionMonitor, summarizeSubmissions, submissionTotals };
