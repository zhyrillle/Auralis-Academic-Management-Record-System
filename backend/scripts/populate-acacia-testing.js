// Acacia-only capstone fixtures. Keeps John Doe an English teacher only.
// Dry run by default. --apply --backup-dir=<outside-repository folder> saves.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { populateAll } = require('./populate-all-section-testing');
const { weekdays } = require('./populate-john-doe-english-testing');
const slots = rows => rows.map(() => '?').join(',');
const day = value => new Date(value).toISOString().slice(0,10);
const band = id => Number(id)%10<2?0:Number(id)%10<6?1:2;
async function insertRows(c,table,columns,rows) {
  for(let i=0;i<rows.length;i+=200) {
    const chunk=rows.slice(i,i+200);
    await c.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(()=>'('+slots(columns)+')').join(',')}`,chunk.flat());
  }
}
async function supportingRecords(pool,{apply,through,backupDir}) {
  const c=await pool.getConnection();
  const report={section:'Acacia',applied:apply,through,attendanceOwner:'English teaching assignment'};
  try {
    await c.beginTransaction();
    const lock=apply?' FOR UPDATE':'';
    const [years]=await c.execute("SELECT * FROM SCHOOL_YEAR WHERE LOWER(status)='ongoing'"+lock);
    assert.equal(years.length,1);
    const year=years[0];
    const [classes]=await c.execute(`SELECT so.*,sec.section_name,ta.teacher_assignment_id,ta.user_id
      FROM SUBJECT_OFFERING so JOIN SECTION sec ON sec.section_id=so.section_id
      JOIN SUBJECT sub ON sub.subject_id=so.subject_id JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id=so.subject_offering_id
      JOIN USER u ON u.user_id=ta.user_id WHERE sec.section_name='Acacia' AND UPPER(sub.subject_name)='ENGLISH'
      AND so.school_year_id=? AND u.first_name='John' AND u.last_name='Doe' AND u.account_status='active'${lock}`,[year.school_year_id]);
    assert.equal(classes.length,1,'John Doe must have exactly one current Acacia English assignment.');
    const cls=classes[0];
    const [section]=await c.execute('SELECT * FROM SECTION WHERE section_id=?'+lock,[cls.section_id]);
    assert.equal(section[0].section_name,'Acacia');
    const [advisers]=await c.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id=? AND school_year_id=? ORDER BY adviser_assignment_id'+lock,[cls.section_id,year.school_year_id]);
    assert(!advisers.some(row=>Number(row.user_id)===Number(cls.user_id)),'John Doe is to remain English teacher only for Acacia.');
    const [periods]=await c.execute("SELECT * FROM ACADEMIC_TERM WHERE school_year_id=? AND term_name IN ('1st','2nd') ORDER BY starts_at"+lock,[year.school_year_id]);
    assert.equal(periods.length,2);
    const [students]=await c.execute(`SELECT ss.student_section_id,ss.student_id FROM STUDENT_SECTION ss
      JOIN STUDENT st ON st.student_id=ss.student_id WHERE ss.section_id=? AND ss.school_year_id=?
      AND (st.status='ACTIVE' OR st.status IS NULL) ORDER BY ss.student_section_id${lock}`,[cls.section_id,year.school_year_id]);
    assert(students.length>0);
    const ids=students.map(row=>row.student_section_id);
    let [sheets]=await c.execute(`SELECT ash.* FROM ATTENDANCE_SHEET ash
      LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.adviser_assignment_id=ash.adviser_assignment_id
      LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.teacher_assignment_id=ash.teacher_assignment_id
      LEFT JOIN SUBJECT_OFFERING so ON so.subject_offering_id=ta.subject_offering_id
      WHERE COALESCE(saa.section_id,so.section_id)=? AND COALESCE(saa.school_year_id,so.school_year_id)=?
      AND ash.attendance_scope='SECTION' AND ash.attendance_date BETWEEN ? AND ?${lock}`,[cls.section_id,year.school_year_id,day(periods[0].starts_at),through]);
    const [attendance]=sheets.length?await c.execute(`SELECT * FROM ATTENDANCE WHERE attendance_sheet_id IN (${slots(sheets)})${lock}`,sheets.map(row=>row.attendance_sheet_id)):[[]];
    const [screening]=await c.execute(`SELECT * FROM PHIL_IRI_SCREENING WHERE student_section_id IN (${slots(ids)})${lock}`,ids);
    const [reading]=await c.execute(`SELECT * FROM PHIL_IRI_ASSESSMENT WHERE student_section_id IN (${slots(ids)})${lock}`,ids);
    if(apply) {
      assert(backupDir);
      fs.mkdirSync(backupDir,{recursive:true});
      report.backupFile=path.join(backupDir,`acacia-supporting-${Date.now()}-before.json`);
      fs.writeFileSync(report.backupFile,JSON.stringify({capturedAt:new Date().toISOString(),year,cls,section,advisers,periods,students,sheets,attendance,screening,reading},null,2),{flag:'wx'});
    }
    const dates=periods.flatMap(period=>weekdays(period.starts_at,day(period.ends_at)<through?day(period.ends_at):through));
    const missingDays=dates.filter(date=>!sheets.some(row=>day(row.attendance_date)===date));
    if(apply&&missingDays.length) {
      await insertRows(c,'ATTENDANCE_SHEET',['teacher_assignment_id','attendance_scope','attendance_date'],missingDays.map(date=>[cls.teacher_assignment_id,'SECTION',date]));
      const [created]=await c.execute("SELECT * FROM ATTENDANCE_SHEET WHERE teacher_assignment_id=? AND attendance_scope='SECTION' AND attendance_date BETWEEN ? AND ?",[cls.teacher_assignment_id,day(periods[0].starts_at),through]);
      const existing=new Set(sheets.map(row=>Number(row.attendance_sheet_id)));
      sheets=[...sheets,...created.filter(row=>!existing.has(Number(row.attendance_sheet_id)))];
    }
    const newAttendance=[];
    let projected=0;
    for(const date of dates) {
      const daily=sheets.filter(row=>day(row.attendance_date)===date).sort((a,b)=>Number(a.attendance_sheet_id)-Number(b.attendance_sheet_id));
      if(!daily.length){if(!apply)projected+=students.length;continue;}
      if(daily.some(row=>row.no_class_reason))continue;
      const dailyIds=new Set(daily.map(row=>Number(row.attendance_sheet_id)));
      for(const student of students) {
        if(attendance.some(row=>dailyIds.has(Number(row.attendance_sheet_id))&&Number(row.student_section_id)===Number(student.student_section_id)))continue;
        const marker=(Number(student.student_section_id)*19+Math.floor(Date.parse(date)/86400000)*7)%100;
        const absent=[16,8,3][band(student.student_section_id)];
        newAttendance.push([daily[0].attendance_sheet_id,student.student_section_id,marker<absent?'A':marker<absent+5?'L':'P','Capstone testing sample']);
      }
    }
    const newScreening=[],postTests=[];
    for(const student of students) {
      const level=band(student.student_section_id),variation=Number(student.student_section_id)%3;
      if(!screening.some(row=>Number(row.student_section_id)===Number(student.student_section_id)))newScreening.push([
        student.student_section_id,weekdays(periods[0].starts_at,periods[0].ends_at)[4],'Grade 7',14,12,14,28,1,
        [6,10,12][level]+variation,[4,7,10][level]+variation,[6,9,12][level]+variation,cls.user_id,
      ]);
      if(!reading.some(row=>Number(row.student_section_id)===Number(student.student_section_id)&&row.test_type==='POST_TEST')) {
        const words=[57,64,68][level]+variation,correct=[2,3,4][level]+(variation===2?1:0);
        const oral=words/70*100,comprehension=correct/5*100;
        const oralLevel=oral>=97?'INDEPENDENT':oral>=90?'INSTRUCTIONAL':'FRUSTRATION';
        const compLevel=comprehension>=80?'INDEPENDENT':comprehension>=59?'INSTRUCTIONAL':'FRUSTRATION';
        const overall=oralLevel==='INDEPENDENT'&&compLevel==='INDEPENDENT'?'INDEPENDENT'
          :oralLevel==='INDEPENDENT'||compLevel==='INDEPENDENT'||oralLevel==='INSTRUCTIONAL'&&compLevel==='INSTRUCTIONAL'?'INSTRUCTIONAL':'FRUSTRATION';
        postTests.push([student.student_section_id,cls.subject_offering_id,'POST_TEST',70,words,Number(oral.toFixed(2)),oralLevel,5,correct,comprehension,compLevel,overall,cls.user_id]);
      }
    }
    if(apply) {
      await insertRows(c,'ATTENDANCE',['attendance_sheet_id','student_section_id','status','remarks'],newAttendance);
      await insertRows(c,'PHIL_IRI_SCREENING',['student_section_id','assessed_on','test_level','literal_max','inferential_max','critical_max','score_threshold','test_taken','literal_score','inferential_score','critical_score','recorded_by'],newScreening);
      await insertRows(c,'PHIL_IRI_ASSESSMENT',['student_section_id','subject_offering_id','test_type','passage_words_count','words_correct','oral_reading_percent','oral_reading_level','total_comp_items','comp_correct','comp_score_percent','comp_reading_level','overall_reading_level','user_id'],postTests);
    }
    const [afterAdvisers]=await c.execute('SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id=? AND school_year_id=? ORDER BY adviser_assignment_id',[cls.section_id,year.school_year_id]);
    const [afterTeacher]=await c.execute('SELECT * FROM TEACHER_ASSIGNMENT WHERE teacher_assignment_id=?',[cls.teacher_assignment_id]);
    assert.deepEqual(afterAdvisers,advisers);assert.equal(Number(afterTeacher[0].subject_offering_id),Number(cls.subject_offering_id));
    if(apply)await c.commit();else await c.rollback();
    return {...report,learners:students.length,weekdays:dates.length,attendanceDaysAdded:missingDays.length,
      attendanceAdded:newAttendance.length+projected,screeningAdded:newScreening.length,postTestAdded:postTests.length,adviserAssignmentsUnchanged:true};
  }catch(error){await c.rollback();throw error;}finally{c.release();}
}
async function main() {
  const args=process.argv.slice(2),apply=args.includes('--apply');
  const through=args.find(arg=>arg.startsWith('--through='))?.slice('--through='.length)
    ||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
  const backupDir=args.find(arg=>arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  assert.match(through,/^\d{4}-\d{2}-\d{2}$/);
  if(apply)assert(backupDir,'A backup directory is required.');
  const db=require('../config/db');
  try {
    assert(db.cloudPool||!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL),'The shared database is required.');
    const pool=db.cloudPool||db;
    // Check and prepare John Doe's existing teaching assignment before grading.
    console.log(JSON.stringify({supportingRecords:await supportingRecords(pool,{apply,through,backupDir})}));
    console.log(JSON.stringify(await populateAll(pool,{apply,through,backupDir,sectionNames:['Acacia'],submitSectionNames:['Acacia']})));
  }finally{await db.end();if(db.cloudPool)await db.cloudPool.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={supportingRecords};
