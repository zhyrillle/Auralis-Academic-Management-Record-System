# Subject Teacher → Adviser submission (existing tables)

## Implementation and deployment

The revised implementation needs **no new table or migration**. The proposed
GRADE_PUBLICATION snapshot table and deferred REPORT_SUBMISSION feature were
removed, including their routes/UI, migrations, and snapshot-only tests. Their
source is recoverable in the pre-update safety stash
`3f5660564a87e75adc483b7f3423a5226965760a`.

No school database writes, migrations, backend restart, push, or PR creation were
performed during implementation. Restart the backend normally before live testing;
the new summary/submission contracts use version 2. Live school-record submission
has not been tested.

## Existing responsibilities

- `routes/classRecordRoutes.js` keeps the Submit handler, request scoping,
  saved-input loading, and transaction coordination.
- `services/GradeComputationService.js` validates complete inputs and delegates
  to the existing shared `utils/depedTransmutation.js` calculation, including
  the saved transmutation On/Off setting. It no longer has an independent table.
- `models/GradeSheet.js` owns the common editing-window check used by score
  saving and assessment creation, HPS/details updates, and deletion.
- `models/StudentGrade.js`, `models/GradeSheet.js`, `models/AuditEvent.js`,
  and `services/NotificationService.js` retain their separate responsibilities.
  Their submission writes receive the same transaction connection.
- `services/MasterSheetService.js` reads accepted grades instead of recalculating
  assessment scores.
- Frontend requests use the existing `services/classRecordApi.js`. The separate
  teacherGradeSubmission wrapper is removed.
- The read-only submission-status route/service and floating panel remain; they
  read existing tables and do not require any new storage.

## What saves, and when

1. Ordinary entry autosaves raw assessment inputs in existing `SCORE`.
   Score saving, class-record reads, and section-directory reads do not update
   accepted `STUDENT_GRADE` rows.
2. The teacher's draft term grades are previews calculated from saved server
   inputs. They do not become accepted grades just by being displayed.
3. Submit sends only offering, section, school year, and the chosen term.
   Browser-supplied grades are ignored.
4. The existing handler starts one transaction and locks the selected sheet,
   inputs, roster, weights, and transmutation configuration. It validates the
   current assignment, enrollment, period, workflow, and complete score data.
5. It writes only that term's `STUDENT_GRADE` values, marks `GRADE_SHEET`
   Submitted with its time, and saves audit/notification rows using that same
   connection. Any failure rolls back the entire submission attempt.
6. Live notifications emit after commit. Live delivery failure does not undo a
   successful submission. Repeating an already-submitted request is idempotent.
7. The Master Sheet copies the accepted values. A locked first draft is not
   published. Existing final-grade/completeness rules and exports are preserved.

Score/assessment edits serialize against the sheet lock used by Submit. Score
requests reject invalid numbers, other-sheet activity IDs, and enrollment IDs
outside the selected section/year. They do not create enrollments or trust a
caller-supplied teacher-assignment ID.

Class-record reads resolve the explicit offering and assignment; they do not
create an arbitrary offering or use another school year's academic term.
Default assessment setup remains in the existing route and is serialized with
submission. School-year roster filtering is explicit.

## Corrections, caching, and notifications

Reopening changes the existing sheet to Draft but retains `submitted_at`.
Accepted `STUDENT_GRADE` values remain unchanged while the teacher saves
correction scores. The adviser continues seeing those accepted values, including
after a correction window expires. Successful resubmission replaces the accepted
values and relocks that correction.

The actual approved owner-specific reopening window controls editing; it is not
substituted with the current term. The teacher can select an available correction
term explicitly. Missing/duplicate/invalid configuration is not guessed.

The frontend waits for matching server confirmation before showing success.
Submission is online-only and pending account-scoped offline scores block it.
The class-record back action waits for autosave or remains on the record if
edits are still unsaved. Offline drafts and queued work remain account-scoped.

The adviser refreshes in the background on matching committed submission events,
reconnect, and coming online. Focus/returning to the tab rechecks only after one
minute; repeated events share a pending read. The loaded table remains usable
without a loading overlay, and a failed refresh preserves its displayed grades.
Versioned read URLs bypass earlier
calculated-grade caches without clearing unrelated records or pending drafts.

## Boundaries and historical data

- Department Head Class Record previews reuse the reader with department-scoped,
  read-only access. The current department appointment (or resolved USER
  department) is checked against the offering's subject. Previewing does not
  initialize grade sheets or assessments, and this permission is never used by
  Submit, autosave, or assessment mutations.
- Existing historical accepted quarterly grades are copied, not repaired.
  Invalid old initial grades can remain flagged for review without inventing an
  initial grade. A correction already overwritten by older autosave code cannot
  reconstruct its earlier accepted value; review is required.
- `MISSING` is zero; blank/`NOT_ENCODED`/unknown statuses block submission.
  `EXCUSED` requires a policy review rather than an invented exclusion rule.
- This transaction covers the configured primary database, not a distributed
  transaction across a local database and Aiven. Existing raw-score mirroring
  remains separate. Read-side cloud imports and autosave mirroring of accepted
  grades were removed so they cannot bypass Submit. Separate installations
  using different primary databases need a separately designed synchronization
  policy; a successful local Submit does not certify a cloud replica update.
- Login/password/JWT issuance are unchanged. The existing resolved-user
  interface and assignment checks are used. The user-ID header can be forged;
  it is not verified authentication or a production security fix.
- Older generic score/assessment CRUD endpoints and broader analytics/report
  publication policies are not comprehensively redesigned here.
- Adviser → Principal submission/report tracking remains deferred. The latest
  incoming SF9 export, layout, and masking changes and SF10 database import fix
  from main are preserved.

## Isolated verification

Backend (no real database pool):
```text
node --test test/TeacherGradeSubmission.test.js test/MasterSheetService.test.js test/GradeComputationService.test.js test/GradeSubmissionStatus.test.js test/GradingPeriodService.test.js test/reportRoutes.test.js
```

Frontend (all API traffic intercepted):
```text
node test/teacherAdviserFlow.browser.test.mjs
node test/gradeSubmissionStatus.browser.test.mjs
node test/offlineCache.browser.test.mjs
npm run build
```

Browser tests accept PLAYWRIGHT_MODULE_PATH and BROWSER_CHANNEL. Coverage includes
two accounts, current/correction terms, teacher/adviser value alignment, saved
transmutation, unchanged other terms, partial-write rollback, learner-five
failure, autosave isolation, truthful errors, idempotence, live refresh, offline
draft preservation, restored submission status, and laptop/narrow layouts.

Focused grading-file lint passes except ClassRecord.jsx, which has the same
19 errors and 2 warnings as HEAD. No additional lint findings were introduced.
