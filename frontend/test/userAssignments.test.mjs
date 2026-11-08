import test from 'node:test';
import assert from 'node:assert/strict';
import {adviserIsInYear,assignmentFieldsForYear,schoolYearLabel} from '../src/utils/userAssignments.js';

const options={schoolYear:{school_year_id:2},sections:[{section_id:3,grade_level_id:1}],
  subjectOfferings:[{subject_offering_id:201,school_year_id:2,section_id:3,grade_level_id:1}]};

test('a school-year switch loads only that year’s teaching assignments',()=>{
  const fields=assignmentFieldsForYear({teaching_assignments:[
    {school_year_id:1,subject_offering_id:101,section_id:3,grade_level_id:1},
    {school_year_id:2,subject_offering_id:201},
  ]},options);
  assert.equal(fields.school_year_id,'2');
  assert.deepEqual(fields.teaching_assignments,[{grade_level_id:'1',section_id:'3',subject_offering_id:'201'}]);
});

test('an adviser in the current year does not hide a free section in the next year',()=>{
  const currentAdviser={adviser_school_year_id:1,adviser_section_id:3,adviser_grade_level_id:1};
  assert.equal(adviserIsInYear(currentAdviser,2),false);
  assert.equal(assignmentFieldsForYear(currentAdviser,options).adviser_section_id,'');
  assert.equal(adviserIsInYear({...currentAdviser,adviser_school_year_id:2},2),true);
});

test('a new account starts with the selected school year and empty class assignments',()=>{
  assert.deepEqual(assignmentFieldsForYear(null,options),{
    school_year_id:'2',adviser_section_id:'',adviser_grade_level_id:'',teaching_assignments:[],
  });
});

test('missing grade-level details are resolved from the selected year’s options',()=>{
  const fields=assignmentFieldsForYear({adviser_school_year_id:2,adviser_section_id:3,teaching_assignments:[{subject_offering_id:201}]},options);
  assert.equal(fields.adviser_grade_level_id,'1');
  assert.equal(fields.teaching_assignments[0].grade_level_id,'1');
});

test('school-year labels handle both year numbers and date values',()=>{
  assert.equal(schoolYearLabel({starts_on:2026,ends_on:2027}),'2026–2027');
  assert.equal(schoolYearLabel({starts_on:'2027-06-01',ends_on:'2028-04-30'}),'2027–2028');
});
