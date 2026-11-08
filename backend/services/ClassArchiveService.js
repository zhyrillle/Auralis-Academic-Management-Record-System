const fs = require('node:fs');
const path = require('node:path');

const schemaReady = new WeakMap();
const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const integer = (value, label) => {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw fail(400, 'INVALID_ARCHIVE_CONTEXT', `${label} must be a positive whole number.`);
  }
  return Number(value);
};

// The migration uses session variables: every statement must share a connection.
async function ensureSchema(database) {
  if (!schemaReady.has(database)) {
    const pending = (async () => {
      const connection = await database.getConnection();
      try {
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/20261108_class_archive.sql'), 'utf8');
        // This migration contains no procedures or semicolons inside SQL strings.
        for (const sql of migration.split(';').map(value => value.trim()).filter(Boolean)) {
          try { await connection.query(sql); }
          catch (error) {
            // Another server can add the same column between EXISTS and ALTER.
            if (error.code !== 'ER_DUP_FIELDNAME' || sql !== 'EXECUTE archive_stmt') throw error;
          }
        }
      } finally { connection.release(); }
    })();
    schemaReady.set(database, pending);
    pending.catch(() => schemaReady.delete(database));
  }
  return schemaReady.get(database);
}

function targetsFor(input) {
  if (!input || !['advisory', 'teaching'].includes(input.assignmentType)) {
    throw fail(400, 'INVALID_ARCHIVE_CONTEXT', 'Choose an advisory or teaching assignment.');
  }
  const selected = new Map();
  const add = (type, value) => {
    const id = integer(value, 'Assignment ID');
    if (selected.has(type) && selected.get(type) !== id) {
      throw fail(400, 'INVALID_ARCHIVE_CONTEXT', 'The selected assignment IDs do not match.');
    }
    selected.set(type, id);
  };
  add(input.assignmentType, input.assignmentId);
  if (input.advisoryAssignmentId != null) add('advisory', input.advisoryAssignmentId);
  if (input.teacherAssignmentId != null) add('teaching', input.teacherAssignmentId);
  // Consistent lock order for advisory cards combined with a teaching assignment.
  return [...selected].sort(([a], [b]) => a.localeCompare(b)).map(([type, id]) => ({ type, id }));
}

async function change(userId, input, restore, database) {
  const owner = integer(userId, 'Signed-in user ID');
  const targets = targetsFor(input);
  const sectionId = input.sectionId == null ? null : integer(input.sectionId, 'Section ID');
  const schoolYearId = input.schoolYearId == null ? null : integer(input.schoolYearId, 'School year ID');
  const reason = String(input.reason || 'Manually archived').trim();
  if (reason.length > 255) throw fail(400, 'INVALID_ARCHIVE_REASON', 'Archive reason must be at most 255 characters.');
  await ensureSchema(database);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    let context = null;
    // Verify every supplied assignment before changing either one.
    for (const target of targets) {
      const sql = target.type === 'advisory'
        ? `SELECT saa.section_id, saa.school_year_id FROM SECTION_ADVISER_ASSIGNMENT saa
           WHERE saa.adviser_assignment_id = ? AND saa.user_id = ? FOR UPDATE`
        : `SELECT so.section_id, so.school_year_id FROM TEACHER_ASSIGNMENT ta
           JOIN SUBJECT_OFFERING so ON so.subject_offering_id = ta.subject_offering_id
           WHERE ta.teacher_assignment_id = ? AND ta.user_id = ? FOR UPDATE`;
      const [rows] = await connection.execute(sql, [target.id, owner]);
      if (rows.length !== 1) throw fail(403, 'CLASS_ARCHIVE_FORBIDDEN', 'You can only archive or restore your own assigned classes.');
      const row = { sectionId: Number(rows[0].section_id), schoolYearId: Number(rows[0].school_year_id) };
      if ((sectionId && sectionId !== row.sectionId) || (schoolYearId && schoolYearId !== row.schoolYearId)
        || (context && (context.sectionId !== row.sectionId || context.schoolYearId !== row.schoolYearId))) {
        throw fail(409, 'CLASS_ARCHIVE_CONTEXT_MISMATCH', 'The assignments must belong to the same section and school year.');
      }
      context = row;
    }
    for (const target of targets) {
      if (restore) {
        await connection.execute('DELETE FROM CLASS_ARCHIVE WHERE user_id = ? AND assignment_type = ? AND assignment_id = ?',
          [owner, target.type, target.id]);
      } else {
        await connection.execute(`INSERT INTO CLASS_ARCHIVE (user_id,assignment_type,assignment_id,section_id,archived_at,reason)
          VALUES (?,?,?,?,UTC_TIMESTAMP(6),?)
          ON DUPLICATE KEY UPDATE section_id=VALUES(section_id),archived_at=UTC_TIMESTAMP(6),reason=VALUES(reason)`,
          [owner, target.type, target.id, context.sectionId, reason]);
      }
      // Identifiers come only from this fixed mapping; ownership is rechecked in the write.
      const [table, key] = target.type === 'advisory'
        ? ['SECTION_ADVISER_ASSIGNMENT', 'adviser_assignment_id'] : ['TEACHER_ASSIGNMENT', 'teacher_assignment_id'];
      await connection.execute(`UPDATE ${table} SET is_archived = ?, archived_at = ${restore ? 'NULL' : 'UTC_TIMESTAMP(6)'} WHERE ${key} = ? AND user_id = ?`,
        [restore ? 0 : 1, target.id, owner]);
    }
    await connection.commit();
    return { success: true, message: restore ? 'Class restored successfully.' : 'Class archived successfully.' };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

module.exports = { ensureSchema, change };
