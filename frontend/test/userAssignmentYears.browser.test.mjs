// Real Manage Users page with intercepted API calls. Never writes school data.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';

const playwright=await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href:'playwright');
const {chromium}=playwright.chromium ? playwright : playwright.default;
const artifacts=process.env.ARTIFACT_DIR || mkdtempSync(join(tmpdir(),'auralis-assignment-years-'));
mkdirSync(artifacts,{recursive:true});
const server=await createServer({cacheDir:join(artifacts,'vite'),server:{host:'127.0.0.1',port:0,open:false}});
const years=[{school_year_id:1,starts_on:2026,ends_on:2027,status:'ongoing'},
  {school_year_id:2,starts_on:2027,ends_on:2028,status:'upcoming'}];
const user={user_id:7,role:'subject teacher',display_role:'adviser',first_name:'John',last_name:'Doe',email:'john@example.test',
  department_id:1,account_status:'active',adviser_section_id:3,adviser_school_year_id:1,adviser_grade_level_id:1,
  teaching_assignments:[{teacher_assignment_id:21,subject_offering_id:101,section_id:3,grade_level_id:1,school_year_id:1}]};
const otherAdviser={...user,user_id:8,first_name:'Other',last_name:'Adviser',email:'other@example.test',
  adviser_section_id:4,teaching_assignments:[]};
const optionsFor=year=>({schoolYear:years.find(y=>y.school_year_id===year),schoolYears:years,
  gradeLevels:[{grade_level_id:1,grade_level_name:'G7'}],departments:[{department_id:1,department_name:'English'}],
  sections:[{section_id:3,section_name:'Cedar',grade_level_id:1,adviser_user_id:year===1?7:null},
    {section_id:4,section_name:'Birch',grade_level_id:1,adviser_user_id:year===1?8:null}],
  subjectOfferings:[{subject_offering_id:year===1?101:201,subject_id:3,subject_name:'English',subject_code:'ENG',
    section_id:3,grade_level_id:1,school_year_id:year,teacher_user_id:year===1?7:null}]});
let browser;
try{
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('user',JSON.stringify({user_id:92001,role:'system_admin',first_name:'Fixture',last_name:'Admin'})));
  const writes=[],errors=[];
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(!url.pathname.startsWith('/api/'))return url.href.startsWith(server.resolvedUrls.local[0])?route.continue():route.abort();
    const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data),headers:{
      'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'}});
    if(request.method()==='OPTIONS')return json({});
    if(request.method()!=='GET'){
      writes.push({method:request.method(),path:url.pathname,body:request.postDataJSON()});
      return json({message:'Fixture saved',user_id:7,user});
    }
    const year=Number(url.searchParams.get('school_year_id')||1);
    if(url.pathname==='/api/users/management-options')return json(optionsFor(year));
    if(url.pathname==='/api/users')return json([user,otherAdviser]);
    if(url.pathname==='/api/users/7')return json(year===1?user:{...user,display_role:'subject teacher',
      adviser_section_id:null,adviser_school_year_id:null,adviser_grade_level_id:null,teaching_assignments:[]});
    return json([]);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'system-admin/manage-users');
  const choose=async(label,option)=>{
    await page.getByRole('button',{name:new RegExp('^'+label+':')}).click();
    await page.getByRole('option',{name:option,exact:true}).click();
  };
  const addEnglish=async()=>{
    await page.getByRole('button',{name:'Add Subject Class',exact:true}).click();
    await choose('Grade Level','G7');await choose('Section','Cedar');await choose('Subject','English (ENG)');
  };

  await page.getByRole('button',{name:'Edit John Doe',exact:true}).click();
  await page.getByRole('button',{name:'School Year: 2026–2027',exact:true}).waitFor();
  await page.getByLabel(/^First Name/).fill('John Updated');
  await choose('School Year','2027–2028');
  await page.getByRole('button',{name:'School Year: 2027–2028',exact:true}).waitFor();
  assert.equal(await page.getByLabel(/^First Name/).inputValue(),'John Updated');
  await choose('Advisory Grade Level','G7');await choose('Advisory Section','Birch');
  await addEnglish();
  await page.screenshot({path:join(artifacts,'adviser-school-year.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Save Changes',exact:true}).click();
  await page.getByRole('heading',{name:'Edit User',exact:true}).waitFor({state:'hidden'});
  assert.equal(writes.length,1);assert.equal(writes[0].method,'PUT');
  assert.equal(writes[0].body.school_year_id,2);assert.equal(writes[0].body.adviser_section_id,'4');
  assert.equal(writes[0].body.teaching_assignments[0].subject_offering_id,'201');
  assert.equal(writes[0].body.first_name,'John Updated');

  await page.getByRole('button',{name:/Add.*User/}).first().click();
  await page.getByRole('button',{name:/^Role:/}).waitFor();
  await page.getByLabel(/^First Name/).fill('Fixture');
  await page.getByLabel(/^Last Name/).fill('Teacher');
  await page.getByLabel(/^Email/).fill('fixture@example.test');
  await page.getByLabel(/^Password/).fill('Fictional-Test-Password1!');
  await choose('Role','Subject Teacher');await choose('Department / Assigned Area','English');
  await choose('School Year','2027–2028');
  await page.getByRole('button',{name:'School Year: 2027–2028',exact:true}).waitFor();
  await addEnglish();
  await page.screenshot({path:join(artifacts,'teacher-school-year.png'),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Create User',exact:true}).click();
  await page.getByRole('heading',{name:'Add New User',exact:true}).waitFor({state:'hidden'});
  assert.equal(writes.length,2);assert.equal(writes[1].method,'POST');
  assert.equal(writes[1].body.school_year_id,2);assert.equal(writes[1].body.adviser_section_id,null);
  assert.equal(writes[1].body.teaching_assignments[0].subject_offering_id,'201');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({adviserYearSelection:true,teacherYearSelection:true,selectedYearSaved:true,
    accountEditsPreservedOnYearChange:true,currentYearAdviserDoesNotBlockNextYear:true,realDataWrites:0,artifacts}));
}finally{await browser?.close();await server.close();}
