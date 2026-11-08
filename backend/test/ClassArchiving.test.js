const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const service = require('../services/ClassArchiveService');

// Every query below runs against this in-memory database, never config/db.
function harness() {
  const state = { assignments: [
    { type:'advisory', id:11, userId:7, section_id:3, school_year_id:1, is_archived:0 },
    { type:'teaching', id:21, userId:7, section_id:3, school_year_id:1, is_archived:0 },
    { type:'teaching', id:22, userId:7, section_id:3, school_year_id:2, is_archived:0 },
    { type:'teaching', id:23, userId:8, section_id:3, school_year_id:1, is_archived:0 },
  ], archives:[], calls:[], migrations:[], commits:0, rollbacks:0, failOnUpdate:null };
  let original;
  const connection = {
    query:async sql => { state.migrations.push(sql); return [[]]; },
    beginTransaction:async () => { original=structuredClone({assignments:state.assignments,archives:state.archives}); },
    commit:async () => { state.commits++; },
    rollback:async () => { state.assignments=original.assignments;state.archives=original.archives;state.rollbacks++; },
    release:() => {},
    execute:async (sql,params=[]) => {
      params=Array.from(params);state.calls.push({sql,params});
      const type=sql.includes('SECTION_ADVISER_ASSIGNMENT')?'advisory':'teaching';
      if(sql.includes('FOR UPDATE')) {
        assert.match(sql,/AND (saa|ta)\.user_id = \?/);
        return [state.assignments.filter(a=>a.type===type&&a.id===params[0]&&a.userId===params[1])];
      }
      if(sql.startsWith('DELETE FROM CLASS_ARCHIVE')) {
        assert.match(sql,/user_id = \? AND assignment_type = \? AND assignment_id = \?/);
        state.archives=state.archives.filter(a=>!(a.user_id===params[0]&&a.assignment_type===params[1]&&a.assignment_id===params[2]));return [{affectedRows:1}];
      }
      if(sql.startsWith('INSERT INTO CLASS_ARCHIVE')) {
        const row={user_id:params[0],assignment_type:params[1],assignment_id:params[2],section_id:params[3],reason:params[4],archived_at:'2026-11-08T12:00:00Z'};
        state.archives=state.archives.filter(a=>!(a.user_id===row.user_id&&a.assignment_type===row.assignment_type&&a.assignment_id===row.assignment_id));state.archives.push(row);return [{affectedRows:1}];
      }
      if(sql.startsWith('UPDATE ')) {
        assert.match(sql,/AND user_id = \?/);
        if(state.failOnUpdate===params[1])throw Error('Simulated assignment write failure');
        const row=state.assignments.find(a=>a.type===type&&a.id===params[1]&&a.userId===params[2]);
        assert(row);row.is_archived=params[0];row.archived_at=params[0]?'2026-11-08T12:00:00Z':null;return [{affectedRows:1}];
      }
      if(sql.includes('SELECT DISTINCT'))return [state.assignments.filter(a=>a.type===type&&a.userId===Number(params[0])).map(a=>({
        ...a, adviser_assignment_id:type==='advisory'?a.id:undefined,teacher_assignment_id:type==='teaching'?a.id:undefined,
        subject_offering_id:100+a.id,subject_id:2,subject_name:'Science',section_name:'Fixture Section',grade_level_name:'G7',
        is_specialized:0,school_year_status:a.school_year_id===2?'completed':'ongoing',school_year_end:a.school_year_id===2?2025:2027,
        is_archived_col:a.is_archived,archived_at_col:a.archived_at,
      }))];
      if(sql.includes('FROM CLASS_ARCHIVE'))return [state.archives.filter(a=>a.user_id===Number(params[0]))];
      if(sql.includes('FROM ACADEMIC_TERM'))return [[]];
      throw Error('Unexpected isolated database query: '+sql);
    },
  };
  const database={getConnection:async()=>connection,execute:(...args)=>connection.execute(...args)};
  const mod={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../models/Section.js'),'utf8'),{
    module:mod,console,require:name=>{
      if(name==='../config/db')return database;
      if(name==='../services/ClassArchiveService')return service;
      if(name==='../utils/encryption')return {decryptLrn:value=>value};
      throw Error('Unexpected model dependency: '+name);
    },
  });
  return {state,database,Section:mod.exports};
}
const input={assignmentType:'teaching',assignmentId:21,sectionId:3,schoolYearId:1};
const mutations=state=>state.calls.filter(c=>/^INSERT|^UPDATE|^DELETE/.test(c.sql));

