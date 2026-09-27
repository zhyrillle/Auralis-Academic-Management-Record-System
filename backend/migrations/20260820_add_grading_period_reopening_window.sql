-- Auralis Grading Period reopening-window migration
-- Run this migration against the revised ERD database before starting the
-- Grading Period backend endpoints.

ALTER TABLE ACADEMIC_TERM
  ADD COLUMN reopening_requests_open_at DATETIME(6) NULL
    AFTER grade_submission_deadline_at,
  ADD COLUMN reopening_requests_close_at DATETIME(6) NULL
    AFTER reopening_requests_open_at;

CREATE INDEX idx_academic_term_submission_deadline
  ON ACADEMIC_TERM (grade_submission_deadline_at);

CREATE INDEX idx_academic_term_reopening_close
  ON ACADEMIC_TERM (reopening_requests_close_at);

CREATE INDEX idx_temporary_reopening_expiry
  ON TEMPORARY_REOPENING (status, expires_at);

-- The policy is fixed: requests open at the submission deadline and remain
-- available for seven days. Existing terms are backfilled accordingly.
UPDATE ACADEMIC_TERM
SET
  reopening_requests_open_at = grade_submission_deadline_at,
  reopening_requests_close_at = DATE_ADD(grade_submission_deadline_at, INTERVAL 7 DAY)
WHERE grade_submission_deadline_at IS NOT NULL;

-- Verify the calculated windows:
SELECT
  term_id,
  term_name,
  grade_submission_deadline_at,
  reopening_requests_open_at,
  reopening_requests_close_at
FROM ACADEMIC_TERM
ORDER BY school_year_id, starts_at;
