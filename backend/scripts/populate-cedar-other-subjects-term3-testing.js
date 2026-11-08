// Cedar's seven remaining subjects, Term 3 only. Keeps English and supporting records.
// Dry run by default; --apply --backup-dir=<outside-repository folder> saves and submits.
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {populateAll}=require('./populate-all-section-testing');
const {context}=require('./populate-cedar-english-term3-testing');
const subjectIds=[1,2,4,5,6,7,8];

async function protectedRecords(pool,{cls,term}) {
  const values=[cls.section_id,cls.school_year_id,term.term_id,cls.subject_id];
  const [sheets]=await pool.execute(`SELECT gs.* FROM GRADE_SHEET gs JOIN SUBJECT_OFFERING so ON so.subject_offering_id=gs.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=? AND (gs.term_id<>? OR so.subject_id=?) ORDER BY gs.grade_sheet_id`,values);
  const [activities]=await pool.execute(`SELECT ga.* FROM GRADE_ACTIVITY ga JOIN GRADE_SHEET gs ON gs.grade_sheet_id=ga.grade_sheet_id
    JOIN SUBJECT_OFFERING so ON so.subject_offering_id=gs.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=? AND (gs.term_id<>? OR so.subject_id=?) ORDER BY ga.activity_id`,values);
  const [scores]=await pool.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id=sc.activity_id
    JOIN GRADE_SHEET gs ON gs.grade_sheet_id=ga.grade_sheet_id JOIN SUBJECT_OFFERING so ON so.subject_offering_id=gs.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=? AND (gs.term_id<>? OR so.subject_id=?) ORDER BY sc.score_id`,values);
  const [grades]=await pool.execute(`SELECT sg.* FROM STUDENT_GRADE sg JOIN SUBJECT_OFFERING so ON so.subject_offering_id=sg.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=? AND (sg.term<>'T3' OR so.subject_id=?) ORDER BY sg.student_grade_id`,[cls.section_id,cls.school_year_id,cls.subject_id]);
  const [screening]=await pool.execute(`SELECT ps.* FROM PHIL_IRI_SCREENING ps JOIN STUDENT_SECTION ss ON ss.student_section_id=ps.student_section_id
    WHERE ss.section_id=? AND ss.school_year_id=? ORDER BY ps.screening_id`,[cls.section_id,cls.school_year_id]);
  const [reading]=await pool.execute(`SELECT ps.* FROM PHIL_IRI_ASSESSMENT ps JOIN STUDENT_SECTION ss ON ss.student_section_id=ps.student_section_id
    WHERE ss.section_id=? AND ss.school_year_id=? ORDER BY ps.phil_iri_id`,[cls.section_id,cls.school_year_id]);
  const [attendanceSheets]=await pool.execute(`SELECT ash.* FROM ATTENDANCE_SHEET ash
    LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id=ash.adviser_assignment_id
    LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id=ash.teacher_assignment_id
    LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id=ta.subject_offering_id
    WHERE COALESCE(saa.section_id,so.section_id)=? AND COALESCE(saa.school_year_id,so.school_year_id)=? ORDER BY ash.attendance_sheet_id`,[cls.section_id,cls.school_year_id]);
  const [attendance]=attendanceSheets.length?await pool.query('SELECT * FROM ATTENDANCE WHERE attendance_sheet_id IN (?) ORDER BY attendance_id',[attendanceSheets.map(s=>s.attendance_sheet_id)]):[[]];
  const [teachers]=await pool.execute(`SELECT ta.* FROM TEACHER_ASSIGNMENT ta JOIN SUBJECT_OFFERING so ON so.subject_offering_id=ta.subject_offering_id
    WHERE so.section_id=? AND so.school_year_id=? ORDER BY ta.teacher_assignment_id`,[cls.section_id,cls.school_year_id]);
  const [advisers]=await pool.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id=? AND school_year_id=? ORDER BY adviser_assignment_id',[cls.section_id,cls.school_year_id]);
  return {sheets,activities,scores,grades,screening,reading,attendanceSheets,attendance,teachers,advisers};
}

async function main() {
  const args=process.argv.slice(2),apply=args.includes('--apply');
  const backupDir=args.find(arg=>arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  if(apply)assert(backupDir,'An outside-repository backup folder is required.');
  const db=require('../config/db');
  try {
    assert(db.cloudPool||!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL),'The shared database is required.');
    const pool=db.cloudPool||db,scope=await context(pool);
    const before=await protectedRecords(pool,scope);
    if(apply){fs.mkdirSync(backupDir,{recursive:true});fs.writeFileSync(path.join(backupDir,`cedar-other-subjects-protected-${Date.now()}-before.json`),JSON.stringify({scope,...before},null,2),{flag:'wx'});}
    const report=await populateAll(pool,{apply,through:new Date(scope.term.ends_at).toISOString().slice(0,10),backupDir,
      sectionNames:['Cedar'],submitSectionNames:['Cedar'],termNames:['3rd'],subjectIds});
    assert.deepEqual(await context(pool),scope,'Calendar or adviser changed during setup.');
    assert.deepEqual(await protectedRecords(pool,scope),before,'English, earlier terms, assignments, attendance, and PHIL-IRI must be preserved.');
    console.log(JSON.stringify({...report,englishPreserved:true,earlierTermsPreserved:true,supportingRecordsPreserved:true,calendarPreserved:true}));
  }finally{await db.end();if(db.cloudPool)await db.cloudPool.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={protectedRecords,subjectIds};
