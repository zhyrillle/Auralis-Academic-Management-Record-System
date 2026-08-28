# Auralis Backend Model–Database Audit

## Purpose and boundary

This document records model/schema findings without applying database changes.
Every database change remains subject to team review. The live database must be
inventoried by running `beekeeper-schema-audit.sql` in Beekeeper Studio; the
backend configuration and `.env` files are not used for this audit.

The existing `backend/schema.sql` describes an older Auralis schema. It must not
be used to rebuild the current database until the case-by-case review is complete.

## Grading feature changes on this branch

| Model | Change | Verified live result | Decision |
| --- | --- | --- | --- |
| `AcademicTerm` | Added reopening-window fields, field allowlist, and optional transaction connection. | Matches `ACADEMIC_TERM`, including both reopening timestamps. | Keep. |
| `GradeSheet` | Added transaction-aware updates and helpers for temporary correction and restoring the term lock. | Referenced columns exist. `approved_at` remains but no longer has an active workflow meaning. | Keep helpers; review `approved_at` later. |
| `GradeReopenRequest` | Added transaction-aware create/update and `reviewed_by_user_id`. | Referenced columns exist. Legacy attachment columns also still exist. | Keep reviewer support; review legacy behavior below. |
| `TemporaryReopening` | Added transaction-aware create/update and a field allowlist. | Matches `TEMPORARY_REOPENING`. | Keep. |
| `GradeSheetReview` | Removed the active model and route. | No runtime code uses the table. A guarded migration removes an empty active or legacy table. | Remove when empty; preserve non-empty history for team review. |
| `GradeActivity` | Uses `grade_sheet_id` and `subj_comp_weight_id`; no teacher/component-type duplication. | Matches the verified `GRADE_ACTIVITY` columns. | Keep. |
| `Score` | Stores activity, student-section, raw-score state, and teacher assignment. | Matches the verified `SCORE` columns. | Relationship design still needs team review. |

## Full model inventory

`Verified` means the model's referenced columns were compared with live metadata.
`Pending metadata` means the code side was inspected, but the Beekeeper export is
still required before deciding whether the model or database should change.

| Model/helper | Table(s) | Status | Finding / next review |
| --- | --- | --- | --- |
| `AcademicTerm` | `ACADEMIC_TERM` | Verified | Model and live columns align. |
| `Attendance` | `ATTENDANCE`, assignment tables | Pending metadata | Dynamic updates require an allowlist; verify attendance FKs and remarks. |
| `AttendanceSheet` | `ATTENDANCE_SHEET` | Pending metadata | Contains separate adviser-only and general creation paths; verify nullable assignment constraints. |
| `AuditEvent` | `AUDIT_EVENT` | Pending metadata | Verify JSON/text types, timestamp default, and entity index. |
| `ComponentType` | `COMPONENT_TYPE` | Pending metadata | Dynamic updates require an allowlist. |
| `Department` | `DEPARTMENT` | Pending metadata | Dynamic updates require an allowlist. |
| `DepartmentHead` | `DEPARTMENT_HEAD` | Pending metadata | Verify status/appointment fields and active-assignment uniqueness. |
| `Feedback` | `FEEDBACK` | Pending metadata | Complex evaluation columns require exact metadata comparison; dynamic update needs an allowlist. |
| `GradeActivity` | `GRADE_ACTIVITY` | Verified | Model and live columns align; dynamic update still needs an allowlist. |
| `GradeLevel` | `GRADE_LEVEL` | Pending metadata | Dynamic updates require an allowlist. |
| `GradeReopenRequest` | `GRADE_REOPEN_REQUEST` | Verified | Column mapping aligns; requester lookup and duplicate detection need correction. |
| `GradeSheet` | `GRADE_SHEET` | Verified | Model aligns; `approved_at` is obsolete but harmless while nullable. |
| `Notification` | `NOTIFICATION` | Pending metadata | Verify polymorphic related-entity fields; dynamic update needs an allowlist. |
| `School` | `SCHOOL` | Pending metadata | Verify address columns; dynamic update needs an allowlist. |
| `SchoolYear` | `SCHOOL_YEAR` | Verified for columns used by Grading Period | Dynamic update needs an allowlist. |
| `Score` | `SCORE` | Verified | Model and live columns align; decide whether teacher ownership should be derived instead. |
| `Section` | `SECTION` and assignment joins | Pending metadata | Verify query assumptions and replace dynamic updates with an allowlist. |
| `SectionAdviserAssignment` | `SECTION_ADVISER_ASSIGNMENT` | Pending metadata | Verify active assignment and date constraints. |
| `Student` | `STUDENT` | Pending metadata | Verify LRN casing/type and address fields; dynamic update needs an allowlist. |
| `StudentSection` | `STUDENT_SECTION` | Pending metadata | Verify the actual primary-key name and yearly uniqueness constraint. |
| `Subject` | `SUBJECT` | Pending metadata | Verify department FK and status enum; dynamic update needs an allowlist. |
| `SubjectComponentWeight` | `SUBJECT_COMPONENT_WEIGHT` | Pending metadata | Verify school-year FK and unique subject/component/year constraint; dynamic update needs an allowlist. |
| `SubjectOffering` | `SUBJECT_OFFERING` | Pending metadata | Verify subject/section/year uniqueness; dynamic update needs an allowlist. |
| `TeacherAssignment` | `TEACHER_ASSIGNMENT` | Pending metadata | Verify assignment status enum, dates, and active uniqueness. |
| `TemporaryReopening` | `TEMPORARY_REOPENING` | Verified | Model and live columns align. |
| `User` | `USER` | Pending metadata | Verify role, department, password, profile, account-status, and login timestamp fields. |
| `UserAssignment` | Multiple assignment tables | Helper, not one table | Treat as an assignment service during future architecture cleanup. |
| `UserManagementOptions` | Multiple lookup tables | Helper, not one table | Treat as a read service rather than a table model. |

