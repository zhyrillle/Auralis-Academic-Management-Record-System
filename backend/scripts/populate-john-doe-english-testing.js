// Scoped test-data helper. Dry run unless --apply and --backup-dir are supplied.
// Never submits grade sheets or writes accepted STUDENT_GRADE values.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { calculateGrades } = require('../services/GradeComputationService');
const names = ['Cedar', 'Mahogany'];
const placeholders = rows => rows.map(() => '?').join(',');
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
function weekdays(start, end) {
  const result = [];
  for (let date = new Date(day(start) + 'T00:00:00Z'); day(date) <= day(end); date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() > 0 && date.getUTCDay() < 6) result.push(day(date));
  }
  return result;
}
const band = id => Number(id) % 10 < 2 ? 0 : Number(id) % 10 < 6 ? 1 : 2;
function rawScore(student, activity, term) {
  const seed = (Number(student.student_section_id) * 17 + Number(activity.activity_id) * 7) % 13;
  const percentage = [48, 68, 85][band(student.student_section_id)] + seed + (term === '2nd' ? 3 : 0);
  return Math.max(0, Math.min(Math.floor(Number(activity.highest_possible_score)),
    Math.round(Number(activity.highest_possible_score) * Math.min(100, percentage) / 100)));
}
const templates = [
  ['WW', 'Written Work 1', 20], ['WW', 'Written Work 2 - Vocabulary Quiz', 20],
  ['WW', 'Written Work 3 - Grammar Exercise', 25], ['WW', 'Written Work 4 - Reading Comprehension', 30],
  ['WW', 'Written Work 5 - Literature Quiz', 20], ['PT', 'Performance Task 1', 50],
  ['PT', 'Performance Task 2 - Oral Presentation', 50], ['PT', 'Performance Task 3 - Writing Portfolio', 50],
  ['STE', 'Summative Test 1', 30], ['STE', 'Summative Test 2', 30], ['STE', 'Term Exam', 40],
];
async function bulk(connection, table, columns, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await connection.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(() => '(' + placeholders(columns) + ')').join(',')}`, chunk.flat());
  }
}

async function populate(pool, { apply, today, backupDir }) {
  const c = await pool.getConnection();
  const report = { applied: apply, throughDate: today, sections: [], skippedSubmittedSheets: [] };
  try {
    await c.beginTransaction();
    const lock = apply ? ' FOR UPDATE' : '';
    const [users] = await c.execute("SELECT user_id FROM USER WHERE LOWER(first_name) = 'john' AND LOWER(last_name) = 'doe' AND account_status = 'active'" + lock);
    assert.equal(users.length, 1, 'John Doe must identify one active account.');
    const userId = users[0].user_id;
    const [years] = await c.execute("SELECT * FROM SCHOOL_YEAR WHERE LOWER(status) = 'ongoing'" + lock);
    assert.equal(years.length, 1, 'Choose one ongoing school year.');
    const year = years[0];
    const [classes] = await c.execute(`SELECT so.*, sec.section_name, sub.subject_code, sub.subject_name,
      ta.teacher_assignment_id FROM SUBJECT_OFFERING so JOIN SECTION sec ON sec.section_id = so.section_id
      JOIN SUBJECT sub ON sub.subject_id = so.subject_id JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
      WHERE ta.user_id = ? AND so.school_year_id = ? AND sec.section_name IN ('Cedar','Mahogany')
      AND UPPER(sub.subject_name) = 'ENGLISH' ORDER BY sec.section_name${lock}`, [userId, year.school_year_id]);
    assert.equal(classes.length, 2, 'Both English classes must belong to John Doe.');
    assert.deepEqual(classes.map(row => row.section_name), names);
    const [periods] = await c.execute("SELECT * FROM ACADEMIC_TERM WHERE school_year_id = ? AND term_name IN ('1st','2nd') ORDER BY starts_at" + lock, [year.school_year_id]);
    assert.equal(periods.length, 2, 'Term 1 and Term 2 must both exist.');
    const offeringIds = classes.map(row => row.subject_offering_id);
    const sectionIds = classes.map(row => row.section_id);
    const [roster] = await c.execute(`SELECT ss.student_section_id, ss.student_id, ss.section_id FROM STUDENT_SECTION ss
      JOIN STUDENT st ON st.student_id = ss.student_id WHERE ss.section_id IN (${placeholders(sectionIds)}) AND ss.school_year_id = ?
      AND (st.status = 'ACTIVE' OR st.status IS NULL) ORDER BY ss.student_section_id${lock}`, [...sectionIds, year.school_year_id]);
    const [sheets] = await c.execute(`SELECT * FROM GRADE_SHEET WHERE subject_offering_id IN (${placeholders(offeringIds)})
      AND term_id IN (${placeholders(periods)}) ORDER BY grade_sheet_id${lock}`, [...offeringIds, ...periods.map(row => row.term_id)]);
    assert.equal(sheets.length, 4, 'Exactly four existing grade sheets are required.');
    const sheetIds = sheets.map(row => row.grade_sheet_id);
    const [activities] = await c.execute(`SELECT ga.*, ct.component_code FROM GRADE_ACTIVITY ga
      JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id = ga.subj_comp_weight_id
      JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id
      WHERE ga.grade_sheet_id IN (${placeholders(sheetIds)})${lock}`, sheetIds);
    const [scores] = await c.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id
      WHERE ga.grade_sheet_id IN (${placeholders(sheetIds)})${lock}`, sheetIds);
    const [accepted] = await c.execute(`SELECT * FROM STUDENT_GRADE WHERE subject_offering_id IN (${placeholders(offeringIds)}) ORDER BY student_grade_id${lock}`, offeringIds);
    const [screening] = await c.execute(`SELECT ps.* FROM PHIL_IRI_SCREENING ps JOIN STUDENT_SECTION ss ON ss.student_section_id = ps.student_section_id
      WHERE ss.section_id IN (${placeholders(sectionIds)}) AND ss.school_year_id = ?${lock}`, [...sectionIds, year.school_year_id]);
    const [reading] = await c.execute(`SELECT pia.* FROM PHIL_IRI_ASSESSMENT pia JOIN STUDENT_SECTION ss ON ss.student_section_id = pia.student_section_id
      WHERE ss.section_id IN (${placeholders(sectionIds)}) AND ss.school_year_id = ?${lock}`, [...sectionIds, year.school_year_id]);
    const [attendanceSheets] = await c.execute(`SELECT ash.*, COALESCE(saa.section_id, so.section_id) AS section_id FROM ATTENDANCE_SHEET ash
      LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id = ash.adviser_assignment_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id = ash.teacher_assignment_id
      LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
      WHERE COALESCE(saa.section_id,so.section_id) IN (${placeholders(sectionIds)})
      AND COALESCE(saa.school_year_id,so.school_year_id) = ? AND ash.attendance_scope = 'SECTION'
      AND ash.attendance_date BETWEEN ? AND ?${lock}`, [...sectionIds, year.school_year_id, day(periods[0].starts_at), today]);
    const [attendance] = attendanceSheets.length ? await c.execute(`SELECT * FROM ATTENDANCE WHERE attendance_sheet_id IN (${placeholders(attendanceSheets)})${lock}`, attendanceSheets.map(row => row.attendance_sheet_id)) : [[]];
    if (apply) {
      assert(backupDir, 'A backup directory is required.');
      fs.mkdirSync(backupDir, { recursive: true });
      report.backupFile = path.join(backupDir, `english-records-${Date.now()}-before.json`);
      fs.writeFileSync(report.backupFile, JSON.stringify({ capturedAt: new Date().toISOString(), userId, year, classes, periods, roster,
        sheets, activities, scores, accepted, screening, reading, attendanceSheets, attendance }, null, 2), { flag: 'wx' });
    }
    for (const cls of classes) {
      const learners = roster.filter(row => Number(row.section_id) === Number(cls.section_id));
      assert(learners.length, 'The selected class needs enrolled learners.');
      const detail = { section: cls.section_name, learners: learners.length, terms: [], attendanceAdded: 0, screeningAdded: 0, postTestAdded: 0 };
      const [weights] = await c.execute(`SELECT cw.*, ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw
        JOIN COMPONENT_TYPE ct ON ct.component_type_id = cw.component_type_id WHERE cw.subject_id = ? AND cw.school_year_id = ?`, [cls.subject_id, year.school_year_id]);
      for (const period of periods) {
        const matching = sheets.filter(row => Number(row.subject_offering_id) === Number(cls.subject_offering_id) && Number(row.term_id) === Number(period.term_id));
        assert.equal(matching.length, 1);
        const sheet = matching[0];
        if (sheet.workflow_status !== 'DRAFT') {
          report.skippedSubmittedSheets.push({ section: cls.section_name, term: period.term_name, gradeSheetId: sheet.grade_sheet_id });
          continue;
        }
        let active = activities.filter(row => Number(row.grade_sheet_id) === Number(sheet.grade_sheet_id) && row.status !== 'ARCHIVED');
        const days = weekdays(period.starts_at, day(period.ends_at) < today ? day(period.ends_at) : today);
        assert(days.length);
        let added = 0;
        for (let i = 0; i < templates.length; i++) {
          const [code, name, maximum] = templates[i];
          if (active.some(row => row.activity_name.toLowerCase() === name.toLowerCase())) continue;
          const weight = weights.filter(row => row.component_code === code);
          assert.equal(weight.length, 1);
          if (apply) {
            const [insert] = await c.execute(`INSERT INTO GRADE_ACTIVITY
              (grade_sheet_id,subj_comp_weight_id,activity_name,highest_possible_score,activity_date,status,created_at)
              VALUES (?,?,?,?,?,'ACTIVE',UTC_TIMESTAMP(6))`, [sheet.grade_sheet_id, weight[0].subj_comp_weight_id, name, maximum,
              days[Math.floor(i * (days.length - 1) / (templates.length - 1))]]);
            active.push({ activity_id: insert.insertId, grade_sheet_id: sheet.grade_sheet_id, component_code: code,
              activity_name: name, highest_possible_score: maximum, status: 'ACTIVE', mapeh_component: null });
          }
          added++;
        }
        const newScores = [];
        for (const activity of active) for (const learner of learners) {
          const existing = scores.filter(row => Number(row.activity_id) === Number(activity.activity_id) && Number(row.student_section_id) === Number(learner.student_section_id));
          assert(existing.length <= 1, 'Duplicate raw scores need review.');
          const old = existing[0];
          if (old && old.score_status === 'EXCUSED') throw new Error('Existing excused scores need review before filling.');
          if (old && old.raw_score != null && old.score_status !== 'NOT_ENCODED') {
            assert(Number(old.raw_score) >= 0 && Number(old.raw_score) <= Number(activity.highest_possible_score));
            if (!Number.isInteger(Number(old.raw_score)) && apply) await c.execute('UPDATE SCORE SET raw_score = ?, updated_at = UTC_TIMESTAMP(6) WHERE score_id = ?', [Math.min(Math.floor(Number(activity.highest_possible_score)), Math.round(Number(old.raw_score))), old.score_id]);
            continue;
          }
          const raw = rawScore(learner, activity, period.term_name);
          assert(Number.isInteger(raw));
          if (old && apply) await c.execute("UPDATE SCORE SET raw_score = ?, score_status = 'ENCODED', teacher_assignment_id = ?, updated_at = UTC_TIMESTAMP(6) WHERE score_id = ?", [raw, cls.teacher_assignment_id, old.score_id]);
          else if (!old) newScores.push([activity.activity_id, learner.student_section_id, raw, 'ENCODED', cls.teacher_assignment_id]);
        }
        if (apply) {
          await bulk(c, 'SCORE', ['activity_id','student_section_id','raw_score','score_status','teacher_assignment_id'], newScores);
          const [saved] = await c.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id = sc.activity_id WHERE ga.grade_sheet_id = ?`, [sheet.grade_sheet_id]);
          let config = null;
          const [configs] = await c.execute('SELECT is_custom_enabled, ranges_json FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id = 1');
          if (configs.length) config = { is_custom_enabled: Boolean(configs[0].is_custom_enabled), ranges: configs[0].ranges_json ? JSON.parse(configs[0].ranges_json) : [] };
          const preview = calculateGrades({ offering: cls, students: learners, weights, activities: active, scores: saved, config });
          assert.equal(preview.length, learners.length);
          const enrollmentIds = new Set(learners.map(row => Number(row.student_section_id)));
          assert(saved.filter(row => enrollmentIds.has(Number(row.student_section_id))).every(row => Number.isInteger(Number(row.raw_score))));
          detail.terms.push({ term: period.term_name, activities: active.length, scores: learners.length * active.length,
            workflow: 'DRAFT', previewGradeRange: [Math.min(...preview.map(row => row.termGrade)), Math.max(...preview.map(row => row.termGrade))] });
        } else detail.terms.push({ term: period.term_name, existingActivities: active.length, activitiesToAdd: added, workflow: 'DRAFT' });
      }
      const allDays = periods.flatMap(period => weekdays(period.starts_at, day(period.ends_at) < today ? day(period.ends_at) : today));
      let selectedSheets = attendanceSheets.filter(row => Number(row.section_id) === Number(cls.section_id));
      const [advisers] = await c.execute('SELECT adviser_assignment_id FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id = ? AND school_year_id = ?' + lock, [cls.section_id, year.school_year_id]);
      assert.equal(advisers.length, 1, 'An unambiguous section adviser is required for attendance.');
      const missingDays = allDays.filter(date => !selectedSheets.some(row => day(row.attendance_date) === date));
      if (apply && missingDays.length) {
        await bulk(c, 'ATTENDANCE_SHEET', ['adviser_assignment_id','attendance_scope','attendance_date'], missingDays.map(date => [advisers[0].adviser_assignment_id,'SECTION',date]));
        const [inserted] = await c.execute(`SELECT * FROM ATTENDANCE_SHEET WHERE adviser_assignment_id = ? AND attendance_scope = 'SECTION' AND attendance_date BETWEEN ? AND ?`, [advisers[0].adviser_assignment_id, day(periods[0].starts_at), today]);
        const seen = new Set(selectedSheets.map(row => Number(row.attendance_sheet_id)));
        selectedSheets = [...selectedSheets, ...inserted.filter(row => !seen.has(Number(row.attendance_sheet_id)))];
      }
      const rows = [];
      let projectedAttendance = 0;
      for (const date of allDays) {
        const daily = selectedSheets.filter(row => day(row.attendance_date) === date).sort((a,b) => Number(a.attendance_sheet_id)-Number(b.attendance_sheet_id));
        if (!daily.length) { if (!apply) projectedAttendance += learners.length; continue; }
        if (daily.some(row => row.no_class_reason)) continue;
        const ids = new Set(daily.map(row => Number(row.attendance_sheet_id)));
        for (const learner of learners) {
          if (attendance.some(row => ids.has(Number(row.attendance_sheet_id)) && Number(row.student_section_id) === Number(learner.student_section_id))) continue;
          const marker = (Number(learner.student_section_id) * 19 + Math.floor(Date.parse(date) / 86400000) * 7) % 100;
          const absent = [16, 8, 3][band(learner.student_section_id)];
          rows.push([daily[0].attendance_sheet_id, learner.student_section_id, marker < absent ? 'A' : marker < absent + 5 ? 'L' : 'P', 'Capstone testing sample']);
        }
      }
      if (apply) await bulk(c, 'ATTENDANCE', ['attendance_sheet_id','student_section_id','status','remarks'], rows);
      detail.attendanceAdded = rows.length + projectedAttendance;
      detail.attendanceDaysAdded = missingDays.length;
      const screenings = [], postTests = [];
      for (const learner of learners) {
        const level = band(learner.student_section_id), variation = Number(learner.student_section_id) % 3;
        if (!screening.some(row => Number(row.student_section_id) === Number(learner.student_section_id))) screenings.push([
          learner.student_section_id, weekdays(periods[0].starts_at, periods[0].ends_at)[4], 'Grade 7', 14, 12, 14, 28, 1,
          [6,10,12][level] + variation, [4,7,10][level] + variation, [6,9,12][level] + variation, userId,
        ]);
        if (!reading.some(row => Number(row.student_section_id) === Number(learner.student_section_id) && row.test_type === 'POST_TEST')) {
          const words = [57,64,68][level] + variation, correct = [2,3,4][level] + (variation === 2 ? 1 : 0);
          const oral = words / 70 * 100, comprehension = correct / 5 * 100;
          const oralLevel = oral >= 97 ? 'INDEPENDENT' : oral >= 90 ? 'INSTRUCTIONAL' : 'FRUSTRATION';
          const compLevel = comprehension >= 80 ? 'INDEPENDENT' : comprehension >= 59 ? 'INSTRUCTIONAL' : 'FRUSTRATION';
          const overall = oralLevel === 'INDEPENDENT' && compLevel === 'INDEPENDENT' ? 'INDEPENDENT'
            : oralLevel === 'INDEPENDENT' || compLevel === 'INDEPENDENT' || oralLevel === 'INSTRUCTIONAL' && compLevel === 'INSTRUCTIONAL' ? 'INSTRUCTIONAL' : 'FRUSTRATION';
          postTests.push([learner.student_section_id,cls.subject_offering_id,'POST_TEST',70,words,Number(oral.toFixed(2)),oralLevel,5,correct,comprehension,compLevel,overall,userId]);
        }
      }
      if (apply) {
        await bulk(c, 'PHIL_IRI_SCREENING', ['student_section_id','assessed_on','test_level','literal_max','inferential_max','critical_max','score_threshold','test_taken','literal_score','inferential_score','critical_score','recorded_by'], screenings);
        await bulk(c, 'PHIL_IRI_ASSESSMENT', ['student_section_id','subject_offering_id','test_type','passage_words_count','words_correct','oral_reading_percent','oral_reading_level','total_comp_items','comp_correct','comp_score_percent','comp_reading_level','overall_reading_level','user_id'], postTests);
      }
      detail.screeningAdded = screenings.length; detail.postTestAdded = postTests.length;
      detail.attendanceWeekdays = allDays.length;
      report.sections.push(detail);
    }
    const [afterAccepted] = await c.execute(`SELECT * FROM STUDENT_GRADE WHERE subject_offering_id IN (${placeholders(offeringIds)}) ORDER BY student_grade_id`, offeringIds);
    assert.deepEqual(afterAccepted, accepted, 'Accepted grades must never change during population.');
    const [afterSheets] = await c.execute(`SELECT * FROM GRADE_SHEET WHERE grade_sheet_id IN (${placeholders(sheetIds)}) ORDER BY grade_sheet_id`, sheetIds);
    assert.deepEqual(afterSheets, sheets, 'Population must not change submission status.');
    if (apply) await c.commit(); else await c.rollback();
    report.acceptedGradesUnchanged = true; report.submissionStatusesUnchanged = true;
    return report;
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backupDir = args.find(arg => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  const today = args.find(arg => arg.startsWith('--through='))?.slice('--through='.length)
    || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  if (apply) assert(backupDir, 'Supply --backup-dir before applying changes.');
  const db = require('../config/db');
  try {
    assert(db.cloudPool || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL), 'The shared database is required.');
    console.log(JSON.stringify(await populate(db.cloudPool || db, { apply, today, backupDir })));
  } finally { await db.end(); if (db.cloudPool) await db.cloudPool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { populate, weekdays, rawScore };
