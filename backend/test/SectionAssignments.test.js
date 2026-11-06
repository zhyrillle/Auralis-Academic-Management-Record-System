const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('advisory and subject cards keep distinct identities, subjects and school-year boundaries', async () => {
  const base = { section_id: 18, school_year_id: 3, section_name: 'Carrots', grade_level_name: 'Grade 8', is_specialized: 0 };
  const teaching = [
    { ...base, teacher_assignment_id: 41, subject_id: 1, subject_offering_id: 81, subject_name: 'English' },
    { ...base, teacher_assignment_id: 42, subject_id: 2, subject_offering_id: 82, subject_name: 'Science' },
    { ...base, school_year_id: 4, teacher_assignment_id: 43, subject_id: 1, subject_offering_id: 83, subject_name: 'English' },
  ];
  const database = { execute: async sql => {
    if (sql.includes('FROM SECTION_ADVISER_ASSIGNMENT')) return [[{ ...base, adviser_assignment_id: 9 }]];
    if (sql.includes('FROM TEACHER_ASSIGNMENT')) return [teaching];
    if (sql.includes('FROM ACADEMIC_TERM')) return [[]];
    throw new Error('Unexpected query');
  } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../models/Section.js'), 'utf8'), {
    module, console, require: name => name === '../config/db' ? database : {},
  });
  const cards = await module.exports.findAdviserSections(3);
  assert.equal(cards.length, 4);
  const advisory = cards.find(card => card.assignmentType === 'advisory');
  assert.equal(advisory.assignmentId, 9); assert.equal(advisory.subject, 'All subjects');
  assert.equal(advisory.subject_offering_id, null); assert.equal(advisory.subject_id, null);
  for (const [index, row] of teaching.entries()) {
    const card = cards.find(item => item.assignmentType === 'teaching' && item.assignmentId === row.teacher_assignment_id);
    assert.equal(card.subject, row.subject_name); assert.equal(card.subject_offering_id, row.subject_offering_id);
    assert.equal(card.isAdviser, index < 2);
    assert.equal(card.classType, index < 2 ? 'Advisory Class' : 'Regular Class');
  }
  assert.equal(new Set(cards.map(card => card.id)).size, 4);
});