test('owned classes move between active and archived without changing past-school-year cards',async()=>{
  const {state,Section}=harness();
  const before=await Section.findAdviserSections(7);assert.equal(before.length,2);
  await Section.archiveClass(7,input);
  assert.equal((await Section.findAdviserSections(7)).length,1);
  const archived=await Section.findAdviserSections(7,{archived:true});assert.equal(archived.length,2);
  assert(archived.some(c=>c.assignmentId===22&&c.archived_reason==='School Year Ended'));
  await Section.restoreClass(7,input);assert.equal((await Section.findAdviserSections(7)).length,2);
  assert.equal((await Section.findAdviserSections(7,{archived:true})).length,1);
  assert.equal((await Section.findAdviserSections(7,{archived:'all'})).length,3);
  assert(state.calls.every(c=>!/\b(SCORE|STUDENT_GRADE|ATTENDANCE|PHIL_IRI)\b/.test(c.sql)));
});

test('another teacher cannot archive or restore an assignment even with a known section ID',async()=>{
  for(const restore of [false,true]){
    const {state,database}=harness();
    await assert.rejects(service.change(7,{...input,assignmentId:23},restore,database),e=>e.statusCode===403);
    assert.equal(mutations(state).length,0);assert.equal(state.rollbacks,1);
  }
});

test('combined advisory and teaching requests validate all owners before writing either record',async()=>{
  const {state,database}=harness();
  await assert.rejects(service.change(7,{...input,assignmentId:23,advisoryAssignmentId:11},false,database),e=>e.code==='CLASS_ARCHIVE_FORBIDDEN');
  assert.equal(mutations(state).length,0);assert.equal(state.assignments[0].is_archived,0);
});

test('assignments from different school years or a mismatched section are rejected',async()=>{
  for(const request of [{...input,sectionId:9},{...input,assignmentId:22,advisoryAssignmentId:11,schoolYearId:undefined}]){
    const {state,database}=harness();
    await assert.rejects(service.change(7,request,false,database),e=>e.code==='CLASS_ARCHIVE_CONTEXT_MISMATCH');
    assert.equal(mutations(state).length,0);
  }
});

test('combined owned assignments archive and restore together',async()=>{
  const {state,database}=harness(),request={...input,advisoryAssignmentId:11,teacherAssignmentId:21};
  await service.change(7,request,false,database);assert.equal(state.archives.length,2);
  assert(state.assignments.filter(a=>[11,21].includes(a.id)).every(a=>a.is_archived===1));
  await service.change(7,request,true,database);assert.equal(state.archives.length,0);
  assert(state.assignments.filter(a=>[11,21].includes(a.id)).every(a=>a.is_archived===0));
  assert.equal(state.commits,2);
});

test('restoring one assignment preserves another archived assignment in the same section',async()=>{
  const {state,database}=harness();
  await service.change(7,input,false,database);
  await service.change(7,{...input,assignmentId:22,schoolYearId:2},false,database);
  await service.change(7,input,true,database);
  assert.equal(state.archives.length,1);assert.equal(state.archives[0].assignment_id,22);
  assert.equal(state.assignments.find(a=>a.id===22).is_archived,1);
});

test('an interrupted write rolls back archive entries and assignment flags together',async()=>{
  const {state,database}=harness();state.failOnUpdate=21;
  await assert.rejects(service.change(7,{...input,advisoryAssignmentId:11},false,database),/Simulated/);
  assert.equal(state.archives.length,0);assert(state.assignments.every(a=>a.is_archived===0));assert.equal(state.commits,0);
});

test('invalid identifiers and contradictory assignment IDs are rejected before database access',async()=>{
  for(const request of [{...input,assignmentId:0},{...input,assignmentId:'1 OR 1=1'},
    {...input,assignmentType:'section'},{...input,teacherAssignmentId:22},{...input,reason:'x'.repeat(256)}]){
    const {state,database}=harness();await assert.rejects(service.change(7,request,false,database),e=>e.statusCode===400);
    assert.equal(state.migrations.length,0);assert.equal(state.calls.length,0);
  }
});

