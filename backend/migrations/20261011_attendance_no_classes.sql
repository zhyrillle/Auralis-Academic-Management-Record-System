-- A day-level exclusion; NULL leaves existing dates unclassified.
-- Learner P/A/L records are preserved when a day is marked or unmarked.
ALTER TABLE ATTENDANCE_SHEET
  ADD COLUMN no_class_reason ENUM('HOLIDAY', 'SUSPENSION') NULL DEFAULT NULL;
