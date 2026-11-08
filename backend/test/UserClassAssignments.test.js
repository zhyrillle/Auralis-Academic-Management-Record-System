const test = require('node:test');
const assert = require('node:assert/strict');
const assignments = require('../services/UserClassAssignments');

function fixture() {
  const state = {
    advisers: [
      {adviser_assignment_id:11,user_id:7,section_id:3,school_year_id:1},
      {adviser_assignment_id:12,user_id:7,section_id:3,school_year_id:2},
      {adviser_assignment_id:13,user_id:7,section_id:3,school_year_id:3},
      {adviser_assignment_id:14,user_id:8,section_id:4,school_year_id:1},
    ],
    offerings: [
      {subject_offering_id:101,section_id:3,school_year_id:1},
      {subject_offering_id:201,section_id:3,school_year_id:2},
      {subject_offering_id:202,section_id:4,school_year_id:2},
      {subject_offering_id:203,section_id:4,school_year_id:2},
    ],
    teachers: [
      {teacher_assignment_id:21,user_id:7,subject_offering_id:101},
      {teacher_assignment_id:22,user_id:7,subject_offering_id:201},
      {teacher_assignment_id:23,user_id:8,subject_offering_id:202},
    ],
    attendance: [
      {attendance_sheet_id:1,adviser_assignment_id:11,teacher_assignment_id:21},
      {attendance_sheet_id:2,adviser_assignment_id:12,teacher_assignment_id:22},
    ],
    scores: [{teacher_assignment_id:21,raw_score:17},{teacher_assignment_id:22,raw_score:19}],
    heads: [{department_head_id:31,user_id:7,department_id:1,school_year_id:1}],
    calls: [],
  };
  const connection = {execute:async(sql,p=[])=>{
    state.calls.push({sql,p});
    if(sql.startsWith('SELECT section_id FROM SECTION'))return [[{section_id:p[0]}]];
    if(sql.startsWith('SELECT saa.user_id'))return [state.advisers.filter(a=>a.section_id===p[0]&&a.school_year_id===p[1]&&a.user_id!==p[2])];
    if(sql.startsWith('SELECT subject_offering_id'))return [state.offerings.filter(o=>o.subject_offering_id===p[0])];
    if(sql.startsWith('SELECT ta.user_id'))return [state.teachers.filter(a=>a.subject_offering_id===p[0]&&a.user_id!==p[1])];
    if(sql.startsWith('SELECT * FROM SECTION_ADVISER_ASSIGNMENT'))return [state.advisers.filter(a=>a.user_id===p[0]&&a.school_year_id===p[1])];
    if(sql.startsWith('SELECT ta.*'))return [state.teachers.filter(a=>a.user_id===p[0]&&state.offerings.some(o=>o.subject_offering_id===a.subject_offering_id&&o.school_year_id===p[1]))];
    if(sql.startsWith('SELECT * FROM DEPARTMENT_HEAD'))return [state.heads.filter(a=>a.user_id===p[0]&&a.school_year_id===p[1])];
    if(sql.startsWith('UPDATE ATTENDANCE_SHEET')){
      const field=sql.includes('SET adviser_assignment_id')?'adviser_assignment_id':'teacher_assignment_id';
      for(const row of state.attendance)if(row[field]===p[0])row[field]=null;
    }else if(sql.startsWith('UPDATE SCORE')){
      for(const row of state.scores)if(row.teacher_assignment_id===p[0])row.teacher_assignment_id=null;
    }else if(sql.startsWith('DELETE FROM SECTION_ADVISER_ASSIGNMENT')){
      state.advisers=state.advisers.filter(a=>!(a.adviser_assignment_id===p[0]&&a.user_id===p[1]&&a.school_year_id===p[2]));
    }else if(sql.startsWith('DELETE FROM TEACHER_ASSIGNMENT')){
      state.teachers=state.teachers.filter(a=>!(a.teacher_assignment_id===p[0]&&a.user_id===p[1]));
    }else if(sql.startsWith('DELETE FROM DEPARTMENT_HEAD')){
      state.heads=state.heads.filter(a=>!(a.department_head_id===p[0]&&a.user_id===p[1]&&a.school_year_id===p[2]));
    }else if(sql.startsWith('INSERT INTO SECTION_ADVISER_ASSIGNMENT')){
      state.advisers.push({adviser_assignment_id:99,section_id:p[0],school_year_id:p[1],user_id:p[2],assigned_from:p[3],assigned_until:p[4]});
    }else if(sql.startsWith('INSERT INTO TEACHER_ASSIGNMENT')){
      state.teachers.push({teacher_assignment_id:99,user_id:p[0],subject_offering_id:p[1],assigned_from:p[2],assigned_until:p[3]});
    }else throw Error('Unexpected isolated assignment query: '+sql);
    return [{affectedRows:1}];
  }};
  return {state,connection};
}
const year={school_year_id:2};
const dates={assignedFrom:'2027-01-01',assignedUntil:'2028-12-31'};
const unchanged={adviser_section_id:3,teaching_assignments:[{subject_offering_id:201,section_id:3}]};

