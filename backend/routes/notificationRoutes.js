/**
 * notificationRoutes.js
 *
 * REST API + Server-Sent Events (SSE) for the Auralis Notification System.
 *
 * Mounted at: /api/notifications  (see server.js)
 *
 * Endpoints:
 *   GET    /api/notifications                  – paginated list for logged-in user
 *   GET    /api/notifications/department-head  – dept-head specific feed (legacy + new)
 *   GET    /api/notifications/unread-count     – lightweight badge counter
 *   GET    /api/notifications/stream           – Server-Sent Events stream (real-time)
 *   PATCH  /api/notifications/:id/read         – mark single notification read
 *   PATCH  /api/notifications/read-all         – mark all as read for current user
 *   POST   /api/notifications                  – create a notification (admin / testing)
 *   DELETE /api/notifications/:id              – soft-delete a notification
 *
 * Authentication:
 *   All endpoints read the user id from the X-Auralis-User-Id request header
 *   (same convention used everywhere else in this codebase).
 *   No JWT is required yet – that header is the temporary auth boundary.
 */

const express             = require('express');
const router              = express.Router();
const db                  = require('../config/db');
const Notification        = require('../models/Notification');
const NotificationService = require('../services/NotificationService');

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a Date (or ISO string) into a human-readable relative label.
 * e.g. "Just now", "5 mins", "2 hours", "Yesterday", "Oct 3"
 */
