require('dotenv').config();
const mysql = require('mysql2/promise');

const LOCAL_CONFIG = {
  host: process.env.LOCAL_DB_HOST || '127.0.0.1',
  port: Number(process.env.LOCAL_DB_PORT) || 3306,
  user: process.env.LOCAL_DB_USER || 'root',
  password: process.env.LOCAL_DB_PASSWORD || '',
  database: process.env.LOCAL_DB_NAME || 'auralis',
  multipleStatements: true,
};

const AIVEN_URL = process.env.AIVEN_DATABASE_URL;

async function pushLocalToAiven() {
  console.log('====================================================');
  console.log('☁️ AURALIS: PUSH LOCAL SCORES -> AIVEN CLOUD DB');
  console.log('====================================================');

  if (!AIVEN_URL) {
    console.error('❌ AIVEN_DATABASE_URL is not set in .env');
    return;
  }

  console.log('💻 Connecting to Local MySQL (127.0.0.1:3306)...');
  const localConn = await mysql.createConnection(LOCAL_CONFIG);

  console.log('☁️ Connecting to Aiven Cloud MySQL...');
  const aivenConn = await mysql.createConnection({
    uri: AIVEN_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 0. Sync local users to Aiven Cloud
    const [localUsers] = await localConn.query('SELECT * FROM USER;');
    console.log(`👤 Checking ${localUsers.length} local users...`);
    for (const u of localUsers) {
      await aivenConn.query(
        `INSERT INTO USER (user_id, role, department_id, first_name, middle_name, last_name, extension_name, email, password, account_status, pfp_url, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           role = VALUES(role),
           department_id = VALUES(department_id),
           first_name = VALUES(first_name),
           middle_name = VALUES(middle_name),
           last_name = VALUES(last_name),
           extension_name = VALUES(extension_name),
           account_status = VALUES(account_status),
           pfp_url = VALUES(pfp_url);`,
        [u.user_id, u.role, u.department_id, u.first_name, u.middle_name, u.last_name, u.extension_name, u.email, u.password, u.account_status, u.pfp_url, u.last_login_at]
      );
    }
    console.log('✅ Users verified and synced to Aiven.');

    // 0b. Sync local sections to Aiven Cloud
    const [localSections] = await localConn.query('SELECT section_id, section_name, grade_level_id, program_id, is_specialized FROM SECTION;');
    console.log(`🏫 Checking ${localSections.length} local sections...`);
    if (localSections.length > 0) {
      const placeholders = localSections.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const flat = [];
      for (const s of localSections) flat.push(s.section_id, s.section_name, s.grade_level_id, s.program_id, s.is_specialized);
      await aivenConn.query(
        `INSERT INTO SECTION (section_id, section_name, grade_level_id, program_id, is_specialized)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           section_name = VALUES(section_name),
           grade_level_id = VALUES(grade_level_id),
           program_id = VALUES(program_id),
           is_specialized = VALUES(is_specialized);`,
        flat
      );
    }
    console.log('✅ Sections verified and synced to Aiven.');

    // 0c. Sync local students to Aiven Cloud
    const [localStudents] = await localConn.query(
      `SELECT student_id, LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id
       FROM STUDENT;`
    );
    console.log(`🎒 Checking ${localStudents.length} local students...`);
    if (localStudents.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < localStudents.length; i += CHUNK_SIZE) {
        const chunk = localStudents.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const st of chunk) {
          const bdate = st.birthdate ? new Date(st.birthdate).toISOString().slice(0, 10) : null;
          flat.push(
            st.student_id,
            st.LRN,
            st.lrn_hash || null,
            st.first_name,
            st.middle_name || null,
            st.last_name,
            st.extension_name || null,
            bdate,
            st.sex || 'M',
            st.street || null,
            st.barangay || null,
            st.city || null,
            st.province || null,
            st.country || null,
            st.postal_code || null,
            st.status || 'ACTIVE',
            st.program_id || null
          );
        }
        await aivenConn.query(
          `INSERT INTO STUDENT (student_id, LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             LRN = VALUES(LRN),
             lrn_hash = VALUES(lrn_hash),
             first_name = VALUES(first_name),
             middle_name = VALUES(middle_name),
             last_name = VALUES(last_name),
             extension_name = VALUES(extension_name),
             birthdate = VALUES(birthdate),
             sex = VALUES(sex),
             street = VALUES(street),
             barangay = VALUES(barangay),
             city = VALUES(city),
             province = VALUES(province),
             country = VALUES(country),
             postal_code = VALUES(postal_code),
             status = VALUES(status),
             program_id = VALUES(program_id);`,
          flat
        );
      }
    }
    console.log('✅ Students verified and synced to Aiven.');

    // 0d. Sync local student-section assignments to Aiven Cloud
    const [localSS] = await localConn.query('SELECT student_section_id, student_id, section_id, school_year_id FROM STUDENT_SECTION;');
    console.log(`📋 Checking ${localSS.length} local student-section assignments...`);
    if (localSS.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < localSS.length; i += CHUNK_SIZE) {
        const chunk = localSS.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const ss of chunk) flat.push(ss.student_section_id, ss.student_id, ss.section_id, ss.school_year_id);
        await aivenConn.query(
          `INSERT INTO STUDENT_SECTION (student_section_id, student_id, section_id, school_year_id)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             student_id = VALUES(student_id),
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id);`,
          flat
        );
      }
    }
    console.log('✅ Student sections verified and synced to Aiven.');

    // 0e. Sync local school years to Aiven Cloud
    const [localSY] = await localConn.query('SELECT school_year_id, school_id, starts_on, ends_on, curriculum, status FROM SCHOOL_YEAR;');
    console.log(`📅 Checking ${localSY.length} local school years...`);
    if (localSY.length > 0) {
      for (const sy of localSY) {
        const startsOn = sy.starts_on instanceof Date ? sy.starts_on.toISOString().slice(0, 10) : sy.starts_on;
        const endsOn = sy.ends_on instanceof Date ? sy.ends_on.toISOString().slice(0, 10) : sy.ends_on;
        await aivenConn.query(
          `INSERT INTO SCHOOL_YEAR (school_year_id, school_id, starts_on, ends_on, curriculum, status)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             school_id = VALUES(school_id),
             starts_on = VALUES(starts_on),
             ends_on = VALUES(ends_on),
             curriculum = VALUES(curriculum),
             status = VALUES(status);`,
          [sy.school_year_id, sy.school_id, startsOn, endsOn, sy.curriculum, sy.status]
        );
      }
    }
    console.log('✅ School years verified and synced to Aiven.');

    // 0f. Sync local academic terms to Aiven Cloud
    const [localTerms] = await localConn.query('SELECT term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status FROM ACADEMIC_TERM;');
    console.log(`⏱️ Checking ${localTerms.length} local academic terms...`);
    if (localTerms.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      for (const t of localTerms) {
        await aivenConn.query(
          `INSERT INTO ACADEMIC_TERM (term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             school_year_id = VALUES(school_year_id),
             term_name = VALUES(term_name),
             starts_at = VALUES(starts_at),
             ends_at = VALUES(ends_at),
             grade_submission_deadline_at = VALUES(grade_submission_deadline_at),
             reopening_requests_open_at = VALUES(reopening_requests_open_at),
             reopening_requests_close_at = VALUES(reopening_requests_close_at),
             status = VALUES(status);`,
          [
            t.term_id,
            t.school_year_id,
            t.term_name,
            toSqlDt(t.starts_at),
            toSqlDt(t.ends_at),
            toSqlDt(t.grade_submission_deadline_at),
            toSqlDt(t.reopening_requests_open_at),
            toSqlDt(t.reopening_requests_close_at),
            t.status,
          ]
        );
      }
    }
    console.log('✅ Academic terms verified and synced to Aiven.');

    // 0g. Sync local subject component weights to Aiven Cloud
    const [localWeights] = await localConn.query('SELECT subj_comp_weight_id, subject_id, component_type_id, school_year_id, percentage FROM SUBJECT_COMPONENT_WEIGHT;');
    console.log(`⚖️ Checking ${localWeights.length} local component weights...`);
    if (localWeights.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < localWeights.length; i += CHUNK_SIZE) {
        const chunk = localWeights.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const w of chunk) flat.push(w.subj_comp_weight_id, w.subject_id, w.component_type_id, w.school_year_id, w.percentage);
        await aivenConn.query(
          `INSERT INTO SUBJECT_COMPONENT_WEIGHT (subj_comp_weight_id, subject_id, component_type_id, school_year_id, percentage)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             component_type_id = VALUES(component_type_id),
             school_year_id = VALUES(school_year_id),
             percentage = VALUES(percentage);`,
          flat
        );
      }
    }
    console.log('✅ Subject weights verified and synced to Aiven.');

    // 0h. Sync local grade transmutation config to Aiven Cloud
    const [localTransmutation] = await localConn.query('SELECT config_id, is_custom_enabled, ranges_json, updated_by FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1;');
    if (localTransmutation.length > 0) {
      const row = localTransmutation[0];
      await aivenConn.query(
        `INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id, is_custom_enabled, ranges_json, updated_by, updated_at)
         VALUES (1, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           is_custom_enabled = VALUES(is_custom_enabled),
           ranges_json = VALUES(ranges_json),
           updated_by = VALUES(updated_by),
           updated_at = NOW();`,
        [row.is_custom_enabled, typeof row.ranges_json === 'object' ? JSON.stringify(row.ranges_json) : row.ranges_json, row.updated_by]
      );
      console.log('✅ Grade transmutation configuration verified and synced to Aiven.');
    }

    // 0i. Sync local section adviser assignments to Aiven Cloud
    const [localSAA] = await localConn.query('SELECT adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until FROM SECTION_ADVISER_ASSIGNMENT;');
    console.log(`👨‍🏫 Checking ${localSAA.length} local adviser assignments...`);
    if (localSAA.length > 0) {
      for (const saa of localSAA) {
        const fromD = saa.assigned_from instanceof Date ? saa.assigned_from.toISOString().slice(0, 10) : saa.assigned_from;
        const untilD = saa.assigned_until instanceof Date ? saa.assigned_until.toISOString().slice(0, 10) : saa.assigned_until;
        await aivenConn.query(
          `INSERT INTO SECTION_ADVISER_ASSIGNMENT (adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id),
             user_id = VALUES(user_id),
             assigned_from = VALUES(assigned_from),
             assigned_until = VALUES(assigned_until);`,
          [saa.adviser_assignment_id, saa.section_id, saa.school_year_id, saa.user_id, fromD, untilD]
        );
      }
    }
    console.log('✅ Section adviser assignments verified and synced to Aiven.');

    // 0j. Sync local subject offerings to Aiven Cloud
    const [localSO] = await localConn.query('SELECT subject_offering_id, subject_id, section_id, school_year_id FROM SUBJECT_OFFERING;');
    console.log(`📚 Checking ${localSO.length} local subject offerings...`);
    if (localSO.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < localSO.length; i += CHUNK_SIZE) {
        const chunk = localSO.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const so of chunk) flat.push(so.subject_offering_id, so.subject_id, so.section_id, so.school_year_id);
        await aivenConn.query(
          `INSERT INTO SUBJECT_OFFERING (subject_offering_id, subject_id, section_id, school_year_id)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id);`,
          flat
        );
      }
    }
    console.log('✅ Subject offerings verified and synced to Aiven.');

    // 0k. Sync local teacher assignments to Aiven Cloud
    const [localTA] = await localConn.query('SELECT teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until FROM TEACHER_ASSIGNMENT;');
    console.log(`🧑‍🏫 Checking ${localTA.length} local teacher assignments...`);
    if (localTA.length > 0) {
      for (const ta of localTA) {
        const fromD = ta.assigned_from instanceof Date ? ta.assigned_from.toISOString().slice(0, 10) : ta.assigned_from;
        const untilD = ta.assigned_until instanceof Date ? ta.assigned_until.toISOString().slice(0, 10) : ta.assigned_until;
        await aivenConn.query(
          `INSERT INTO TEACHER_ASSIGNMENT (teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             user_id = VALUES(user_id),
             subject_offering_id = VALUES(subject_offering_id),
             assigned_from = VALUES(assigned_from),
             assigned_until = VALUES(assigned_until);`,
          [ta.teacher_assignment_id, ta.user_id, ta.subject_offering_id, fromD, untilD]
        );
      }
    }
    console.log('✅ Teacher assignments verified and synced to Aiven.');

    // 0l. Sync local attendance sheets to Aiven Cloud
    const [localSheets] = await localConn.query('SELECT attendance_sheet_id, teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date, no_class_reason FROM ATTENDANCE_SHEET;');
    console.log(`📋 Checking ${localSheets.length} local attendance sheets...`);
    if (localSheets.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < localSheets.length; i += CHUNK_SIZE) {
        const chunk = localSheets.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const s of chunk) {
          const dt = s.attendance_date instanceof Date ? s.attendance_date.toISOString().slice(0, 10) : s.attendance_date;
          flat.push(s.attendance_sheet_id, s.teacher_assignment_id || null, s.adviser_assignment_id || null, s.attendance_scope || 'SECTION', dt, s.no_class_reason || null);
        }
        await aivenConn.query(
          `INSERT INTO ATTENDANCE_SHEET (attendance_sheet_id, teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date, no_class_reason)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             teacher_assignment_id = VALUES(teacher_assignment_id),
             adviser_assignment_id = VALUES(adviser_assignment_id),
             attendance_scope = VALUES(attendance_scope),
             attendance_date = VALUES(attendance_date),
             no_class_reason = VALUES(no_class_reason);`,
          flat
        );
      }
    }
    console.log('✅ Attendance sheets verified and synced to Aiven.');

    // 0m. Sync local attendance records to Aiven Cloud
    const [localAtt] = await localConn.query('SELECT attendance_sheet_id, student_section_id, status, remarks FROM ATTENDANCE;');
    console.log(`📝 Checking ${localAtt.length} local attendance records...`);
    if (localAtt.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < localAtt.length; i += CHUNK_SIZE) {
        const chunk = localAtt.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const a of chunk) flat.push(a.attendance_sheet_id, a.student_section_id, a.status || 'P', a.remarks || null);
        await aivenConn.query(
          `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             remarks = VALUES(remarks);`,
          flat
        );
      }
    }
    console.log('✅ Attendance records verified and synced to Aiven.');

    // 0n. Sync local Phil-IRI assessments and screenings to Aiven Cloud
    const [localAssessments] = await localConn.query('SELECT student_section_id, subject_offering_id, test_type, passage_words_count, words_correct, oral_reading_percent, oral_reading_level, total_comp_items, comp_correct, comp_score_percent, comp_reading_level, overall_reading_level, user_id FROM PHIL_IRI_ASSESSMENT;');
    console.log(`📖 Checking ${localAssessments.length} local Phil-IRI assessments...`);
    if (localAssessments.length > 0) {
      for (const p of localAssessments) {
        await aivenConn.query(
          `INSERT INTO PHIL_IRI_ASSESSMENT (student_section_id, subject_offering_id, test_type, passage_words_count, words_correct, oral_reading_percent, oral_reading_level, total_comp_items, comp_correct, comp_score_percent, comp_reading_level, overall_reading_level, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             subject_offering_id = VALUES(subject_offering_id),
             passage_words_count = VALUES(passage_words_count),
             words_correct = VALUES(words_correct),
             oral_reading_percent = VALUES(oral_reading_percent),
             oral_reading_level = VALUES(oral_reading_level),
             total_comp_items = VALUES(total_comp_items),
             comp_correct = VALUES(comp_correct),
             comp_score_percent = VALUES(comp_score_percent),
             comp_reading_level = VALUES(comp_reading_level),
             overall_reading_level = VALUES(overall_reading_level),
             user_id = VALUES(user_id);`,
          [p.student_section_id, p.subject_offering_id, p.test_type, p.passage_words_count, p.words_correct, p.oral_reading_percent, p.oral_reading_level, p.total_comp_items, p.comp_correct, p.comp_score_percent, p.comp_reading_level, p.overall_reading_level, p.user_id]
        );
      }
    }
    console.log('✅ Phil-IRI assessments verified and synced to Aiven.');

    const [localScreenings] = await localConn.query('SELECT student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max, score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by FROM PHIL_IRI_SCREENING;');
    console.log(`📊 Checking ${localScreenings.length} local Phil-IRI screenings...`);
    if (localScreenings.length > 0) {
      for (const s of localScreenings) {
        const d = s.assessed_on instanceof Date ? s.assessed_on.toISOString().slice(0, 10) : s.assessed_on;
        await aivenConn.query(
          `INSERT INTO PHIL_IRI_SCREENING (student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max, score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             assessed_on = VALUES(assessed_on),
             test_level = VALUES(test_level),
             literal_max = VALUES(literal_max),
             inferential_max = VALUES(inferential_max),
             critical_max = VALUES(critical_max),
             score_threshold = VALUES(score_threshold),
             test_taken = VALUES(test_taken),
             literal_score = VALUES(literal_score),
             inferential_score = VALUES(inferential_score),
             critical_score = VALUES(critical_score),
             recorded_by = VALUES(recorded_by);`,
          [s.student_section_id, d, s.test_level, s.literal_max, s.inferential_max, s.critical_max, s.score_threshold, s.test_taken, s.literal_score, s.inferential_score, s.critical_score, s.recorded_by]
        );
      }
    }
    console.log('✅ Phil-IRI screenings verified and synced to Aiven.');

    // 0o. Sync local grade reopening requests to Aiven Cloud
    const [localGRR] = await localConn.query('SELECT request_id, grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status, file_name, file_path, file_type, file_size, requested_at, reviewed_at FROM GRADE_REOPEN_REQUEST;');
    console.log(`🔓 Checking ${localGRR.length} local reopen requests...`);
    if (localGRR.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      for (const r of localGRR) {
        await aivenConn.query(
          `INSERT INTO GRADE_REOPEN_REQUEST (request_id, grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status, file_name, file_path, file_type, file_size, requested_at, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             grade_sheet_id = VALUES(grade_sheet_id),
             teacher_assignment_id = VALUES(teacher_assignment_id),
             reviewed_by_user_id = VALUES(reviewed_by_user_id),
             reason = VALUES(reason),
             status = VALUES(status),
             file_name = VALUES(file_name),
             file_path = VALUES(file_path),
             file_type = VALUES(file_type),
             file_size = VALUES(file_size),
             requested_at = VALUES(requested_at),
             reviewed_at = VALUES(reviewed_at);`,
          [r.request_id, r.grade_sheet_id, r.teacher_assignment_id, r.reviewed_by_user_id || null, r.reason, r.status || 'PENDING', r.file_name || null, r.file_path || null, r.file_type || null, r.file_size || null, toSqlDt(r.requested_at), toSqlDt(r.reviewed_at)]
        );
      }
    }
    console.log('✅ Reopen requests verified and synced to Aiven.');

    // 0p. Sync local temporary reopenings to Aiven Cloud
    const [localTR] = await localConn.query('SELECT temporary_reopening_id, request_id, starts_at, expires_at, status, created_at FROM TEMPORARY_REOPENING;');
    console.log(`⏱️ Checking ${localTR.length} local temporary reopenings...`);
    if (localTR.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      for (const t of localTR) {
        await aivenConn.query(
          `INSERT INTO TEMPORARY_REOPENING (temporary_reopening_id, request_id, starts_at, expires_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             request_id = VALUES(request_id),
             starts_at = VALUES(starts_at),
             expires_at = VALUES(expires_at),
             status = VALUES(status),
             created_at = VALUES(created_at);`,
          [t.temporary_reopening_id, t.request_id, toSqlDt(t.starts_at), toSqlDt(t.expires_at), t.status || 'ACTIVE', toSqlDt(t.created_at)]
        );
      }
    }
    console.log('✅ Temporary reopenings verified and synced to Aiven.');

    // 0q. Sync local feedback to Aiven Cloud
    const [localFB] = await localConn.query('SELECT feedback_id, evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at, reviewed_at FROM FEEDBACK;');
    console.log(`💬 Checking ${localFB.length} local feedback records...`);
    if (localFB.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      for (const f of localFB) {
        await aivenConn.query(
          `INSERT INTO FEEDBACK (feedback_id, evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             evaluator_id = VALUES(evaluator_id),
             evaluee_id = VALUES(evaluee_id),
             q1_rate = VALUES(q1_rate),
             q2_rate = VALUES(q2_rate),
             q3_rate = VALUES(q3_rate),
             q4_rate = VALUES(q4_rate),
             q5_rate = VALUES(q5_rate),
             q6_rate = VALUES(q6_rate),
             q7_rate = VALUES(q7_rate),
             q8_rate = VALUES(q8_rate),
             strengths_comments = VALUES(strengths_comments),
             improvements_comments = VALUES(improvements_comments),
             status = VALUES(status),
             created_at = VALUES(created_at),
             reviewed_at = VALUES(reviewed_at);`,
          [f.feedback_id, f.evaluator_id, f.evaluee_id, f.q1_rate, f.q2_rate, f.q3_rate, f.q4_rate, f.q5_rate, f.q6_rate, f.q7_rate, f.q8_rate, f.strengths_comments || null, f.improvements_comments || null, f.status || 'OPEN', toSqlDt(f.created_at), toSqlDt(f.reviewed_at)]
        );
      }
    }
    console.log('✅ Feedback records verified and synced to Aiven.');

    // 0r. Sync local grade sheets to Aiven Cloud
    const [localGradeSheets] = await localConn.query(
      'SELECT grade_sheet_id, subject_offering_id, term_id, workflow_status, lock_status, submitted_at, approved_at, locked_at FROM GRADE_SHEET;'
    );
    console.log(`📋 Checking ${localGradeSheets.length} local grade sheets...`);
    if (localGradeSheets.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      for (const gs of localGradeSheets) {
        await aivenConn.query(
          `INSERT INTO GRADE_SHEET (grade_sheet_id, subject_offering_id, term_id, workflow_status, lock_status, submitted_at, approved_at, locked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             subject_offering_id = VALUES(subject_offering_id),
             term_id = VALUES(term_id),
             workflow_status = VALUES(workflow_status),
             lock_status = VALUES(lock_status),
             submitted_at = VALUES(submitted_at),
             approved_at = VALUES(approved_at),
             locked_at = VALUES(locked_at);`,
          [
            gs.grade_sheet_id,
            gs.subject_offering_id,
            gs.term_id,
            gs.workflow_status || 'DRAFT',
            gs.lock_status || 'EDITABLE',
            toSqlDt(gs.submitted_at),
            toSqlDt(gs.approved_at),
            toSqlDt(gs.locked_at),
          ]
        );
      }
    }
    console.log('✅ Grade sheets verified and synced to Aiven.');

    // 0s. Sync local grade activities to Aiven Cloud
    const [localActivities] = await localConn.query(
      'SELECT activity_id, grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status FROM GRADE_ACTIVITY;'
    );
    console.log(`📝 Checking ${localActivities.length} local grade activities...`);
    if (localActivities.length > 0) {
      for (const ga of localActivities) {
        const actDate = ga.activity_date instanceof Date ? ga.activity_date.toISOString().slice(0, 10) : (ga.activity_date ? String(ga.activity_date).slice(0, 10) : null);
        await aivenConn.query(
          `INSERT INTO GRADE_ACTIVITY (activity_id, grade_sheet_id, subj_comp_weight_id, mapeh_component, activity_name, highest_possible_score, activity_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             grade_sheet_id = VALUES(grade_sheet_id),
             subj_comp_weight_id = VALUES(subj_comp_weight_id),
             mapeh_component = VALUES(mapeh_component),
             activity_name = VALUES(activity_name),
             highest_possible_score = VALUES(highest_possible_score),
             activity_date = VALUES(activity_date),
             status = VALUES(status);`,
          [
            ga.activity_id,
            ga.grade_sheet_id,
            ga.subj_comp_weight_id || null,
            ga.mapeh_component || null,
            ga.activity_name,
            ga.highest_possible_score,
            actDate,
            ga.status || 'ACTIVE',
          ]
        );
      }
    }
    console.log('✅ Grade activities verified and synced to Aiven.');

    // 0t. Sync local student grades to Aiven Cloud (omit surrogate student_grade_id to avoid unique key collision)
    const [localStudentGrades] = await localConn.query(
      'SELECT subject_offering_id, student_id, student_section_id, term, mapeh_component, mapeh_key, initial_grade, quarterly_grade, remarks FROM STUDENT_GRADE;'
    );
    console.log(`🎓 Checking ${localStudentGrades.length} local student quarterly grades...`);
    if (localStudentGrades.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < localStudentGrades.length; i += CHUNK_SIZE) {
        const chunk = localStudentGrades.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const sg of chunk) {
          flat.push(
            sg.subject_offering_id,
            sg.student_id,
            sg.student_section_id || null,
            sg.term,
            sg.mapeh_component || null,
            sg.mapeh_key || null,
            sg.initial_grade,
            sg.quarterly_grade,
            sg.remarks || null
          );
        }
        await aivenConn.query(
          `INSERT INTO STUDENT_GRADE (subject_offering_id, student_id, student_section_id, term, mapeh_component, mapeh_key, initial_grade, quarterly_grade, remarks)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             student_section_id = VALUES(student_section_id),
             initial_grade = VALUES(initial_grade),
             quarterly_grade = VALUES(quarterly_grade),
             remarks = VALUES(remarks);`,
          flat
        );
      }
    }
    console.log('✅ Student quarterly grades verified and synced to Aiven.');

    // 1. Sync ALL local scores to Aiven Cloud (omit surrogate score_id to avoid unique key collision)
    const [localScores] = await localConn.query(
      'SELECT activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at, updated_at FROM SCORE;'
    );
    console.log(`📊 Checking ${localScores.length} local scores...`);

    if (localScores.length > 0) {
      const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
      const CHUNK_SIZE = 100;
      for (let i = 0; i < localScores.length; i += CHUNK_SIZE) {
        const chunk = localScores.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const sc of chunk) {
          flat.push(
            sc.activity_id,
            sc.student_section_id,
            sc.raw_score,
            sc.score_status || 'ENCODED',
            sc.teacher_assignment_id || null,
            toSqlDt(sc.created_at),
            toSqlDt(sc.updated_at)
          );
        }
        await aivenConn.query(
          `INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status, teacher_assignment_id, created_at, updated_at)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE 
             raw_score = VALUES(raw_score),
             score_status = VALUES(score_status),
             teacher_assignment_id = VALUES(teacher_assignment_id),
             updated_at = VALUES(updated_at);`,
          flat
        );
      }
      console.log(`✅ Successfully uploaded/verified ${localScores.length} scores to Aiven!`);
    } else {
      console.log('✅ No local scores to upload.');
    }

    // 2. Verify final state on Aiven
    const [finalStats] = await aivenConn.query('SELECT MAX(score_id) as max_id, COUNT(*) as count FROM SCORE;');
    console.log('\n====================================================');
    console.log(`🎉 SUCCESS! Aiven now has ${finalStats[0].count} scores (Max ID: ${finalStats[0].max_id})`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Failed to push to Aiven:', err.message);
  } finally {
    await localConn.end();
    await aivenConn.end();
  }
}

pushLocalToAiven().catch(console.error);
