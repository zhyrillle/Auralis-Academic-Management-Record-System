const db = require('../config/db');

const AuditLog = {
  findAll: async () => {
    const [rows] = await db.query('SELECT * FROM AUDIT_LOG ORDER BY action_timestamp DESC');
    return rows;
  },

  log: async (logEntry) => {
    const { user_id, score_id, action_type, affected_table, previous_value, new_value, remarks } = logEntry;
    await db.query(
      `INSERT INTO AUDIT_LOG (user_id, score_id, action_type, affected_table, previous_value, new_value, remarks) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, score_id, action_type, affected_table, previous_value, new_value, remarks]
    );
  }
};

module.exports = AuditLog;