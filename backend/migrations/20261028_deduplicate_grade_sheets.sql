-- Migration: 20261028_deduplicate_grade_sheets.sql
-- Description: Enforce unique constraint on GRADE_SHEET (subject_offering_id, term_id) to prevent duplicate grade sheets

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Remove known duplicate sheets while preserving sheets with recorded scores and submissions
DELETE FROM GRADE_ACTIVITY WHERE grade_sheet_id = 3;
DELETE FROM GRADE_SHEET WHERE grade_sheet_id = 3;
DELETE FROM GRADE_SHEET WHERE grade_sheet_id = 153;

-- 2. Add unique key if not exists
SET @exist := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'GRADE_SHEET'
    AND index_name = 'uq_offering_term'
);

SET @sqlstmt := IF(@exist = 0, 'ALTER TABLE GRADE_SHEET ADD UNIQUE KEY uq_offering_term (subject_offering_id, term_id)', 'SELECT "Index already exists"');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;
