// Illustrative payloads for the supported audit writers. Never insert these into a school database.
import { auditModuleGroup } from '../../src/utils/auditModules.js';

const base = {
  occurredAt: '2026-11-13T00:45:00+08:00', actorName: 'Morgan Admin', actorRole: 'System Administrator',
  actingAs: 'System Administrator', schoolYear: '2026–2027', impact: 'Medium', metadata: {},
};
const classroom = { actorName: 'Jamie Teacher', actorRole: 'Subject Teacher', actingAs: 'Teacher — Demo Section (English)',
  section: 'Demo Section', subject: 'English', term: 'T1', target: 'Demo Section · English · Term 1', entityType: 'Grade Sheet', entityId: '164' };
const teacher = { ...classroom, actorName: 'Jamie Teacher', actorRole: 'Subject Teacher' };
const learner = { grade_id: 7524, learner_name: 'Alex Santos', initial_grade: 81, term_grade: 83, remarks: 'Passed' };
const score = { score_key: '3:101', activity_id: 3, activity_name: 'Written Work 1', student_section_id: 101, learner_name: 'Alex Santos', raw_score: '14.00', score_status: 'ENCODED' };
const activity = { activity_id: 3, activity_name: 'Written Work 1', component: 'Written Work', highest_possible_score: 20, activity_date: '2026-09-05', status: 'ACTIVE' };
const weight = (component, percentage) => ({ weight_key: `English:${component}`, subject: 'English', component, percentage });
const range = converted => ({ id: 'range-25', min: 70, max: 72.99, transmuted: converted, label: null });
const reopening = { ...classroom, actorName: 'Morgan Admin', actorRole: 'System Administrator', actingAs: 'System Administrator',
  entityType: 'Grade Reopen Request', entityId: '55', metadata: { requester: 'Jamie Teacher', reason: 'Correct a score checked against the learner’s answer sheet.' } };

function sample(type, label, recordedModule, beforeData, afterData, context = {}, explanation = '') {
  const event = { ...base, eventType: type, eventLabel: label, recordedModule, module: recordedModule,
    entityType: 'Record', entityId: '1', target: label, beforeData, afterData, ...context };
  event.module = auditModuleGroup(event);
  return { title: label, explanation, ...event, summary: context.summary || label + '.' };
}

