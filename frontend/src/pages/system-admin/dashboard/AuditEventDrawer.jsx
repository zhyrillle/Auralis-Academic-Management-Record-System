import { X } from "lucide-react";

const formatValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const formatField = (value) =>
  String(value)
    .split(/[_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const getChanges = (beforeData, afterData) => {
  const fields = new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {}),
  ]);

  return Array.from(fields)
    .filter((field) => formatValue(beforeData?.[field]) !== formatValue(afterData?.[field]))
    .map((field) => ({
      field,
      before: formatValue(beforeData?.[field]),
      after: formatValue(afterData?.[field]),
    }));
};

export default function AuditEventDrawer({ event, onClose }) {
  if (!event) return null;

  const changes = getChanges(event.beforeData, event.afterData);
  const occurredAt = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.occurredAt));

  return (
    <div className="audit-drawer-overlay" onMouseDown={onClose}>
      <aside
        className="audit-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-drawer-title"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <header className="audit-drawer__header">
          <div>
            <span>Audit Event</span>
            <h2 id="audit-drawer-title">Event Details</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close audit details">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="audit-drawer__body">
          <section className="audit-detail-grid">
            <div><span>Event</span><strong>{event.eventLabel}</strong></div>
            <div><span>Occurred</span><strong>{occurredAt}</strong></div>
            <div><span>Actor</span><strong>{event.actorName}</strong></div>
            <div><span>Context</span><strong>{event.actingAs || event.actorRole}</strong></div>
            <div><span>Module</span><strong>{event.module}</strong></div>
            <div><span>Target</span><strong>{event.target || event.entityType}</strong></div>
            <div><span>School Year</span><strong>{event.schoolYear || "System-wide"}</strong></div>
            <div><span>Record ID</span><strong>{event.entityId || "Not applicable"}</strong></div>
            {event.term && <div><span>Term</span><strong>{event.term}</strong></div>}
            {event.subject && <div><span>Subject</span><strong>{event.subject}</strong></div>}
            {event.section && <div><span>Section</span><strong>{event.section}</strong></div>}
          </section>

          <section className="audit-drawer__section">
            <h3>Activity</h3>
            <p>{event.summary}</p>
          </section>

          {event.metadata?.reason && (
            <section className="audit-drawer__section">
              <h3>Recorded Reason</h3>
              <p>{event.metadata.reason}</p>
            </section>
          )}

          {changes.length > 0 && (
            <section className="audit-drawer__section">
              <h3>Changes</h3>
              <div className="audit-change-list">
                {changes.map((change) => (
                  <div key={change.field}>
                    <strong>{formatField(change.field)}</strong>
                    <span>{change.before}</span>
                    <span aria-hidden="true">→</span>
                    <span>{change.after}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
