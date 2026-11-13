-- Qualifications/title suffix used by user profiles and report signatures.
-- Match the deployed USER.credentials definition without replacing user records.
-- Run all statements on the same connection. Safe to run more than once.
SET @credentials_ddl = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'user'
      AND COLUMN_NAME = 'credentials'
  ),
  'SELECT 1',
  'ALTER TABLE `USER` ADD COLUMN credentials VARCHAR(100) NULL DEFAULT NULL AFTER extension_name'
);
PREPARE credentials_statement FROM @credentials_ddl;
EXECUTE credentials_statement;
DEALLOCATE PREPARE credentials_statement;
