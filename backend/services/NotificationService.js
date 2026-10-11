/**
 * NotificationService.js
 *
 * Centralised service layer for all notification events in Auralis.
 * Routes and other services call methods on this class instead of
 * writing raw INSERT SQL, keeping business rules in one place.
 *
 * Event types supported:
 *   SUBMISSION  – subject teacher submits a class record
 *   AT_RISK     – students flagged as at-risk in a section/subject
 *   DEADLINE    – grade submission window closing soon
 *   REQUEST     – grade reopening request received / actioned
 *   SUMMARY     – consolidated analytics / master sheets ready
 *
 * Real-time delivery:
 *   After persisting to DB, the service emits a 'notification' event
 *   on the global EventEmitter exported by this module.  The SSE
 *   endpoint in notificationRoutes.js subscribes to this emitter
 *   and forwards the payload to the correct connected client(s).
 */

const EventEmitter = require('events');
const db           = require('../config/db');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../models/Notification');

// ─────────────────────────────────────────────────────────────────────────────
// Global in-process event bus for real-time delivery.
// The SSE route imports this emitter to push events to open browser connections.
// ─────────────────────────────────────────────────────────────────────────────
const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(200); // allow many concurrent SSE connections

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the user_id(s) of the Department Head(s) responsible for the
 * given subject_offering_id.
 *
 * Strategy (in priority order):
 *   1. DEPARTMENT_HEAD table – matched by department_id on the subject
 *   2. USER.role = 'department_head' matched by department
 *   3. Fallback: any active user with role 'department_head'
 *
 * @param {number} subjectOfferingId
 * @param {object} [connection=db]
 * @returns {Promise<Array<{ user_id: number, department_id: number|null }>>}
 */
async function resolveDeptHeadsForOffering(subjectOfferingId, connection = db) {
  try {
    const [rows] = await connection.execute(
      `SELECT DISTINCT u.user_id
       FROM SUBJECT_OFFERING so
       JOIN SUBJECT sub ON so.subject_id = sub.subject_id

       -- Path A: via DEPARTMENT_HEAD join table (matched by subject's department)
       JOIN DEPARTMENT_HEAD dh ON dh.department_id = sub.department_id
       JOIN USER u ON u.user_id = dh.user_id

       WHERE so.subject_offering_id = ?

       UNION

       -- Path B: USER.department_id matches the subject's department_id
       SELECT DISTINCT u2.user_id
       FROM SUBJECT_OFFERING so2
       JOIN SUBJECT sub2 ON so2.subject_id = sub2.subject_id
       JOIN USER u2
         ON LOWER(TRIM(u2.role)) IN ('department_head', 'dept_head', 'department head')
        AND u2.department_id = sub2.department_id
       WHERE so2.subject_offering_id = ?

       LIMIT 10`,
      [subjectOfferingId, subjectOfferingId]
    );

    if (rows.length === 0) {
      console.warn(`[NotificationService] No department head assigned to the specific subject department for offering ${subjectOfferingId}. Unrelated department heads will NOT be notified.`);
    }

    return rows;
  } catch (err) {
    console.warn('[NotificationService] resolveDeptHeadsForOffering error:', err.message);
    return [];
  }
}

/**
 * Resolves all active Department Heads across the system.
 * Used for DEADLINE and SUMMARY events that are system-wide.
 *
 * @param {number|null} [departmentId]  – limit to one department if provided
 * @returns {Promise<Array<{ user_id: number, department_id: number|null }>>}
 */
async function resolveDeptHeads(departmentId = null) {
  try {
    let sql = `
      SELECT DISTINCT u.user_id, dh.department_id
      FROM DEPARTMENT_HEAD dh
      JOIN USER u ON u.user_id = dh.user_id
    `;
    const params = [];
    if (departmentId) {
      sql += ' WHERE dh.department_id = ?';
      params.push(departmentId);
    }
    sql += ' LIMIT 20';

    const [rows] = await db.execute(sql, params);

    // If DEPARTMENT_HEAD table is empty, fall back to USER.role
    if (rows.length === 0) {
      const [fallback] = await db.execute(
        `SELECT user_id, NULL AS department_id FROM USER
         WHERE LOWER(TRIM(role)) IN ('department_head', 'dept_head', 'department head')
         LIMIT 20`
      );
      return fallback;
    }
    return rows;
  } catch (err) {
    console.warn('[NotificationService] resolveDeptHeads error:', err.message);
    return [];
  }
}

/**
 * Core insert-and-emit helper.
 * Persists one notification row and then fires the in-process event
 * so SSE connections can push it to the browser instantly.
 *
 * @param {object} payload
 * @param {object|null} [connection]  – optional DB connection (for transactions)
 * @returns {Promise<number>} notification_id
 */
