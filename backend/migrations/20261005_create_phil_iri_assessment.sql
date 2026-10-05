-- Migration: Create PHIL_IRI_ASSESSMENT table for Philippine Informal Reading Inventory (English)
CREATE TABLE IF NOT EXISTS PHIL_IRI_ASSESSMENT (
    phil_iri_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_section_id BIGINT NOT NULL,
    subject_offering_id BIGINT NULL,
    test_type ENUM('PRE_TEST', 'POST_TEST') NOT NULL,
    passage_words_count INT DEFAULT 70,
    words_correct INT DEFAULT 0,
    oral_reading_percent DECIMAL(5,2) DEFAULT 0.00,
    oral_reading_level ENUM('FRUSTRATION', 'INSTRUCTIONAL', 'INDEPENDENT') DEFAULT 'FRUSTRATION',
    total_comp_items INT DEFAULT 5,
    comp_correct INT DEFAULT 0,
    comp_score_percent DECIMAL(5,2) DEFAULT 0.00,
    comp_reading_level ENUM('FRUSTRATION', 'INSTRUCTIONAL', 'INDEPENDENT') DEFAULT 'FRUSTRATION',
    overall_reading_level ENUM('FRUSTRATION', 'INSTRUCTIONAL', 'INDEPENDENT') DEFAULT 'FRUSTRATION',
    recorded_by BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_section_test (student_section_id, test_type),
    CONSTRAINT fk_phil_iri_student_section FOREIGN KEY (student_section_id) REFERENCES STUDENT_SECTION(student_section_id) ON DELETE CASCADE,
    CONSTRAINT fk_phil_iri_recorded_by FOREIGN KEY (recorded_by) REFERENCES USER(user_id) ON DELETE SET NULL
);
