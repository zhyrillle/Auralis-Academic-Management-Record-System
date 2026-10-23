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
