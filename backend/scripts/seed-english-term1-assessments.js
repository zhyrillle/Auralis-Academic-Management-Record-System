// Local fixtures only. Preview by default; use --school-year=1 --apply-local to create empty Term 1 records.
// Existing assessments and accepted grades are skipped. Use reconcile-local-grades.js to repair existing test grades.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('../config/db');
const { calculateGrades, termCode } = require('../services/GradeComputationService');
const { readSnapshot } = require('../services/GradeReconciliationService');
const AuditEvent = require('../models/AuditEvent');
const canonical = code => ['EX', 'QA', 'STE'].includes(code) ? 'EX' : code;
const template = [
  { name: 'Written Work 1', code: 'WW', maximum: 20 },
  { name: 'Performance Task 1', code: 'PT', maximum: 50 },
  { name: 'Summative Test 1', code: 'EX', maximum: 30 },
  { name: 'Summative Test 2', code: 'EX', maximum: 30 },
  { name: 'Term Exam', code: 'EX', maximum: 40 },
];

async function seedEnglishTerm1(pool, { schoolYearId, apply = false, outputDirectory = os.tmpdir() }) {
  if (!['localhost', '127.0.0.1', '::1'].includes(pool.pool.config.connectionConfig.host)) throw new Error('Local testing database required.');
  if (apply && pool.cloudPool) throw new Error('Pause the local cloud connection before creating testing records.');
  if (!Number.isSafeInteger(schoolYearId) || schoolYearId <= 0) throw new Error('Specify --school-year=<id>.');
  const connection = await pool.getConnection();
  try {
    await connection.query(apply ? 'START TRANSACTION' : 'START TRANSACTION READ ONLY');
    const snapshot = await readSnapshot(connection, { lock: apply });
    const periods = snapshot.periods.filter(row => Number(row.school_year_id) === schoolYearId && termCode(row.term_name) === 'T1');
    if (periods.length !== 1 || !periods[0].ends_at) throw new Error('A unique configured Term 1 is required.');
    if (snapshot.configs.length !== 1) throw new Error('A unique transmutation configuration is required.');
    const period = periods[0], configRow = snapshot.configs[0];
    const config = { is_custom_enabled: Boolean(Number(configRow.is_custom_enabled)),
      ranges: configRow.ranges_json ? JSON.parse(configRow.ranges_json) : [] };
    const completed = new Date(period.ends_at).getTime() < Date.now() && String(period.status).toLowerCase() === 'completed';
    const offerings = snapshot.offerings.filter(row => Number(row.school_year_id) === schoolYearId
      && (/^(ENG|ENGLISH)$/i.test(row.subject_code) || /^English$/i.test(row.subject_name)));
    let backupPath = null;
    if (apply) {
      fs.mkdirSync(outputDirectory, { recursive: true });
      backupPath = path.join(outputDirectory, `auralis-before-english-fixtures-${crypto.randomUUID()}.json`);
      fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), schoolYearId, snapshot }, null, 2), { flag: 'wx' });
    }
    const created = [], skipped = [];
    for (const offering of offerings) {
      const offeringId = Number(offering.subject_offering_id);
      const siblings = offerings.filter(row => Number(row.section_id) === Number(offering.section_id));
      const sheets = snapshot.sheets.filter(row => Number(row.subject_offering_id) === offeringId && Number(row.term_id) === Number(period.term_id));
      const hasAccepted = snapshot.grades.some(row => Number(row.subject_offering_id) === offeringId && termCode(row.term) === 'T1');
      const hasWork = snapshot.activities.some(row => sheets.some(sheet => Number(row.grade_sheet_id) === Number(sheet.grade_sheet_id)));
      if (siblings.length !== 1 || sheets.length > 1 || hasAccepted || hasWork || sheets.some(row => row.workflow_status === 'SUBMITTED')) {
        skipped.push({ offeringId, section: offering.section_name, reason: 'Existing or ambiguous records are preserved.' }); continue;
      }
      const students = snapshot.enrollments.filter(row => Number(row.section_id) === Number(offering.section_id)
        && Number(row.school_year_id) === schoolYearId).sort((a, b) => Number(a.student_id) - Number(b.student_id));
      if (!students.length) { skipped.push({ offeringId, section: offering.section_name, reason: 'No enrolled learners.' }); continue; }
      const weights = snapshot.weights.filter(row => Number(row.subject_id) === Number(offering.subject_id) && Number(row.school_year_id) === schoolYearId);
      const activities = template.map((item, index) => {
        const matches = weights.filter(row => canonical(row.component_code) === item.code);
        if (matches.length !== 1) throw new Error(`Offering ${offeringId} needs unique ${item.code} weights.`);
        return { activity_id: -(index + 1), activity_name: item.name, highest_possible_score: item.maximum,
          component_code: item.code, subj_comp_weight_id: matches[0].subj_comp_weight_id, status: 'ACTIVE' };
      });
      const scores = activities.flatMap(activity => students.map((student, index) => {
        const seed = (Number(student.student_id) * 17 + index * 13) % 100;
        const factor = seed < 20 ? 0.55 + seed % 10 * 0.01 : seed < 50 ? 0.70 + seed % 15 * 0.01 : 0.85 + seed % 15 * 0.01;
        return { activity_id: activity.activity_id, student_section_id: student.student_section_id,
          raw_score: Math.min(activity.highest_possible_score, Math.round(activity.highest_possible_score * factor)), score_status: 'ENCODED' };
      }));
      const grades = calculateGrades({ offering, students, weights, activities, scores, config });
      let sheetId = sheets[0]?.grade_sheet_id || null;
      if (apply) {
        if (!sheetId) {
          const [sheet] = await connection.execute("INSERT INTO GRADE_SHEET (subject_offering_id, term_id, workflow_status, lock_status) VALUES (?, ?, 'DRAFT', 'EDITABLE')", [offeringId, period.term_id]);
          sheetId = sheet.insertId;
        }
        for (const activity of activities) {
          const [inserted] = await connection.execute("INSERT INTO GRADE_ACTIVITY (grade_sheet_id, subj_comp_weight_id, activity_name, highest_possible_score, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
            [sheetId, activity.subj_comp_weight_id, activity.activity_name, activity.highest_possible_score]);
          for (const score of scores.filter(row => row.activity_id === activity.activity_id)) {
            await connection.execute("INSERT INTO SCORE (activity_id, student_section_id, raw_score, score_status) VALUES (?, ?, ?, 'ENCODED')",
              [inserted.insertId, score.student_section_id, score.raw_score]);
          }
        }
        if (completed) {
          for (const grade of grades) await connection.execute(`INSERT INTO STUDENT_GRADE
            (subject_offering_id, student_id, student_section_id, term, initial_grade, quarterly_grade, remarks)
            VALUES (?, ?, ?, 'T1', ?, ?, ?)`, [offeringId, grade.studentId, grade.studentSectionId,
            grade.initialGrade, grade.termGrade, grade.termGrade >= 75 ? 'Passed' : 'Failed']);
          await connection.execute("UPDATE GRADE_SHEET SET workflow_status='SUBMITTED', lock_status='TERM_LOCKED', submitted_at=UTC_TIMESTAMP(6), locked_at=UTC_TIMESTAMP(6) WHERE grade_sheet_id=?", [sheetId]);
        }
        await AuditEvent.create({ event_type: 'GRADE_SHEET_TEST_DATA_CREATED', module_name: 'GRADING', entity_type: 'GRADE_SHEET', entity_id: sheetId,
          actor_context: { role: 'system', source: 'local-english-fixtures' }, metadata: { backup_file: backupPath, students: students.length, published: completed } }, connection);
      }
      created.push({ offeringId, section: offering.section_name, students: students.length, sheetId,
        published: apply && completed, grades });
    }
    if (apply) await connection.commit(); else await connection.rollback();
    return { applied: apply, backupPath, created, skipped };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

if (require.main === module) seedEnglishTerm1(db, {
  schoolYearId: Number(process.argv.find(arg => arg.startsWith('--school-year='))?.split('=')[1]),
  apply: process.argv.includes('--apply-local'),
}).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await db.end(); if (db.cloudPool) await db.cloudPool.end(); });

module.exports = { seedEnglishTerm1 };
