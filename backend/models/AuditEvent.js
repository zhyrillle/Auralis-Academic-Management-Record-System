const db = require('../config/db');

class AuditEvent {
  static async findAll() {
    const [rows] = await db.execute('SELECT * FROM AUDIT_EVENT');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM AUDIT_EVENT WHERE audit_event_id = ?', [id]);
    return rows[0];
  }

  static async create(data) {
    const { user_id, actor_context, event_type, module_name, entity_type, entity_id, before_data, after_data, metadata } = data;
    const [result] = await db.execute(
      `INSERT INTO AUDIT_EVENT (user_id, actor_context, event_type, module_name, entity_type, entity_id, before_data, after_data, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        actor_context ? JSON.stringify(actor_context) : null,
        event_type,
        module_name,
        entity_type,
        entity_id,
        before_data ? JSON.stringify(before_data) : null,
        after_data ? JSON.stringify(after_data) : null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return result.insertId;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM AUDIT_EVENT WHERE audit_event_id = ?', [id]);
    return result.affectedRows > 0;
  }
}

module.exports = AuditEvent;