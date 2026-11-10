-- Add credentials column to USER table if missing
SET @credentials_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'USER'
    AND COLUMN_NAME = 'credentials'
);

SET @add_credentials_sql = IF(
  @credentials_exists = 0,
  'ALTER TABLE `USER` ADD COLUMN `credentials` VARCHAR(255) NULL AFTER `extension_name`',
  'SELECT 1'
);

PREPARE add_credentials_stmt FROM @add_credentials_sql;
EXECUTE add_credentials_stmt;
DEALLOCATE PREPARE add_credentials_stmt;
