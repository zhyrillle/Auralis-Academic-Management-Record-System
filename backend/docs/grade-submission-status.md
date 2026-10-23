# Grade submission status display

This read-only feature covers subject teacher Grading Sheets and the adviser's
Master Sheet. It does not change grade calculations or the submission write path.

- `GET /api/grade-submission-status?subjectOfferingId=...`: assigned teacher only.
- `GET /api/grade-submission-status?adviserAssignmentId=...`: assigned adviser only.
- Identity uses the existing `resolveCurrentUser` mechanism. This inherits its
  temporary user-id-header authentication limitation; it is not a JWT/session fix.
- Reads only existing assignments, terms, grade sheets, and submission audit events.
  No migration, initialization SQL, grade reads, or database writes are performed.
- A locked draft is Not submitted. Reopened sheets show Correction in progress.
  Missing/duplicate configuration is Unavailable, not a fabricated empty status.
- Assigned teachers are separate from submitters. The submitter comes from a
  submission audit event at or after the saved submission timestamp. Missing actor
  names/timestamps are Not recorded, never inferred from the current assignment.
- Status requests bypass page caches and reload when the panel opens. Failures have
  Retry and do not become Not submitted. Times display in Asia/Manila.
- Teacher footer status and its Submitted indicator read server status; the existing
  class-wide optimistic flag is not used as proof of current-term submission.

The separate [Teacher → Adviser flow](teacher-adviser-grade-flow.md) now handles
term-specific, confirmed submission, calculation alignment, accepted grades in
existing STUDENT_GRADE, transactions, correction isolation, and cross-user refresh.
Neither the revised flow nor this status reader needs a new table or migration. Real session/JWT verification remains deferred to the authentication owner.
Existing historical discrepancies are not automatically reconciled.

The running backend needs a normal restart to register the new GET route.
No backend restart or school database modification was performed by this change.

Verification: `node --test test/GradeSubmissionStatus.test.js` (backend),
`node test/gradeSubmissionStatus.browser.test.mjs` (frontend, Playwright path/channel
may be supplied through environment variables), frontend build and focused lint.
Tests use SELECT-only substitutes and intercepted browser requests, never school DB.
