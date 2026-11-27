const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');
const calls = [];
const fixture = {
  notification_id: 91000, user_id: 999999, title: 'Fixture grade submission',
  message: 'Synthetic notification for isolated testing.', type: 'SUBMISSION', is_read: 0,
  created_at: new Date().toISOString(), action_link: '/adviser/master-sheet',
};
const database = { async execute(sql) {
  calls.push(sql);
  assert.match(sql, /^\s*SELECT\b/i, 'Notification feed tests must never write records.');
  if (sql.includes('FROM NOTIFICATION')) return [[fixture]];
  if (/FROM (SECTION_ADVISER_ASSIGNMENT|TEACHER_ASSIGNMENT|ACADEMIC_TERM)/.test(sql)) return [[]];
  throw new Error('Unexpected notification query in test.');
} };
const originalLoad = Module._load;
let notificationRoutes, NotificationService;
try {
  Module._load = function (request, parent, isMain) {
    if (request === '../config/db') return database;
    return originalLoad.call(this, request, parent, isMain);
  };
  notificationRoutes = require('../routes/notificationRoutes');
  NotificationService = require('../services/NotificationService');
} finally {
  Module._load = originalLoad;
}

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  return app;
}

test.after(() => {
  assert(calls.length > 0);
  assert(calls.every(sql => /^\s*SELECT\b/i.test(sql)), 'No write may be hidden by route error handling.');
});

test('GET /api/notifications/adviser returns structured notification feed', async (t) => {
  const app = createTestApp();
  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/notifications/adviser`, {
    headers: { 'x-auralis-user-id': '999999' },
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.notifications, 'Response should contain notifications object');
  assert.ok(Array.isArray(data.notifications.today), 'notifications.today should be an array');
  assert.ok(Array.isArray(data.notifications.yesterday), 'notifications.yesterday should be an array');
  assert.ok(typeof data.unreadCount === 'number', 'unreadCount should be a number');
  assert.ok(typeof data.totalCount === 'number', 'totalCount should be a number');

  // Verify notification structure
  const allNotifications = [...data.notifications.today, ...data.notifications.yesterday];
  assert.ok(allNotifications.length > 0, 'Should have at least 1 notification returned');
  assert.ok(allNotifications.some(n => n.id === fixture.notification_id), 'The feed must include the substituted database record.');
  for (const n of allNotifications) {
    assert.ok(n.id, 'Notification must have an id');
    assert.ok(n.title, 'Notification must have a title');
    assert.ok(n.message, 'Notification must have a message');
    assert.ok(typeof n.unread === 'boolean', 'Notification must have boolean unread property');
    assert.ok(n.timestamp, 'Notification must have timestamp');
    assert.ok(n.action_link !== undefined, 'Notification should include action_link field');
  }
});

test('GET /api/notifications/adviser works without user header (fallback broadcast)', async (t) => {
  const app = createTestApp();
  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/notifications/adviser`);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.notifications);
});

test('NotificationService exposes expected notification types including SUBMISSION and SUMMARY', () => {
  assert.equal(NotificationService.TYPES.SUBMISSION, 'SUBMISSION');
  assert.equal(NotificationService.TYPES.AT_RISK, 'AT_RISK');
  assert.equal(NotificationService.TYPES.DEADLINE, 'DEADLINE');
  assert.equal(NotificationService.TYPES.SUMMARY, 'SUMMARY');
});

