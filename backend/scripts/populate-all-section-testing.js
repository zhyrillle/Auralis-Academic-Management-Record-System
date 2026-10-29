// Capstone fixtures for explicitly selected sections, Terms 1 and 2 only.
// Assignments and grades outside the requested submissions are preserved.
// --apply --submit-cedar --backup-dir=<outside-repository folder> saves the data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { populate: populateEnglish, weekdays, rawScore } = require('./populate-john-doe-english-testing');
const { calculateGrades, isMapehSubject, termCode } = require('../services/GradeComputationService');
const slots = rows => rows.map(() => '?').join(',');
const dateOnly = value => new Date(value).toISOString().slice(0, 10);
const component = code => ['EX', 'QA', 'STE'].includes(code) ? 'STE' : code;
function activityKey(row) {
  const code = component(row.component_code);
  if (code === 'STE') {
    if (/\b(?:ST1|SUMMATIVE\s*(?:TEST\s*)?1)\b/i.test(row.activity_name)) return 'ST1';
    if (/\b(?:ST2|SUMMATIVE\s*(?:TEST\s*)?2)\b/i.test(row.activity_name)) return 'ST2';
    if (/\b(?:TE|TERM\s*EXAM|QUARTERLY)\b/i.test(row.activity_name)) return 'TE';
    throw new Error('An examination has no recognized ST1/ST2/TE mapping.');
  }
  const match = row.activity_name.match(/(?:WRITTEN\s*WORK|PERFORMANCE\s*TASK|WW|PT)\s*(\d+)/i);
  return match ? `${code}${match[1]}` : `${code}:${row.activity_name}`;
}
function templates(mapeh) {
  return [
    ...[20,20,25,30,20].map((max,i) => ({ code: 'WW', key: `WW${i+1}`, name: `Written Work ${i+1}`, max })),
    ...[50,50,50].map((max,i) => ({ code: 'PT', key: `PT${i+1}`, name: `Performance Task ${i+1}`, max })),
    { code: 'STE', key: 'ST1', name: 'Summative Test 1', max: mapeh ? 25 : 30 },
    { code: 'STE', key: 'ST2', name: 'Summative Test 2', max: mapeh ? 25 : 30 },
    { code: 'STE', key: 'TE', name: 'Term Exam', max: mapeh ? 25 : 40 },
  ];
}
async function insertRows(c, table, columns, rows) {
  for (let i=0;i<rows.length;i+=200) {
    const chunk=rows.slice(i,i+200);
    await c.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${chunk.map(() => '('+slots(columns)+')').join(',')}`,chunk.flat());
  }
}
async function populateAll(pool, { apply, submitCedar, through, backupDir,
  sectionNames = ['Cedar','Mahogany'], submitSectionNames = submitCedar ? ['Cedar'] : [] }) {
  const expectedSubjects = { Cedar: 8, Mahogany: 9, Acacia: 9 };
  assert(sectionNames.length && sectionNames.every(name=>Object.hasOwn(expectedSubjects,name)));
  assert(submitSectionNames.every(name=>sectionNames.includes(name)));
  const c=await pool.getConnection();
  const report={ applied:apply, submissionSections:submitSectionNames, through, sections:[], archivedEmptyDuplicateExams:0 };
  try {
    await c.beginTransaction();
    const lock=apply?' FOR UPDATE':'';
    const [years]=await c.execute("SELECT * FROM SCHOOL_YEAR WHERE LOWER(status)='ongoing'"+lock);
    assert.equal(years.length,1);
    const year=years[0];
    const [actors]=await c.execute("SELECT user_id FROM USER WHERE first_name='John' AND last_name='Doe' AND account_status='active'"+lock);
    assert.equal(actors.length,1);
    const actor=actors[0].user_id;
    const [periods]=await c.execute("SELECT * FROM ACADEMIC_TERM WHERE school_year_id=? AND term_name IN ('1st','2nd') ORDER BY starts_at"+lock,[year.school_year_id]);
    assert.equal(periods.length,2);
    const [classes]=await c.execute(`SELECT so.*,sec.section_name,sub.subject_code,sub.subject_name
      FROM SUBJECT_OFFERING so JOIN SECTION sec ON sec.section_id=so.section_id JOIN SUBJECT sub ON sub.subject_id=so.subject_id
      WHERE sec.section_name IN (${slots(sectionNames)}) AND so.school_year_id=? ORDER BY sec.section_name,sub.subject_name${lock}`,[...sectionNames,year.school_year_id]);
    for(const name of sectionNames)assert.equal(classes.filter(row=>row.section_name===name).length,expectedSubjects[name],`${name} must have its current subjects.`);
    const ids=classes.map(row=>row.subject_offering_id);
    const sectionIds=[...new Set(classes.map(row=>row.section_id))];
    const [teachers]=await c.execute(`SELECT * FROM TEACHER_ASSIGNMENT WHERE subject_offering_id IN (${slots(ids)}) ORDER BY teacher_assignment_id${lock}`,ids);
    const [advisers]=await c.execute(`SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id IN (${slots(sectionIds)}) AND school_year_id=? ORDER BY adviser_assignment_id${lock}`,[...sectionIds,year.school_year_id]);
    const [roster]=await c.execute(`SELECT ss.student_section_id,ss.student_id,ss.section_id FROM STUDENT_SECTION ss
      JOIN STUDENT st ON st.student_id=ss.student_id WHERE ss.section_id IN (${slots(sectionIds)}) AND ss.school_year_id=?
      AND (st.status='ACTIVE' OR st.status IS NULL) ORDER BY ss.student_section_id${lock}`,[...sectionIds,year.school_year_id]);
    const [sheets]=await c.execute(`SELECT * FROM GRADE_SHEET WHERE subject_offering_id IN (${slots(ids)})
      AND term_id IN (${slots(periods)}) ORDER BY grade_sheet_id${lock}`,[...ids,...periods.map(row=>row.term_id)]);
    const sheetIds=sheets.map(row=>row.grade_sheet_id);
    const [activities]=sheetIds.length ? await c.execute(`SELECT ga.*,ct.component_code FROM GRADE_ACTIVITY ga
      JOIN SUBJECT_COMPONENT_WEIGHT cw ON cw.subj_comp_weight_id=ga.subj_comp_weight_id
      JOIN COMPONENT_TYPE ct ON ct.component_type_id=cw.component_type_id
      WHERE ga.grade_sheet_id IN (${slots(sheetIds)}) ORDER BY ga.activity_id${lock}`,sheetIds) : [[]];
    const [scores]=sheetIds.length ? await c.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id=sc.activity_id
      WHERE ga.grade_sheet_id IN (${slots(sheetIds)}) ORDER BY sc.score_id${lock}`,sheetIds) : [[]];
    const [accepted]=await c.execute(`SELECT * FROM STUDENT_GRADE WHERE subject_offering_id IN (${slots(ids)}) ORDER BY student_grade_id${lock}`,ids);
    const [allWeights]=await c.execute(`SELECT cw.*,ct.component_code FROM SUBJECT_COMPONENT_WEIGHT cw
      JOIN COMPONENT_TYPE ct ON ct.component_type_id=cw.component_type_id WHERE cw.school_year_id=? ORDER BY cw.subj_comp_weight_id${lock}`,[year.school_year_id]);
    const [configs]=await c.execute('SELECT * FROM GRADE_TRANSMUTATION_CONFIG WHERE config_id=1'+lock);
    assert.equal(configs.length,1);
    const config={is_custom_enabled:Boolean(Number(configs[0].is_custom_enabled)),ranges:JSON.parse(configs[0].ranges_json)};
    if (apply) {
      assert(backupDir,'A backup directory is required.');
      fs.mkdirSync(backupDir,{recursive:true});
      report.backupFile=path.join(backupDir,`all-subjects-${Date.now()}-before.json`);
      fs.writeFileSync(report.backupFile,JSON.stringify({capturedAt:new Date().toISOString(),actor,year,periods,classes,teachers,advisers,roster,sheets,activities,scores,accepted,allWeights,configs},null,2),{flag:'wx'});
    }
    for (const cls of classes) {
      const students=roster.filter(row=>Number(row.section_id)===Number(cls.section_id));
      assert(students.length>0);
      const mapeh=isMapehSubject(cls), parts=mapeh?['MA','PEH']:[null];
      const weights=allWeights.filter(row=>Number(row.subject_id)===Number(cls.subject_id));
      assert.equal(weights.length,3,`${cls.subject_name} needs its saved component weights.`);
      const assignments=teachers.filter(row=>Number(row.subject_offering_id)===Number(cls.subject_offering_id));
      const assignmentId=assignments.length===1?assignments[0].teacher_assignment_id:null;
      const details={section:cls.section_name,subject:cls.subject_name,learners:students.length,terms:[]};
      for (const period of periods) {
        const code=termCode(period.term_name);
        const matching=sheets.filter(row=>Number(row.subject_offering_id)===Number(cls.subject_offering_id)&&Number(row.term_id)===Number(period.term_id));
        assert(matching.length<=1,'Duplicate grade sheets require review.');
        let sheet=matching[0];
        if (!sheet) {
          sheet={grade_sheet_id:-(Number(cls.subject_offering_id)*10+Number(period.term_id)),workflow_status:'DRAFT',
            lock_status:period.status==='completed'?'TERM_LOCKED':'EDITABLE',submitted_at:null};
          if (apply) {
            const [created]=await c.execute("INSERT INTO GRADE_SHEET (subject_offering_id,term_id,workflow_status,lock_status) VALUES (?,?,'DRAFT',?)",[cls.subject_offering_id,period.term_id,sheet.lock_status]);
            sheet.grade_sheet_id=created.insertId;
          }
        }
        let active=activities.filter(row=>Number(row.grade_sheet_id)===Number(sheet.grade_sheet_id)&&row.status!=='ARCHIVED');
        if (mapeh) assert(active.every(row=>parts.includes(row.mapeh_component)),'Legacy MAPEH activities require explicit component review.');
        const days=weekdays(period.starts_at,dateOnly(period.ends_at)<through?dateOnly(period.ends_at):through);
        assert(days.length);
        let activityAdds=0,scoreAdds=0;
        for (const part of parts) {
          const existing=active.filter(row=>(row.mapeh_component||null)===part);
          const examGroups=new Map();
          for(const row of existing.filter(row=>component(row.component_code)==='STE')) {
            const key=activityKey(row);if(!examGroups.has(key))examGroups.set(key,[]);examGroups.get(key).push(row);
          }
          for(const duplicates of examGroups.values())if(duplicates.length>1) {
            duplicates.sort((a,b)=>scores.filter(row=>Number(row.activity_id)===Number(b.activity_id)).length
              -scores.filter(row=>Number(row.activity_id)===Number(a.activity_id)).length||Number(b.activity_id)-Number(a.activity_id));
            for(const extra of duplicates.slice(1)) {
              assert(!scores.some(row=>Number(row.activity_id)===Number(extra.activity_id)),'Duplicate examinations with scores need manual review.');
              if(apply)await c.execute("UPDATE GRADE_ACTIVITY SET status='ARCHIVED',archived_at=UTC_TIMESTAMP(6),updated_at=UTC_TIMESTAMP(6) WHERE activity_id=?",[extra.activity_id]);
              active=active.filter(row=>Number(row.activity_id)!==Number(extra.activity_id));
              report.archivedEmptyDuplicateExams++;
            }
          }
          const required=templates(mapeh);
          for(let index=0;index<required.length;index++) {
            const item=required[index];
            if(active.some(row=>(row.mapeh_component||null)===part&&activityKey(row)===item.key))continue;
            const weight=weights.filter(row=>component(row.component_code)===item.code);
            assert.equal(weight.length,1);
            let activityId=-(Number(cls.subject_offering_id)*100+activityAdds+1);
            if(apply) {
              const [created]=await c.execute(`INSERT INTO GRADE_ACTIVITY
                (grade_sheet_id,subj_comp_weight_id,mapeh_component,activity_name,highest_possible_score,activity_date,status,created_at)
                VALUES (?,?,?,?,?,?,'ACTIVE',UTC_TIMESTAMP(6))`,[sheet.grade_sheet_id,weight[0].subj_comp_weight_id,part,item.name,item.max,days[Math.floor(index*(days.length-1)/(required.length-1))]]);
              activityId=created.insertId;
            }
            active.push({activity_id:activityId,grade_sheet_id:sheet.grade_sheet_id,subj_comp_weight_id:weight[0].subj_comp_weight_id,
              component_code:item.code,mapeh_component:part,activity_name:item.name,highest_possible_score:item.max,status:'ACTIVE'});
            activityAdds++;
          }
        }
        const inserts=[];
        for(const activity of active)for(const student of students) {
          const current=scores.filter(row=>Number(row.activity_id)===Number(activity.activity_id)&&Number(row.student_section_id)===Number(student.student_section_id));
          assert(current.length<=1,'Duplicate raw scores need review.');
          const old=current[0];
          assert(!old||old.score_status!=='EXCUSED','Existing excused scores need review.');
          if(old&&old.raw_score!=null&&['ENCODED','MISSING'].includes(old.score_status)) {
            assert(Number(old.raw_score)>=0&&Number(old.raw_score)<=Number(activity.highest_possible_score));
            if(!Number.isInteger(Number(old.raw_score))&&apply)await c.execute('UPDATE SCORE SET raw_score=?,updated_at=UTC_TIMESTAMP(6) WHERE score_id=?',[Math.min(Math.floor(Number(activity.highest_possible_score)),Math.round(Number(old.raw_score))),old.score_id]);
            continue;
          }
          const generated=rawScore(student,activity,period.term_name);
          if(old) {if(apply)await c.execute("UPDATE SCORE SET raw_score=?,score_status='ENCODED',teacher_assignment_id=?,updated_at=UTC_TIMESTAMP(6) WHERE score_id=?",[generated,assignmentId,old.score_id]);}
          else inserts.push([activity.activity_id,student.student_section_id,generated,'ENCODED',assignmentId]);
          scoreAdds++;
        }
        if(apply) {
          await insertRows(c,'SCORE',['activity_id','student_section_id','raw_score','score_status','teacher_assignment_id'],inserts);
          const [saved]=await c.execute(`SELECT sc.* FROM SCORE sc JOIN GRADE_ACTIVITY ga ON ga.activity_id=sc.activity_id WHERE ga.grade_sheet_id=?`,[sheet.grade_sheet_id]);
          const grades=calculateGrades({offering:cls,students,weights,activities:active,scores:saved,config});
          assert.equal(grades.length,students.length*(mapeh?3:1));
          if(submitSectionNames.includes(cls.section_name)&&sheet.workflow_status!=='SUBMITTED') {
            for(const grade of grades) {
              const previous=accepted.filter(row=>Number(row.subject_offering_id)===Number(cls.subject_offering_id)
                &&Number(row.student_id)===grade.studentId&&row.term===code&&(row.mapeh_component||null)===grade.mapehComponent);
              assert(previous.length<=1,'Duplicate accepted grades require review.');
              const values=[studentEnrollment(students,grade.studentId),grade.initialGrade,grade.termGrade,grade.termGrade>=75?'Passed':'Failed'];
              if(previous.length)await c.execute('UPDATE STUDENT_GRADE SET student_section_id=?,initial_grade=?,quarterly_grade=?,remarks=?,updated_at=UTC_TIMESTAMP(6) WHERE student_grade_id=?',[...values,previous[0].student_grade_id]);
              else await c.execute(`INSERT INTO STUDENT_GRADE (student_section_id,initial_grade,quarterly_grade,remarks,subject_offering_id,student_id,term,mapeh_component)
                VALUES (?,?,?,?,?,?,?,?)`,[...values,cls.subject_offering_id,grade.studentId,code,grade.mapehComponent]);
            }
            const completed=period.status==='completed';
            await c.execute(`UPDATE GRADE_SHEET SET workflow_status='SUBMITTED',submitted_at=UTC_TIMESTAMP(6),
              lock_status=IF(?,'TERM_LOCKED',lock_status),locked_at=IF(?,COALESCE(locked_at,UTC_TIMESTAMP(6)),locked_at),
              updated_at=UTC_TIMESTAMP(6) WHERE grade_sheet_id=?`,[completed,completed,sheet.grade_sheet_id]);
            await c.execute(`INSERT INTO AUDIT_EVENT (user_id,actor_context,event_type,module_name,entity_type,entity_id,before_data,after_data,metadata)
              VALUES (?,?,'GRADE_SHEET_SUBMITTED','GRADING','GRADE_SHEET',?,?,?,?)`,[actor,
              JSON.stringify({source:'capstone_test_population',acting_as:`${cls.section_name} testing setup`}),sheet.grade_sheet_id,
              JSON.stringify({workflow_status:sheet.workflow_status,submitted_at:sheet.submitted_at}),
              JSON.stringify({workflow_status:'SUBMITTED',term:code}),JSON.stringify({test_data:true,section:cls.section_name,subject:cls.subject_name,
                school_year_id:year.school_year_id,term:code,learner_count:students.length,closed_term_test_setup:period.status==='completed'})]);
            sheet={...sheet,workflow_status:'SUBMITTED'};
          }
          const enrollmentIds=new Set(students.map(row=>Number(row.student_section_id)));
          assert(saved.filter(row=>enrollmentIds.has(Number(row.student_section_id))).every(row=>Number.isInteger(Number(row.raw_score))));
        }
        details.terms.push({term:code,activities:active.length,scores:active.length*students.length,activitiesAdded:activityAdds,scoresAdded:scoreAdds,
          status:submitSectionNames.includes(cls.section_name)?'SUBMITTED':sheet.workflow_status});
      }
      report.sections.push(details);
    }
    const preservedIds=classes.filter(row=>!submitSectionNames.includes(row.section_name)).map(row=>row.subject_offering_id);
    const [afterPreserved]=preservedIds.length ? await c.execute(`SELECT * FROM STUDENT_GRADE WHERE subject_offering_id IN (${slots(preservedIds)}) ORDER BY student_grade_id`,preservedIds) : [[]];
    assert.deepEqual(afterPreserved,accepted.filter(row=>preservedIds.some(id=>Number(id)===Number(row.subject_offering_id))),'Grades outside requested submissions must remain unchanged.');
    const [afterTeachers]=await c.execute(`SELECT * FROM TEACHER_ASSIGNMENT WHERE subject_offering_id IN (${slots(ids)}) ORDER BY teacher_assignment_id`,ids);
    const [afterAdvisers]=await c.execute(`SELECT * FROM SECTION_ADVISER_ASSIGNMENT WHERE section_id IN (${slots(sectionIds)}) AND school_year_id=? ORDER BY adviser_assignment_id`,[...sectionIds,year.school_year_id]);
    assert.deepEqual(afterTeachers,teachers);assert.deepEqual(afterAdvisers,advisers);
    const [afterSheets]=preservedIds.length ? await c.execute(`SELECT * FROM GRADE_SHEET WHERE subject_offering_id IN (${slots(preservedIds)}) AND term_id IN (${slots(periods)})`,[...preservedIds,...periods.map(row=>row.term_id)]) : [[]];
    for(const before of sheets.filter(row=>preservedIds.some(id=>Number(id)===Number(row.subject_offering_id)))) {
      const after=afterSheets.find(row=>Number(row.grade_sheet_id)===Number(before.grade_sheet_id));
      assert.equal(after.workflow_status,before.workflow_status);assert.equal(String(after.submitted_at),String(before.submitted_at));
    }
    if(apply)await c.commit();else await c.rollback();
    report.assignmentsPreserved=true;report.otherSubmissionsPreserved=true;
    return report;
  }catch(error){await c.rollback();throw error;}finally{c.release();}
}
function studentEnrollment(students,id){return students.find(row=>Number(row.student_id)===Number(id)).student_section_id;}
async function main(){
  const args=process.argv.slice(2),apply=args.includes('--apply'),submitCedar=args.includes('--submit-cedar');
  const backupDir=args.find(arg=>arg.startsWith('--backup-dir='))?.slice('--backup-dir='.length);
  const through=args.find(arg=>arg.startsWith('--through='))?.slice('--through='.length)
    ||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date());
  assert.match(through,/^\d{4}-\d{2}-\d{2}$/);
  if(apply)assert(backupDir&&submitCedar,'Applying this fixture requires explicit Cedar submission and a backup directory.');
  const db=require('../config/db');
  try{
    assert(db.cloudPool||!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL),'The shared database is required.');
    const pool=db.cloudPool||db;
    const supporting=await populateEnglish(pool,{apply,today:through,backupDir});
    console.log(JSON.stringify({supportingRecords:supporting}));
    console.log(JSON.stringify(await populateAll(pool,{apply,submitCedar,through,backupDir})));
  }finally{await db.end();if(db.cloudPool)await db.cloudPool.end();}
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={populateAll,templates,activityKey};