test('repeating an archive request creates only one entry',async()=>{
  const {state,database}=harness();await service.change(7,input,false,database);await service.change(7,input,false,database);
  assert.equal(state.archives.length,1);
});

test('class reads and writes use the same shared database when a cloud pool is configured',async()=>{
  const {database,Section}=harness();let readPool,writePool;
  database.cloudPool={};
  const probe={ensureSchema:async db=>{readPool=db;throw Error('Stop before reads');},change:async(u,p,r,db)=>{writePool=db;}};
  const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../models/Section.js'),'utf8'),{
    module:mod,console,require:name=>name==='../config/db'?database:name==='../services/ClassArchiveService'?probe:{},
  });
  await assert.rejects(mod.exports.findAdviserSections(7),/Stop before reads/);
  await mod.exports.archiveClass(7,input);assert.equal(readPool,database.cloudPool);assert.equal(writePool,readPool);
  assert(Section);
});

function routesFor(Section) {
  const routes=new Map(),router={get(){},put(){},delete(){},patch(){},post:(url,...handlers)=>routes.set(url,handlers)};
  const authModule={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../middleware/resolveCurrentUser.js'),'utf8'),{
    module:authModule,require:name=>{
      assert.equal(name,'../models/User');return {findById:async id=>id===7?{user_id:7,role:'subject_teacher',account_status:'active'}:null};
    },
  });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/sectionRoutes.js'),'utf8'),{
    module:{exports:{}},console,require:name=>{
      if(name==='express')return {Router:()=>router};
      if(name==='../models/Section')return Section;
      if(name==='../middleware/resolveCurrentUser')return authModule.exports;
      if(['../config/db','../services/cloudSyncService'].includes(name))return {};
      throw Error('Unexpected route dependency: '+name);
    },
  });
  return async(url,body,userId)=>{
    const req={body,get:()=>userId==null?undefined:String(userId)};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
    const handlers=routes.get(url);let index=0;
    const next=error=>{if(error)throw error;const handler=handlers[index++];return handler?.(req,res,next);};
    await next();return res;
  };
}

test('archive routes require a signed-in active user before accessing records',async()=>{
  const {state,Section}=harness(),request=routesFor(Section);
  for(const url of ['/archive','/restore'])for(const user of [undefined,99]){
    const res=await request(url,{...input,userId:7},user);assert.equal(res.statusCode,401);
  }
  assert.equal(state.calls.length,0);assert.equal(state.migrations.length,0);
});

test('archive routes ignore body user IDs and enforce the resolved owner for archive and restore',async()=>{
  for(const url of ['/archive','/restore']){
    const {state,Section}=harness(),request=routesFor(Section);
    const forbidden=await request(url,{...input,assignmentId:23,userId:8},7);assert.equal(forbidden.statusCode,403);assert.equal(mutations(state).length,0);
    const allowed=await request(url,{...input,userId:8},7);assert.equal(allowed.statusCode,200);
    assert(mutations(state).every(c=>c.sql.startsWith('UPDATE ')?c.params[2]===7:c.params[0]===7));
  }
});

test('schema setup runs once per pool on a single connection and includes all four required columns',async()=>{
  let connections=0;const calls=[];
  const db={getConnection:async()=>{connections++;return {query:async sql=>{calls.push(sql);},release(){}};}};
  await Promise.all([service.ensureSchema(db),service.ensureSchema(db)]);
  assert.equal(connections,1);assert.equal(calls.length,17);
  for(const table of ['SECTION_ADVISER_ASSIGNMENT','TEACHER_ASSIGNMENT'])for(const column of ['is_archived','archived_at']){
    const ddl=calls.find(sql=>sql.includes(`ALTER TABLE ${table} ADD COLUMN ${column}`));assert(ddl);assert(ddl.includes('IF(EXISTS('));
  }
  assert(!calls.some(sql=>/^UPDATE |^DELETE |^DROP /i.test(sql)));
});

test('a failed schema setup is retried instead of permanently hiding class lists',async()=>{
  let attempts=0;const db={getConnection:async()=>{if(++attempts===1)throw Error('Schema connection unavailable');return {query:async()=>{},release(){}};}};
  await assert.rejects(service.ensureSchema(db),/unavailable/);await service.ensureSchema(db);assert.equal(attempts,2);
});
