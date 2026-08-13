import { AlertCircle, FileSearch } from "lucide-react";
import Badge from "../../../components/common/Badge";

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "Unknown date", time: "" };

  return {
    date: new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  };
};

export default function AuditEventTable({
  events,
  isLoading,
  error,
  onRetry,
  onSelect,
}) {
  const renderResults = () => {
    if (error) {
      return (
        <div className="admin-dashboard-state admin-dashboard-state--error">
          <AlertCircle size={20} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" onClick={onRetry}>Try Again</button>
        </div>
      );
    }

    if (!isLoading && events.length === 0) {
      return (
        <div className="admin-dashboard-state admin-dashboard-state--empty">
          <FileSearch size={26} aria-hidden="true" />
          <strong>No audit activity found</strong>
          <span>Try clearing the filters or check again later.</span>
        </div>
      );
    }

    return (
      <table className="audit-trail__table" aria-busy={isLoading}>
        <thead>
          <tr>
            <th scope="col">Date &amp; Time</th>
            <th scope="col">Actor</th>
            <th scope="col">Context</th>
            <th scope="col">Module</th>
            <th scope="col">Activity</th>
            <th scope="col">Impact</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="audit-row--skeleton" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, cellIndex) => (
                    <td key={cellIndex}><span /></td>
                  ))}
                </tr>
              ))
            : events.map((event) => {
                const timestamp = formatDateTime(event.occurredAt);
                return (
                  <tr
                    key={event.id}
                    className="audit-event-row"
                    tabIndex="0"
                    onClick={() => onSelect(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onSelect(event);
                      }
                    }}
                    aria-label={`View details for ${event.summary}`}
                  >
                    <td>
                      <span className="audit-trail__date">{timestamp.date}</span>
                      <span className="audit-trail__time">{timestamp.time}</span>
                    </td>
                    <td className="audit-trail__user">{event.actorName}</td>
                    <td>
                      <span className="audit-trail__context">{event.actorRole}</span>
                      {event.actingAs && <small>{event.actingAs}</small>}
                    </td>
                    <td><Badge variant="module">{event.module}</Badge></td>
                    <td className="audit-trail__action">
                      <strong>{event.summary}</strong>
                      {event.target && <small>{event.target}</small>}
                    </td>
                    <td>
                      <Badge variant={event.impact.toLowerCase()}>{event.impact}</Badge>
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="audit-results">
      <div className="audit-trail__table-wrapper">
        {renderResults()}
      </div>
      <div className="audit-results__footer" aria-live="polite">
        {isLoading
          ? "Loading audit events…"
          : `${events.length} ${events.length === 1 ? "event" : "events"} shown`}
      </div>
    </div>
  );
}
