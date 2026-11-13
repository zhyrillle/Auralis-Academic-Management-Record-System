const fieldKey = value => String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[-\s]+/g, '_').toLowerCase();
const sensitive = key => /password|passwd|secret|(^|_)(token|api_key|authorization)($|_)/i.test(fieldKey(key));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const LABELS = {
  initial_grade: 'Initial grade', term_grade: 'Term grade', quarterly_grade: 'Term grade',
  grade_id: 'Grade record ID', student_grade_id: 'Grade record ID', student_id: 'Student ID',
  student_section_id: 'Enrollment ID', user_id: 'User ID', school_year_id: 'School year ID',
  grade_sheet_id: 'Grade sheet ID', attendance_sheet_id: 'Attendance sheet ID',
  ww: 'Written Work', pt: 'Performance Tasks', qa: 'Examinations', ex: 'Examinations',
  is_custom_enabled: 'Custom transmutation enabled', ranges_count: 'Number of ranges',
  workflow_status: 'Submission status', lock_status: 'Lock status', remarks: 'Remarks',
  p: 'Present', a: 'Absent', l: 'Late',
  raw_score: 'Score', score_status: 'Score status', highest_possible_score: 'Highest possible score',
  percentage: 'Component weight', min: 'Minimum initial grade', max: 'Maximum initial grade', transmuted: 'Converted grade',
  no_class_reason: 'Day status', expires_at: 'Editing access ends',
};

export const auditFieldLabel = key => LABELS[fieldKey(key)] || fieldKey(key).split('_')
  .map((part, i) => /^(id|lrn|sf9|sf10|ww|pt|qa)$/.test(part) ? part.toUpperCase()
    : i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part).join(' ');

// Some historical snapshots are JSON strings; do not print their serialization in the drawer.
function decode(value) {
  if (typeof value !== 'string' || (!value.trim().startsWith('{') && !value.trim().startsWith('['))) return value;
  try { return JSON.parse(value); } catch { return 'Unreadable saved value'; }
}

function canonical(value, grading, attendance) {
  const decoded = decode(value);
  if (Array.isArray(decoded)) return decoded.map(item => canonical(item, grading, attendance));
  if (!object(decoded)) return decoded;
  const hiddenAttendanceFields = new Set(['section_id', 'school_year_id', 'absences_created']);
  return Object.fromEntries(Object.entries(decoded).filter(([key]) =>
    !sensitive(key) && !(attendance && hiddenAttendanceFields.has(fieldKey(key)))
  ).map(([key, item]) => {
    let name = fieldKey(key);
    if (grading) name = ({ initial: 'initial_grade', final: 'term_grade', quarterly_grade: 'term_grade', student_grade_id: 'grade_id' })[name] || name;
    return [name, canonical(item, grading, attendance)];
  }));
}

function equal(a, b, key) {
  if (a === b) return true;
  if (a == null || b == null || a === '' || b === '' || typeof a === 'boolean' || typeof b === 'boolean') return false;
  if (/(^|_)(grade|score|percentage|weight|count|points|possible|earned|minimum|maximum|initial|final)(_|$)/.test(key)
    && typeof a !== 'object' && typeof b !== 'object' && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) {
    return Number(a) === Number(b);
  }
  return false;
}

export function formatAuditValue(value, key = '') {
  if (value === undefined) return 'Not recorded';
  if (key === 'no_class_reason' && value === null) return 'Regular class day';
  if (value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key === 'percentage' && Number.isFinite(Number(value))) return `${Number(value)}%`;
  if (Array.isArray(value)) return value.length ? value.map(item => formatAuditValue(item, key)).join(', ') : 'None';
  if (object(value)) return 'Additional saved details';
  if (/(^date$|_at$|_on$|_date$|timestamp$)/.test(key) && typeof value === 'string') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (dateOnly || /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      const date = new Date(dateOnly ? `${value}T00:00:00+08:00` : value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila', dateStyle: 'medium', ...(dateOnly ? {} : { timeStyle: 'short' }),
      }).format(date);
    }
  }
  if (/status|scope|role/.test(key) && typeof value === 'string') {
    if (key === 'status' && ['P', 'A', 'L'].includes(value)) return { P: 'Present', A: 'Absent', L: 'Late' }[value];
    if (/^[A-Z_]+$/.test(value) || value.includes('_')) return auditFieldLabel(value);
  }
  return String(value);
}

function recordIdentity(row) {
  if (!object(row)) return null;
  for (const key of ['score_key', 'weight_key', 'assignment_key', 'grade_id', 'student_grade_id', 'attendance_id', 'activity_id', 'assessment_id', 'range_id', 'id', 'student_section_id', 'student_id', 'user_id']) {
    if (row[key] !== undefined && row[key] !== null) return `${key}:${row[key]}`;
  }
  if (row.subject_id != null && row.component_type_id != null) return `weight:${row.subject_id}:${row.component_type_id}`;
  return null;
}

