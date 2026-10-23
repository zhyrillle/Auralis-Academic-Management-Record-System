const db = require('../config/db');

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const positiveId = value => Number.isInteger(Number(value)) && Number(value) > 0;
const termPosition = name => {
  const value = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return [1, 2, 3].find(n => value.includes(String(n))
    || value.startsWith(['', 'FIRST', 'SECOND', 'THIRD'][n])) || null;
};
const timestamp = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

class GradeSubmissionStatusService {
  static async read(query, user, database = db) {
    if (!positiveId(user?.user_id)) throw fail(401, 'Sign in to view submission status.');
    const byAdviser = query.adviserAssignmentId != null;
    const byOffering = query.subjectOfferingId != null;
    if (byAdviser === byOffering || !positiveId(byAdviser ? query.adviserAssignmentId : query.subjectOfferingId)) {
      throw fail(400, 'Select one valid advisory assignment or subject offering.');
    }
    const [scopeRows] = byAdviser
      ? await database.execute(`SELECT saa.section_id, saa.school_year_id
          FROM SECTION_ADVISER_ASSIGNMENT saa
          WHERE saa.adviser_assignment_id = ? AND saa.user_id = ?`,
        [Number(query.adviserAssignmentId), Number(user.user_id)])
      : await database.execute(`SELECT DISTINCT so.section_id, so.school_year_id
          FROM SUBJECT_OFFERING so JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
          WHERE so.subject_offering_id = ? AND ta.user_id = ?`,
        [Number(query.subjectOfferingId), Number(user.user_id)]);
    if (scopeRows.length !== 1) throw fail(403, 'This class is not assigned to you.');
    const scope = scopeRows[0];
    const [offerings] = await database.execute(`SELECT so.subject_offering_id, s.subject_name
        FROM SUBJECT_OFFERING so JOIN SUBJECT s ON s.subject_id = so.subject_id
        WHERE so.section_id = ? AND so.school_year_id = ?${byOffering ? ' AND so.subject_offering_id = ?' : ''}
        ORDER BY s.subject_name, so.subject_offering_id`,
      [scope.section_id, scope.school_year_id, ...(byOffering ? [Number(query.subjectOfferingId)] : [])]);
    const [terms] = await database.execute(`SELECT term_id, term_name FROM ACADEMIC_TERM
        WHERE school_year_id = ? ORDER BY term_id`, [scope.school_year_id]);
    const [sheets] = await database.execute(`SELECT gs.grade_sheet_id, gs.subject_offering_id, gs.term_id,
        gs.workflow_status, gs.lock_status, gs.submitted_at
        FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
        WHERE so.section_id = ? AND so.school_year_id = ?${byOffering ? ' AND so.subject_offering_id = ?' : ''}`,
      [scope.section_id, scope.school_year_id, ...(byOffering ? [Number(query.subjectOfferingId)] : [])]);
    const [teachers] = await database.execute(`SELECT ta.subject_offering_id, u.first_name, u.last_name
        FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
        JOIN USER u ON u.user_id = ta.user_id
        WHERE so.section_id = ? AND so.school_year_id = ?${byOffering ? ' AND so.subject_offering_id = ?' : ''}
        ORDER BY u.last_name, u.first_name`,
      [scope.section_id, scope.school_year_id, ...(byOffering ? [Number(query.subjectOfferingId)] : [])]);
    // The assigned teacher is not necessarily the actor who submitted a sheet.
    // Only use an audit entry belonging to the latest saved submission attempt.
    const [actors] = await database.execute(`SELECT a.entity_id AS grade_sheet_id, a.user_id, u.first_name, u.last_name
        FROM AUDIT_EVENT a JOIN GRADE_SHEET gs ON gs.grade_sheet_id = a.entity_id
        JOIN SUBJECT_OFFERING so ON so.subject_offering_id = gs.subject_offering_id
        LEFT JOIN USER u ON u.user_id = a.user_id
        WHERE a.entity_type = 'GRADE_SHEET'
          AND a.event_type IN ('GRADE_SHEET_SUBMITTED', 'GRADE_SHEET_CORRECTION_RESUBMITTED')
          AND gs.submitted_at IS NOT NULL AND a.occurred_at >= gs.submitted_at
          AND so.section_id = ? AND so.school_year_id = ?${byOffering ? ' AND so.subject_offering_id = ?' : ''}
        ORDER BY a.occurred_at DESC, a.audit_event_id DESC`,
      [scope.section_id, scope.school_year_id, ...(byOffering ? [Number(query.subjectOfferingId)] : [])]);
    return {
      statusVersion: 1,
      context: { sectionId: Number(scope.section_id), schoolYearId: Number(scope.school_year_id),
        ...(byOffering ? { subjectOfferingId: Number(query.subjectOfferingId) }
          : { adviserAssignmentId: Number(query.adviserAssignmentId) }) },
      subjects: offerings.map(offering => ({
        subjectOfferingId: Number(offering.subject_offering_id), subjectName: offering.subject_name,
        assignedTeachers: [...new Set(teachers.filter(t => Number(t.subject_offering_id) === Number(offering.subject_offering_id))
          .map(t => [t.first_name, t.last_name].filter(Boolean).join(' ')))],
        terms: [1, 2, 3].map(position => {
          const matches = terms.filter(t => termPosition(t.term_name) === position);
          const candidates = matches.length === 1 ? sheets.filter(s => Number(s.term_id) === Number(matches[0].term_id)
            && Number(s.subject_offering_id) === Number(offering.subject_offering_id)) : [];
          const sheet = candidates.length === 1 ? candidates[0] : null;
          const workflow = String(sheet?.workflow_status || '').toUpperCase();
          const lock = String(sheet?.lock_status || '').toUpperCase();
          const submittedAt = timestamp(sheet?.submitted_at);
          const actor = sheet && actors.find(a => Number(a.grade_sheet_id) === Number(sheet.grade_sheet_id));
          const unavailable = matches.length !== 1 || candidates.length > 1
            || (sheet && !['DRAFT', 'SUBMITTED'].includes(workflow));
          const correction = lock === 'TEMPORARILY_REOPENED' || (workflow === 'DRAFT' && submittedAt);
          return { term: `T${position}`, state: unavailable ? 'UNAVAILABLE' : correction ? 'IN_CORRECTION'
            : workflow === 'SUBMITTED' ? 'SUBMITTED' : 'NOT_SUBMITTED',
          submittedAt, submittedBy: actor?.user_id && (actor.first_name || actor.last_name)
            ? { userId: Number(actor.user_id), name: [actor.first_name, actor.last_name].filter(Boolean).join(' ') } : null };
        }),
      })),
    };
  }
}
module.exports = GradeSubmissionStatusService;
