import test from 'node:test';
import assert from 'node:assert/strict';
import { canAddToSection, formatSectionGrade, sectionCapacity, sectionProgram } from '../src/utils/studentSections.js';

test('section grade labels support database IDs and display labels', () => {
  assert.equal(formatSectionGrade('G8', 2), 'Grade 8');
  assert.equal(formatSectionGrade('Grade 10'), 'Grade 10');
  assert.equal(formatSectionGrade(null), 'Unassigned');
});
test('capacity guide uses 40–45 as target without exceeding the progress bar', () => {
  assert.equal(sectionCapacity(39).tone, 'available');
  assert.equal(sectionCapacity(40).tone, 'target');
  assert.equal(sectionCapacity(45).percent, 100);
  assert.equal(sectionCapacity(46).tone, 'over');
  assert.equal(sectionCapacity(70).percent, 100);
});
test('regular sections only offer unassigned learners from a compatible grade and program', () => {
  const section = { grade_level_id: 2, is_specialized: 0 };
  assert(canAddToSection({ grade_level_id: 2, program_id: 4 }, section));
  assert(!canAddToSection({ grade_level_id: 1, program_id: 4 }, section));
  assert(!canAddToSection({ grade_level_id: 2, program_id: 1 }, section));
  assert(!canAddToSection({ section_id: 1, grade_level_id: 2 }, section));
});
test('specialized sections preserve the existing non-conflicting program eligibility rules', () => {
  const section = { grade_level_id: 1, is_specialized: '1', program_id: 1 };
  assert.equal(sectionProgram(section).code, 'STE');
  assert(canAddToSection({ grade_level_id: 1, program_id: 1 }, section));
  assert(canAddToSection({ grade_level_id: 1, program_id: 4 }, section));
  assert(!canAddToSection({ grade_level_id: 1, program_id: 2 }, section));
});
