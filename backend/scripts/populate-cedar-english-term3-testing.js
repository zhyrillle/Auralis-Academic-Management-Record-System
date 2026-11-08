// Explicit capstone fixture: Cedar / John Doe / English / Term 3 only.
// Includes future-dated sample attendance within the configured Term 3 dates.
// Does not alter the calendar, assignments, earlier terms, or saved PHIL-IRI.
// Dry run unless --apply and --backup-dir=<outside-repository folder> are supplied.
process.env.NODE_ENV = 'test';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { populate } = require('./populate-john-doe-english-testing');
const { calculateGrades } = require('../services/GradeComputationService');
const MasterSheetService = require('../services/MasterSheetService');
const dateOnly = value => new Date(value).toISOString().slice(0, 10);

async function context(pool) {
  const [classes] = await pool.execute(`SELECT so.*,sec.section_name,gl.grade_level_name,
    sub.subject_name,sub.subject_code,ta.teacher_assignment_id,ta.user_id,
    saa.adviser_assignment_id FROM SUBJECT_OFFERING so
    JOIN SECTION sec ON sec.section_id=so.section_id
    JOIN GRADE_LEVEL gl ON gl.grade_level_id=sec.grade_level_id
    JOIN SUBJECT sub ON sub.subject_id=so.subject_id
    JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id=so.subject_offering_id
    JOIN USER u ON u.user_id=ta.user_id
    JOIN SCHOOL_YEAR sy ON sy.school_year_id=so.school_year_id
    JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id=sec.section_id
      AND saa.school_year_id=so.school_year_id AND saa.user_id=u.user_id
    WHERE sec.section_name='Cedar' AND UPPER(sub.subject_name)='ENGLISH'
      AND LOWER(u.first_name)='john' AND LOWER(u.last_name)='doe'
      AND u.account_status='active' AND LOWER(sy.status)='ongoing'`);
  assert.equal(classes.length, 1, 'John Doe must be Cedar adviser and English teacher in one ongoing school year.');
  const cls = classes[0];
  const [periods] = await pool.execute('SELECT * FROM ACADEMIC_TERM WHERE school_year_id=? ORDER BY term_id', [cls.school_year_id]);
  const selected = periods.filter(p => p.term_name === '3rd');
  assert.equal(selected.length, 1, 'Exactly one Term 3 is required.');
  return { cls, periods, term: selected[0] };
}

