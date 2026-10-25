const db = require('../config/db');

function formatDate(val) {
  if (!val || String(val).trim() === '') return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Automatically sync sections from Aiven Cloud into local MySQL.
 */
async function syncSectionsFromCloud(timeoutMs = 2500) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud section sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    const [cloudSections] = await db.cloudPool.query(
      `SELECT section_id, section_name, grade_level_id, program_id, is_specialized FROM SECTION`
    );

    if (cloudSections && cloudSections.length > 0) {
      for (const s of cloudSections) {
        await db.execute(
          `INSERT INTO SECTION (section_id, section_name, grade_level_id, program_id, is_specialized)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             section_name = VALUES(section_name),
             grade_level_id = VALUES(grade_level_id),
             program_id = VALUES(program_id),
             is_specialized = VALUES(is_specialized)`,
          [s.section_id, s.section_name, s.grade_level_id, s.program_id, s.is_specialized]
        );
      }

      // Cleanup sections deleted on Cloud
      const cloudIds = cloudSections.map((s) => s.section_id);
      const [localExtra] = await db.execute(
        `SELECT section_id FROM SECTION WHERE section_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const extra of localExtra) {
        try {
          await db.execute('DELETE FROM STUDENT_SECTION WHERE section_id = ?', [extra.section_id]);
          await db.execute('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ?', [extra.section_id]);
          await db.execute('DELETE FROM SUBJECT_OFFERING WHERE section_id = ?', [extra.section_id]);
          await db.execute('DELETE FROM SECTION WHERE section_id = ?', [extra.section_id]);
        } catch (_) {}
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudSectionSync] Bypassed cloud sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync students from Aiven Cloud into local MySQL.
 */
async function syncStudentsFromCloud(timeoutMs = 4000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud student sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    const [cloudStudents] = await db.cloudPool.query(
      `SELECT student_id, LRN, lrn_hash, first_name, middle_name, last_name, extension_name, birthdate, sex, street, barangay, city, province, country, postal_code, status, program_id
       FROM STUDENT`
    );

    if (cloudStudents && cloudStudents.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudStudents.length; i += CHUNK_SIZE) {
        const chunk = cloudStudents.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = [];
        for (const s of chunk) {
          flatValues.push(
            s.student_id,
            s.LRN,
            s.lrn_hash || null,
            s.first_name,
            s.middle_name || null,
            s.last_name,
            s.extension_name || null,
            formatDate(s.birthdate),
            s.sex || 'M',
            s.street || null,
            s.barangay || null,
            s.city || null,
            s.province || null,
            s.country || null,
            s.postal_code || null,
            s.status || 'ACTIVE',
            s.program_id || null
          );
        }

        await db.execute(
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
             program_id = VALUES(program_id)`,
          flatValues
        );
      }

      // Cleanup students deleted on Cloud
      const cloudIds = cloudStudents.map((s) => s.student_id);
      const [localExtra] = await db.execute(
        `SELECT student_id FROM STUDENT WHERE student_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const extra of localExtra) {
        try {
          await db.execute('DELETE FROM STUDENT_SECTION WHERE student_id = ?', [extra.student_id]);
          await db.execute('DELETE FROM STUDENT_GRADE WHERE student_id = ?', [extra.student_id]);
          await db.execute('DELETE FROM STUDENT WHERE student_id = ?', [extra.student_id]);
        } catch (_) {}
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudStudentSync] Bypassed cloud sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync student section assignments from Aiven Cloud into local MySQL.
 */
async function syncStudentSectionsFromCloud(timeoutMs = 4000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud student section sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    // 1. Fetch all student sections from cloud
    const [cloudSS] = await db.cloudPool.query(
      `SELECT student_section_id, student_id, section_id, school_year_id FROM STUDENT_SECTION`
    );

    if (cloudSS && cloudSS.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < cloudSS.length; i += CHUNK_SIZE) {
        const chunk = cloudSS.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const flatValues = [];
        for (const row of chunk) {
          flatValues.push(row.student_section_id, row.student_id, row.section_id, row.school_year_id);
        }

        try {
          await db.execute(
            `INSERT INTO STUDENT_SECTION (student_section_id, student_id, section_id, school_year_id)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
               student_id = VALUES(student_id),
               section_id = VALUES(section_id),
               school_year_id = VALUES(school_year_id)`,
            flatValues
          );
        } catch (err) {
          // If bulk insert hits FK constraint, fall back to individual rows
          for (const row of chunk) {
            try {
              await db.execute(
                `INSERT INTO STUDENT_SECTION (student_section_id, student_id, section_id, school_year_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   student_id = VALUES(student_id),
                   section_id = VALUES(section_id),
                   school_year_id = VALUES(school_year_id)`,
                [row.student_section_id, row.student_id, row.section_id, row.school_year_id]
              );
            } catch (_) {}
          }
        }
      }

      // Cleanup unassigned / deleted student sections
      const cloudIds = cloudSS.map((ss) => ss.student_section_id);
      const [localExtra] = await db.execute(
        `SELECT student_section_id FROM STUDENT_SECTION WHERE student_section_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const extra of localExtra) {
        try {
          await db.execute('DELETE FROM STUDENT_SECTION WHERE student_section_id = ?', [extra.student_section_id]);
        } catch (_) {}
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudStudentSectionSync] Bypassed cloud sync (${err.message}). Serving local database.`);
  }
}

/**
 * Forward student section assignment to Aiven Cloud.
 */
async function forwardStudentAssignToCloud(studentId, sectionId, schoolYearId, targetProgId) {
  if (!db.cloudPool) return;

  try {
    let syId = schoolYearId;
    if (!syId) {
      const [syRows] = await db.cloudPool.query(`SELECT school_year_id FROM SCHOOL_YEAR WHERE status IN ('ACTIVE', 'ONGOING') ORDER BY school_year_id DESC LIMIT 1`);
      syId = syRows[0]?.school_year_id || 1;
    }

    let finalProgId = targetProgId;
    if (finalProgId === undefined) {
      const [secRows] = await db.cloudPool.query('SELECT is_specialized, program_id FROM SECTION WHERE section_id = ?', [sectionId]);
      if (secRows.length > 0) {
        finalProgId = secRows[0].is_specialized == 1 && secRows[0].program_id ? Number(secRows[0].program_id) : 4;
      }
    }

    const [existing] = await db.cloudPool.query(
      `SELECT student_section_id FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ? LIMIT 1`,
      [studentId, syId]
    );

    if (existing.length > 0) {
      await db.cloudPool.query(
        `UPDATE STUDENT_SECTION SET section_id = ? WHERE student_section_id = ?`,
        [sectionId, existing[0].student_section_id]
      );
    } else {
      await db.cloudPool.query(
        `INSERT INTO STUDENT_SECTION (student_id, section_id, school_year_id) VALUES (?, ?, ?)`,
        [studentId, sectionId, syId]
      );
    }

    if (finalProgId !== undefined && finalProgId !== null) {
      await db.cloudPool.query(`UPDATE STUDENT SET program_id = ? WHERE student_id = ?`, [finalProgId, studentId]);
    }
  } catch (err) {
    console.warn('[CloudAssign] Failed to sync assignment to Aiven Cloud:', err.message);
  }
}

/**
 * Forward student unassignment to Aiven Cloud.
 */
async function forwardStudentUnassignToCloud(studentId, sectionId, schoolYearId, studentSectionId) {
  if (!db.cloudPool) return;

  try {
    let resolvedStudentId = studentId;
    if (!resolvedStudentId && studentSectionId) {
      const [ssRows] = await db.cloudPool.query(
        'SELECT student_id FROM STUDENT_SECTION WHERE student_section_id = ?',
        [studentSectionId]
      );
      if (ssRows.length > 0) resolvedStudentId = ssRows[0].student_id;
    }

    if (studentSectionId) {
      await db.cloudPool.query(`DELETE FROM STUDENT_SECTION WHERE student_section_id = ?`, [studentSectionId]);
    } else if (studentId && sectionId) {
      await db.cloudPool.query(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND section_id = ?`,
        [studentId, sectionId]
      );
    } else if (studentId) {
      await db.cloudPool.query(
        `DELETE FROM STUDENT_SECTION WHERE student_id = ? AND school_year_id = ?`,
        [studentId, schoolYearId]
      );
    }

    if (resolvedStudentId) {
      await db.cloudPool.query('UPDATE STUDENT SET program_id = 4 WHERE student_id = ?', [resolvedStudentId]);
    }
  } catch (err) {
    console.warn('[CloudUnassign] Failed to sync unassign to Aiven Cloud:', err.message);
  }
}