test('GET /api/notifications/adviser links At-Risk Student Detected to corresponding section details with student, section, and term', async (t) => {
  let advisoryOnly = false;
  const scopedDb = {
    async execute(sql) {
      assert.match(sql, /^\s*SELECT\b/i, 'Notification feed tests must never write records.');
      if (sql.includes('FROM SECTION_ADVISER_ASSIGNMENT')) {
        return [[{
          adviser_assignment_id: 301,
          section_id: 55,
          section_name: 'Rizal',
          grade_level_name: 'Grade 9',
          grade_level_id: 9,
          school_year_id: 2026,
        }]];
      }
      if (sql.includes('FROM TEACHER_ASSIGNMENT')) {
        if (advisoryOnly) return [[]];
        return [[{
          teacher_assignment_id: 707,
          subject_offering_id: 808,
          section_id: 55,
          school_year_id: 2026,
          section_name: 'Rizal',
          grade_level_name: 'Grade 9',
          subject_name: 'English',
        }]];
      }
      if (sql.includes('FROM NOTIFICATION')) return [[]];
      if (sql.includes('FROM ACADEMIC_TERM')) {
        return [[{ term_id: 2, term_name: '2nd Term', ends_at: null }]];
      }
      if (sql.includes('FROM STUDENT_GRADE sg')) {
        return [[{
          student_id: 44,
          student_section_id: 944,
          student_name: 'Juan Dela Cruz',
          subject_offering_id: 808,
          subject_name: 'English',
          term: 'T2',
          quarterly_grade: 71,
          updated_at: new Date().toISOString(),
          student_grade_id: 1,
        }]];
      }
      if (sql.includes('FROM GRADE_SHEET') || sql.includes('FROM SUBJECT_OFFERING') || sql.includes('FROM GRADE_REOPEN_REQUEST')) {
        return [[]];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  let scopedRoutes;
  const prevLoad = Module._load;
  delete require.cache[require.resolve('../routes/notificationRoutes')];
  try {
    Module._load = function (request, parent, isMain) {
      if (request === '../config/db') return scopedDb;
      return prevLoad.call(this, request, parent, isMain);
    };
    scopedRoutes = require('../routes/notificationRoutes');
  } finally {
    Module._load = prevLoad;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/notifications', scopedRoutes);
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();

  // Case 1: Adviser who also teaches the failing subject -> teaching section details
  const resTeaching = await fetch(`http://127.0.0.1:${port}/api/notifications/adviser`, {
    headers: { 'x-auralis-user-id': '42' },
  });
  assert.equal(resTeaching.status, 200);
  const dataTeaching = await resTeaching.json();
  const teachingNotif = [...dataTeaching.notifications.today, ...dataTeaching.notifications.yesterday]
    .find((n) => n.title === 'At-Risk Student Detected');
  assert.ok(teachingNotif, 'Expected synthesized At-Risk Student Detected notification');
  assert.equal(teachingNotif.section_id, 55);
  assert.equal(teachingNotif.assignment_id, 707);
  assert.equal(teachingNotif.assignment_type, 'teaching');
  assert.equal(teachingNotif.student_id, 44);
  assert.equal(teachingNotif.student_name, 'Juan Dela Cruz');
  assert.equal(teachingNotif.term, 'T2');
  assert.match(teachingNotif.message, /Term 2/);
  const teachUrl = new URL(teachingNotif.action_link, 'http://localhost');
  assert.equal(teachUrl.pathname, '/adviser/sections/details');
  assert.equal(teachUrl.searchParams.get('sectionId'), '55');
  assert.equal(teachUrl.searchParams.get('assignmentId'), '707');
  assert.equal(teachUrl.searchParams.get('assignmentType'), 'teaching');
  assert.equal(teachUrl.searchParams.get('term'), 'T2');
  assert.equal(teachUrl.searchParams.get('studentId'), '44');
  assert.equal(teachUrl.searchParams.get('studentName'), 'Juan Dela Cruz');

  // Case 2: Adviser who does not teach the failing subject -> advisory section details
  advisoryOnly = true;
  const resAdvisory = await fetch(`http://127.0.0.1:${port}/api/notifications/adviser`, {
    headers: { 'x-auralis-user-id': '42' },
  });
  assert.equal(resAdvisory.status, 200);
  const dataAdvisory = await resAdvisory.json();
  const advisoryNotif = [...dataAdvisory.notifications.today, ...dataAdvisory.notifications.yesterday]
    .find((n) => n.title === 'At-Risk Student Detected');
  assert.ok(advisoryNotif, 'Expected synthesized At-Risk Student Detected notification for advisory-only user');
  assert.equal(advisoryNotif.assignment_id, 301);
  assert.equal(advisoryNotif.assignment_type, 'advisory');
  const advUrl = new URL(advisoryNotif.action_link, 'http://localhost');
  assert.equal(advUrl.pathname, '/adviser/sections/details');
  assert.equal(advUrl.searchParams.get('sectionId'), '55');
  assert.equal(advUrl.searchParams.get('assignmentId'), '301');
  assert.equal(advUrl.searchParams.get('assignmentType'), 'advisory');
  assert.equal(advUrl.searchParams.get('term'), 'T2');
  assert.equal(advUrl.searchParams.get('studentId'), '44');
});