async function _persist(payload, connection = null) {
  const conn = connection || db;
  const id   = await Notification.create(payload, conn);

  // Emit for real-time delivery – fire-and-forget, never throws
  const notifRecord = { ...payload, notification_id: id, created_at: new Date().toISOString() };
  setImmediate(() => {
    // 'notification:<userId>' – subscribed by individual SSE streams
    if (payload.user_id) {
      notificationEmitter.emit(`notification:${payload.user_id}`, notifRecord);
    }
    // 'notification:broadcast' – subscribed by all SSE streams
    notificationEmitter.emit('notification:broadcast', notifRecord);
  });

  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const NotificationService = {

  // ── Expose the emitter so the SSE route can subscribe ──────────────────
  emitter: notificationEmitter,

  // ── Expose type constants for convenience ──────────────────────────────
  TYPES: NOTIFICATION_TYPES,

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * SUBMISSION event
   *
   * Called automatically from classRecordRoutes after a successful grade
   * sheet submission. Notifies all Department Heads for that subject.
   *
   * @param {object} opts
   * @param {number}      opts.subjectOfferingId  – so.subject_offering_id
   * @param {number}      opts.gradeSheetId
   * @param {string}      opts.teacherName        – "Juan Dela Cruz"
   * @param {string}      opts.subjectName        – "Mathematics"
   * @param {string}      opts.sectionName        – "Grade 9 – Einstein"
   * @param {string}      opts.termName           – "Quarter 2"
   * @param {object|null} [opts.connection]       – reuse transaction connection
   * @returns {Promise<number[]>} inserted notification_ids
   */
  async notifyGradeSubmission({ subjectOfferingId, gradeSheetId, teacherName, submitterRole, subjectName, sectionName, termName, connection }) {
    const recipients = await resolveDeptHeadsForOffering(subjectOfferingId, connection);
    const ids        = [];

    const roleSuffix = submitterRole ? ` (${submitterRole})` : '';
    for (const recipient of recipients) {
      const id = await _persist({
        user_id:             recipient.user_id,
        title:               `Grade Submission Received — ${subjectName}`,
        message:             `${teacherName}${roleSuffix} submitted ${termName} final grades for ${sectionName} (${subjectName}).`,
        type:                NOTIFICATION_TYPES.SUBMISSION,
        related_entity_type: 'GRADE_SHEET',
        related_entity_id:   gradeSheetId,
        is_read:             false,
      }, connection);
      ids.push(id);
    }

    if (ids.length === 0) {
      console.warn(`[NotificationService] SUBMISSION – no dept heads resolved for offering ${subjectOfferingId}`);
    } else {
      console.log(`[NotificationService] SUBMISSION – notified ${ids.length} dept head(s) for offering ${subjectOfferingId}`);
    }

    return ids;
  },

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * AT_RISK event
   *
   * Called from the at-risk prediction service or batch job.
   *
   * @param {object} opts
   * @param {number}      opts.subjectOfferingId
   * @param {string}      opts.subjectName
   * @param {string}      opts.sectionName        – "Grade 9 – Einstein"
   * @param {number}      opts.atRiskCount         – number of flagged students
   * @param {number|null} [opts.departmentId]
   * @param {string|null} [opts.actionLink]        – e.g. '/at-risk/42'
   * @returns {Promise<number[]>}
   */
  async notifyAtRisk({ subjectOfferingId, subjectName, sectionName, atRiskCount, departmentId, actionLink }) {
    const recipients = subjectOfferingId
      ? await resolveDeptHeadsForOffering(subjectOfferingId)
      : await resolveDeptHeads(departmentId);

    const ids = [];
    for (const recipient of recipients) {
      const id = await _persist({
        user_id:             recipient.user_id,
        department_id:       departmentId || recipient.department_id || null,
        title:               `At-Risk Alert — ${subjectName}`,
        message:             `${atRiskCount} student${atRiskCount !== 1 ? 's' : ''} in ${sectionName} ` +
                             `have been flagged with high risk in ${subjectName} based on recent performance.`,
        type:                NOTIFICATION_TYPES.AT_RISK,
        related_entity_type: 'AT_RISK_PREDICTION',
        related_entity_id:   null,
        action_link:         actionLink || null,
        is_read:             false,
      });
      ids.push(id);
    }
    return ids;
  },

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * DEADLINE event
   *
   * Called by the GradingPeriodService lifecycle guard (or a cron job)
   * when a submission window is nearing its close date.
   *
   * @param {object} opts
   * @param {number}      opts.daysRemaining       – e.g. 3
   * @param {string}      opts.termName            – "Quarter 2"
   * @param {number}      opts.pendingTeacherCount – teachers who haven't submitted
   * @param {number|null} [opts.departmentId]      – limit to one dept or NULL for all
   * @param {string|null} [opts.actionLink]
   * @returns {Promise<number[]>}
   */
  async notifyDeadlineReminder({ daysRemaining, termName, pendingTeacherCount, departmentId, actionLink }) {
    const recipients = await resolveDeptHeads(departmentId);
    const ids        = [];

    for (const recipient of recipients) {
      const id = await _persist({
        user_id:             recipient.user_id,
        department_id:       departmentId || recipient.department_id || null,
        title:               `Grade Submission Deadline Reminder`,
        message:             `${termName} grade submission window closes in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. ` +
                             `${pendingTeacherCount} subject teacher${pendingTeacherCount !== 1 ? 's' : ''} in your department ` +
                             `${pendingTeacherCount !== 1 ? 'have' : 'has'} pending records.`,
        type:                NOTIFICATION_TYPES.DEADLINE,
        related_entity_type: 'ACADEMIC_TERM',
        related_entity_id:   null,
        action_link:         actionLink || '/grade-submission',
        is_read:             false,
      });
      ids.push(id);
    }
    return ids;
  },

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * REQUEST event – grade reopening request submitted by a teacher.
   *
   * @param {object} opts
   * @param {number}      opts.requestId
   * @param {string}      opts.teacherName
   * @param {string}      opts.subjectName
   * @param {string}      opts.sectionName
   * @param {string}      opts.reason
   * @param {number}      opts.subjectOfferingId
   * @param {object|null} [opts.connection]
   * @returns {Promise<number[]>}
   */
  async notifyReopenRequest({ requestId, teacherName, subjectName, sectionName, reason, subjectOfferingId, connection }) {
    const recipients = await resolveDeptHeadsForOffering(subjectOfferingId, connection);
    const ids        = [];

    for (const recipient of recipients) {
      const id = await _persist({
        user_id:             recipient.user_id,
        department_id:       recipient.department_id || null,
        title:               `Grade Reopening Request — ${subjectName}`,
        message:             `${teacherName} requested grade reopening for ${sectionName} (${subjectName}): "${reason}".`,
        type:                NOTIFICATION_TYPES.REQUEST,
        related_entity_type: 'GRADE_REOPEN_REQUEST',
        related_entity_id:   requestId,
        action_link:         `/reopen-requests/${requestId}`,
        is_read:             false,
      }, connection);
      ids.push(id);
    }
    return ids;
  },

  /**
   * REQUEST event – grade reopening request approved or declined.
   *
   * @param {object} opts
   * @param {number}      opts.requestId
   * @param {string}      opts.status             – 'APPROVED' | 'DECLINED'
   * @param {string}      opts.subjectName
   * @param {string}      opts.sectionName
   * @param {number}      opts.teacherUserId       – notify the requesting teacher
   * @param {string|null} [opts.hoursUnlocked]    – e.g. '48' when approved
   * @param {object|null} [opts.connection]
   * @returns {Promise<number>}
   */
  async notifyReopenRequestActioned({ requestId, status, subjectName, sectionName, teacherUserId, hoursUnlocked, connection }) {
    const approved = status === 'APPROVED';
    const message  = approved
      ? `Grade reopening request for ${sectionName} (${subjectName}) has been approved and unlocked for ${hoursUnlocked || '48'} hours.`
      : `Grade reopening request for ${sectionName} (${subjectName}) has been declined.`;

    const id = await _persist({
      user_id:             teacherUserId,
      title:               `Grade Reopening Request ${approved ? 'Approved' : 'Declined'} — ${subjectName}`,
      message,
      type:                NOTIFICATION_TYPES.REQUEST,
      related_entity_type: 'GRADE_REOPEN_REQUEST',
      related_entity_id:   requestId,
      action_link:         `/reopen-requests/${requestId}`,
      is_read:             false,
    }, connection);

    return id;
  },

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * SUMMARY event – consolidated analytics / master sheets finalized.
   *
   * @param {object} opts
   * @param {string}      opts.termName            – "Quarter 1"
   * @param {string}      [opts.details]           – extra details for the message
   * @param {number|null} [opts.departmentId]
   * @param {string|null} [opts.actionLink]
   * @returns {Promise<number[]>}
   */
  async notifySummaryReady({ termName, details, departmentId, actionLink }) {
    const recipients = await resolveDeptHeads(departmentId);
    const ids        = [];

    const defaultDetail = 'Consolidated pass rates and subject master sheets have been finalized and archived.';
    for (const recipient of recipients) {
      const id = await _persist({
        user_id:             recipient.user_id,
        department_id:       departmentId || recipient.department_id || null,
        title:               `Department Performance Summary Ready`,
        message:             `${details || defaultDetail} (${termName})`,
        type:                NOTIFICATION_TYPES.SUMMARY,
        related_entity_type: 'ACADEMIC_TERM',
        related_entity_id:   null,
        action_link:         actionLink || '/master-sheets',
        is_read:             false,
      });
      ids.push(id);
    }
    return ids;
  },

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Generic / manual notification creation (used by admin tooling or tests).
   *
   * @param {object} data  – any valid Notification.create() payload
   * @returns {Promise<number>}
   */
  async createNotification(data) {
    return _persist(data);
  },
};

module.exports = NotificationService;