test('saving unchanged assignments preserves their IDs, attendance, scores, and all other school years',async()=>{
  const {state,connection}=fixture(),before=structuredClone(state);
  await assignments.validate(connection,7,unchanged,2);
  await assignments.synchronize(connection,7,unchanged,year,'subject teacher',dates);
  for(const key of ['advisers','teachers','attendance','scores','heads'])assert.deepEqual(state[key],before[key]);
  assert(state.calls.every(c=>!/^INSERT|^UPDATE|^DELETE/.test(c.sql)));
});

test('changing upcoming-year classes only removes that year’s retired links',async()=>{
  const {state,connection}=fixture();
  const body={adviser_section_id:4,teaching_assignments:[{subject_offering_id:203,section_id:4}]};
  await assignments.validate(connection,7,body,2);
  await assignments.synchronize(connection,7,body,year,'subject teacher',dates);
  assert(state.advisers.some(a=>a.adviser_assignment_id===11));
  assert(state.advisers.some(a=>a.adviser_assignment_id===13));
  assert(state.advisers.some(a=>a.school_year_id===2&&a.section_id===4&&a.adviser_assignment_id===99));
  assert(state.teachers.some(a=>a.teacher_assignment_id===21));
  assert(state.teachers.some(a=>a.subject_offering_id===203));
  assert.deepEqual(state.attendance[0],{attendance_sheet_id:1,adviser_assignment_id:11,teacher_assignment_id:21});
  assert.deepEqual(state.attendance[1],{attendance_sheet_id:2,adviser_assignment_id:null,teacher_assignment_id:null});
  assert.equal(state.scores[0].teacher_assignment_id,21);
  assert.equal(state.scores[1].teacher_assignment_id,null);
  assert.deepEqual(state.scores.map(s=>s.raw_score),[17,19]);
  assert.equal(state.heads.length,1);
});

test('an adviser assigned in another year does not block the selected year',async()=>{
  const {connection}=fixture();
  await assignments.validate(connection,7,{adviser_section_id:4,teaching_assignments:[]},2);
  await assert.rejects(assignments.validate(connection,7,{adviser_section_id:4},1),e=>e.statusCode===409);
});

test('subjects from another school year or another section are rejected',async()=>{
  for(const assignment of [{subject_offering_id:101},{subject_offering_id:201,section_id:4},{subject_offering_id:999}]){
    const {connection}=fixture();
    await assert.rejects(assignments.validate(connection,7,{teaching_assignments:[assignment]},2),e=>e.statusCode===400);
  }
});

test('duplicate subjects and another teacher’s active assignment are rejected',async()=>{
  const {connection}=fixture();
  await assert.rejects(assignments.validate(connection,7,{teaching_assignments:[{subject_offering_id:201},{subject_offering_id:201}]},2),e=>e.statusCode===400);
  await assert.rejects(assignments.validate(connection,7,{teaching_assignments:[{subject_offering_id:202}]},2),e=>e.statusCode===409);
});

test('clearing a selected year leaves current and historical assignments intact',async()=>{
  const {state,connection}=fixture();
  await assignments.synchronize(connection,7,{teaching_assignments:[]},year,'subject teacher',dates);
  assert.deepEqual(state.advisers.filter(a=>a.user_id===7).map(a=>a.school_year_id),[1,3]);
  assert.deepEqual(state.teachers.filter(a=>a.user_id===7).map(a=>a.subject_offering_id),[101]);
  assert.equal(state.attendance[0].adviser_assignment_id,11);
  assert.equal(state.attendance[0].teacher_assignment_id,21);
});
