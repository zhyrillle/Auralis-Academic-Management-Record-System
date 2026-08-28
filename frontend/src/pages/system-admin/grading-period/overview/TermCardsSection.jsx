import {
  ChevronRight,
  Clock3,
  FileClock,
  KeyRound,
} from "lucide-react";
import Badge from "../../../../components/common/Badge";
import ProgressBar from "../../../../components/common/ProgressBar";

function TermCard({
  term,
  isSelected,
  requestCount,
  activeCount,
  onSelect,
  onViewDetails,
  onManageReopenings,
}) {
  const handleCardClick = (event) => {
    if (event.target.closest?.("button")) return;
    onSelect(term.id);
  };

  const handleCardKeyDown = (event) => {
    if (
      event.target === event.currentTarget &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      onSelect(term.id);
    }
  };

  return (
    <article
      className={`term-card term-card--${term.status} ${
        isSelected ? "term-card--selected" : ""
      }`}
      aria-current={isSelected ? "true" : undefined}
      aria-label={`Select ${term.label}`}
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="term-card__top">
        <div>
          <div className="term-card__meta">
            <span className="term-card__period">{term.periodLabel}</span>
          </div>
          <h3>{term.label}</h3>
        </div>
        <Badge variant={term.status}>{term.statusLabel}</Badge>
      </div>

      {term.status !== "upcoming" && (
        <div className="term-card__progress-block">
          <div className="term-card__progress-label">
            <span>Submission Progress</span>
            <strong>{term.progress}%</strong>
          </div>
          <ProgressBar
            className="grade-lock-progress"
            value={term.progress}
            ariaLabel={`${term.label} submission progress`}
          />
        </div>
      )}

      <dl className="term-card__details">
        {term.status === "upcoming" ? (
          <>
            <div>
              <dt>Schedule</dt>
              <dd>
                {term.startDateLabel} &ndash; {term.endDateLabel}
              </dd>
            </div>
            <div>
              <dt>Deadline</dt>
              <dd>
                {term.deadlineDateLabel} &bull; {term.deadlineTimeLabel}
              </dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Deadline</dt>
              <dd>{term.deadlineDateLabel}</dd>
            </div>
            {term.status === "finalized" ? (
              <div>
                <dt>Finalized by</dt>
                <dd>{term.finalizedBy}</dd>
              </div>
            ) : (
              <div>
                <dt>Time Remaining</dt>
                <dd className="term-card__countdown">
                  {term.timeRemaining || "Schedule unavailable"}
                </dd>
              </div>
            )}
          </>
        )}
      </dl>

      {term.status === "finalized" && (
        <div className="term-card__reopening-summary">
          <span>
            <FileClock size={15} aria-hidden="true" />
            {requestCount} correction {requestCount === 1 ? "request" : "requests"}
          </span>
          <span>
            <KeyRound size={15} aria-hidden="true" />
            {activeCount} Temporary Access {activeCount === 1 ? "record" : "records"} active
          </span>
        </div>
      )}

      {term.status !== "finalized" && (
        <div className="term-card__actions">
          <button
            type="button"
            className={`grade-lock-button term-card__view-details ${
              term.status === "open"
                ? "grade-lock-button--primary"
                : "grade-lock-button--secondary"
            }`}
            onClick={() => onViewDetails(term.id)}
          >
            View Details
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {term.status === "finalized" && (
        <div className="term-card__actions">
          <button
            type="button"
            className="grade-lock-button grade-lock-button--primary"
            onClick={() => onManageReopenings(term.id)}
          >
            Manage Requests
          </button>
        </div>
      )}
    </article>
  );
}

export default function TermCardsSection({
  terms,
  selectedTermId,
  schoolYearLabel,
  reopeningRequests,
  activeReopenings,
  nextActiveAccessEndLabel,
  onSelectTerm,
  onViewTermTimeline,
  onManageReopenings,
  onOpenActiveAccess,
}) {
  const activeAccessCount = activeReopenings.length;

  return (
    <section className="grade-lock-section" aria-labelledby="terms-title">
      <div className="grade-lock-section__heading">
        <div>
          <h2 id="terms-title">Academic Periods</h2>
          <p>Select a period to view its submission and activity.</p>
        </div>
        <div className="grade-lock-section__heading-actions">
          <span className="grade-lock-section__context">{schoolYearLabel}</span>
          {activeAccessCount > 0 && (
            <button
              type="button"
              className="grade-lock-section__active-access"
              onClick={onOpenActiveAccess}
              aria-label={`${activeAccessCount} active temporary access ${
                activeAccessCount === 1 ? "session" : "sessions"
              }. Next access ends at ${nextActiveAccessEndLabel}. View Active Access.`}
            >
              <span
                className="grade-lock-section__active-access-icon"
                aria-hidden="true"
              >
                <Clock3 size={16} />
              </span>
              <span className="grade-lock-section__active-access-copy">
                <strong>{activeAccessCount} Active Access</strong>
                <small>Next ends {nextActiveAccessEndLabel}</small>
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="term-card-grid">
        {terms.map((term) => {
          const requestCount = reopeningRequests.filter(
            (request) =>
              request.termId === term.id && request.status === "pending",
          ).length;
          const activeCount = activeReopenings.filter(
            (reopening) => reopening.termId === term.id,
          ).length;

          return (
            <TermCard
              key={term.id}
              term={term}
              isSelected={term.id === selectedTermId}
              requestCount={requestCount}
              activeCount={activeCount}
              onSelect={onSelectTerm}
              onViewDetails={onViewTermTimeline}
              onManageReopenings={onManageReopenings}
            />
          );
        })}
      </div>
    </section>
  );
}