## Case-by-case decision queue

### Runtime and logic issues

1. `GradeReopenRequest.findByUserId()` contains a fallback that filters on a
   nonexistent `user_id` property. Remove the fallback after the owning requester
   route is migrated to the grade-sheet-based API.
2. `checkExistingRequest(teacherAssignmentId)` checks the teacher assignment only.
   Duplicate prevention should be scoped to `grade_sheet_id` plus `PENDING`, or a
   teacher can be blocked from requesting correction for a different sheet.
3. The legacy reopening route logs complete request bodies and lookup results.
   Remove these debug logs before production.
4. The legacy reopening route accepts term and attachment fields while the revised
   workflow selects one grade sheet and requires only a reason. Coordinate this
   route replacement with the requester-UI owner.

### Obsolete but currently harmless fields

1. `GRADE_SHEET.approved_at` is no longer written by the active workflow. Keep it
   nullable until the team approves a removal migration.
2. `GRADE_REOPEN_REQUEST.file_name`, `file_path`, `file_type`, and `file_size`
   remain for compatibility with the existing requester UI. Remove them only after
   that UI and route stop using supporting documents.
3. `GRADE_SHEET_REVIEW_LEGACY` is no longer exposed through active APIs. The
   guarded `20260828_remove_grade_sheet_review.sql` migration removes it when it
   is empty and preserves it when historical rows still exist.

### Model safety improvements

Several models construct `UPDATE` statements from every key supplied by callers.
Replace these with explicit per-model field allowlists after live metadata is
verified. Prioritize public routes first: Grade Activity, Score, School Year,
Subject Component Weight, Attendance, Notification, Student, Subject, and user
assignment models.

## Safe resolution sequence for each approved mismatch

1. Capture current columns, indexes, FKs, and affected-row counts in Beekeeper.
2. Decide whether the model, database, or both are wrong.
3. Add new columns or constraints without dropping the old structure.
4. Backfill and verify every affected row.
5. Update model allowlists, routes, services, and tests in the same feature change.
6. Remove obsolete columns or constraints only after all consumers are migrated.
7. Re-run the metadata audit and relevant API tests.
8. Regenerate `schema.sql` only when all approved migrations are complete.