function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Recently';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Recently';
  const now      = new Date();
  const diffMs   = Math.max(0, now.getTime() - d.getTime());
  const diffSec  = Math.floor(diffMs / 1000);
  const diffMin  = Math.floor(diffSec / 60);
  const diffHrs  = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60)  return 'Just now';
  if (diffMin < 60)  return `${diffMin} min${diffMin > 1 ? 's' : ''}`;
  if (diffHrs < 24 && d.toDateString() === now.toDateString())
                     return `${diffHrs} hour${diffHrs > 1 ? 's' : ''}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** True if the notification was created today (for grouping). */
function isCreatedToday(dateInput) {
  if (!dateInput) return true;
  const d = new Date(dateInput);
  return isNaN(d.getTime()) || d.toDateString() === new Date().toDateString();
}

/**
 * Shapes a raw DB row into the response format the frontend expects.
 */
function formatNotification(n) {
  return {
    id:                  n.notification_id,
    title:               n.title,
    message:             n.message,
    timestamp:           formatRelativeTime(n.created_at),
    created_at:          n.created_at,
    unread:              !n.is_read || n.is_read === 0,
    type:                n.type  || 'general',
    related_entity_type: n.related_entity_type || null,
    related_entity_id:   n.related_entity_id   || null,
  };
}

/** Extract user id from request headers (matches existing codebase convention). */
function getUserId(req) {
  const raw = req.headers['x-auralis-user-id'] || req.query.user_id || null;
  const id  = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications
// Primary paginated endpoint – used by the notification dropdown and list view.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'X-Auralis-User-Id header is required.' });
    }

    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));

    const { rows, total, unreadCount } = await Notification.findByUserId(userId, { page, limit });

    const formatted = rows.map(formatNotification);
    const today     = formatted.filter(n => isCreatedToday(n.created_at));
    const older     = formatted.filter(n => !isCreatedToday(n.created_at));

    res.json({
      success: true,
      unreadCount,
      totalCount: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      notifications: { today, older },
      all: formatted,
    });
  } catch (err) {
    console.error('[GET /api/notifications]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/department-head
// Department-Head-specific feed:
//   • Real DB notifications addressed to this user
//   • Live fallback aggregations (grade submissions, reopen requests) when DB is empty
//   • Static demo seed when nothing exists at all (onboarding / testing)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/department-head', async (req, res) => {
  try {
    const userId = getUserId(req);

    // Resolve the Department Head's department (department_id and department_name)
    let userDeptId = null;
    let userDeptName = 'Department';
    if (userId) {
      try {
        const [deptRows] = await db.execute(
          `SELECT u.department_id AS user_dept_id, dh.department_id AS dh_dept_id, d.department_name
           FROM USER u
           LEFT JOIN DEPARTMENT_HEAD dh ON dh.user_id = u.user_id
           LEFT JOIN DEPARTMENT d ON d.department_id = COALESCE(u.department_id, dh.department_id)
           WHERE u.user_id = ?
           LIMIT 1`,
          [userId]
        );
        if (deptRows.length) {
          userDeptId = deptRows[0].user_dept_id || deptRows[0].dh_dept_id || null;
          userDeptName = deptRows[0].department_name || 'Department';
        }
      } catch (dErr) {
        console.warn('[dept-head] Failed to resolve department for user:', dErr.message);
      }
    }

    // ── 1. Fetch from NOTIFICATION table (scoped to this dept head's department) ──
    let dbNotifs = [];
    try {
      if (userId) {
        const [rows] = await db.execute(
          `SELECT n.* FROM NOTIFICATION n
           LEFT JOIN GRADE_SHEET gs
             ON n.related_entity_type = 'GRADE_SHEET' AND n.related_entity_id = gs.grade_sheet_id
           LEFT JOIN SUBJECT_OFFERING so1
             ON gs.subject_offering_id = so1.subject_offering_id
           LEFT JOIN SUBJECT s1
             ON so1.subject_id = s1.subject_id
           LEFT JOIN GRADE_REOPEN_REQUEST grr
             ON n.related_entity_type = 'GRADE_REOPEN_REQUEST' AND n.related_entity_id = grr.request_id
           LEFT JOIN TEACHER_ASSIGNMENT ta2
             ON grr.teacher_assignment_id = ta2.teacher_assignment_id
           LEFT JOIN SUBJECT_OFFERING so2
             ON ta2.subject_offering_id = so2.subject_offering_id
           LEFT JOIN SUBJECT s2
             ON so2.subject_id = s2.subject_id
           WHERE (n.user_id = ? OR n.user_id IS NULL)
             AND (
               ? IS NULL
               OR (s1.department_id IS NULL AND s2.department_id IS NULL)
               OR s1.department_id = ?
               OR s2.department_id = ?
             )
           ORDER BY n.created_at DESC, n.notification_id DESC
           LIMIT 50`,
          [userId, userDeptId, userDeptId, userDeptId]
        );
        dbNotifs = rows;
      } else {
        // If no specific userId in header, fetch notifications addressed to dept heads or broadcast
        const [rows] = await db.execute(`
          SELECT n.* FROM NOTIFICATION n
          LEFT JOIN USER u ON n.user_id = u.user_id
          WHERE (n.user_id IS NULL OR LOWER(TRIM(u.role)) IN ('department_head', 'dept_head', 'department head'))
          ORDER BY n.created_at DESC, n.notification_id DESC
          LIMIT 50
        `);
        dbNotifs = rows;
      }
    } catch (e) {
      console.warn('[notifications/department-head] DB read error:', e.message);
    }

    // ── 2. Synthesized notifications when DB has nothing (scoped to department) ─
    const synthesized = [];
    if (dbNotifs.length === 0) {

      // 2a. Submitted grade sheets for this department
      try {
        const [sheets] = await db.execute(`
          SELECT
            gs.grade_sheet_id,
            gs.submitted_at,
            gs.updated_at,
            sub.subject_name,
            sec.section_name,
            gl.grade_level_name AS grade_level,
            COALESCE(
              CONCAT(u.first_name, ' ', u.last_name),
              CONCAT(adv_u.first_name, ' ', adv_u.last_name),
              'Adviser'
            ) AS teacher_name,
            CASE WHEN adv_u.user_id IS NOT NULL AND u.user_id IS NULL THEN ' (Adviser)' ELSE '' END AS role_label,
            atm.term_name
          FROM GRADE_SHEET gs
          JOIN SUBJECT_OFFERING so   ON gs.subject_offering_id = so.subject_offering_id
          JOIN SUBJECT sub           ON so.subject_id = sub.subject_id
          JOIN SECTION sec           ON so.section_id = sec.section_id
          JOIN GRADE_LEVEL gl        ON sec.grade_level_id = gl.grade_level_id
          LEFT JOIN TEACHER_ASSIGNMENT ta ON ta.subject_offering_id = so.subject_offering_id
          LEFT JOIN USER u           ON ta.user_id = u.user_id
          LEFT JOIN SECTION_ADVISER_ASSIGNMENT saa ON saa.section_id = sec.section_id
          LEFT JOIN USER adv_u       ON saa.user_id = adv_u.user_id
          LEFT JOIN ACADEMIC_TERM atm ON gs.term_id = atm.term_id
          WHERE gs.workflow_status = 'SUBMITTED'
            AND (? IS NULL OR sub.department_id = ?)
          ORDER BY COALESCE(gs.submitted_at, gs.updated_at) DESC
          LIMIT 5
        `, [userDeptId, userDeptId]);

        for (const s of sheets) {
          synthesized.push({
            id:         `sub-${s.grade_sheet_id}`,
            title:      `Grade Submission Received — ${s.subject_name}`,
            message:    `${s.teacher_name}${s.role_label || ''} submitted ${s.term_name || 'Quarter grades'} ` +
                        `for Grade ${s.grade_level} – ${s.section_name} (${s.subject_name}).`,
            timestamp:  formatRelativeTime(s.submitted_at || s.updated_at),
            created_at: s.submitted_at || s.updated_at || new Date().toISOString(),
            unread:     true,
            type:       'SUBMISSION',
            action_link: `/class-record/${s.grade_sheet_id}`,
          });
        }
      } catch (err) {
        console.warn('[dept-head] synthesize submissions error:', err.message);
      }

      // 2b. Pending grade reopen requests for this department
      try {
        const [requests] = await db.execute(`
          SELECT
            grr.request_id,
            grr.reason,
            grr.status,
            grr.requested_at,
            sub.subject_name,
            sec.section_name,
            gl.grade_level_name AS grade_level,
            CONCAT(u.first_name, ' ', u.last_name) AS teacher_name
          FROM GRADE_REOPEN_REQUEST grr
          JOIN TEACHER_ASSIGNMENT ta ON grr.teacher_assignment_id = ta.teacher_assignment_id
          JOIN SUBJECT_OFFERING so   ON ta.subject_offering_id = so.subject_offering_id
          JOIN SUBJECT sub           ON so.subject_id = sub.subject_id
          JOIN SECTION sec           ON so.section_id = sec.section_id
          JOIN GRADE_LEVEL gl        ON sec.grade_level_id = gl.grade_level_id
          JOIN USER u                ON ta.user_id = u.user_id
          WHERE (? IS NULL OR sub.department_id = ?)
          ORDER BY grr.requested_at DESC
          LIMIT 3
        `, [userDeptId, userDeptId]);

        for (const r of requests) {
          synthesized.push({
            id:         `reopen-${r.request_id}`,
            title:      `Grade Reopening Request — ${r.subject_name}`,
            message:    `${r.teacher_name || 'Teacher'} requested reopening for ` +
                        `Grade ${r.grade_level} – ${r.section_name} (${r.subject_name}): "${r.reason || 'Correction needed'}".`,
            timestamp:  formatRelativeTime(r.requested_at),
            created_at: r.requested_at || new Date().toISOString(),
            unread:     r.status === 'PENDING',
            type:       'REQUEST',
            action_link: `/reopen-requests/${r.request_id}`,
          });
        }
      } catch (err) {
        console.warn('[dept-head] synthesize reopen requests error:', err.message);
      }

      // 2c. Static demo seed tailored to this Department Head's department
      if (synthesized.length === 0) {
        const now       = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        synthesized.push(
          {
            id: 'demo-1', type: 'SUBMISSION',
            title: `Grade Submission Received — ${userDeptName}`,
            message: `Mr. Juan Dela Cruz submitted Quarter 2 final grades for Grade 9 – Rizal (${userDeptName}).`,
            timestamp: '5 mins', unread: true,
            created_at: new Date(now.getTime() - 5 * 60000).toISOString(),
            action_link: null,
          },
          {
            id: 'demo-2', type: 'AT_RISK',
            title: `At-Risk Alert — ${userDeptName} Department`,
            message: `4 students in Grade 9 – Einstein have been flagged with high risk in ${userDeptName} based on quarterly assessments.`,
            timestamp: '30 mins', unread: true,
            created_at: new Date(now.getTime() - 30 * 60000).toISOString(),
            action_link: null,
          },
          {
            id: 'demo-3', type: 'DEADLINE',
            title: 'Grade Submission Deadline Reminder',
            message: `Quarter 2 grade submission window closes in 3 days. Subject teachers in your department have pending records.`,
            timestamp: '2 hours', unread: true,
            created_at: new Date(now.getTime() - 120 * 60000).toISOString(),
            action_link: '/grade-submission',
          },
          {
            id: 'demo-4', type: 'REQUEST',
            title: 'Grade Reopening Request Endorsed',
            message: `Grade reopening request for Grade 8 – Mabini (${userDeptName}) has been approved and unlocked for 48 hours.`,
            timestamp: 'Yesterday', unread: false,
            created_at: yesterday.toISOString(),
            action_link: null,
          },
          {
            id: 'demo-5', type: 'SUMMARY',
            title: 'Department Performance Summary Ready',
            message: `Consolidated pass rates and subject master sheets for ${userDeptName} (Quarter 1) have been finalized and archived.`,
            timestamp: 'Yesterday', unread: false,
            created_at: yesterday.toISOString(),
            action_link: '/master-sheets',
          }
        );
      }
    }

    // ── 3. Merge & group ────────────────────────────────────────────────────
    const formattedDb = dbNotifs.map(formatNotification);
    const all         = [...formattedDb, ...synthesized];

    const today     = [];
    const yesterday = [];
    for (const item of all) {
      isCreatedToday(item.created_at) ? today.push(item) : yesterday.push(item);
    }

    res.json({
      success:     true,
      unreadCount: all.filter(n => n.unread).length,
      totalCount:  all.length,
      notifications: { today, yesterday },
      all,
    });
  } catch (err) {
    console.error('[GET /api/notifications/department-head]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/unread-count
// Lightweight endpoint used to update the badge number in the nav bar.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/unread-count', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.json({ unreadCount: 0 });

    const [[{ unreadCount }]] = await db.execute(
      `SELECT COUNT(*) AS unreadCount FROM NOTIFICATION
       WHERE is_read = 0
         AND (user_id = ? OR user_id IS NULL)`,
      [userId]
    );
    res.json({ success: true, unreadCount });
  } catch (err) {
    console.error('[GET /api/notifications/unread-count]', err.message);
    res.json({ unreadCount: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/stream
// Server-Sent Events endpoint for real-time push notifications.
//
// The frontend connects once and keeps the stream open.  The server emits
// an event whenever NotificationService._persist() fires on the emitter.
//
// Connection URL example:
//   const es = new EventSource('/api/notifications/stream?user_id=42');
//   es.onmessage = (e) => { const notif = JSON.parse(e.data); ... }
//
// Heartbeat: sent every 30 s to keep the connection alive through proxies.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stream', (req, res) => {
  const userId = getUserId(req);

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
  res.flushHeaders();

  // Send a connected confirmation event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, connected: true })}\n\n`);

  /**
   * Emit helper – writes one SSE message frame.
   * @param {object} payload
   */
  function send(payload) {
    try {
      res.write(`data: ${JSON.stringify(formatNotification(payload))}\n\n`);
    } catch (_) { /* connection already closed */ }
  }

  // Subscribe to user-specific and broadcast events
  const userChannel      = `notification:${userId}`;
  const broadcastChannel = 'notification:broadcast';

  const emitter = NotificationService.emitter;

  function onUserNotif(payload) {
    // Only deliver if this notification belongs to this user
    if (!payload.user_id || Number(payload.user_id) === Number(userId)) {
      send(payload);
    }
  }
  function onBroadcast(payload) {
    // Broadcast is sent to ALL connected clients
    if (!payload.user_id) send(payload);
  }

  emitter.on(userChannel,      onUserNotif);
  emitter.on(broadcastChannel, onBroadcast);

  // Heartbeat every 30 seconds (prevents proxy timeouts)
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, 30_000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    emitter.off(userChannel,      onUserNotif);
    emitter.off(broadcastChannel, onBroadcast);
    res.end();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// Mark a single notification as read.
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    // Only process numeric IDs (synthesized demo IDs like 'demo-1' are skipped)
    if (/^\d+$/.test(String(id))) {
      await Notification.markAsRead(id, true);
    }
    res.json({ success: true, message: 'Notification marked as read.', id });
  } catch (err) {
    console.error('[PATCH /api/notifications/:id/read]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/read-all
// Mark all notifications as read for the current user.
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/read-all', async (req, res) => {
  try {
    const userId = getUserId(req);
    await Notification.markAllAsRead(userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('[PATCH /api/notifications/read-all]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications/mark-all-read  (legacy alias kept for compatibility)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/mark-all-read', async (req, res) => {
  try {
    const userId = getUserId(req) || (req.body && req.body.user_id) || null;
    await Notification.markAllAsRead(userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/notifications
// Create a notification manually (admin tooling or integration testing).
// Body: { user_id, title, message, type, department_id?, action_link?, ... }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const id = await NotificationService.createNotification(req.body);
    res.status(201).json({ success: true, message: 'Notification created.', notification_id: id });
  } catch (err) {
    console.error('[POST /api/notifications]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/:id
// Fetch a single notification by ID.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true, notification: formatNotification(notification) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id
// Hard-deletes a notification row.
// ─────────────────────────────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Notification.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true, message: 'Notification deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;