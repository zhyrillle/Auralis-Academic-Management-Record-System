-- Retire the Grade Sheet Review table after adviser approval was removed.
--
-- This migration is intentionally guarded:
-- - It drops GRADE_SHEET_REVIEW_LEGACY only when the table is empty.
-- - It also handles an environment where the older migration has not renamed
--   GRADE_SHEET_REVIEW yet, but drops that table only when it is empty.
-- - A non-empty table is preserved so historical rows can be exported and
--   reviewed before a later, explicitly approved destructive migration.

-- Retire the already-renamed legacy table when it contains no rows.
SET @legacy_review_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'GRADE_SHEET_REVIEW_LEGACY'
);

SET @legacy_review_rows = 0;
SET @count_legacy_review_sql = IF(
  @legacy_review_exists = 1,
  'SELECT COUNT(*) INTO @legacy_review_rows FROM GRADE_SHEET_REVIEW_LEGACY',
  'SELECT 0 INTO @legacy_review_rows'
);
PREPARE count_legacy_review_statement FROM @count_legacy_review_sql;
EXECUTE count_legacy_review_statement;
DEALLOCATE PREPARE count_legacy_review_statement;

SET @drop_legacy_review_sql = CASE
  WHEN @legacy_review_exists = 0
    THEN 'SELECT ''GRADE_SHEET_REVIEW_LEGACY is already absent'' AS migration_note'
  WHEN @legacy_review_rows = 0
    THEN 'DROP TABLE GRADE_SHEET_REVIEW_LEGACY'
  ELSE
    'SELECT ''GRADE_SHEET_REVIEW_LEGACY was preserved because it contains historical rows'' AS migration_note'
END;
PREPARE drop_legacy_review_statement FROM @drop_legacy_review_sql;
EXECUTE drop_legacy_review_statement;
DEALLOCATE PREPARE drop_legacy_review_statement;

-- Handle databases that still use the original active table name.
SET @active_review_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'GRADE_SHEET_REVIEW'
);

SET @active_review_rows = 0;
SET @count_active_review_sql = IF(
  @active_review_exists = 1,
  'SELECT COUNT(*) INTO @active_review_rows FROM GRADE_SHEET_REVIEW',
  'SELECT 0 INTO @active_review_rows'
);
PREPARE count_active_review_statement FROM @count_active_review_sql;
EXECUTE count_active_review_statement;
DEALLOCATE PREPARE count_active_review_statement;

SET @drop_active_review_sql = CASE
  WHEN @active_review_exists = 0
    THEN 'SELECT ''GRADE_SHEET_REVIEW is already absent'' AS migration_note'
  WHEN @active_review_rows = 0
    THEN 'DROP TABLE GRADE_SHEET_REVIEW'
  ELSE
    'SELECT ''GRADE_SHEET_REVIEW was preserved because it contains historical rows'' AS migration_note'
END;
PREPARE drop_active_review_statement FROM @drop_active_review_sql;
EXECUTE drop_active_review_statement;
DEALLOCATE PREPARE drop_active_review_statement;

-- Verification: this should return no rows after an empty table is removed.
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('GRADE_SHEET_REVIEW', 'GRADE_SHEET_REVIEW_LEGACY');

