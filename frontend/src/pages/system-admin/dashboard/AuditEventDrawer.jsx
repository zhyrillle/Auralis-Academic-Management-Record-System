import { UserRound, X } from "lucide-react";
import { useRef, useState } from 'react';
import { formatAuditValue, getAuditChangeGroups } from '../../../utils/auditEventPresentation';

function DetailRows({ rows }) {
  return <dl className="audit-detail-rows">
    {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

function ChangeGroups({ groups, hasBefore, hasAfter, label = 'recorded details' }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 5;
  const query = search.trim().toLowerCase();
  const filtered = groups.filter(group => !query || `${group.title} ${group.fields.map(field =>
    `${field.label} ${field.before} ${field.after}`).join(' ')}`.toLowerCase().includes(query));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const start = currentPage * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const compare = hasBefore && hasAfter;

  return <div className="audit-record-collection">
    {groups.length > pageSize && <label className="audit-record-search">
      <span>Find a learner or record</span>
      <input type="search" aria-label={`Search ${label}`} placeholder="Search name or value..." value={search}
        onChange={event => { setSearch(event.target.value); setPage(0); }} />
    </label>}
    <div className="audit-change-groups">
      {visible.map(group => <section className="audit-change-group" key={group.id}>
        {group.title && <h4>{group.title}</h4>}
        <dl className={`audit-change-list${compare ? ' audit-change-list--comparison' : ''}`}>
          {group.fields.map(field => <div key={field.id} className={`audit-change-field${Math.max(field.before.length, field.after.length) > (compare ? 18 : 70) ? ' audit-change-field--wide' : ''}`}>
            <dt>{field.label}</dt>
            {compare ? <dd className="audit-change-comparison">
              <span><small className="audit-change-state audit-change-state--before">Before</small><span className="audit-change-value">{field.before}</span></span>
              <span><small className="audit-change-state audit-change-state--after">After</small><span className="audit-change-value">{field.after}</span></span>
            </dd> : <dd>{hasAfter ? field.after : field.before}</dd>}
          </div>)}
        </dl>
      </section>)}
      {!filtered.length && <p className="audit-change-empty">No matching records.</p>}
    </div>
    {groups.length > pageSize && <nav className="audit-record-pagination" aria-label={`${label} pages`}>
      <span aria-live="polite">{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)}` : '0'} of {filtered.length} records</span>
      <div>
        <button type="button" aria-label={`Previous ${label}`} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <button type="button" aria-label={`Next ${label}`} disabled={start + pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </nav>}
  </div>;
}

export default function AuditEventDrawer({ event, onClose }) {
  if (!event) return null;
  return <AuditEventDrawerContent event={event} onClose={onClose} />;
}

const DEFAULT_WIDTH = 460;

function AuditEventDrawerContent({ event, onClose }) {
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_WIDTH);
  const drag = useRef(null);
  const widthLimits = () => {
    const min = Math.min(DEFAULT_WIDTH, window.innerWidth);
    return { min, max: Math.max(min, window.innerWidth - 32) };
  };
  const clampWidth = width => {
    const { min, max } = widthLimits();
    return Math.min(max, Math.max(min, width));
  };
  const onResizeStart = pointerEvent => {
    if (pointerEvent.button !== 0) return;
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    drag.current = { pointerId: pointerEvent.pointerId, x: pointerEvent.clientX, width: pointerEvent.currentTarget.parentElement.getBoundingClientRect().width };
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  };
  const onResizeMove = pointerEvent => {
    if (drag.current?.pointerId !== pointerEvent.pointerId) return;
    setDrawerWidth(clampWidth(drag.current.width + drag.current.x - pointerEvent.clientX));
  };
  const onResizeEnd = pointerEvent => {
    if (drag.current?.pointerId === pointerEvent.pointerId) drag.current = null;
  };
  const onResizeKey = keyboardEvent => {
    const { min, max } = widthLimits();
    const next = { ArrowLeft: drawerWidth + 32, ArrowRight: drawerWidth - 32, Home: min, End: max }[keyboardEvent.key];
    if (next === undefined) return;
    keyboardEvent.preventDefault();
    setDrawerWidth(clampWidth(next));
  };

  const getSectionId = value => {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value.section_id ?? value.sectionId ?? null;
  };
  const sectionId = event.metadata?.section_id
    ?? getSectionId(event.afterData ?? event.after_data)
    ?? getSectionId(event.beforeData ?? event.before_data);
  const changes = getAuditChangeGroups(event);
  const isSubmission = ['GRADE_SHEET_SUBMITTED', 'GRADE_SHEET_CORRECTION_RESUBMITTED'].includes(event.eventType);
  let savedAfter = event.afterData ?? event.after_data;
  if (typeof savedAfter === 'string') {
    try { savedAfter = JSON.parse(savedAfter); } catch { savedAfter = null; }
  }
  const submittedGrades = isSubmission && Array.isArray(savedAfter?.grades) ? savedAfter.grades : [];
  const submittedGradeGroups = submittedGrades.length
    ? getAuditChangeGroups({ eventType: event.eventType, module: event.module, afterData: { grades: submittedGrades } }).groups
    : [];
  const displayGroups = changes.groups.filter(group =>
    !(submittedGradeGroups.length && group.id.startsWith('/grades/')) &&
    !(event.eventType === 'GRADE_ACTIVITY_DELETED' && (group.id === '/scores' || group.id.startsWith('/scores/'))));
  const occurredAt = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.occurredAt));
  const actingAs = event.actingAs && event.actingAs.toLowerCase() !== event.actorRole.toLowerCase()
    ? event.actingAs : null;
  const recordRows = [
    ['Affected record', event.target || event.entityType],
    ['Event', event.eventLabel],
    ['Module', event.module],
    ...(event.recordedModule && event.recordedModule !== event.module ? [['Target:', event.recordedModule]] : []),
    ...(event.section ? [['Section', event.section]] : []),
    ...(event.subject ? [['Subject', event.subject]] : []),
    ...(event.metadata?.attendance_scope ? [['Attendance scope', formatAuditValue(event.metadata.attendance_scope, 'attendance_scope')]] : []),
    ['Record ID', event.entityId || 'Not applicable'],
    ...(sectionId != null ? [['Section ID', sectionId]] : []),
    ...(event.metadata?.requester ? [['Requested by', event.metadata.requester]] : []),
    ...(event.metadata?.inherited_from ? [['Inherited from', event.metadata.inherited_from]] : []),
  ];
  const timeRows = [
    ['Occurred', occurredAt],
    ...(event.metadata?.attendance_date ? [['Attendance date', formatAuditValue(event.metadata.attendance_date, 'attendance_date')]] : []),
    ['School year', event.schoolYear || 'System-wide'],
    ...(event.term ? [['Term', event.term]] : []),
    ...(event.metadata?.expires_at ? [['Editing access ends', formatAuditValue(event.metadata.expires_at, 'expires_at')]] : []),
  ];

  return (
    <div className="audit-drawer-overlay" onMouseDown={onClose}>
      <aside
        className="audit-drawer"
        style={{ width: `min(${drawerWidth}px, 100%)` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-drawer-title"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <div className="audit-drawer__resize" role="separator" tabIndex={0}
          aria-label="Resize audit details drawer" aria-orientation="vertical"
          aria-valuemin={Math.min(DEFAULT_WIDTH, window.innerWidth)}
          aria-valuemax={widthLimits().max} aria-valuenow={Math.round(Math.min(drawerWidth, window.innerWidth))}
          onPointerDown={onResizeStart} onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd} onLostPointerCapture={onResizeEnd}
          onKeyDown={onResizeKey} onDoubleClick={() => setDrawerWidth(DEFAULT_WIDTH)} />
        <header className="audit-drawer__header">
          <div>
            <span className="audit-drawer__category">Audit Event</span>
            <h2 id="audit-drawer-title">Event Details</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close audit details">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="audit-drawer__body">
          <section className="audit-event-summary audit-actor-summary" aria-label="Responsible user">
            <span className="audit-event-summary__icon"><UserRound size={21} aria-hidden="true" /></span>
            <div><h3>{event.actorName}</h3><p className="audit-actor-role">{event.actorRole}</p>
              {actingAs && <p className="audit-drawer__acting-as">Acting as: {actingAs}</p>}
            </div>
          </section>

          <section className="audit-drawer__section audit-timeline-section audit-timeline-section--what" aria-label="What was affected">
            <h3>What</h3>
            <DetailRows rows={recordRows} />
          </section>

          <section className="audit-drawer__section audit-timeline-section audit-timeline-section--when" aria-label="When it happened">
            <h3>When</h3>
            <DetailRows rows={timeRows} />
          </section>

          <section className="audit-drawer__section audit-timeline-section audit-timeline-section--activity">
            <h3>Activity</h3>
            <p>{event.summary}</p>
            {event.metadata?.reason && <div className="audit-activity-note">
              <h4>Recorded reason</h4>
              <p>{event.metadata.reason}</p>
            </div>}
            {event.metadata?.admin_note && <div className="audit-activity-note">
              <h4>Administrator’s note</h4><p>{event.metadata.admin_note}</p>
            </div>}
          </section>

          <section className="audit-drawer__section audit-timeline-section audit-timeline-section--changes" aria-label="Recorded audit details">
            <h3>{changes.heading}</h3>
            {!displayGroups.length ? (
              <p className="audit-change-empty">{/^USER_PASSWORD_/.test(event.eventType || '')
                ? 'Password values are not recorded in audit history.'
                : submittedGradeGroups.length ? 'The recorded submitted grades are available below.'
                : changes.hasBefore || changes.hasAfter
                ? 'This event has no saved field-level differences.'
                : 'This event does not include before-and-after details.'}</p>
            ) : (
              <>
                {(!changes.hasBefore || !changes.hasAfter) && <p className="audit-change-note">
                  {changes.hasAfter ? 'Only the recorded values are available for this event.' : 'Only the previous values are available for this event.'}
                </p>}
                <ChangeGroups key={`${event.id}:changes`} groups={displayGroups} hasBefore={changes.hasBefore} hasAfter={changes.hasAfter} />
              </>
            )}
            {submittedGradeGroups.length > 0 && <details className="audit-submitted-grades">
              <summary>View submitted grades ({submittedGrades.length})</summary>
              <ChangeGroups key={`${event.id}:submitted`} groups={submittedGradeGroups} hasBefore={false} hasAfter label="submitted grades" />
            </details>}
          </section>
        </div>
      </aside>
    </div>
  );
}
