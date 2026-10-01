-- Auralis read-only schema inventory for Beekeeper Studio.
-- Select the intended Auralis database before running this file.
-- These statements do not change data or schema.

-- 1. Tables and columns
SELECT
  c.TABLE_NAME,
  c.ORDINAL_POSITION,
  c.COLUMN_NAME,
  c.COLUMN_TYPE,
  c.IS_NULLABLE,
  c.COLUMN_DEFAULT,
  c.EXTRA
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;

-- 2. Foreign keys and referential actions
SELECT
  k.TABLE_NAME,
  k.COLUMN_NAME,
  k.CONSTRAINT_NAME,
  k.REFERENCED_TABLE_NAME,
  k.REFERENCED_COLUMN_NAME,
  r.UPDATE_RULE,
  r.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE k
LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
  ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
  AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
  AND r.TABLE_NAME = k.TABLE_NAME
WHERE k.CONSTRAINT_SCHEMA = DATABASE()
  AND k.REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY k.TABLE_NAME, k.ORDINAL_POSITION;

-- 3. Primary, unique, and supporting indexes
SELECT
  s.TABLE_NAME,
  s.INDEX_NAME,
  s.NON_UNIQUE,
  s.SEQ_IN_INDEX,
  s.COLUMN_NAME,
  s.INDEX_TYPE
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = DATABASE()
ORDER BY s.TABLE_NAME, s.INDEX_NAME, s.SEQ_IN_INDEX;