/**
 * Automatically sync academic calendar (SCHOOL_YEAR and ACADEMIC_TERM) from Aiven Cloud.
 */
async function syncAcademicCalendarFromCloud(timeoutMs = 2500) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud academic calendar sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    // 1. Sync SCHOOL_YEAR
    const [cloudSY] = await db.cloudPool.query(
      `SELECT school_year_id, school_id, starts_on, ends_on, curriculum, status FROM SCHOOL_YEAR`
    );
    if (cloudSY && cloudSY.length > 0) {
      for (const sy of cloudSY) {
        const startsOn = sy.starts_on instanceof Date ? sy.starts_on.toISOString().slice(0, 10) : sy.starts_on;
        const endsOn = sy.ends_on instanceof Date ? sy.ends_on.toISOString().slice(0, 10) : sy.ends_on;
        await db.execute(
          `INSERT INTO SCHOOL_YEAR (school_year_id, school_id, starts_on, ends_on, curriculum, status)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             school_id = VALUES(school_id),
             starts_on = VALUES(starts_on),
             ends_on = VALUES(ends_on),
             curriculum = VALUES(curriculum),
             status = VALUES(status)`,
          [sy.school_year_id, sy.school_id, startsOn, endsOn, sy.curriculum, sy.status]
        ).catch(() => {});
      }
    }

    // 2. Sync ACADEMIC_TERM
    const [cloudTerms] = await db.cloudPool.query(
      `SELECT term_id, school_year_id, term_name, starts_at, ends_at, grade_submission_deadline_at, reopening_requests_open_at, reopening_requests_close_at, status
       FROM ACADEMIC_TERM`
    );
    if (cloudTerms && cloudTerms.length > 0) {
      for (const t of cloudTerms) {
        const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
        await db.execute(
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
             status = VALUES(status)`,
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
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudCalendarSync] Bypassed cloud calendar sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync subject component weights from Aiven Cloud.
 */
async function syncSubjectComponentWeightsFromCloud(schoolYearId = null, timeoutMs = 2500) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud weights sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    let query = `SELECT subj_comp_weight_id, subject_id, component_type_id, school_year_id, percentage FROM SUBJECT_COMPONENT_WEIGHT`;
    const params = [];
    if (schoolYearId) {
      query += ` WHERE school_year_id = ?`;
      params.push(schoolYearId);
    }

    const [cloudWeights] = await db.cloudPool.query(query, params);
    if (cloudWeights && cloudWeights.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudWeights.length; i += CHUNK_SIZE) {
        const chunk = cloudWeights.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const w of chunk) flat.push(w.subj_comp_weight_id, w.subject_id, w.component_type_id, w.school_year_id, w.percentage);

        await db.execute(
          `INSERT INTO SUBJECT_COMPONENT_WEIGHT (subj_comp_weight_id, subject_id, component_type_id, school_year_id, percentage)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             component_type_id = VALUES(component_type_id),
             school_year_id = VALUES(school_year_id),
             percentage = VALUES(percentage)`,
          flat
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudWeightsSync] Bypassed cloud weights sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync grade transmutation config from Aiven Cloud.
 */
async function syncGradeTransmutationFromCloud(timeoutMs = 2500) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud transmutation sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    const [cloudRows] = await db.cloudPool.query(
      `SELECT config_id, is_custom_enabled, ranges_json, updated_by, updated_at FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1`
    );
    if (cloudRows && cloudRows.length > 0) {
      const row = cloudRows[0];
      await db.execute(
        `INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id, is_custom_enabled, ranges_json, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_custom_enabled = VALUES(is_custom_enabled),
           ranges_json = VALUES(ranges_json),
           updated_by = VALUES(updated_by),
           updated_at = VALUES(updated_at)`,
        [
          row.config_id,
          row.is_custom_enabled,
          typeof row.ranges_json === 'object' ? JSON.stringify(row.ranges_json) : row.ranges_json,
          row.updated_by,
          row.updated_at,
        ]
      ).catch(() => {});
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudTransmutationSync] Bypassed cloud transmutation sync (${err.message}). Serving local database.`);
  }
}