async function preservedRecords(pool, { cls, term }) {
  const [sheets] = await pool.execute('SELECT * FROM GRADE_SHEET WHERE subject_offering_id=? AND term_id<>? ORDER BY grade_sheet_id', [cls.subject_offering_id, term.term_id]);
  const [activities] = await pool.execute(`SELECT ga.* FROM GRADE_ACTIVITY ga JOIN GRADE_SHEET gs ON gs.grade_sheet_id=ga.grade_sheet_id
    WHERE gs.subject_offering_id=? AND gs.term_id<>? ORDER BY ga.activity_id`, [cls.subject_offering_id, term.term_id]);
  const [scores] = await pool.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id=sc.activity_id
    JOIN GRADE_SHEET gs ON gs.grade_sheet_id=ga.grade_sheet_id WHERE gs.subject_offering_id=? AND gs.term_id<>? ORDER BY sc.score_id`, [cls.subject_offering_id, term.term_id]);
  const [grades] = await pool.execute("SELECT * FROM STUDENT_GRADE WHERE subject_offering_id=? AND term<>'T3' ORDER BY student_grade_id", [cls.subject_offering_id]);
  const [screening] = await pool.execute(`SELECT ps.* FROM PHIL_IRI_SCREENING ps JOIN STUDENT_SECTION ss ON ss.student_section_id=ps.student_section_id
    WHERE ss.section_id=? AND ss.school_year_id=? ORDER BY ps.screening_id`, [cls.section_id, cls.school_year_id]);
  const [reading] = await pool.execute(`SELECT ps.* FROM PHIL_IRI_ASSESSMENT ps JOIN STUDENT_SECTION ss ON ss.student_section_id=ps.student_section_id
    WHERE ss.section_id=? AND ss.school_year_id=? ORDER BY ps.phil_iri_id`, [cls.section_id, cls.school_year_id]);
  const [teachers] = await pool.execute('SELECT * FROM TEACHER_ASSIGNMENT WHERE subject_offering_id=? ORDER BY teacher_assignment_id', [cls.subject_offering_id]);
  const [advisers] = await pool.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id=? AND school_year_id=? ORDER BY adviser_assignment_id', [cls.section_id, cls.school_year_id]);
  return { sheets, activities, scores, grades, screening, reading, teachers, advisers };
}

async function loadMasterSheet(connection, cls) {
  const [assignments] = await connection.execute(`SELECT saa.*,sec.section_name,gl.grade_level_name,
    sy.starts_on,sy.ends_on,sy.curriculum,sy.status AS school_year_status,
    sch.school_name,sch.school_code,sch.region,sch.division,
    u.first_name,u.middle_name,u.last_name,u.extension_name,
    CASE WHEN sec.is_specialized=1 THEN p.program_code ELSE NULL END AS program_code
    FROM SECTION_ADVISER_ASSIGNMENT saa JOIN SECTION sec ON sec.section_id=saa.section_id
    JOIN GRADE_LEVEL gl ON gl.grade_level_id=sec.grade_level_id
    JOIN SCHOOL_YEAR sy ON sy.school_year_id=saa.school_year_id
    JOIN SCHOOL sch ON sch.school_id=sy.school_id JOIN USER u ON u.user_id=saa.user_id
    LEFT JOIN PROGRAM p ON p.program_id=sec.program_id WHERE saa.adviser_assignment_id=?`, [cls.adviser_assignment_id]);
  assert.equal(assignments.length, 1);
  const [termRows] = await connection.execute('SELECT * FROM ACADEMIC_TERM WHERE school_year_id=? ORDER BY starts_at,term_id', [cls.school_year_id]);
  const [offeringRows] = await connection.execute(`SELECT so.*,s.subject_code,s.subject_name FROM SUBJECT_OFFERING so
    JOIN SUBJECT s ON s.subject_id=so.subject_id WHERE so.section_id=? AND so.school_year_id=?`, [cls.section_id, cls.school_year_id]);
  const [studentRows] = await connection.execute(`SELECT ss.student_section_id,st.student_id,st.LRN AS lrn,st.first_name,st.middle_name,
    st.last_name,st.extension_name,st.sex FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id=ss.student_id
    WHERE ss.section_id=? AND ss.school_year_id=? AND (st.status='ACTIVE' OR st.status IS NULL) ORDER BY ss.student_section_id`, [cls.section_id, cls.school_year_id]);
  const [gradeSheetRows] = await connection.execute(`SELECT gs.* FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id=gs.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=?`, [cls.section_id, cls.school_year_id]);
  const [savedGradeRows] = await connection.execute(`SELECT sg.* FROM STUDENT_GRADE sg JOIN SUBJECT_OFFERING so ON so.subject_offering_id=sg.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=?`, [cls.section_id, cls.school_year_id]);
  const result = MasterSheetService.buildResponse({ assignment: assignments[0], termRows, offeringRows, studentRows, gradeSheetRows, savedGradeRows });
  return {result,savedGradeRows};
}

async function verifyMasterSheet(connection, cls) {
  const {result,savedGradeRows} = await loadMasterSheet(connection, cls);
  const english = result.subjects.find(s => s.subjectOfferingId === Number(cls.subject_offering_id));
  assert(english, 'English must be offered on the master sheet.');
  assert(result.students.length > 0);
  for (const student of result.students) {
    const grade = student.grades[english.key].terms[2];
    const saved = savedGradeRows.filter(s => Number(s.student_id) === student.studentId
      && Number(s.subject_offering_id) === Number(cls.subject_offering_id) && s.term === 'T3' && !s.mapeh_component);
    assert.equal(saved.length, 1);
    assert.equal(grade, Number(saved[0].quarterly_grade));
    assert(Number.isFinite(grade), 'Each learner must have an English Term 3 master sheet grade.');
  }
  return { visibleTerm3Grades: result.students.length,
    englishFinalGrades: result.students.filter(s => Number.isFinite(s.grades[english.key].finalGrade)).length };
}

async function publish(pool, scope, before, backupDir) {
  const c = await pool.getConnection();
  const { cls, term } = scope;
  try {
    await c.beginTransaction();
    const nowScope = await context(c);
    assert.deepEqual(nowScope, scope, 'Calendar or assignment changed during setup.');
    assert.deepEqual(await preservedRecords(c, scope), before, 'Earlier records or assignments changed during setup.');
    const [sheets] = await c.execute('SELECT * FROM GRADE_SHEET WHERE subject_offering_id=? AND term_id=? FOR UPDATE', [cls.subject_offering_id, term.term_id]);
    assert.equal(sheets.length, 1);
    const sheet = sheets[0];
    const [students] = await c.execute(`SELECT ss.student_section_id,ss.student_id FROM STUDENT_SECTION ss JOIN STUDENT st ON st.student_id=ss.student_id
      WHERE ss.section_id=? AND ss.school_year_id=? AND (st.status='ACTIVE' OR st.status IS NULL) ORDER BY ss.student_section_id FOR UPDATE`, [cls.section_id, cls.school_year_id]);
    const [weights] = await c.execute(`SELECT cw.*,ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw JOIN COMPONENT_TYPE ct ON ct.component_type_id=cw.component_type_id
      WHERE cw.subject_id=? AND cw.school_year_id=?`, [cls.subject_id, cls.school_year_id]);
    const [activities] = await c.execute(`SELECT ga.*,ct.component_code FROM GRADE_ACTIVITY ga JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id=ga.subj_comp_weight_id
      JOIN COMPONENT_TYPE ct ON ct.component_type_id=cw.component_type_id WHERE ga.grade_sheet_id=? AND ga.status='ACTIVE' ORDER BY ga.activity_id FOR UPDATE`, [sheet.grade_sheet_id]);
    const [scores] = await c.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id=sc.activity_id
      WHERE ga.grade_sheet_id=? AND ga.status='ACTIVE' ORDER BY sc.score_id FOR UPDATE`, [sheet.grade_sheet_id]);
    const [configs] = await c.execute('SELECT * FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id=1');
    assert.equal(configs.length, 1);
    const config = { is_custom_enabled: Boolean(Number(configs[0].is_custom_enabled)), ranges: JSON.parse(configs[0].ranges_json) };
    const grades = calculateGrades({ offering: cls, students, weights, activities, scores, config });
    assert.equal(grades.length, students.length);
    assert(scores.every(s => s.raw_score !== null && Number.isInteger(Number(s.raw_score))));
    const [accepted] = await c.execute("SELECT * FROM STUDENT_GRADE WHERE subject_offering_id=? AND term='T3' ORDER BY student_grade_id FOR UPDATE", [cls.subject_offering_id]);
    fs.writeFileSync(path.join(backupDir, `cedar-term3-submission-${Date.now()}-before.json`),
      JSON.stringify({ scope, sheet, students, weights, activities, scores, config, accepted }, null, 2), { flag: 'wx' });
    if (sheet.workflow_status !== 'SUBMITTED') {
      assert.equal(sheet.workflow_status, 'DRAFT');
      assert.equal(accepted.length, 0, 'Existing accepted Term 3 grades need review.');
      for (const grade of grades) await c.execute(`INSERT INTO STUDENT_GRADE
        (subject_offering_id,student_id,student_section_id,term,mapeh_component,initial_grade,quarterly_grade,remarks)
        VALUES (?,?,?,'T3',NULL,?,?,?)`, [cls.subject_offering_id, grade.studentId, grade.studentSectionId,
        grade.initialGrade, grade.termGrade, grade.termGrade >= 75 ? 'Passed' : 'Failed']);
      await c.execute("UPDATE GRADE_SHEET SET workflow_status='SUBMITTED',submitted_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6) WHERE grade_sheet_id=?", [sheet.grade_sheet_id]);
      await c.execute(`INSERT INTO AUDIT_EVENT (actor_context,event_type,module_name,entity_type,entity_id,before_data,after_data,metadata)
        VALUES (?,'GRADE_SHEET_SUBMITTED','GRADING','GRADE_SHEET',?,?,?,?)`, [JSON.stringify({ source:'capstone_test_population',acting_as:'Cedar Term 3 test fixture' }),
        sheet.grade_sheet_id, JSON.stringify({workflow_status:sheet.workflow_status,submitted_at:sheet.submitted_at}),
        JSON.stringify({workflow_status:'SUBMITTED',term:'T3'}), JSON.stringify({test_data:true,future_term_test_setup:term.status==='upcoming',
          section:'Cedar',subject:'English',school_year_id:cls.school_year_id,learner_count:students.length,calendar_unchanged:true})]);
    } else {
      assert.equal(accepted.length, grades.length);
      for (const grade of grades) {
        const saved = accepted.find(g => Number(g.student_id) === grade.studentId && !g.mapeh_component);
        assert(saved && Number(saved.quarterly_grade) === grade.termGrade, 'Existing published grade differs from raw scores.');
      }
    }
    const masterSheet = await verifyMasterSheet(c, cls);
    assert.deepEqual(await preservedRecords(c, scope), before);
    assert.deepEqual(await context(c), scope);
    await c.commit();
    return { submitted:true,term:'T3',learners:students.length,wholeNumberScores:scores.length,
      gradeSheetId:sheet.grade_sheet_id,masterSheet,earlierRecordsPreserved:true,calendarPreserved:true };
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const backupDir = args.find(arg => arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  if (apply) assert(backupDir, 'An outside-repository backup folder is required.');
  const db = require('../config/db');
  try {
    assert(db.cloudPool || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL), 'The shared database is required.');
    const pool = db.cloudPool || db;
    const scope = await context(pool);
    const before = await preservedRecords(pool, scope);
    if (apply) {
      fs.mkdirSync(backupDir, {recursive:true});
      fs.writeFileSync(path.join(backupDir, `cedar-term3-protected-${Date.now()}-before.json`),
        JSON.stringify({scope,...before},null,2), {flag:'wx'});
    }
    const preparation = await populate(pool, {apply,today:dateOnly(scope.term.ends_at),backupDir,
      sectionNames:['Cedar'],termNames:['3rd'],requireAdviser:true});
    console.log(JSON.stringify({preparation,syntheticFutureTerm:scope.term.status==='upcoming',
      sampleAttendanceFrom:dateOnly(scope.term.starts_at),sampleAttendanceThrough:dateOnly(scope.term.ends_at)}));
    if (apply) console.log(JSON.stringify(await publish(pool,scope,before,backupDir)));
  } finally { await db.end(); if(db.cloudPool) await db.cloudPool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = { context, preservedRecords, loadMasterSheet, verifyMasterSheet };
