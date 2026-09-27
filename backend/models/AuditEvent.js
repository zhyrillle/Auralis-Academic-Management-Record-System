const db = require('../config/db');

const ROLE_DISPLAY_MAP = {
  admin: 'System Administrator',
  system_admin: 'System Administrator',
  'system administrator': 'System Administrator',
  principal: 'Principal',
  department_head: 'Department Head',
  'department head': 'Department Head',
  subject_teacher: 'Subject Teacher',
  'subject teacher': 'Subject Teacher',
  adviser: 'Adviser',
};

const MODULE_DISPLAY_MAP = {
  ACCOUNT_MANAGEMENT: 'Account Management',
  account_management: 'Account Management',
  GRADING_PERIOD: 'Grading Period',
  grading_period: 'Grading Period',
  GRADE_LOCK: 'Grade Lock',
  grade_lock: 'Grade Lock',
  WS_CONFIGURATION: 'WS Configuration',
  ws_configuration: 'WS Configuration',
  GRADING: 'Grading',
  grading: 'Grading',
  ATTENDANCE: 'Attendance',
  attendance: 'Attendance',
};

const EVENT_TYPE_MAP = {
  USER_ACCOUNT_CREATED: 'User Account Created',
  USER_ACCOUNT_UPDATED: 'User Account Updated',
  USER_STATUS_UPDATED: 'User Status Updated',
  USER_PROFILE_UPDATED: 'User Profile Updated',
  USER_PASSWORD_RESET: 'User Password Reset',
  UPCOMING_SCHOOL_YEAR_CREATED: 'Upcoming School Year Created',
  GRADING_PERIOD_CREATED: 'Grading Period Created',
  GRADING_PERIOD_TIMELINE_UPDATED: 'Grading Period Timeline Updated',
  GRADE_REOPEN_REQUEST_SUBMITTED: 'Grade Reopen Request Submitted',
  GRADE_REOPEN_REQUEST_APPROVED: 'Grade Reopen Request Approved',
  GRADE_REOPEN_REQUEST_DENIED: 'Grade Reopen Request Denied',
  TEMPORARY_REOPENING_EXPIRED: 'Temporary Reopening Expired',
  TERM_AUTOMATICALLY_LOCKED: 'Term Automatically Locked',
  SUBJECT_WEIGHTS_UPDATED: 'Subject Weights Updated',
  SUBJECT_WEIGHTS_INHERITED: 'Subject Weights Inherited',
  GRADE_SHEET_SUBMITTED: 'Grade Sheet Submitted',
  GRADE_SHEET_RECALLED: 'Grade Sheet Recalled',
  GRADE_SHEET_CORRECTION_RESUBMITTED: 'Grade Sheet Correction Resubmitted',
  GRADE_SHEET_UPDATED: 'Grade Sheet Updated',
};

const ENTITY_TYPE_MAP = {
  USER: 'User Account',
  user: 'User Account',
  SCHOOL_YEAR: 'School Year',
  school_year: 'School Year',
  ACADEMIC_TERM: 'Academic Term',
  academic_term: 'Academic Term',
  GRADE_REOPEN_REQUEST: 'Grade Reopen Request',
  grade_reopen_request: 'Grade Reopen Request',
  TEMPORARY_REOPENING: 'Temporary Reopening',
  temporary_reopening: 'Temporary Reopening',
  SUBJECT_COMPONENT_WEIGHT: 'Subject Component Weight',
  subject_component_weight: 'Subject Component Weight',
  GRADE_SHEET: 'Grade Sheet',
  grade_sheet: 'Grade Sheet',
};

function formatRole(role) {
  if (!role) return 'System';
  const key = String(role).trim().toLowerCase();
  return ROLE_DISPLAY_MAP[key] || role;
}

