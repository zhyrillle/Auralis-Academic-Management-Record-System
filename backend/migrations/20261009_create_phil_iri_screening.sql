-- Separate baseline screening scores from the existing oral pre/post-test records.
-- Apply through the team's normal migration process.
CREATE TABLE IF NOT EXISTS PHIL_IRI_SCREENING (
    screening_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_section_id BIGINT NOT NULL,
    assessed_on DATE NULL,
    test_version VARCHAR(100) NULL,
    literal_max INT NOT NULL DEFAULT 14,
    inferential_max INT NOT NULL DEFAULT 12,
    critical_max INT NOT NULL DEFAULT 14,
    screening_cutoff INT NOT NULL DEFAULT 28,
    test_taken TINYINT NULL,
    literal_score INT NULL,
    inferential_score INT NULL,
    critical_score INT NULL,
    recorded_by BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_screening_student_section (student_section_id),
  CONSTRAINT ck_screening_maxima CHECK (literal_max BETWEEN 1 AND 1000
    AND inferential_max BETWEEN 1 AND 1000 AND critical_max BETWEEN 1 AND 1000),
  CONSTRAINT ck_screening_cutoff CHECK (screening_cutoff BETWEEN 1 AND literal_max + inferential_max + critical_max),
  CONSTRAINT ck_screening_taken CHECK (test_taken IS NULL OR test_taken IN (0, 1)),
  CONSTRAINT ck_screening_scores CHECK ((literal_score IS NULL OR literal_score BETWEEN 0 AND literal_max)
    AND (inferential_score IS NULL OR inferential_score BETWEEN 0 AND inferential_max)
    AND (critical_score IS NULL OR critical_score BETWEEN 0 AND critical_max)),
  CONSTRAINT ck_screening_untested CHECK (COALESCE(test_taken, 0) = 1
    OR (literal_score IS NULL AND inferential_score IS NULL AND critical_score IS NULL)),
    CONSTRAINT fk_screening_student_section FOREIGN KEY (student_section_id)
      REFERENCES STUDENT_SECTION(student_section_id) ON DELETE CASCADE,
    CONSTRAINT fk_screening_recorded_by FOREIGN KEY (recorded_by)
      REFERENCES USER(user_id) ON DELETE SET NULL
);