function recordTitle(row, index) {
  if (object(row)) {
    const name = row.student_name || row.learner_name || row.name;
    const id = row.grade_id ?? row.student_grade_id;
    if (id != null) return `${name ? `${name} · ` : ''}Grade record #${id}`;
    if (row.weight_key != null) return [row.subject, row.component].filter(Boolean).join(' · ');
    if (row.score_key != null) return [name, row.activity_name].filter(Boolean).join(' · ');
    if (row.assignment_key != null) return [row.section, row.subject, row.department].filter(Boolean).join(' · ');
    if (row.min != null && row.max != null) return `Initial grade ${row.min}–${row.max}`;
    if (row.activity_id != null && row.activity_name) return row.activity_name;
    if (name) return String(name);
    for (const [key, label] of [['attendance_id', 'Attendance record'], ['student_section_id', 'Enrollment'], ['student_id', 'Student'], ['user_id', 'User']]) {
      if (row[key] != null) return `${label} #${row[key]}`;
    }
  }
  return `Record ${index + 1}`;
}

export function getAuditChangeGroups(event) {
  const grading = /GRAD|CLASS_RECORD/i.test(`${event.eventType || ''} ${event.module || ''}`);
  const attendance = /ATTENDANCE/i.test(`${event.eventType || ''} ${event.module || ''}`);
  const recordedBefore = canonical(event.beforeData ?? event.before_data, grading, attendance);
  const recordedAfter = canonical(event.afterData ?? event.after_data, grading, attendance);
  const emptyContainers = value => Array.isArray(value) ? value.every(emptyContainers)
    : object(value) ? Object.values(value).every(emptyContainers) : false;
  // Creation events can store an empty collection as their before snapshot.
  // Treat that as absent, while preserving any actual recorded prior values.
  const before = /_CREATED$/i.test(event.eventType || '') && recordedBefore != null && emptyContainers(recordedBefore)
    ? null : recordedBefore;
  const isDeleted = /_DELETED$/i.test(event.eventType || '');
  const after = isDeleted && recordedAfter != null && emptyContainers(recordedAfter)
    ? null : recordedAfter;
  const present = value => object(value) ? Object.keys(value).length > 0 : Array.isArray(value) ? value.length > 0 : value != null;
  const hasBefore = present(before), hasAfter = present(after);
  const groups = [];

  function visit(left, right, path = '', title = '', depth = 0) {
    if (depth > 12) return;
    const group = { id: path || 'record', title, fields: [] };
    groups.push(group);
    function leaf(key, a, b) {
      if (['score_key', 'weight_key', 'assignment_key'].includes(key)) return;
      if (!equal(a, b, key)) group.fields.push({ id: `${path}.${key}`, label: auditFieldLabel(key),
        before: formatAuditValue(a, key), after: formatAuditValue(b, key), hasBefore: a !== undefined, hasAfter: b !== undefined });
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      const a = Array.isArray(left) ? left : [], b = Array.isArray(right) ? right : [];
      if ([...a, ...b].every(item => !object(item) && !Array.isArray(item))) {
        if (a.length !== b.length || a.some((item, index) => !equal(item, b[index], path))) leaf('value', left, right);
      } else {
        const counts = items => items.reduce((map, item) => { const id = recordIdentity(item); if (id) map.set(id, (map.get(id) || 0) + 1); return map; }, new Map());
        const ac = counts(a), bc = counts(b);
        const key = (item, index) => { const id = recordIdentity(item); return id && (ac.get(id) || 0) <= 1 && (bc.get(id) || 0) <= 1 ? id : `position:${index}`; };
        const am = new Map(a.map((item, i) => [key(item, i), item])), bm = new Map(b.map((item, i) => [key(item, i), item]));
        [...new Set([...am.keys(), ...bm.keys()])].forEach((id, index) => {
          const row = bm.get(id) || am.get(id);
          visit(am.get(id), bm.get(id), `${path}/${id}`, [title, recordTitle(row, index)].filter(Boolean).join(' · '), depth + 1);
        });
      }
    } else if (object(left) || object(right)) {
      for (const key of new Set([...Object.keys(object(left) ? left : {}), ...Object.keys(object(right) ? right : {})])) {
        const a = has(left, key) ? left[key] : undefined, b = has(right, key) ? right[key] : undefined;
        if (object(a) || object(b) || Array.isArray(a) || Array.isArray(b)) {
          visit(a, b, `${path}/${key}`, [title, auditFieldLabel(key)].filter(Boolean).join(' · '), depth + 1);
        } else leaf(key, a, b);
      }
    } else leaf('value', left, right);
  }

  if (hasBefore || hasAfter) visit(before, after);
  return { groups: groups.filter(group => group.fields.length), hasBefore, hasAfter,
    heading: hasBefore && hasAfter ? 'Changes' : hasAfter ? 'Recorded details' : hasBefore ? (isDeleted ? 'Deleted details' : 'Previous details') : 'Changes' };
}
