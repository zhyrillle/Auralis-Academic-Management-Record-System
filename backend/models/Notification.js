const db = require('../config/db');

/**
 * Notification Model
 *
 * Wraps all database interactions with the NOTIFICATION table using the lean, standard schema:
 *   notification_id     BIGINT PK AUTO_INCREMENT
 *   user_id             BIGINT NULL
 *   title               VARCHAR(255) NOT NULL
 *   message             TEXT NOT NULL
 *   related_entity_type VARCHAR(50) NULL
 *   related_entity_id   BIGINT NULL
 *   type                VARCHAR(50) NOT NULL DEFAULT 'general'
 *   is_read             BOOLEAN DEFAULT 0
 *   created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 */

const NOTIFICATION_TYPES = Object.freeze({
  SUBMISSION: 'SUBMISSION',   // Teacher submitted a class record
  AT_RISK:    'AT_RISK',      // Students flagged as at-risk
  DEADLINE:   'DEADLINE',     // Submission window closing soon
  REQUEST:    'REQUEST',      // Grade reopening request received
  SUMMARY:    'SUMMARY',      // Analytics / master sheet ready
  GENERAL:    'general',      // Fallback catch-all
});

class Notification {
  /** No-op initialization hook for table safety. */
  static async initTable() {
    return true;
  }

  /** Fetch all notifications (admin use). */
  static async findAll() {
    const [rows] = await db.execute(`
      SELECT * FROM NOTIFICATION
      ORDER BY created_at DESC, notification_id DESC
    `);
    return rows;
  }

  /** Fetch a single notification by PK. */
  static async findById(id) {
    const [rows] = await db.execute(
      'SELECT * FROM NOTIFICATION WHERE notification_id = ?',
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Fetch paginated notifications for a specific user.
   *
   * @param {number} userId
   * @param {object} opts
   * @param {number} [opts.page=1]
   * @param {number} [opts.limit=20]
   * @param {boolean} [opts.includeBroadcast=true]
   * @returns {{ rows: object[], total: number, unreadCount: number }}
   */
  static async findByUserId(userId, { page = 1, limit = 20, includeBroadcast = true } = {}) {
    const pageNum  = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 20);
    const offset   = (pageNum - 1) * limitNum;
    const broadcastClause = includeBroadcast ? 'OR user_id IS NULL' : '';

    const [rows] = await db.execute(
      `SELECT * FROM NOTIFICATION
       WHERE (user_id = ? ${broadcastClause})
       ORDER BY created_at DESC, notification_id DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      [userId]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM NOTIFICATION
       WHERE (user_id = ? ${broadcastClause})`,
      [userId]
    );

    const [[{ unreadCount }]] = await db.execute(
      `SELECT COUNT(*) AS unreadCount FROM NOTIFICATION
       WHERE is_read = 0 AND (user_id = ? ${broadcastClause})`,
      [userId]
    );

    return { rows, total, unreadCount };
  }

  /**
   * Fetch the N most recent notifications for a user.
   */
  static async findRecentByUserId(userId, limit = 50) {
    const limitNum = Math.max(1, Number(limit) || 50);
    const [rows] = await db.execute(
      `SELECT * FROM NOTIFICATION
       WHERE (user_id = ? OR user_id IS NULL)
       ORDER BY created_at DESC, notification_id DESC
       LIMIT ${limitNum}`,
      [userId]
    );
    return rows;
  }

  /**
   * Insert a new notification row.
   *
   * @param {object} data
   * @param {number|null}  data.user_id
   * @param {string}       data.title
   * @param {string}       data.message
   * @param {string|null}  [data.related_entity_type]
   * @param {number|null}  [data.related_entity_id]
   * @param {string}       [data.type='general']
   * @param {boolean}      [data.is_read=false]
   * @param {object|null}  [connection]
   * @returns {number} insertId
   */
  static async create(data, connection = db) {
    const {
      user_id             = null,
      title,
      message,
      related_entity_type = null,
      related_entity_id   = null,
      type                = NOTIFICATION_TYPES.GENERAL,
      is_read             = false,
    } = data;

    const [result] = await connection.execute(
      `INSERT INTO NOTIFICATION
         (user_id, title, message, related_entity_type, related_entity_id, type, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        user_id,
        title,
        message,
        related_entity_type,
        related_entity_id,
        type,
        is_read ? 1 : 0,
      ]
    );
    return result.insertId;
  }

  /** Mark a single notification as read. */
  static async markAsRead(id, isRead = true) {
    await db.execute(
      'UPDATE NOTIFICATION SET is_read = ? WHERE notification_id = ?',
      [isRead ? 1 : 0, id]
    );
    return this.findById(id);
  }

  /** Mark all unread notifications for a user as read. */
  static async markAllAsRead(userId) {
    if (userId) {
      await db.execute(
        `UPDATE NOTIFICATION SET is_read = 1
         WHERE (user_id = ? OR user_id IS NULL)`,
        [userId]
      );
    } else {
      await db.execute(
        'UPDATE NOTIFICATION SET is_read = 1'
      );
    }
    return true;
  }

  /** Delete a notification. */
  static async delete(id) {
    const [result] = await db.execute(
      'DELETE FROM NOTIFICATION WHERE notification_id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;