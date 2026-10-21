const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const notificationRoutes = require('../routes/notificationRoutes');
const NotificationService = require('../services/NotificationService');
const db = require('../config/db');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  return app;
}

test.after(async () => {
  try {
    if (db && typeof db.end === 'function') await db.end();
    if (db && db.cloudPool && typeof db.cloudPool.end === 'function') await db.cloudPool.end();
  } catch (_) {}
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