/**
 * Forward Subject Weights configuration to Aiven Cloud.
 */
async function forwardSubjectWeightsToCloud(schoolYearId, weights) {
  if (!db.cloudPool) return;

  try {
    for (const weight of weights) {
      const [existing] = await db.cloudPool.query(
        `SELECT subj_comp_weight_id FROM SUBJECT_COMPONENT_WEIGHT WHERE subject_id = ? AND component_type_id = ? AND school_year_id = ? LIMIT 1`,
        [weight.subject_id, weight.component_type_id, schoolYearId]
      );
      if (existing.length > 0) {
        await db.cloudPool.query(
          `UPDATE SUBJECT_COMPONENT_WEIGHT SET percentage = ? WHERE subj_comp_weight_id = ?`,
          [weight.percentage, existing[0].subj_comp_weight_id]
        );
      } else {
        await db.cloudPool.query(
          `INSERT INTO SUBJECT_COMPONENT_WEIGHT (subject_id, component_type_id, school_year_id, percentage) VALUES (?, ?, ?, ?)`,
          [weight.subject_id, weight.component_type_id, schoolYearId, weight.percentage]
        );
      }
    }
  } catch (err) {
    console.warn('[CloudWeights] Failed to dual-write weights to Aiven Cloud:', err.message);
  }
}

/**
 * Forward Grade Transmutation config to Aiven Cloud.
 */
