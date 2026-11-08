-- Idempotent on MySQL and MariaDB. Run each statement on the same connection.
CREATE TABLE IF NOT EXISTS CLASS_ARCHIVE (
  archive_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  assignment_type VARCHAR(20) NOT NULL,
  assignment_id BIGINT NOT NULL,
  section_id BIGINT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason VARCHAR(255) NULL,
  UNIQUE KEY uq_user_assignment (user_id, assignment_type, assignment_id),
  INDEX idx_user (user_id),
  INDEX idx_assignment (assignment_type, assignment_id)
) ENGINE=InnoDB;

SET @archive_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SECTION_ADVISER_ASSIGNMENT' AND COLUMN_NAME='is_archived'), 'SELECT 1', 'ALTER TABLE SECTION_ADVISER_ASSIGNMENT ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0');
PREPARE archive_stmt FROM @archive_ddl;
EXECUTE archive_stmt;
DEALLOCATE PREPARE archive_stmt;

SET @archive_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SECTION_ADVISER_ASSIGNMENT' AND COLUMN_NAME='archived_at'), 'SELECT 1', 'ALTER TABLE SECTION_ADVISER_ASSIGNMENT ADD COLUMN archived_at DATETIME NULL');
PREPARE archive_stmt FROM @archive_ddl;
EXECUTE archive_stmt;
DEALLOCATE PREPARE archive_stmt;

SET @archive_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='TEACHER_ASSIGNMENT' AND COLUMN_NAME='is_archived'), 'SELECT 1', 'ALTER TABLE TEACHER_ASSIGNMENT ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0');
PREPARE archive_stmt FROM @archive_ddl;
EXECUTE archive_stmt;
DEALLOCATE PREPARE archive_stmt;

SET @archive_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='TEACHER_ASSIGNMENT' AND COLUMN_NAME='archived_at'), 'SELECT 1', 'ALTER TABLE TEACHER_ASSIGNMENT ADD COLUMN archived_at DATETIME NULL');
PREPARE archive_stmt FROM @archive_ddl;
EXECUTE archive_stmt;
DEALLOCATE PREPARE archive_stmt;

