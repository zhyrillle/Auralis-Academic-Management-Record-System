-- Disable foreign key checks temporarily to make dropping/recreating tables painless during development
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS AUDIT_LOG;
DROP TABLE IF EXISTS GRADE_REOPEN_REQUEST;
DROP TABLE IF EXISTS SCORE;
DROP TABLE IF EXISTS COMPONENT_TYPE;
DROP TABLE IF EXISTS ATTENDANCE;
DROP TABLE IF EXISTS STUDENT_SECTION;
DROP TABLE IF EXISTS SUBJECT;
DROP TABLE IF EXISTS GRADE_SUBMISSION;
DROP TABLE IF EXISTS SECTION;
DROP TABLE IF EXISTS GRADE_LEVEL;
DROP TABLE IF EXISTS STUDENT;
DROP TABLE IF EXISTS NOTIFICATION;
DROP TABLE IF EXISTS FEEDBACK;
DROP TABLE IF EXISTS USER;
DROP TABLE IF EXISTS SCHOOL_YEAR;
DROP TABLE IF EXISTS SCHOOL;
SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================
-- 1. INDEPENDENT / PARENT TABLES
-- ==========================================

CREATE TABLE SCHOOL (
    school_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_name VARCHAR(100) NOT NULL,
    school_code VARCHAR(50),
    region VARCHAR(50),
    division VARCHAR(50),
    street VARCHAR(50),
    city VARCHAR(50),
    province VARCHAR(50),
    country VARCHAR(50),
    postal_code INT
);

CREATE TABLE GRADE_LEVEL (
    grade_level_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    grade_level_name VARCHAR(100) NOT NULL
);

CREATE TABLE STUDENT (
    student_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    LRN BIGINT UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    extension_name VARCHAR(3),
    birthdate DATE,
    sex VARCHAR(2),
    street VARCHAR(50),
    city VARCHAR(50),
    province VARCHAR(50),
    country VARCHAR(50),
    postal_code INT
);

CREATE TABLE SCHOOL_YEAR (
    school_year_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    start_year DATE NOT NULL,
    end_year DATE NOT NULL,
    term ENUM('1st', '2nd', '3rd') NOT NULL,
    curriculum VARCHAR(100)
);

CREATE TABLE COMPONENT_TYPE (
    component_type_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    component_name VARCHAR(100) NOT NULL,
    percentage DECIMAL(5,2) NOT NULL
);

-- ==========================================
-- 2. FIRST-LEVEL DEPENDENT TABLES (Rely on Parents)
-- ==========================================

CREATE TABLE USER (
    user_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT,
    role ENUM('1', '2', '3', '4', '5') NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    pfp VARCHAR(100),
    FOREIGN KEY (school_id) REFERENCES SCHOOL(school_id) ON DELETE SET NULL
);

CREATE TABLE SECTION (
    section_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    section_name VARCHAR(100) NOT NULL,
    grade_level_id BIGINT,
    user_id BIGINT, -- Adviser
    FOREIGN KEY (grade_level_id) REFERENCES GRADE_LEVEL(grade_level_id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE SET NULL
);

CREATE TABLE GRADE_SUBMISSION (
    submission_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_year_id BIGINT,
    open_datetime DATETIME NOT NULL,
    close_datetime DATETIME NOT NULL,
    status ENUM('Open', 'Closed') NOT NULL DEFAULT 'Closed',
    FOREIGN KEY (school_year_id) REFERENCES SCHOOL_YEAR(school_year_id) ON DELETE CASCADE
);

-- ==========================================
-- 3. SECOND-LEVEL DEPENDENT TABLES
-- ==========================================

CREATE TABLE SUBJECT (
    subject_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    subject_name VARCHAR(100) NOT NULL,
    subject_code VARCHAR(10) NOT NULL,
    description VARCHAR(100),
    student_section_id BIGINT, -- Handled below using ALTER TABLE to avoid circular dependency
    user_id BIGINT, -- Teacher assigned
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE SET NULL
);

CREATE TABLE STUDENT_SECTION (
    student_section_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_id BIGINT NOT NULL,
    section_id BIGINT NOT NULL,
    school_year_id BIGINT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES SECTION(section_id) ON DELETE CASCADE,
    FOREIGN KEY (school_year_id) REFERENCES SCHOOL_YEAR(school_year_id) ON DELETE CASCADE
);

-- Resolve the circular reference between SUBJECT and STUDENT_SECTION
ALTER TABLE SUBJECT 
ADD CONSTRAINT fk_subject_student_section
FOREIGN KEY (student_section_id) REFERENCES STUDENT_SECTION(student_section_id) ON DELETE SET NULL;

-- ==========================================
-- 4. SCORE, ATTENDANCE & REQUEST TABLES
-- ==========================================

CREATE TABLE SCORE (
    score_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    component_type_id BIGINT NOT NULL,
    activity_name VARCHAR(50) NOT NULL,
    highest_score INT NOT NULL,
    raw_score INT NOT NULL,
    initial_grade DECIMAL(5,2),
    term_grade DECIMAL(5,2),
    descriptor VARCHAR(50),
    remark VARCHAR(50),
    locked_status BOOLEAL DEFAULT FALSE,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subject_id BIGINT,
    student_section_id BIGINT,
    FOREIGN KEY (component_type_id) REFERENCES COMPONENT_TYPE(component_type_id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id) REFERENCES SUBJECT(subject_id) ON DELETE CASCADE,
    FOREIGN KEY (student_section_id) REFERENCES STUDENT_SECTION(student_section_id) ON DELETE CASCADE
);

CREATE TABLE ATTENDANCE (
    attendance_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    student_section_id BIGINT NOT NULL,
    attendance_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('P', 'A', 'L') NOT NULL, -- Present, Absent, Late
    FOREIGN KEY (student_section_id) REFERENCES STUDENT_SECTION(student_section_id) ON DELETE CASCADE
);

CREATE TABLE GRADE_REOPEN_REQUEST (
    request_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL, -- Requesting Teacher
    subject_id BIGINT NOT NULL,
    submission_id BIGINT NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reopen_until DATE,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES SUBJECT(subject_id) ON DELETE CASCADE,
    FOREIGN KEY (submission_id) REFERENCES GRADE_SUBMISSION(submission_id) ON DELETE CASCADE
);

-- ==========================================
-- 5. UTILITY & SYSTEM LOGS (AUDIT, NOTIFICATION, FEEDBACK)
-- ==========================================

CREATE TABLE AUDIT_LOG (
    audit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    score_id BIGINT,
    action_type ENUM('update', 'delete') NOT NULL,
    module_name DATE, -- Adjust data type if module_name should be VARCHAR
    affected_table VARCHAR(10),
    previous_value INT,
    new_value INT,
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks TEXT,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE SET NULL,
    FOREIGN KEY (score_id) REFERENCES SCORE(score_id) ON DELETE SET NULL
);

CREATE TABLE NOTIFICATION (
    notification_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('input_reminder', 'deadline') NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);

CREATE TABLE FEEDBACK (
    feedback_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    feedback_type ENUM('positive', 'neutral', 'negative') NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES USER(user_id) ON DELETE CASCADE
);