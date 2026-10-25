const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Module = require('node:module');

test('NotificationService.notifyAtRisk inserts AT_RISK notification for department heads with connection support', async () => {
  const inserts = [];
  const cx = {
    async execute(sql, params) {
      if (sql.includes('DEPARTMENT_HEAD') || sql.includes('SUBJECT_OFFERING')) {
        return [[{ user_id: 101, department_id: 5 }]];
      }
      return [[]];
    },
  };
  const Notification = {
    NOTIFICATION_TYPES: { AT_RISK: 'AT_RISK' },
    async create(record, connection) {
      assert.equal(connection, cx);
      inserts.push(record);
      return inserts.length;
    },
  };

  const originalLoad = Module._load;
  let Service;
  try {
    Module._load = function (request, parent, isMain) {
      if (request === '../config/db') return cx;
      if (request === '../models/Notification') return Notification;
      return originalLoad.call(this, request, parent, isMain);
    };
    // Clear cache if present
    delete require.cache[require.resolve('../services/NotificationService')];
    Service = require('../services/NotificationService');
  } finally {
    Module._load = originalLoad;
  }

  const ids = await Service.notifyAtRisk({
    subjectOfferingId: 50,
    subjectName: 'Science 9',
    sectionName: 'Grade 9 - Einstein',
    atRiskCount: 3,
    departmentId: 5,
    actionLink: '/department-head/dashboard',
    connection: cx,
  });

  assert.equal(ids.length, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].user_id, 101);
  assert.equal(inserts[0].type, 'AT_RISK');
  assert.match(inserts[0].title, /At-Risk Alert/);
  assert.match(inserts[0].message, /3 students in Grade 9 - Einstein have been flagged with high risk in Science 9/);
  assert.equal(inserts[0].action_link, '/department-head/dashboard');
});

test('GET /api/notifications/department-head synthesizes at-risk alerts from STUDENT_GRADE when DB is empty', async (t) => {
  const originalLoad = Module._load;
  const mockDb = {
    async execute(sql, params) {
      // 1. Initial user / department check
      if (sql.includes('FROM USER u WHERE u.user_id = ?')) {
        return [[{ user_id: 101, department_id: 5, department_name: 'Science' }]];
      }
      // 2. Main notification query: return empty to trigger synthesizer
      if (sql.includes('FROM NOTIFICATION n')) {
        return [[]];
      }
      // 3. Synthesize submissions: empty
      if (sql.includes('FROM GRADE_SHEET gs')) {
        return [[]];
      }
      // 4. Synthesize reopen requests: empty
      if (sql.includes('FROM GRADE_REOPEN_REQUEST grr')) {
        return [[]];
      }
      // 5. Synthesize at-risk students: return 1 at-risk section
      if (sql.includes('FROM STUDENT_GRADE sg')) {
        return [[{
          subject_offering_id: 202,
          subject_name: 'Biology',
          section_name: 'Newton',
          grade_level: '10',
          at_risk_count: 4,
          latest_recorded_at: new Date().toISOString(),
        }]];
      }
      return [[]];
    },
  };

  let notificationRoutes;
  try {
    Module._load = function (request, parent, isMain) {
      if (request === '../config/db') return mockDb;
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[require.resolve('../routes/notificationRoutes')];
    notificationRoutes = require('../routes/notificationRoutes');
  } finally {
    Module._load = originalLoad;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);

  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/notifications/department-head`, {
    headers: { 'x-auralis-user-id': '101' },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.notifications);

  const all = [...data.notifications.today, ...data.notifications.yesterday];
  const atRiskNotif = all.find(n => n.type === 'AT_RISK');
  assert.ok(atRiskNotif, 'Feed must contain a synthesized AT_RISK notification');
  assert.match(atRiskNotif.title, /At-Risk Alert — Biology/);
  assert.match(atRiskNotif.message, /4 students in Grade 10 – Newton have been flagged with high risk/);
  assert.equal(atRiskNotif.unread, true);
  assert.equal(atRiskNotif.action_link, '/department-head/dashboard');
});
