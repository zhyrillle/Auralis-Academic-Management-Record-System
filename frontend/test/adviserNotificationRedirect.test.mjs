import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = {
  location: { origin: 'http://localhost' },
  addEventListener: () => {},
  removeEventListener: () => {},
  atob: globalThis.atob,
  btoa: globalThis.btoa,
  console,
};

const server = await createServer({
  cacheDir: mkdtempSync(path.join(os.tmpdir(), 'auralis-notif-redirect-')),
  plugins: [{
    name: 'stub-sf9-page',
    enforce: 'pre',
    load(id) {
      if (id.replaceAll('\\', '/').endsWith('/pages/adviser/StudentSF9Page.jsx')) {
        return 'export default function StudentSF9Page() { return null; }';
      }
    },
  }],
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
});

try {
  const { resolveNotificationNavigation, resolveNotificationPath } = await server.ssrLoadModule(
    '/src/pages/adviser/AdviserNotifications.jsx'
  );
  const {
    normalizeSectionTermParam,
    findFocusedLearner,
    matchesLearnerSearch,
  } = await server.ssrLoadModule('/src/utils/sectionDetailsPresentation.js');

  const assignedClasses = [
    {
      id: 'advisory-301',
      assignmentType: 'advisory',
      assignmentId: 301,
      adviser_assignment_id: 301,
      section_id: 55,
      sectionName: 'Rizal',
      grade_level_name: 'Grade 9',
      gradeLevel: 'G9',
      subject: 'All subjects',
      isAdviser: true,
      active_term: 'T2',
    },
    {
      id: 'teaching-707',
      assignmentType: 'teaching',
      assignmentId: 707,
      teacher_assignment_id: 707,
      section_id: 55,
      subject_offering_id: 808,
      sectionName: 'Rizal',
      grade_level_name: 'Grade 9',
      gradeLevel: 'G9',
      subject: 'English',
      isAdviser: true,
      active_term: 'T2',
    },
  ];

  // 1. Structured backend notification with explicit section details action_link
  const structuredNotif = {
    id: 'atrisk-44-808-T2',
    title: 'At-Risk Student Detected',
    message: 'Juan Dela Cruz in Grade 9 – Rizal has been identified as at-risk due to a failing grade (71) in English (Term 2).',
    type: 'AT_RISK',
    section_id: 55,
    assignment_id: 707,
    assignment_type: 'teaching',
    student_id: 44,
    student_name: 'Juan Dela Cruz',
    term: 'T2',
    action_link: '/adviser/sections/details?sectionId=55&assignmentId=707&assignmentType=teaching&term=T2&studentId=44&studentName=Juan+Dela+Cruz',
  };

  const nav1 = resolveNotificationNavigation(structuredNotif, 'adviser', assignedClasses);
  const url1 = new URL(nav1.path, 'http://localhost');
  assert.equal(url1.pathname, '/adviser/sections/details');
  assert.equal(url1.searchParams.get('sectionId'), '55');
  assert.equal(url1.searchParams.get('assignmentId'), '707');
  assert.equal(url1.searchParams.get('assignmentType'), 'teaching');
  assert.equal(url1.searchParams.get('term'), 'T2');
  assert.equal(url1.searchParams.get('studentId'), '44');
  assert.equal(url1.searchParams.get('studentName'), 'Juan Dela Cruz');
  assert.equal(nav1.state.term, 'T2');
  assert.equal(nav1.state.studentId, 44);
  assert.equal(nav1.state.studentName, 'Juan Dela Cruz');

  // Teacher role uses /teacher/sections/details
  const teacherPath = resolveNotificationPath(structuredNotif, 'teacher', assignedClasses);
  assert.ok(teacherPath.startsWith('/teacher/sections/details?'));

  // 2. Legacy DB notification with old action_link='/adviser/performance' and only message text
  const legacyEnglishNotif = {
    id: 12,
    title: 'At-Risk Student Detected',
    message: 'Juan Dela Cruz in Grade 9 – Rizal has been identified as at-risk due to a failing grade (71) in English (Term 3).',
    type: 'AT_RISK',
    action_link: '/adviser/performance',
  };
  const nav2 = resolveNotificationNavigation(legacyEnglishNotif, 'adviser', assignedClasses);
  const url2 = new URL(nav2.path, 'http://localhost');
  assert.equal(url2.pathname, '/adviser/sections/details');
  assert.equal(url2.searchParams.get('sectionId'), '55');
  assert.equal(url2.searchParams.get('assignmentId'), '707');
  assert.equal(url2.searchParams.get('assignmentType'), 'teaching');
  assert.equal(url2.searchParams.get('term'), 'T3');
  assert.equal(url2.searchParams.get('studentName'), 'Juan Dela Cruz');

  // 3. Legacy message for a subject the adviser does not teach -> resolves to advisory assignment
  const legacyMathNotif = {
    id: 13,
    title: 'At-Risk Student Detected',
    message: 'Maria Santos in Grade 9 – Rizal has been identified as at-risk due to a failing grade (73) in Mathematics (Quarter 2).',
    type: 'AT_RISK',
    action_link: '/adviser/performance',
  };
  const nav3 = resolveNotificationNavigation(legacyMathNotif, 'adviser', assignedClasses);
  const url3 = new URL(nav3.path, 'http://localhost');
  assert.equal(url3.pathname, '/adviser/sections/details');
  assert.equal(url3.searchParams.get('sectionId'), '55');
  assert.equal(url3.searchParams.get('assignmentId'), '301');
  assert.equal(url3.searchParams.get('assignmentType'), 'advisory');
  assert.equal(url3.searchParams.get('term'), 'T2');
  assert.equal(url3.searchParams.get('studentName'), 'Maria Santos');

  // 4. Demo at-risk notification without matching classes -> falls back safely to /adviser/sections
  const demoNotif = {
    id: 'adv-demo-2',
    title: 'At-Risk Student Detected',
    message: 'A learner in Grade 9 – Rizal has been identified as Moderate Risk due to declining grades and attendance.',
    type: 'AT_RISK',
    action_link: '/adviser/performance',
  };
  assert.equal(resolveNotificationPath(demoNotif, 'adviser', []), '/adviser/sections');

  // 5. Non-at-risk notifications remain unchanged
  assert.equal(
    resolveNotificationPath({ title: 'Grade Submission Completed', type: 'SUMMARY', action_link: '/adviser/master-sheet' }, 'adviser', assignedClasses),
    '/adviser/master-sheet'
  );

  // 6. SectionDetails helpers: term parsing & learner matching ("First Last" <-> "Last, First")
  assert.equal(normalizeSectionTermParam('T2'), 'T2');
  assert.equal(normalizeSectionTermParam('Term 3'), 'T3');
  assert.equal(normalizeSectionTermParam('Quarter 1'), 'T1');
  assert.equal(normalizeSectionTermParam('2nd Term'), 'T2');
  assert.equal(normalizeSectionTermParam('invalid'), null);

  const learners = [
    { studentId: 44, studentSectionId: 944, name: 'Dela Cruz, Juan M.' },
    { studentId: 45, studentSectionId: 945, name: 'Santos, Maria Clara' },
  ];
  assert.equal(findFocusedLearner(learners, 44, '')?.name, 'Dela Cruz, Juan M.');
  assert.equal(findFocusedLearner(learners, null, 'Juan Dela Cruz')?.studentId, 44);
  assert.equal(findFocusedLearner(learners, null, 'Maria Santos')?.studentId, 45);
  assert.equal(matchesLearnerSearch('Dela Cruz, Juan M.', 'Juan Dela Cruz'), true);
  assert.equal(matchesLearnerSearch('Dela Cruz, Juan M.', 'Dela Cruz'), true);
  assert.equal(matchesLearnerSearch('Dela Cruz, Juan M.', 'Maria'), false);

  console.log('PASS adviserNotificationRedirect.test.mjs');
} finally {
  await server.close();
}