async function forwardGradeTransmutationToCloud(config) {
  if (!db.cloudPool) return;

  try {
    const isCustom = config.is_custom_enabled ? 1 : 0;
    const jsonStr = typeof config.ranges === 'object' ? JSON.stringify(config.ranges) : config.ranges_json;
    await db.cloudPool.query(
      `INSERT INTO GRADE_TRANSMUTATION_CONFIG (config_id, is_custom_enabled, ranges_json, updated_by, updated_at)
       VALUES (1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         is_custom_enabled = VALUES(is_custom_enabled),
         ranges_json = VALUES(ranges_json),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [isCustom, jsonStr, config.updated_by || null]
    );
  } catch (err) {
    console.warn('[CloudTransmutation] Failed to dual-write transmutation to Aiven Cloud:', err.message);
  }
}

/**
 * Automatically sync academic assignments (SECTION_ADVISER_ASSIGNMENT, SUBJECT_OFFERING, TEACHER_ASSIGNMENT) from Aiven Cloud.
 */
async function syncAcademicAssignmentsFromCloud(timeoutMs = 3000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud academic assignments sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    // 1. Sync SECTION_ADVISER_ASSIGNMENT
    const [cloudSAA] = await db.cloudPool.query(
      `SELECT adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until FROM SECTION_ADVISER_ASSIGNMENT`
    );
    if (cloudSAA && cloudSAA.length > 0) {
      for (const saa of cloudSAA) {
        await db.execute(
          `INSERT INTO SECTION_ADVISER_ASSIGNMENT (adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id),
             user_id = VALUES(user_id),
             assigned_from = VALUES(assigned_from),
             assigned_until = VALUES(assigned_until)`,
          [saa.adviser_assignment_id, saa.section_id, saa.school_year_id, saa.user_id, formatDate(saa.assigned_from), formatDate(saa.assigned_until)]
        ).catch(() => {});
      }
      const cloudIds = cloudSAA.map((r) => r.adviser_assignment_id);
      const [extra] = await db.execute(
        `SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const row of extra) {
        await db.execute('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id = ?', [row.adviser_assignment_id]).catch(() => {});
      }
    }

    // 2. Sync SUBJECT_OFFERING
    const [cloudSO] = await db.cloudPool.query(
      `SELECT subject_offering_id, subject_id, section_id, school_year_id FROM SUBJECT_OFFERING`
    );
    if (cloudSO && cloudSO.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudSO.length; i += CHUNK_SIZE) {
        const chunk = cloudSO.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const so of chunk) flat.push(so.subject_offering_id, so.subject_id, so.section_id, so.school_year_id);
        await db.execute(
          `INSERT INTO SUBJECT_OFFERING (subject_offering_id, subject_id, section_id, school_year_id)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             section_id = VALUES(section_id),
             school_year_id = VALUES(school_year_id)`,
          flat
        ).catch(() => {});
      }
      const cloudIds = cloudSO.map((r) => r.subject_offering_id);
      const [extra] = await db.execute(
        `SELECT subject_offering_id FROM SUBJECT_OFFERING WHERE subject_offering_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const row of extra) {
        await db.execute('DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ?', [row.subject_offering_id]).catch(() => {});
      }
    }

    // 3. Sync TEACHER_ASSIGNMENT
    const [cloudTA] = await db.cloudPool.query(
      `SELECT teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until FROM TEACHER_ASSIGNMENT`
    );
    if (cloudTA && cloudTA.length > 0) {
      for (const ta of cloudTA) {
        await db.execute(
          `INSERT INTO TEACHER_ASSIGNMENT (teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             user_id = VALUES(user_id),
             subject_offering_id = VALUES(subject_offering_id),
             assigned_from = VALUES(assigned_from),
             assigned_until = VALUES(assigned_until)`,
          [ta.teacher_assignment_id, ta.user_id, ta.subject_offering_id, formatDate(ta.assigned_from), formatDate(ta.assigned_until)]
        ).catch(() => {});
      }
      const cloudIds = cloudTA.map((r) => r.teacher_assignment_id);
      const [extra] = await db.execute(
        `SELECT teacher_assignment_id FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id NOT IN (${cloudIds.map(() => '?').join(',')})`,
        cloudIds
      );
      for (const row of extra) {
        await db.execute('DELETE FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ?', [row.teacher_assignment_id]).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudAssignmentsSync] Bypassed cloud assignments sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync attendance sheets and records from Aiven Cloud.
 */
async function syncAttendanceFromCloud(timeoutMs = 4000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud attendance sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    // 1. Sync ATTENDANCE_SHEET
    const [cloudSheets] = await db.cloudPool.query(
      `SELECT attendance_sheet_id, teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date, no_class_reason
       FROM ATTENDANCE_SHEET`
    );
    if (cloudSheets && cloudSheets.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudSheets.length; i += CHUNK_SIZE) {
        const chunk = cloudSheets.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const s of chunk) {
          flat.push(
            s.attendance_sheet_id,
            s.teacher_assignment_id || null,
            s.adviser_assignment_id || null,
            s.attendance_scope || 'SECTION',
            formatDate(s.attendance_date),
            s.no_class_reason || null
          );
        }
        await db.execute(
          `INSERT INTO ATTENDANCE_SHEET (attendance_sheet_id, teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date, no_class_reason)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             teacher_assignment_id = VALUES(teacher_assignment_id),
             adviser_assignment_id = VALUES(adviser_assignment_id),
             attendance_scope = VALUES(attendance_scope),
             attendance_date = VALUES(attendance_date),
             no_class_reason = VALUES(no_class_reason)`,
          flat
        ).catch(() => {});
      }
    }

    // 2. Sync ATTENDANCE
    const [cloudAttendance] = await db.cloudPool.query(
      `SELECT attendance_id, attendance_sheet_id, student_section_id, status, remarks FROM ATTENDANCE`
    );
    if (cloudAttendance && cloudAttendance.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < cloudAttendance.length; i += CHUNK_SIZE) {
        const chunk = cloudAttendance.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const a of chunk) {
          flat.push(a.attendance_id, a.attendance_sheet_id, a.student_section_id, a.status || 'P', a.remarks || null);
        }
        await db.execute(
          `INSERT INTO ATTENDANCE (attendance_id, attendance_sheet_id, student_section_id, status, remarks)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             attendance_sheet_id = VALUES(attendance_sheet_id),
             student_section_id = VALUES(student_section_id),
             status = VALUES(status),
             remarks = VALUES(remarks)`,
          flat
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudAttendanceSync] Bypassed cloud attendance sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync Phil-IRI assessments and screenings from Aiven Cloud.
 */
async function syncPhilIriFromCloud(timeoutMs = 3500) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud Phil-IRI sync timeout exceeded')), timeoutMs)
  );

  const syncWork = (async () => {
    // 1. Sync PHIL_IRI_ASSESSMENT
    const [cloudAssessments] = await db.cloudPool.query(
      `SELECT phil_iri_id, student_section_id, subject_offering_id, test_type, passage_words_count, words_correct, oral_reading_percent, oral_reading_level, total_comp_items, comp_correct, comp_score_percent, comp_reading_level, overall_reading_level, user_id
       FROM PHIL_IRI_ASSESSMENT`
    );
    if (cloudAssessments && cloudAssessments.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudAssessments.length; i += CHUNK_SIZE) {
        const chunk = cloudAssessments.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const p of chunk) {
          flat.push(
            p.phil_iri_id,
            p.student_section_id,
            p.subject_offering_id || null,
            p.test_type || 'PRE_TEST',
            p.passage_words_count || 70,
            p.words_correct || 0,
            p.oral_reading_percent || 0.0,
            p.oral_reading_level || 'FRUSTRATION',
            p.total_comp_items || 5,
            p.comp_correct || 0,
            p.comp_score_percent || 0.0,
            p.comp_reading_level || 'FRUSTRATION',
            p.overall_reading_level || 'FRUSTRATION',
            p.user_id || null
          );
        }
        await db.execute(
          `INSERT INTO PHIL_IRI_ASSESSMENT (phil_iri_id, student_section_id, subject_offering_id, test_type, passage_words_count, words_correct, oral_reading_percent, oral_reading_level, total_comp_items, comp_correct, comp_score_percent, comp_reading_level, overall_reading_level, user_id)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             student_section_id = VALUES(student_section_id),
             subject_offering_id = VALUES(subject_offering_id),
             test_type = VALUES(test_type),
             passage_words_count = VALUES(passage_words_count),
             words_correct = VALUES(words_correct),
             oral_reading_percent = VALUES(oral_reading_percent),
             oral_reading_level = VALUES(oral_reading_level),
             total_comp_items = VALUES(total_comp_items),
             comp_correct = VALUES(comp_correct),
             comp_score_percent = VALUES(comp_score_percent),
             comp_reading_level = VALUES(comp_reading_level),
             overall_reading_level = VALUES(overall_reading_level),
             user_id = VALUES(user_id)`,
          flat
        ).catch(() => {});
      }
    }

    // 2. Sync PHIL_IRI_SCREENING
    const [cloudScreenings] = await db.cloudPool.query(
      `SELECT screening_id, student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max, score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by
       FROM PHIL_IRI_SCREENING`
    );
    if (cloudScreenings && cloudScreenings.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < cloudScreenings.length; i += CHUNK_SIZE) {
        const chunk = cloudScreenings.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flat = [];
        for (const s of chunk) {
          flat.push(
            s.screening_id,
            s.student_section_id,
            formatDate(s.assessed_on),
            s.test_level || null,
            s.literal_max || 0,
            s.inferential_max || 0,
            s.critical_max || 0,
            s.score_threshold || 0,
            s.test_taken || 0,
            s.literal_score,
            s.inferential_score,
            s.critical_score,
            s.recorded_by || null
          );
        }
        await db.execute(
          `INSERT INTO PHIL_IRI_SCREENING (screening_id, student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max, score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             student_section_id = VALUES(student_section_id),
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
             recorded_by = VALUES(recorded_by)`,
          flat
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudPhilIriSync] Bypassed cloud Phil-IRI sync (${err.message}). Serving local database.`);
  }
}

