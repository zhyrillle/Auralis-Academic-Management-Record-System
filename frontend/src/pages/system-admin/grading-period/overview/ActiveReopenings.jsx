import { ChevronRight, Clock3, Lock, RotateCcwKey } from "lucide-react";
import Badge from "../../../../components/common/Badge";
import EmptyState from "../../../../components/common/EmptyState";

const MANILA_TIMEZONE = "Asia/Manila";

function formatClockTime(timestamp) {
  if (!timestamp) return "Not scheduled";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIMEZONE,
  }).format(new Date(timestamp));
}

function formatRemainingTime(timestamp, now = Date.now()) {
  if (!timestamp) return "Not scheduled";

  const differenceMs = new Date(timestamp).getTime() - now;
  if (!Number.isFinite(differenceMs) || differenceMs <= 0) return "Expired";

  const totalMinutes = Math.ceil(differenceMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
}

function ActiveReopeningCard({ reopening, now, onViewActivity }) {
  const remainingTime = formatRemainingTime(reopening.reopenUntil, now);
  const autoLockTime = formatClockTime(reopening.reopenUntil);

  return (
    <button
      type="button"
      className="active-reopening"
      onClick={() => onViewActivity(reopening.id)}
      aria-label={`View reopening activity for ${reopening.subject}, ${reopening.gradeLevel} ${reopening.section}`}
    >
      <div className="active-reopening__identity">
        <div className="active-reopening__icon" aria-hidden="true">
          <RotateCcwKey size={20} />
        </div>
        <div>
          <Badge variant="temporary">Temporary Access</Badge>
          <h3>
            {reopening.subject} &mdash; {reopening.gradeLevel} {reopening.section}
          </h3>
          <p>Teacher: {reopening.teacherName}</p>
          <span>Reason: {reopening.reason}</span>
        </div>
      </div>

      <div className="active-reopening__timing">
        <div>
          <span>Expires in</span>
          <strong>
            <Clock3 size={16} aria-hidden="true" />
            {remainingTime}
          </strong>
        </div>
        <div>
          <span>Ends</span>
          <strong>{autoLockTime}</strong>
        </div>
      </div>

      <span className="active-reopening__open-indicator" aria-hidden="true">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}

export default function ActiveReopenings({
  term,
  reopenings,
  now,
  onViewActivity,
  sectionRef,
  embedded = false,
}) {
  return (
    <section
      className={`grade-lock-panel active-reopenings${embedded ? " active-reopenings--embedded" : ""}`}
      aria-labelledby={embedded ? undefined : "active-reopenings-title"}
      aria-label={embedded ? "Active temporary reopenings" : undefined}
      ref={sectionRef}
      tabIndex={embedded ? undefined : "-1"}
    >
      {!embedded && (
        <div className="grade-lock-panel__heading">
          <div>
            <h2 id="active-reopenings-title">Active Temporary Reopenings</h2>
            <p>
              Scoped editing exceptions; {term.label} remains {term.statusLabel}.
            </p>
          </div>
          <Badge variant="temporary">{reopenings.length} active</Badge>
        </div>
      )}

      {reopenings.length > 0 ? (
        <div className="active-reopening-list">
          {reopenings.map((reopening) => (
            <ActiveReopeningCard
              key={reopening.id}
              reopening={reopening}
              now={now}
              onViewActivity={onViewActivity}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          className="grade-lock-empty-state"
          icon={Lock}
          title="No active temporary access"
          description="Approved correction access for this academic period will appear here."
        />
      )}
    </section>
  );
}
