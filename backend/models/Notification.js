const db = require('../config/db');

const Notification = {
  findByUserId: async (userId) => {
    const [rows] = await db.query('SELECT * FROM NOTIFICATION WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    return rows;
  },

  create: async (notif) => {
    const { user_id, title, message, type } = notif;
    const [result] = await db.query(
      'INSERT INTO NOTIFICATION (user_id, title, message, type) VALUES (?, ?, ?, ?)',
      [user_id, title, message, type]
    );
    return result.insertId;
  },

  markAsRead: async (id) => {
    await db.query('UPDATE NOTIFICATION SET is_read = TRUE WHERE notification_id = ?', [id]);
  }
};

module.exports = Notification;