export const auditPreviewEvents = [
  sample('USER_ACCOUNT_CREATED', 'User account created', 'Account Management', null,
    { first_name: 'Alex', middle_name: null, last_name: 'Teacher', email: 'alex@example.test', role: 'subject_teacher', account_status: 'active',
      teaching_assignments: [{ assignment_key: 'teaching:10', subject: 'English', section: 'Demo Section', assigned_from: '2026-06-01', assigned_until: null }] },
    { target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Created Alex Teacher’s account and assigned English in Demo Section.' },
    'An account being created has recorded values rather than invented before values.'),
  sample('USER_ACCOUNT_UPDATED', 'User account updated', 'Account Management',
    { middle_name: null, credentials: null, email: 'alex.old@example.test' },
    { middle_name: 'Mendoza', credentials: 'LPT', email: 'alex@example.test' },
    { target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Updated Alex Teacher’s account identifiers.' }),
  sample('USER_ACCOUNT_UPDATED', 'Teaching and advisory assignments changed', 'Account Management',
    { teaching_assignments: [{ assignment_key: 'teaching:10', subject: 'English', section: 'Demo Section', assigned_until: null }], advisory_assignments: [] },
    { teaching_assignments: [{ assignment_key: 'teaching:10', subject: 'English', section: 'Demo Section', assigned_until: '2026-11-13' }, { assignment_key: 'teaching:11', subject: 'English', section: 'Demo Section B', assigned_from: '2026-11-14' }],
      advisory_assignments: [{ assignment_key: 'advisory:2', section: 'Demo Section B', assigned_from: '2026-11-14' }] },
    { target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Updated Alex Teacher’s teaching and advisory assignments.' },
    'Assignment changes use User Account Updated; they are not a separate invented event type.'),
  sample('USER_STATUS_UPDATED', 'User status updated', 'Account Management', { account_status: 'active' }, { account_status: 'inactive' },
    { target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Deactivated Alex Teacher’s account.' }),
  sample('USER_PROFILE_UPDATED', 'User profile updated', 'Account Management', { first_name: 'Alex', last_name: 'Santo' }, { first_name: 'Alexander', last_name: 'Santos' },
    { actorName: 'Alex Santos', actorRole: 'Subject Teacher', actingAs: 'User', target: 'Alex Santos', entityType: 'User Account', entityId: '7', summary: 'Updated personal profile names.' }),
  sample('USER_PASSWORD_CHANGED', 'User password changed', 'Account Management', null, null,
    { actorName: 'Alex Teacher', actorRole: 'Subject Teacher', actingAs: 'User', target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Changed the account password. No password values are retained.' }, 'Password values and hashes never appear in this event.'),
  sample('USER_PASSWORD_RESET', 'User password reset', 'Account Management', null, null,
    { target: 'Alex Teacher', entityType: 'User Account', entityId: '7', summary: 'Reset the account password. No password values are retained.' }),

  sample('SUBJECT_WEIGHTS_UPDATED', 'Subject weights updated', 'WS Configuration',
    { weights: [weight('Written Work', 30), weight('Performance Tasks', 50)] },
    { weights: [weight('Written Work', 40), weight('Performance Tasks', 40)] },
    { target: 'Subject weights · SY 2026–2027', entityType: 'Subject Component Weight', summary: 'Updated English grading component weights.' }),
  sample('SUBJECT_WEIGHTS_INHERITED', 'Subject weights inherited', 'WS Configuration',
    { weights: [] }, { weights: [weight('Written Work', 30), weight('Performance Tasks', 50), weight('Examinations', 20)] },
    { schoolYear: '2027–2028', target: 'Subject weights · SY 2027–2028', entityType: 'Subject Component Weight', metadata: { inherited_from: '2026–2027' }, summary: 'Inherited component weights from the previous school year.' }),
  sample('GRADE_TRANSMUTATION_UPDATED', 'Grade transmutation updated', 'Grade Transmutation',
    { ranges: [range(75)] }, { ranges: [range(76)] },
    { target: 'Grade transmutation', entityType: 'Grade Transmutation Config', schoolYear: null, summary: 'Updated one custom grade conversion range.' }, 'Illustrates the display; this is not a proposed change to the school’s grading policy.'),
  sample('GRADE_TRANSMUTATION_UPDATED', 'Custom transmutation disabled', 'Grade Transmutation',
    { is_custom_enabled: true }, { is_custom_enabled: false },
    { target: 'Grade transmutation', entityType: 'Grade Transmutation Config', schoolYear: null, summary: 'Turned off custom grade transmutation.' }),
  sample('GRADE_TRANSMUTATION_RESET', 'Grade transmutation reset', 'Grade Transmutation',
    { is_custom_enabled: true, ranges: [range(76)] }, { is_custom_enabled: false, ranges: [range(75)] },
    { target: 'Grade transmutation', entityType: 'Grade Transmutation Config', schoolYear: null, summary: 'Reset grade transmutation settings to defaults.' }),
  sample('UPCOMING_SCHOOL_YEAR_CREATED', 'Upcoming school year created', 'Grading Period', null,
    { generated_from_school_year_id: 1, calendar_rule_version: 'illustrative-calendar-version' },
    { actorName: 'Auralis System', actorRole: 'System', actingAs: 'System', target: 'School year #2', entityType: 'School Year', entityId: '2', schoolYear: '2027–2028', summary: 'Created the upcoming school year from the current school year.' },
    'The writer captures generation identifiers; the example does not invent a previous school year.'),
  sample('GRADING_PERIOD_CREATED', 'Grading period created', 'Grading Period', null,
    { school_year_id: 2, term_name: '1st', starts_at: '2027-06-01T00:00:00+08:00', ends_at: '2027-09-01T23:59:59+08:00', grade_submission_deadline_at: '2027-09-05T23:59:00+08:00', status: 'upcoming' },
    { target: 'Term 1', entityType: 'Academic Term', entityId: '4', term: 'T1', schoolYear: '2027–2028', summary: 'Created Term 1 for school year 2027–2028.' }),
  sample('GRADING_PERIOD_TIMELINE_UPDATED', 'Grading period timeline updated', 'Grading Period',
    { grade_submission_deadline_at: '2026-12-17T23:59:00+08:00' }, { grade_submission_deadline_at: '2026-12-19T23:59:00+08:00' },
    { target: 'Term 2 deadline', entityType: 'Academic Term', entityId: '2', term: 'T2', summary: 'Extended the Term 2 grade submission deadline.' }),

  sample('GRADE_ACTIVITY_CREATED', 'Assessment created', 'Grading', { activities: [] }, { activities: [activity] },
    { ...teacher, summary: 'Added assessment Written Work 1.' }),
  sample('GRADE_ACTIVITY_UPDATED', 'Assessment updated', 'Grading', { activities: [activity] }, { activities: [{ ...activity, activity_name: 'Quiz 1', highest_possible_score: 25 }] },
    { ...teacher, summary: 'Updated the assessment name and highest possible score.' }),
  sample('GRADE_ACTIVITY_DELETED', 'Assessment deleted', 'Grading', { activities: [activity], scores: [score] }, { activities: [], scores: [] },
    { ...teacher, summary: 'Deleted an assessment and its recorded scores.' }, 'Deleted values remain visible as previous details.'),
  sample('GRADE_SCORES_UPDATED', 'Scores updated', 'Grading', { scores: [score] }, { scores: [{ ...score, raw_score: '15.00' }] },
    { ...teacher, summary: 'Saved class-record scores.' }),
  sample('GRADE_SHEET_SUBMITTED', 'Grade sheet submitted', 'Grading', { workflow_status: 'DRAFT', submitted_at: null, grades: [learner] },
    { workflow_status: 'SUBMITTED', submitted_at: '2026-09-06T14:00:00+08:00', grades: [learner, { ...learner, grade_id: 7525, learner_name: 'Rae Santos', initial_grade: 70, term_grade: 75 }] },
    { ...teacher, summary: 'Submitted English Term 1 grades for Demo Section.', metadata: { learner_count: 2 } }, 'Expand View submitted grades to inspect the captured grade snapshot, including grades that did not change.'),
  sample('GRADE_SHEET_CORRECTION_RESUBMITTED', 'Grade sheet correction resubmitted', 'Grading', { workflow_status: 'DRAFT', grades: [learner] },
    { workflow_status: 'SUBMITTED', submitted_at: '2026-11-13T00:45:00+08:00', grades: [{ ...learner, initial_grade: 83, term_grade: 85 }] },
    { ...teacher, summary: 'Resubmitted corrected English Term 1 grades for Demo Section.', metadata: { learner_count: 1 } }),
  sample('ATTENDANCE_RECORDED', 'Subject attendance recorded', 'Attendance',
    { learners: [{ student_section_id: 101, learner_name: 'Alex Santos', status: 'A', remarks: null }] },
    { learners: [{ student_section_id: 101, learner_name: 'Alex Santos', status: 'P', remarks: null }] },
    { ...teacher, term: null, entityType: 'Attendance Sheet', entityId: '11', summary: 'Updated English attendance for Demo Section.', metadata: { attendance_date: '2026-11-13', attendance_scope: 'SUBJECT', section_id: 1 } }),
  sample('ATTENDANCE_RECORDED', 'Advisory attendance and late mark', 'Attendance',
    { learners: [{ student_section_id: 101, learner_name: 'Alex Santos', status: 'A', remarks: null }] },
    { learners: [{ student_section_id: 101, learner_name: 'Alex Santos', status: 'L', remarks: 'Arrived after the morning check.' }] },
    { ...teacher, actorRole: 'Adviser', actingAs: 'Adviser — Demo Section', subject: null, term: null, entityType: 'Attendance Sheet', entityId: '12', summary: 'Corrected a learner’s advisory attendance and remark.', metadata: { attendance_date: '2026-11-13', attendance_scope: 'ADVISORY', section_id: 1 } }),
  sample('ATTENDANCE_RECORDED', 'No-class marker set', 'Attendance',
    { days: [{ id: 12, no_class_reason: null }] }, { days: [{ id: 12, no_class_reason: 'SUSPENSION' }] },
    { ...teacher, actorRole: 'Adviser', actingAs: 'Adviser — Demo Section', subject: null, term: null, entityType: 'Attendance Sheet', entityId: '12', summary: 'Marked the date as suspension. Existing learner marks were retained.', metadata: { attendance_date: '2026-11-13', attendance_scope: 'ADVISORY', section_id: 1 } }),

  sample('GRADE_REOPEN_REQUEST_SUBMITTED', 'Grade reopening requested', 'Grading Period', null,
    { request_type: 'GRADE_CORRECTION', reason: 'Correct a score checked against the learner’s answer sheet.', status: 'PENDING' },
    { ...reopening, actorName: 'Jamie Teacher', actorRole: 'Subject Teacher', actingAs: teacher.actingAs, summary: 'Requested temporary access to correct a submitted grade sheet.' }),
  sample('GRADE_REOPEN_REQUEST_APPROVED', 'Grade reopening approved', 'Grading Period',
    { request_status: 'PENDING', workflow_status: 'SUBMITTED', lock_status: 'TERM_LOCKED', expires_at: null },
    { request_status: 'APPROVED', workflow_status: 'DRAFT', lock_status: 'TEMPORARILY_REOPENED', expires_at: '2026-11-13T01:45:00+08:00' },
    { ...reopening, entityType: 'Temporary Reopening', metadata: { ...reopening.metadata, admin_note: 'Verified against the learner’s answer sheet.', expires_at: '2026-11-13T01:45:00+08:00' }, summary: 'Approved temporary correction access for one hour.' }),
  sample('GRADE_REOPEN_REQUEST_DENIED', 'Grade reopening denied', 'Grading Period', { status: 'PENDING' }, { status: 'DENIED' },
    { ...reopening, metadata: { ...reopening.metadata, admin_note: 'The request does not identify the assessment requiring correction.' }, summary: 'Denied the grade reopening request.' }),
  sample('GRADE_REOPEN_REQUEST_CANCELLED', 'Grade reopening cancelled', 'Grading Period', { status: 'PENDING' }, { status: 'CANCELLED' },
    { ...reopening, actorName: 'Jamie Teacher', actorRole: 'Subject Teacher', actingAs: teacher.actingAs, summary: 'Cancelled the pending reopening request.' }),
  sample('TEMPORARY_REOPENING_EXPIRED', 'Temporary reopening expired', 'Grading Period', { status: 'ACTIVE' }, { status: 'EXPIRED', grade_sheet_id: 164 },
    { ...reopening, actorName: 'Auralis System', actorRole: 'System', actingAs: 'System', entityType: 'Temporary Reopening', summary: 'Temporary correction access expired and the term lock was restored.' }),
].map((event, index) => ({ ...event, id: String(index + 1) }));

export const excludedPreviewTypes = ['GRADE_SHEET_DATA_RECONCILED', 'ATTENDANCE_FINALIZED', 'TERM_AUTOMATICALLY_LOCKED'];