/**
 * Forward Adviser Assignment mutation to Aiven Cloud.
 */
async function forwardAdviserAssignmentToCloud(id, data, isUpdate = false) {
  if (!db.cloudPool) return;
  try {
    if (isUpdate) {
      await db.cloudPool.query(
        `UPDATE SECTION_ADVISER_ASSIGNMENT SET section_id = ?, school_year_id = ?, user_id = ?, assigned_from = ?, assigned_until = ? WHERE adviser_assignment_id = ?`,
        [data.section_id, data.school_year_id, data.user_id, formatDate(data.assigned_from), formatDate(data.assigned_until), id]
      );
    } else {
      await db.cloudPool.query(
        `INSERT INTO SECTION_ADVISER_ASSIGNMENT (adviser_assignment_id, section_id, school_year_id, user_id, assigned_from, assigned_until)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           section_id = VALUES(section_id),
           school_year_id = VALUES(school_year_id),
           user_id = VALUES(user_id),
           assigned_from = VALUES(assigned_from),
           assigned_until = VALUES(assigned_until)`,
        [id, data.section_id, data.school_year_id, data.user_id, formatDate(data.assigned_from), formatDate(data.assigned_until)]
      );
    }
  } catch (err) {
    console.warn('[CloudAdviserAssignment] Failed to dual-write adviser assignment to Aiven Cloud:', err.message);
  }
}

async function forwardAdviserAssignmentDeleteToCloud(id) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query('DELETE FROM SECTION_ADVISER_ASSIGNMENT WHERE adviser_assignment_id = ?', [id]);
  } catch (err) {
    console.warn('[CloudAdviserAssignment] Failed to delete adviser assignment from Aiven Cloud:', err.message);
  }
}

/**
 * Forward Subject Offering mutation to Aiven Cloud.
 */
async function forwardSubjectOfferingToCloud(id, data, isUpdate = false) {
  if (!db.cloudPool) return;
  try {
    if (isUpdate) {
      await db.cloudPool.query(
        `UPDATE SUBJECT_OFFERING SET subject_id = ?, section_id = ?, school_year_id = ? WHERE subject_offering_id = ?`,
        [data.subject_id, data.section_id, data.school_year_id, id]
      );
    } else {
      await db.cloudPool.query(
        `INSERT INTO SUBJECT_OFFERING (subject_offering_id, subject_id, section_id, school_year_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           subject_id = VALUES(subject_id),
           section_id = VALUES(section_id),
           school_year_id = VALUES(school_year_id)`,
        [id, data.subject_id, data.section_id, data.school_year_id]
      );
    }
  } catch (err) {
    console.warn('[CloudSubjectOffering] Failed to dual-write subject offering to Aiven Cloud:', err.message);
  }
}

async function forwardSubjectOfferingDeleteToCloud(id) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query('DELETE FROM SUBJECT_OFFERING WHERE subject_offering_id = ?', [id]);
  } catch (err) {
    console.warn('[CloudSubjectOffering] Failed to delete subject offering from Aiven Cloud:', err.message);
  }
}

/**
 * Forward Teacher Assignment mutation to Aiven Cloud.
 */
async function forwardTeacherAssignmentToCloud(id, data, isUpdate = false) {
  if (!db.cloudPool) return;
  try {
    if (isUpdate) {
      await db.cloudPool.query(
        `UPDATE TEACHER_ASSIGNMENT SET user_id = ?, subject_offering_id = ?, assigned_from = ?, assigned_until = ? WHERE teacher_assignment_id = ?`,
        [data.user_id, data.subject_offering_id, formatDate(data.assigned_from), formatDate(data.assigned_until), id]
      );
    } else {
      await db.cloudPool.query(
        `INSERT INTO TEACHER_ASSIGNMENT (teacher_assignment_id, user_id, subject_offering_id, assigned_from, assigned_until)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           subject_offering_id = VALUES(subject_offering_id),
           assigned_from = VALUES(assigned_from),
           assigned_until = VALUES(assigned_until)`,
        [id, data.user_id, data.subject_offering_id, formatDate(data.assigned_from), formatDate(data.assigned_until)]
      );
    }
  } catch (err) {
    console.warn('[CloudTeacherAssignment] Failed to dual-write teacher assignment to Aiven Cloud:', err.message);
  }
}

