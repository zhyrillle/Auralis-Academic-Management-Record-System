require('dotenv').config({ path: __dirname + '/.env' });
const db = require('./config/db');

async function seedRoleAuditEvents() {
  console.log('Seeding role-based audit events...');

  // Sample audit events covering Adviser, Subject Teacher, Department Head, Principal, System Admin, and System
  const events = [
    // --- PRINCIPAL ---
    {
      user_id: 2, // Nikka Rodriguez (Principal)
      actor_context: { source: 'user', acting_as: 'Principal', role: 'principal' },
      event_type: 'SCHOOL_ANALYTICS_REVIEWED',
      module_name: 'SCHOOL_OVERSIGHT',
      entity_type: 'ANALYTICS',
      entity_id: 1,
      before_data: null,
      after_data: null,
      metadata: {
        school_year: '2026–2027',
        target: 'School-wide Performance',
        summary: 'Reviewed school-wide quarterly academic indicators and learner at-risk analytics.',
        impact: 'Low',
      },
      occurred_at: '2026-09-28 14:15:00',
    },
    {
      user_id: 2, // Nikka Rodriguez (Principal)
      actor_context: { source: 'user', acting_as: 'Principal', role: 'principal' },
      event_type: 'GRADE_REOPEN_REQUEST_ENDORSED',
      module_name: 'GRADE_LOCK',
      entity_type: 'GRADE_REOPEN_REQUEST',
      entity_id: 1,
      before_data: { request_status: 'PENDING' },
      after_data: { request_status: 'ENDORSED' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'English 7',
        section: 'Molave',
        target: 'English 7 — Molave',
        summary: 'Endorsed grade reopening request for English 7 — Molave for administrative approval.',
        reason: 'Teacher submitted valid clerical error justification with supporting assessment sheet.',
        impact: 'High',
      },
      occurred_at: '2026-09-27 10:30:00',
    },
    {
      user_id: 2, // Nikka Rodriguez (Principal)
      actor_context: { source: 'user', acting_as: 'Principal', role: 'principal' },
      event_type: 'ACADEMIC_EXCELLENCE_CONFIRMED',
      module_name: 'SF9_RECORDS',
      entity_type: 'STUDENT_SF9',
      entity_id: null,
      before_data: { verification_status: 'Unconfirmed' },
      after_data: { verification_status: 'Confirmed' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        target: 'Grade 7 Honor Roll',
        summary: 'Confirmed official Term Honor Roll and Academic Excellence awards for Grade 7.',
        impact: 'High',
      },
      occurred_at: '2026-09-25 16:45:00',
    },
    {
      user_id: 2, // Nikka Rodriguez (Principal)
      actor_context: { source: 'user', acting_as: 'Principal', role: 'principal' },
      event_type: 'PRINCIPAL_FEEDBACK_SUBMITTED',
      module_name: 'FEEDBACK',
      entity_type: 'FEEDBACK',
      entity_id: 1,
      before_data: null,
      after_data: { feedback_type: 'positive' },
      metadata: {
        school_year: '2026–2027',
        target: 'Junior High School Faculty',
        summary: 'Submitted academic evaluation and instructional guidance feedback for teachers.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-22 11:20:00',
    },

    // --- DEPARTMENT HEAD ---
    {
      user_id: 4, // Vonzelle Puray (Department Head)
      actor_context: { source: 'user', acting_as: 'Department Head — Science', role: 'department_head' },
      event_type: 'DEPARTMENT_SUBMISSIONS_REVIEWED',
      module_name: 'DEPARTMENT_OVERSIGHT',
      entity_type: 'DEPARTMENT',
      entity_id: 2,
      before_data: { reviewed_sheets: 4, total_sheets: 6 },
      after_data: { reviewed_sheets: 6, total_sheets: 6 },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        target: 'Science Department',
        summary: 'Reviewed and endorsed quarterly grade sheet submissions for Science Department.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-26 15:30:00',
    },
    {
      user_id: 4, // Vonzelle Puray (Department Head)
      actor_context: { source: 'user', acting_as: 'Department Head — Science', role: 'department_head' },
      event_type: 'DEPARTMENT_PERFORMANCE_ANALYTIC_VIEWED',
      module_name: 'ANALYTICS',
      entity_type: 'DEPARTMENT',
      entity_id: 2,
      before_data: null,
      after_data: null,
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        target: 'Science Department',
        summary: 'Analyzed departmental passing rates and competency indicators across Grade 7–10.',
        impact: 'Low',
      },
      occurred_at: '2026-09-24 09:15:00',
    },
    {
      user_id: 4, // Vonzelle Puray (Department Head)
      actor_context: { source: 'user', acting_as: 'Department Head — Science', role: 'department_head' },
      event_type: 'GRADE_VERIFICATION_COMPLETED',
      module_name: 'DEPARTMENT_OVERSIGHT',
      entity_type: 'DEPARTMENT',
      entity_id: 2,
      before_data: { verified: false },
      after_data: { verified: true },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        target: 'Science 8 & 9 Records',
        summary: 'Completed grade verification and distribution checks for Science 8 & 9 Records.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-20 13:40:00',
    },

    // --- ADVISER ---
    {
      user_id: 3, // Harvey Babia (Adviser for Mahogany)
      actor_context: { source: 'user', acting_as: 'Adviser — Section Mahogany', role: 'adviser' },
      event_type: 'ATTENDANCE_RECORDED',
      module_name: 'ATTENDANCE',
      entity_type: 'ATTENDANCE_SHEET',
      entity_id: 1,
      before_data: null,
      after_data: { records_count: 35 },
      metadata: {
        school_year: '2026–2027',
        section: 'Mahogany',
        target: 'Section Mahogany',
        summary: 'Recorded daily attendance for Section Mahogany (September).',
        impact: 'Low',
      },
      occurred_at: '2026-09-28 08:10:00',
    },
    {
      user_id: 8, // Rabi Baho (Adviser for Narra)
      actor_context: { source: 'user', acting_as: 'Adviser — Section Narra', role: 'adviser' },
      event_type: 'SF9_GENERATED',
      module_name: 'SF9_RECORDS',
      entity_type: 'STUDENT_SF9',
      entity_id: 2,
      before_data: null,
      after_data: { generated_cards: 32 },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        section: 'Narra',
        target: 'Section Narra',
        summary: 'Generated DepEd Form 138 (SF9) progress report cards for Section Narra.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-26 11:20:00',
    },
    {
      user_id: 3, // Harvey Babia (Adviser for Mahogany)
      actor_context: { source: 'user', acting_as: 'Adviser — Section Mahogany', role: 'adviser' },
      event_type: 'LEARNER_OBSERVED_VALUES_UPDATED',
      module_name: 'SF9_RECORDS',
      entity_type: 'STUDENT_SF9',
      entity_id: 1,
      before_data: { values_evaluated: 15 },
      after_data: { values_evaluated: 35 },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        section: 'Mahogany',
        target: 'Section Mahogany',
        summary: 'Updated DepEd core values and observed learner traits for Section Mahogany.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-23 14:05:00',
    },
    {
      user_id: 6, // Andre Gomez (Adviser for Honesty)
      actor_context: { source: 'user', acting_as: 'Adviser — Section Honesty', role: 'adviser' },
      event_type: 'ATTENDANCE_FINALIZED',
      module_name: 'ATTENDANCE',
      entity_type: 'SECTION',
      entity_id: 8,
      before_data: { status: 'Draft' },
      after_data: { status: 'Finalized' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        section: 'Honesty',
        target: 'Section Honesty',
        summary: 'Finalized advisory section attendance and DepEd Form SF2 monthly summary.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-18 16:30:00',
    },

    // --- SUBJECT TEACHER ---
    {
      user_id: 5, // Zyrile Retuertas (Subject Teacher)
      actor_context: { source: 'user', acting_as: 'Subject Teacher', role: 'subject_teacher' },
      event_type: 'GRADE_SHEET_SUBMITTED',
      module_name: 'GRADING',
      entity_type: 'GRADE_SHEET',
      entity_id: 1,
      before_data: { workflow_status: 'Draft', lock_status: 'Editable' },
      after_data: { workflow_status: 'Submitted', lock_status: 'Submission Read Only' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'Mathematics',
        section: 'Mahogany',
        target: 'Mathematics — Mahogany',
        summary: 'Submitted 1st Term Mathematics grade sheet for Mahogany.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-27 15:45:00',
    },
    {
      user_id: 6, // Andre Gomez (Subject Teacher)
      actor_context: { source: 'user', acting_as: 'Subject Teacher', role: 'subject_teacher' },
      event_type: 'GRADE_SHEET_UPDATED',
      module_name: 'GRADING',
      entity_type: 'GRADE_SHEET',
      entity_id: 2,
      before_data: { recorded_activities: 6 },
      after_data: { recorded_activities: 8 },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'Science',
        section: 'Narra',
        target: 'Science — Narra',
        summary: 'Updated grading scores and class record for Science — Narra.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-25 11:15:00',
    },
    {
      user_id: 7, // rishi zurita (Subject Teacher)
      actor_context: { source: 'user', acting_as: 'Subject Teacher', role: 'subject_teacher' },
      event_type: 'GRADE_REOPEN_REQUEST_SUBMITTED',
      module_name: 'GRADE_LOCK',
      entity_type: 'GRADE_REOPEN_REQUEST',
      entity_id: 1,
      before_data: null,
      after_data: { request_status: 'PENDING' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'English',
        section: 'Molave',
        target: 'English — Molave',
        reason: 'Typographical error on Periodical Exam column for 3 learners.',
        summary: 'Submitted grade reopening request for English — Molave (Typographical error on Periodical Exam column for 3 learners).',
        impact: 'Medium',
      },
      occurred_at: '2026-09-24 14:20:00',
    },
    {
      user_id: 5, // Zyrile Retuertas (Subject Teacher)
      actor_context: { source: 'user', acting_as: 'Subject Teacher', role: 'subject_teacher' },
      event_type: 'GRADE_SHEET_RECALLED',
      module_name: 'GRADING',
      entity_type: 'GRADE_SHEET',
      entity_id: 3,
      before_data: { workflow_status: 'Submitted' },
      after_data: { workflow_status: 'Draft' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'Filipino',
        section: 'Fortitude',
        target: 'Filipino — Fortitude',
        summary: 'Recalled submitted grade sheet for Filipino — Fortitude before deadline.',
        impact: 'Low',
      },
      occurred_at: '2026-09-21 10:05:00',
    },
    {
      user_id: 5, // Zyrile Retuertas (Subject Teacher)
      actor_context: { source: 'user', acting_as: 'Subject Teacher', role: 'subject_teacher' },
      event_type: 'GRADE_SHEET_CORRECTION_RESUBMITTED',
      module_name: 'GRADING',
      entity_type: 'GRADE_SHEET',
      entity_id: 3,
      before_data: { workflow_status: 'Draft', lock_status: 'Temporarily Reopened' },
      after_data: { workflow_status: 'Submitted', lock_status: 'Term Locked' },
      metadata: {
        school_year: '2026–2027',
        term: '1st Term',
        subject: 'Araling Panlipunan',
        section: 'Mahogany',
        target: 'Araling Panlipunan — Mahogany',
        summary: 'Resubmitted corrected grade sheet for Araling Panlipunan — Mahogany.',
        impact: 'Medium',
      },
      occurred_at: '2026-09-22 17:10:00',
    },
  ];

  // Insert events
  for (const ev of events) {
    await db.execute(
      `INSERT INTO AUDIT_EVENT (
        user_id,
        actor_context,
        event_type,
        module_name,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata,
        occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ev.user_id,
        JSON.stringify(ev.actor_context),
        ev.event_type,
        ev.module_name,
        ev.entity_type,
        ev.entity_id,
        ev.before_data ? JSON.stringify(ev.before_data) : null,
        ev.after_data ? JSON.stringify(ev.after_data) : null,
        JSON.stringify(ev.metadata),
        ev.occurred_at,
      ]
    );
  }

  console.log(`Successfully seeded ${events.length} role-based audit events!`);
  process.exit(0);
}

seedRoleAuditEvents().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