function formatModule(moduleName) {
  if (!moduleName) return 'System';
  return (
    MODULE_DISPLAY_MAP[moduleName] ||
    String(moduleName)
      .split(/[_-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  );
}

function formatEventType(eventType) {
  if (!eventType) return 'System Event';
  return (
    EVENT_TYPE_MAP[eventType] ||
    String(eventType)
      .split(/[_-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  );
}

function formatEntityType(entityType) {
  if (!entityType) return 'Record';
  return (
    ENTITY_TYPE_MAP[entityType] ||
    String(entityType)
      .split(/[_-]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  );
}

function safeParseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function computeImpact(eventType, metadata = {}) {
  if (metadata.impact) return metadata.impact;
  const highEvents = [
    'GRADE_REOPEN_REQUEST_APPROVED',
    'TERM_AUTOMATICALLY_LOCKED',
    'USER_PASSWORD_RESET',
    'UPCOMING_SCHOOL_YEAR_CREATED',
  ];
  const lowEvents = ['GRADE_SHEET_RECALLED', 'USER_PROFILE_UPDATED'];
  if (highEvents.includes(eventType)) return 'High';
  if (lowEvents.includes(eventType)) return 'Low';
  return 'Medium';
}

function computeTarget(row, beforeData, afterData, metadata) {
  if (metadata.target) return metadata.target;
  if (row.entity_type === 'USER' || row.entity_type === 'user') {
    const name = [afterData.first_name || beforeData.first_name, afterData.last_name || beforeData.last_name]
      .filter(Boolean)
      .join(' ');
    return name || afterData.email || beforeData.email || (row.entity_id ? `User #${row.entity_id}` : null);
  }
  if (row.entity_type === 'SCHOOL_YEAR' || row.entity_type === 'school_year') {
    return afterData.year_name || (row.entity_id ? `School Year #${row.entity_id}` : null);
  }
  if (row.entity_type === 'ACADEMIC_TERM' || row.entity_type === 'academic_term') {
    return afterData.term_name || beforeData.term_name || (row.entity_id ? `Term #${row.entity_id}` : null);
  }
  if (row.entity_type === 'GRADE_REOPEN_REQUEST' || row.entity_type === 'grade_reopen_request') {
    return metadata.sheet_name || (row.entity_id ? `Reopening Request #${row.entity_id}` : null);
  }
  if (row.entity_type === 'TEMPORARY_REOPENING' || row.entity_type === 'temporary_reopening') {
    return metadata.sheet_name || (row.entity_id ? `Temporary Access #${row.entity_id}` : null);
  }
  if (row.entity_type === 'SUBJECT_COMPONENT_WEIGHT' || row.entity_type === 'subject_component_weight') {
    return metadata.subject_name || (row.entity_id ? `Subject Weight #${row.entity_id}` : null);
  }
  return formatEntityType(row.entity_type);
}

function computeSummary(row, beforeData, afterData, metadata, target) {
  if (metadata.summary) return metadata.summary;

  switch (row.event_type) {
    case 'USER_ACCOUNT_CREATED':
      return `Created a ${formatRole(afterData.role)} account${target ? ` for ${target}` : ''}.`;
    case 'USER_ACCOUNT_UPDATED':
      return `Updated account information${target ? ` for ${target}` : ''}.`;
    case 'USER_STATUS_UPDATED':
      return `Changed account status to ${afterData.account_status || 'updated'}${target ? ` for ${target}` : ''}.`;
    case 'USER_PROFILE_UPDATED':
      return `Updated user profile information${target ? ` for ${target}` : ''}.`;
    case 'USER_PASSWORD_RESET':
      return `Reset password for ${target || 'user account'}.`;
    case 'UPCOMING_SCHOOL_YEAR_CREATED':
      return `Created upcoming school year configuration${target ? ` (${target})` : ''}.`;
    case 'GRADING_PERIOD_CREATED':
      return `Configured new grading period${target ? ` for ${target}` : ''}.`;
    case 'GRADING_PERIOD_TIMELINE_UPDATED':
      return `Updated grading period schedule and submission deadlines${target ? ` for ${target}` : ''}.`;
    case 'GRADE_REOPEN_REQUEST_APPROVED':
      return metadata.admin_note
        ? `Approved temporary correction access for grade sheet (${metadata.admin_note}).`
        : `Approved temporary correction access for grade sheet.`;
    case 'GRADE_REOPEN_REQUEST_DENIED':
      return metadata.admin_note
        ? `Denied grade reopening request #${row.entity_id} (${metadata.admin_note}).`
        : `Denied grade reopening request #${row.entity_id}.`;
    case 'TEMPORARY_REOPENING_EXPIRED':
      return `Automatically closed temporary editing access after expiration window.`;
    case 'TERM_AUTOMATICALLY_LOCKED':
      return `Automatically locked grading sheets when deadline elapsed.`;
    case 'SUBJECT_WEIGHTS_UPDATED':
      return `Updated grading component weights${target ? ` for ${target}` : ''}.`;
    case 'SUBJECT_WEIGHTS_INHERITED':
      return `Inherited subject component weights from the previous school year.`;
    case 'GRADE_SHEET_SUBMITTED':
      return `Submitted grade sheet${target ? ` for ${target}` : ''}.`;
    case 'GRADE_SHEET_RECALLED':
      return `Recalled submitted grade sheet${target ? ` for ${target}` : ''} before deadline.`;
    case 'GRADE_SHEET_CORRECTION_RESUBMITTED':
      return `Resubmitted corrected grade sheet${target ? ` for ${target}` : ''}.`;
    default:
      return `${formatEventType(row.event_type)}${target ? ` on ${target}` : ''}.`;
  }
}

function normalizeAuditEvent(row) {
  const actorContext = safeParseJson(row.actor_context);
  const beforeData = safeParseJson(row.before_data);
  const afterData = safeParseJson(row.after_data);
  const metadata = safeParseJson(row.metadata);

  const actorFullName = [row.first_name, row.last_name].filter(Boolean).join(' ');
  const actorName = actorFullName || actorContext.actor_name || metadata.actor_name || 'Auralis System';
  const actorRole = row.user_id ? formatRole(row.role) : 'System';
  const actingAs =
    actorContext.acting_as ||
    actorContext.actingAs ||
    (row.user_id ? actorRole : actorContext.source === 'system' ? 'Automated System' : 'System');

  const target = computeTarget(row, beforeData, afterData, metadata);
  const summary = computeSummary(row, beforeData, afterData, metadata, target);
  const impact = computeImpact(row.event_type, metadata);

  const schoolYear =
    metadata.school_year ||
    metadata.schoolYear ||
    afterData.school_year ||
    beforeData.school_year ||
    null;

  const term =
    metadata.term ||
    afterData.term ||
    beforeData.term ||
    (afterData.term_name ? afterData.term_name : null) ||
    null;

  const subject =
    metadata.subject ||
    afterData.subject ||
    beforeData.subject ||
    (metadata.subject_name ? metadata.subject_name : null) ||
    null;

  const section =
    metadata.section ||
    afterData.section ||
    beforeData.section ||
    (metadata.section_name ? metadata.section_name : null) ||
    null;

  return {
    id: String(row.audit_event_id),
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
    actorId: row.user_id ? String(row.user_id) : null,
    actorName,
    actorRole,
    actingAs,
    eventType: row.event_type,
    eventLabel: formatEventType(row.event_type),
    module: formatModule(row.module_name),
    entityType: formatEntityType(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : null,
    target,
    summary,
    impact,
    schoolYear,
    term,
    subject,
    section,
    beforeData,
    afterData,
    metadata,
  };
}

class AuditEvent {
  static async findAll() {
    const [rows] = await db.execute(`
      SELECT 
        a.audit_event_id,
        a.user_id,
        a.actor_context,
        a.event_type,
        a.module_name,
        a.entity_type,
        a.entity_id,
        a.before_data,
        a.after_data,
        a.metadata,
        a.occurred_at,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.role,
        u.email
      FROM AUDIT_EVENT a
      LEFT JOIN USER u ON a.user_id = u.user_id
      ORDER BY a.occurred_at DESC
    `);
    return rows.map(normalizeAuditEvent);
  }

  static async findById(id) {
    const [rows] = await db.execute(
      `
      SELECT 
        a.audit_event_id,
        a.user_id,
        a.actor_context,
        a.event_type,
        a.module_name,
        a.entity_type,
        a.entity_id,
        a.before_data,
        a.after_data,
        a.metadata,
        a.occurred_at,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.role,
        u.email
      FROM AUDIT_EVENT a
      LEFT JOIN USER u ON a.user_id = u.user_id
      WHERE a.audit_event_id = ?
      `,
      [id]
    );
    if (!rows[0]) return null;
    return normalizeAuditEvent(rows[0]);
  }

  static async create(data, connection = null) {
    const executor = connection || db;
    const userId = data.user_id || data.userId || null;
    const actorContext = data.actor_context || data.actorContext || null;
    const eventType = data.event_type || data.eventType;
    const moduleName = data.module_name || data.moduleName;
    const entityType = data.entity_type || data.entityType;
    const entityId = data.entity_id || data.entityId || null;
    const beforeData = data.before_data || data.beforeData || null;
    const afterData = data.after_data || data.afterData || null;
    const metadata = data.metadata || null;

    const [result] = await executor.execute(
      `INSERT INTO AUDIT_EVENT (
        user_id,
        actor_context,
        event_type,
        module_name,
        entity_type,
        entity_id,
        before_data,
        after_data,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        actorContext ? JSON.stringify(actorContext) : null,
        eventType,
        moduleName,
        entityType,
        entityId,
        beforeData ? JSON.stringify(beforeData) : null,
        afterData ? JSON.stringify(afterData) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return result.insertId;
  }

  static async delete(id) {
    const [result] = await db.execute('DELETE FROM AUDIT_EVENT WHERE audit_event_id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getAccountSummary() {
    const [rows] = await db.execute(`
      SELECT 
        COUNT(*) AS total_accounts,
        SUM(CASE WHEN LOWER(COALESCE(account_status, 'active')) = 'active' THEN 1 ELSE 0 END) AS active_accounts,
        SUM(CASE WHEN LOWER(COALESCE(account_status, 'active')) != 'active' THEN 1 ELSE 0 END) AS inactive_accounts,
        SUM(CASE WHEN LOWER(role) IN ('subject_teacher', 'subject teacher', 'adviser', 'teacher') THEN 1 ELSE 0 END) AS subject_teachers,
        SUM(CASE WHEN LOWER(role) IN ('department_head', 'department head') THEN 1 ELSE 0 END) AS department_heads,
        SUM(CASE WHEN LOWER(role) = 'principal' THEN 1 ELSE 0 END) AS principals,
        SUM(CASE WHEN LOWER(role) IN ('admin', 'system_admin', 'administrator', 'system administrator') THEN 1 ELSE 0 END) AS system_admins
      FROM USER
    `);

    const stats = rows[0] || {};
    return {
      totalAccounts: Number(stats.total_accounts || 0),
      activeAccounts: Number(stats.active_accounts || 0),
      inactiveAccounts: Number(stats.inactive_accounts || 0),
      roles: {
        subject_teacher: Number(stats.subject_teachers || 0),
        department_head: Number(stats.department_heads || 0),
        principal: Number(stats.principals || 0),
        system_admin: Number(stats.system_admins || 0),
      },
    };
  }
}

module.exports = AuditEvent;