async function forwardTeacherAssignmentDeleteToCloud(id) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query('DELETE FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id = ?', [id]);
  } catch (err) {
    console.warn('[CloudTeacherAssignment] Failed to delete teacher assignment from Aiven Cloud:', err.message);
  }
}

/**
 * Forward Attendance Sheet findOrCreate to Aiven Cloud.
 */
async function forwardAttendanceSheetToCloud(id, data) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query(
      `INSERT INTO ATTENDANCE_SHEET (attendance_sheet_id, teacher_assignment_id, adviser_assignment_id, attendance_scope, attendance_date, no_class_reason)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         teacher_assignment_id = VALUES(teacher_assignment_id),
         adviser_assignment_id = VALUES(adviser_assignment_id),
         attendance_scope = VALUES(attendance_scope),
         attendance_date = VALUES(attendance_date),
         no_class_reason = VALUES(no_class_reason)`,
      [
        id,
        data.teacher_assignment_id || null,
        data.adviser_assignment_id || null,
        data.attendance_scope || 'SECTION',
        formatDate(data.attendance_date),
        data.no_class_reason || null,
      ]
    );
  } catch (err) {
    console.warn('[CloudAttendanceSheet] Failed to dual-write sheet to Aiven Cloud:', err.message);
  }
}

async function forwardAttendanceSheetNoClassesToCloud(sheetId, reason) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query(`UPDATE ATTENDANCE_SHEET SET no_class_reason = ? WHERE attendance_sheet_id = ?`, [reason || null, sheetId]);
  } catch (err) {
    console.warn('[CloudAttendanceSheet] Failed to dual-write no-classes to Aiven Cloud:', err.message);
  }
}

async function forwardAttendanceBulkSaveToCloud(records) {
  if (!db.cloudPool || !Array.isArray(records) || records.length === 0) return;
  try {
    for (const rec of records) {
      const rawId = rec.student_section_id || rec.student_id;
      if (!rec.attendance_sheet_id || !rawId) continue;
      const status = ['P', 'A', 'L'].includes(rec.status) ? rec.status : 'P';
      const cleanRemarks = rec.remarks !== undefined && rec.remarks !== null ? String(rec.remarks).trim() || null : null;
      await db.cloudPool.query(
        `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), remarks = VALUES(remarks)`,
        [rec.attendance_sheet_id, rawId, status, cleanRemarks]
      );
    }
  } catch (err) {
    console.warn('[CloudAttendance] Failed to dual-write bulk attendance to Aiven Cloud:', err.message);
  }
}

async function forwardAttendanceSaveRemarksToCloud(sheetId, studentSectionId, remarks, status = 'P') {
  if (!db.cloudPool) return;
  try {
    const cleanRemarks = remarks !== undefined && remarks !== null ? String(remarks).trim() || null : null;
    const stat = ['P', 'A', 'L'].includes(status) ? status : 'P';
    await db.cloudPool.query(
      `INSERT INTO ATTENDANCE (attendance_sheet_id, student_section_id, status, remarks)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE remarks = VALUES(remarks), status = VALUES(status)`,
      [sheetId, studentSectionId, stat, cleanRemarks]
    );
  } catch (err) {
    console.warn('[CloudAttendance] Failed to dual-write remarks to Aiven Cloud:', err.message);
  }
}

/**
 * Forward Phil-IRI batch to Aiven Cloud.
 */
async function forwardPhilIriBatchToCloud(records) {
  if (!db.cloudPool || !Array.isArray(records) || records.length === 0) return;
  try {
    const validRecords = records.filter((r) => r && r.student_section_id);
    if (validRecords.length === 0) return;

    for (const rec of validRecords) {
      const oralPct = Number(rec.oral_reading_percent) || 0.0;
      const compPct = Number(rec.comp_score_percent) || 0.0;
      await db.cloudPool.query(
        `INSERT INTO PHIL_IRI_ASSESSMENT (
          student_section_id, subject_offering_id, test_type, passage_words_count, words_correct,
          oral_reading_percent, oral_reading_level, total_comp_items, comp_correct, comp_score_percent,
          comp_reading_level, overall_reading_level, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          subject_offering_id = COALESCE(VALUES(subject_offering_id), subject_offering_id),
          passage_words_count = VALUES(passage_words_count),
          words_correct = VALUES(words_correct),
          oral_reading_percent = VALUES(oral_reading_percent),
          oral_reading_level = VALUES(oral_reading_level),
          total_comp_items = VALUES(total_comp_items),
          comp_correct = VALUES(comp_correct),
          comp_score_percent = VALUES(comp_score_percent),
          comp_reading_level = VALUES(comp_reading_level),
          overall_reading_level = VALUES(overall_reading_level),
          user_id = COALESCE(VALUES(user_id), user_id),
          updated_at = CURRENT_TIMESTAMP`,
        [
          Number(rec.student_section_id),
          rec.subject_offering_id ? Number(rec.subject_offering_id) : null,
          rec.test_type === 'POST_TEST' ? 'POST_TEST' : 'PRE_TEST',
          Number(rec.passage_words_count) || 70,
          Number(rec.words_correct) || 0,
          oralPct,
          rec.oral_reading_level || 'FRUSTRATION',
          Number(rec.total_comp_items) || 5,
          Number(rec.comp_correct) || 0,
          compPct,
          rec.comp_reading_level || 'FRUSTRATION',
          rec.overall_reading_level || 'FRUSTRATION',
          rec.user_id ? Number(rec.user_id) : (rec.recorded_by ? Number(rec.recorded_by) : null),
        ]
      );
    }
  } catch (err) {
    console.warn('[CloudPhilIri] Failed to dual-write Phil-IRI batch to Aiven Cloud:', err.message);
  }
}

