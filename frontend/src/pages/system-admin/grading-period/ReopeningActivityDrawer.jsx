import { Check, Clock3, X } from "lucide-react";
import Badge from "../../../components/common/Badge";
import "../../../styles/ReopeningActivityDrawer.css";

const MANILA_TIMEZONE = "Asia/Manila";

function formatAccessExpiration(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp || "Not scheduled";
  }

  const formattedDate = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIMEZONE,
  }).format(date);

  return `${formattedDate} PHT`;
}

export default function ReopeningActivityDrawer({
  reopening,
  events,
  surfaceRef,
  onClose,
}) {
  if (!reopening) {
    return null;
  }

  return (
    <div className="grade-lock-overlay" role="presentation">
      <aside
        className="grade-lock-drawer grade-lock-drawer--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-drawer-title"
        ref={surfaceRef}
      >
        <div className="grade-lock-surface__header">
          <h2 id="activity-drawer-title">Reopening Activity</h2>
          <button
            type="button"
            className="grade-lock-icon-button"
            onClick={onClose}
            aria-label="Close activity"
          >
            <X size={19} />
          </button>
        </div>

        <div className="grade-lock-drawer__body">
          <div className="activity-summary">
            <div className="activity-summary__identity">
              <Badge variant="temporary" className="activity-summary__badge">
                Temporary Access
              </Badge>
              <h3>
                {reopening.subject} &mdash; {reopening.gradeLevel}{" "}
                {reopening.section}
              </h3>
              <div className="activity-summary__teacher">
                <span>Subject teacher</span>
                <p>{reopening.teacherName}</p>
              </div>
            </div>
            <span className="activity-summary__separator" aria-hidden="true" />
            <dl className="activity-summary__details">
              <div>
                <dt>Authorized by</dt>
                <dd>{reopening.approvedBy}</dd>
              </div>
              <div>
                <dt>Access duration</dt>
                <dd>{reopening.durationLabel}</dd>
              </div>
            </dl>
          </div>

          <section className="reopening-progress" aria-labelledby="correction-progress-title">
            <div className="reopening-progress__heading">
              <h3 id="correction-progress-title">Progress</h3>
            </div>

            <ol className="reopening-timeline">
              {events.map((event, index) => (
                <li
                  key={event.id}
                  className={`reopening-timeline__item reopening-timeline__item--${event.state}`}
                  aria-current={event.state === "current" ? "step" : undefined}
                >
                  <span className="reopening-timeline__marker" aria-hidden="true">
                    {event.state === "complete" ? <Check size={13} strokeWidth={3} /> : index + 1}
                  </span>
                  <div className="reopening-timeline__content">
                    <div className="reopening-timeline__title-row">
                      <strong>{event.label}</strong>
                      <span className="reopening-timeline__time">{event.time}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="reopening-access-deadline">
            <span className="reopening-access-deadline__icon" aria-hidden="true">
              <Clock3 size={18} />
            </span>
            <div>
              <span>Editing access expires</span>
              <strong>{formatAccessExpiration(reopening.reopenUntil)}</strong>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
