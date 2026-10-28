const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function report(departmentId, fallback = false) {
 const handlers = new Map();
 const db = { query: async (sql, args) => {
  if (sql.includes('FROM USER')) return [[{department_id:departmentId}]];
  if (sql.includes('FROM DEPARTMENT')) return [[{department_name:departmentId === 9 ? 'English' : 'Math'}]];
  if (sql.includes('FROM SCHOOL_YEAR')) return [[{school_year_id:12,starts_on:2026,ends_on:2027,status:'ongoing'}]];
  if (sql.includes('FROM SUBJECT_OFFERING so')) { assert.match(sql,/s.department_id = \?/); assert.equal(args[0],departmentId); return [[{subject_offering_id:88,section_id:7,school_year_id:12,section_name:'A',grade_level_name:'G7',user_id:1,first_name:'T',last_name:'One'}]]; }
  if (sql.includes('FROM STUDENT_SECTION ss') && sql.includes('SELECT DISTINCT')) { assert.match(sql,/ss.school_year_id = \?/); assert.deepEqual(Array.from(args),[7,12]); return [[{student_id:1}]]; }
  if (sql.includes('FROM STUDENT_GRADE')) return [[{student_id:1,quarterly_grade:80}]];
  if (sql.includes('SELECT at.term_id')) return [[{term_id:5}]];
  if (sql.includes('FROM GRADE_SHEET')) return [[{grade_sheet_id:4,workflow_status:'SUBMITTED',submitted_at:'2026-10-01'}]];
  if (sql.includes('FROM GRADE_ACTIVITY')) return [[{activity_id:3,activity_name:'Terminal Exam',highest_possible_score:100,component_code:'QA'}]];
  if (sql.includes('FROM SCORE')) return [fallback ? [] : [{raw_score:80}]];
  throw new Error(sql);
 }};
 const module = {exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/departmentHeadDashboardRoutes.js'),'utf8'),{module,console,require:n=>n==='express'?{Router:()=>({use(){},get:(p,h)=>handlers.set(p,h)})}:n==='../config/db'?db:{}});
 const res={status(c){this.code=c;return this},json(data){this.data=data;return this}};
 await handlers.get('/grade-distribution-report')({headers:{'x-auralis-user-id':1},query:{schoolYear:'2026-2027',term:'1'}},res);
 assert.notEqual(res.code,500);
 return res.data;
}
for (const department of [9,10]) test(`department ${department}: actual exam maximum, scoped subjects and enrollment`,async()=>{
 const data=await report(department);
 assert.equal(data.grades[0].teachers[0].sections[0].mps,80);
 assert.equal(data.grades[0].mps,80);
 assert.equal(data.summary.mps,80);
 assert.equal(data.grades[0].r80_84,1);
});
test('quarterly grade fallback remains on percentage scale in every rollup',async()=>{
 const data=await report(9,true); assert.equal(data.summary.mps,80);
});