/**
 * Forward Phil-IRI screening batch to Aiven Cloud.
 */
async function forwardPhilIriScreeningBatchToCloud(body, userId) {
  if (!db.cloudPool || !body || !Array.isArray(body.records)) return;
  try {
    const config = body.config || {};
    const date = formatDate(config.assessed_on);
    const testLevel = config.test_level ? String(config.test_level).trim() : null;
    const litMax = Number(config.literal_max) || 0;
    const infMax = Number(config.inferential_max) || 0;
    const critMax = Number(config.critical_max) || 0;
    const thresh = Number(config.score_threshold) || 0;

    for (const rec of body.records) {
      const ssId = Number(rec.student_section_id);
      if (!ssId) continue;
      await db.cloudPool.query(
        `INSERT INTO PHIL_IRI_SCREENING
          (student_section_id, assessed_on, test_level, literal_max, inferential_max, critical_max,
           score_threshold, test_taken, literal_score, inferential_score, critical_score, recorded_by)
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
           recorded_by = VALUES(recorded_by)`,
        [
          ssId,
          date,
          testLevel,
          litMax,
          infMax,
          critMax,
          thresh,
          rec.test_taken || 0,
          rec.literal_score !== undefined ? rec.literal_score : null,
          rec.inferential_score !== undefined ? rec.inferential_score : null,
          rec.critical_score !== undefined ? rec.critical_score : null,
          userId || null,
        ]
      );
    }
  } catch (err) {
    console.warn('[CloudPhilIriScreening] Failed to dual-write screening batch to Aiven Cloud:', err.message);
  }
}

/**
 * Automatically sync grade reopening requests and temporary reopenings from Aiven Cloud.
 */
