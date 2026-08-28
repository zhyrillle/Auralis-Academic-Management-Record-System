-- Auralis simplified grade-sheet workflow
--
-- DRAFT -> SUBMITTED -> TERM_LOCKED
-- A submitted sheet may be recalled before the deadline. After the deadline,
-- correction requires a System Administrator-approved temporary reopening.
-- Reopening requests are accepted from the submission deadline until exactly
-- seven days later.

-- 1. Add the simplified status without invalidating legacy rows.
ALTER TABLE GRADE_SHEET
  MODIFY workflow_status ENUM(
    'DRAFT',
    'SUBMITTED',
    'SUBMITTED_FOR_REVIEW',
    'RETURNED_FOR_CORRECTION',
    'ADVISER_APPROVED'
  ) NOT NULL DEFAULT 'DRAFT';

-- 2. Convert every legacy review state to the nearest simplified state.
UPDATE GRADE_SHEET
SET workflow_status = CASE
  WHEN workflow_status IN ('SUBMITTED_FOR_REVIEW', 'ADVISER_APPROVED') THEN 'SUBMITTED'
  WHEN workflow_status = 'RETURNED_FOR_CORRECTION' THEN 'DRAFT'
  ELSE workflow_status
END;

-- 3. Remove the retired values only after all rows have been converted.
ALTER TABLE GRADE_SHEET
  MODIFY workflow_status ENUM('DRAFT', 'SUBMITTED')
  NOT NULL DEFAULT 'DRAFT';

-- 4. Recalculate every reopening window from the submission deadline.
UPDATE ACADEMIC_TERM
SET
  reopening_requests_open_at = grade_submission_deadline_at,
  reopening_requests_close_at = DATE_ADD(grade_submission_deadline_at, INTERVAL 7 DAY)
WHERE grade_submission_deadline_at IS NOT NULL;

-- 5. Keep the deciding System Administrator attributable on reopening requests.
SET @reviewer_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'GRADE_REOPEN_REQUEST'
    AND column_name = 'reviewed_by_user_id'
);
SET @add_reviewer_column_sql = IF(
  @reviewer_column_exists = 0,
  'ALTER TABLE GRADE_REOPEN_REQUEST ADD COLUMN reviewed_by_user_id BIGINT NULL AFTER teacher_assignment_id',
  'SELECT ''reviewed_by_user_id already exists'' AS migration_note'
);
PREPARE add_reviewer_column_statement FROM @add_reviewer_column_sql;
EXECUTE add_reviewer_column_statement;
DEALLOCATE PREPARE add_reviewer_column_statement;

SET @reviewer_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'GRADE_REOPEN_REQUEST'
    AND index_name = 'idx_grade_reopen_reviewer'
);
SET @add_reviewer_index_sql = IF(
  @reviewer_index_exists = 0,
  'CREATE INDEX idx_grade_reopen_reviewer ON GRADE_REOPEN_REQUEST (reviewed_by_user_id)',
  'SELECT ''reviewer index already exists'' AS migration_note'
);
PREPARE add_reviewer_index_statement FROM @add_reviewer_index_sql;
EXECUTE add_reviewer_index_statement;
DEALLOCATE PREPARE add_reviewer_index_statement;

SET @reviewer_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'GRADE_REOPEN_REQUEST'
    AND constraint_name = 'fk_grade_reopen_reviewer'
);
SET @add_reviewer_fk_sql = IF(
  @reviewer_fk_exists = 0,
  'ALTER TABLE GRADE_REOPEN_REQUEST ADD CONSTRAINT fk_grade_reopen_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES `USER` (user_id) ON DELETE SET NULL',
  'SELECT ''reviewer foreign key already exists'' AS migration_note'
);
PREPARE add_reviewer_fk_statement FROM @add_reviewer_fk_sql;
EXECUTE add_reviewer_fk_statement;
DEALLOCATE PREPARE add_reviewer_fk_statement;

-- 6. Preserve historical adviser-review records without keeping them active.
-- This rename is reversible. Drop the legacy table in a later cleanup only
-- after the team confirms that its history is no longer needed.
SET @review_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'GRADE_SHEET_REVIEW'
);
SET @rename_review_sql = IF(
  @review_table_exists = 1,
  'RENAME TABLE GRADE_SHEET_REVIEW TO GRADE_SHEET_REVIEW_LEGACY',
  'SELECT ''GRADE_SHEET_REVIEW already retired'' AS migration_note'
);
PREPARE rename_review_statement FROM @rename_review_sql;
EXECUTE rename_review_statement;
DEALLOCATE PREPARE rename_review_statement;

-- Verification
SELECT workflow_status, lock_status, COUNT(*) AS grade_sheet_count
FROM GRADE_SHEET
GROUP BY workflow_status, lock_status
ORDER BY workflow_status, lock_status;

SELECT
  term_id,
  term_name,
  grade_submission_deadline_at,
  reopening_requests_open_at,
  reopening_requests_close_at,
  TIMESTAMPDIFF(
    DAY,
    reopening_requests_open_at,
    reopening_requests_close_at
  ) AS reopening_days
FROM ACADEMIC_TERM
ORDER BY school_year_id, starts_at;