async function syncGradeReopenRequestsFromCloud(timeoutMs = 3000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud reopen request sync timeout exceeded')), timeoutMs)
  );

  const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);

  const syncWork = (async () => {
    // 1. Sync GRADE_REOPEN_REQUEST
    const [cloudGRR] = await db.cloudPool.query(
      `SELECT request_id, grade_sheet_id, teacher_assignment_id, reviewed_by_user_id, reason, status, file_name, file_path, file_type, file_size, requested_at, reviewed_at
       FROM GRADE_REOPEN_REQUEST`
    );
    if (cloudGRR && cloudGRR.length > 0) {
      for (const r of cloudGRR) {
        await db.execute(
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
             reviewed_at = VALUES(reviewed_at)`,
          [
            r.request_id,
            r.grade_sheet_id,
            r.teacher_assignment_id,
            r.reviewed_by_user_id || null,
            r.reason,
            r.status || 'PENDING',
            r.file_name || null,
            r.file_path || null,
            r.file_type || null,
            r.file_size || null,
            toSqlDt(r.requested_at),
            toSqlDt(r.reviewed_at),
          ]
        ).catch(() => {});
      }
    }

    // 2. Sync TEMPORARY_REOPENING
    const [cloudTR] = await db.cloudPool.query(
      `SELECT temporary_reopening_id, request_id, starts_at, expires_at, status, created_at FROM TEMPORARY_REOPENING`
    );
    if (cloudTR && cloudTR.length > 0) {
      for (const t of cloudTR) {
        await db.execute(
          `INSERT INTO TEMPORARY_REOPENING (temporary_reopening_id, request_id, starts_at, expires_at, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             request_id = VALUES(request_id),
             starts_at = VALUES(starts_at),
             expires_at = VALUES(expires_at),
             status = VALUES(status),
             created_at = VALUES(created_at)`,
          [
            t.temporary_reopening_id,
            t.request_id,
            toSqlDt(t.starts_at),
            toSqlDt(t.expires_at),
            t.status || 'ACTIVE',
            toSqlDt(t.created_at),
          ]
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudReopenSync] Bypassed cloud reopen sync (${err.message}). Serving local database.`);
  }
}

/**
 * Automatically sync teacher/evaluator feedback from Aiven Cloud.
 */
async function syncFeedbackFromCloud(timeoutMs = 3000) {
  if (!db.cloudPool) return;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cloud feedback sync timeout exceeded')), timeoutMs)
  );

  const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);

  const syncWork = (async () => {
    const [cloudFeedback] = await db.cloudPool.query(
      `SELECT feedback_id, evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at, reviewed_at
       FROM FEEDBACK`
    );
    if (cloudFeedback && cloudFeedback.length > 0) {
      for (const f of cloudFeedback) {
        await db.execute(
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
             reviewed_at = VALUES(reviewed_at)`,
          [
            f.feedback_id,
            f.evaluator_id,
            f.evaluee_id,
            f.q1_rate,
            f.q2_rate,
            f.q3_rate,
            f.q4_rate,
            f.q5_rate,
            f.q6_rate,
            f.q7_rate,
            f.q8_rate,
            f.strengths_comments || null,
            f.improvements_comments || null,
            f.status || 'OPEN',
            toSqlDt(f.created_at),
            toSqlDt(f.reviewed_at),
          ]
        ).catch(() => {});
      }
    }
  })();

  try {
    await Promise.race([syncWork, timeoutPromise]);
  } catch (err) {
    console.log(`[CloudFeedbackSync] Bypassed cloud feedback sync (${err.message}). Serving local database.`);
  }
}

/**
 * Forward Reopen Request to Aiven Cloud.
 */
async function forwardReopenRequestToCloud(reqData) {
  if (!db.cloudPool) return;
  try {
    const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
    await db.cloudPool.query(
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
         reviewed_at = VALUES(reviewed_at)`,
      [
        reqData.request_id,
        reqData.grade_sheet_id,
        reqData.teacher_assignment_id,
        reqData.reviewed_by_user_id || null,
        reqData.reason,
        reqData.status || 'PENDING',
        reqData.file_name || null,
        reqData.file_path || null,
        reqData.file_type || null,
        reqData.file_size || null,
        toSqlDt(reqData.requested_at) || new Date().toISOString().slice(0, 19).replace('T', ' '),
        toSqlDt(reqData.reviewed_at),
      ]
    );
  } catch (err) {
    console.warn('[CloudReopenRequest] Failed to dual-write reopen request to Aiven Cloud:', err.message);
  }
}

async function forwardReopenRequestStatusToCloud(requestId, status, reviewedByUserId = null) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query(
      `UPDATE GRADE_REOPEN_REQUEST SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE request_id = ?`,
      [status, reviewedByUserId || null, requestId]
    );
  } catch (err) {
    console.warn('[CloudReopenRequest] Failed to update request status on Aiven Cloud:', err.message);
  }
}

/**
 * Forward Temporary Reopening to Aiven Cloud.
 */
async function forwardTemporaryReopeningToCloud(data) {
  if (!db.cloudPool) return;
  try {
    const toSqlDt = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null);
    await db.cloudPool.query(
      `INSERT INTO TEMPORARY_REOPENING (temporary_reopening_id, request_id, starts_at, expires_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         request_id = VALUES(request_id),
         starts_at = VALUES(starts_at),
         expires_at = VALUES(expires_at),
         status = VALUES(status),
         created_at = VALUES(created_at)`,
      [
        data.temporary_reopening_id,
        data.request_id,
        toSqlDt(data.starts_at),
        toSqlDt(data.expires_at),
        data.status || 'ACTIVE',
        toSqlDt(data.created_at) || new Date().toISOString().slice(0, 19).replace('T', ' '),
      ]
    );
  } catch (err) {
    console.warn('[CloudTemporaryReopening] Failed to dual-write reopening to Aiven Cloud:', err.message);
  }
}

/**
 * Forward Feedback to Aiven Cloud.
 */
async function forwardFeedbackToCloud(id, data, isUpdate = false) {
  if (!db.cloudPool) return;
  try {
    if (isUpdate) {
      await db.cloudPool.query(
        `UPDATE FEEDBACK SET
           evaluator_id = ?, evaluee_id = ?, q1_rate = ?, q2_rate = ?, q3_rate = ?, q4_rate = ?,
           q5_rate = ?, q6_rate = ?, q7_rate = ?, q8_rate = ?, strengths_comments = ?, improvements_comments = ?,
           status = ?, reviewed_at = NOW()
         WHERE feedback_id = ?`,
        [
          data.evaluator_id,
          data.evaluee_id,
          data.q1_rate,
          data.q2_rate,
          data.q3_rate,
          data.q4_rate,
          data.q5_rate,
          data.q6_rate,
          data.q7_rate,
          data.q8_rate,
          data.strengths_comments || null,
          data.improvements_comments || null,
          data.status || 'OPEN',
          id,
        ]
      );
    } else {
      await db.cloudPool.query(
        `INSERT INTO FEEDBACK (feedback_id, evaluator_id, evaluee_id, q1_rate, q2_rate, q3_rate, q4_rate, q5_rate, q6_rate, q7_rate, q8_rate, strengths_comments, improvements_comments, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
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
           status = VALUES(status)`,
        [
          id,
          data.evaluator_id,
          data.evaluee_id,
          data.q1_rate,
          data.q2_rate,
          data.q3_rate,
          data.q4_rate,
          data.q5_rate,
          data.q6_rate,
          data.q7_rate,
          data.q8_rate,
          data.strengths_comments || null,
          data.improvements_comments || null,
          data.status || 'OPEN',
        ]
      );
    }
  } catch (err) {
    console.warn('[CloudFeedback] Failed to dual-write feedback to Aiven Cloud:', err.message);
  }
}

async function forwardFeedbackDeleteToCloud(id) {
  if (!db.cloudPool) return;
  try {
    await db.cloudPool.query('DELETE FROM FEEDBACK WHERE feedback_id = ?', [id]);
  } catch (err) {
    console.warn('[CloudFeedback] Failed to delete feedback from Aiven Cloud:', err.message);
  }
}

module.exports = {
  formatDate,
  syncSectionsFromCloud,
  syncStudentsFromCloud,
  syncStudentSectionsFromCloud,
  forwardStudentAssignToCloud,
  forwardStudentUnassignToCloud,
  syncAcademicCalendarFromCloud,
  syncSubjectComponentWeightsFromCloud,
  syncGradeTransmutationFromCloud,
  forwardSubjectWeightsToCloud,
  forwardGradeTransmutationToCloud,
  syncAcademicAssignmentsFromCloud,
  syncAttendanceFromCloud,
  syncPhilIriFromCloud,
  forwardAdviserAssignmentToCloud,
  forwardAdviserAssignmentDeleteToCloud,
  forwardSubjectOfferingToCloud,
  forwardSubjectOfferingDeleteToCloud,
  forwardTeacherAssignmentToCloud,
  forwardTeacherAssignmentDeleteToCloud,
  forwardAttendanceSheetToCloud,
  forwardAttendanceSheetNoClassesToCloud,
  forwardAttendanceBulkSaveToCloud,
  forwardAttendanceSaveRemarksToCloud,
  forwardPhilIriBatchToCloud,
  forwardPhilIriScreeningBatchToCloud,
  syncGradeReopenRequestsFromCloud,
  syncFeedbackFromCloud,
  forwardReopenRequestToCloud,
  forwardReopenRequestStatusToCloud,
  forwardTemporaryReopeningToCloud,
  forwardFeedbackToCloud,
  forwardFeedbackDeleteToCloud,
};
