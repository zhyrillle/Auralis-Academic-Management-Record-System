import { Clock3, Inbox } from "lucide-react";
import Badge from "../../../../components/common/Badge";
import ActiveReopenings from "./ActiveReopenings";
import ReopeningRequests from "./ReopeningRequests";

export default function ReopeningManagement({
  term,
  requests,
  reopenings,
  activeTab,
  now,
  onTabChange,
  onReviewRequest,
  onViewActivity,
}) {
  return (
    <section
      className="grade-lock-panel reopening-management"
      aria-labelledby="reopening-management-title"
    >
      <div className="reopening-management__heading">
        <div>
          <h2 id="reopening-management-title">Reopening Management</h2>
          <p>Review and monitor scoped corrections for {term.label}.</p>
        </div>
        <Badge variant={reopenings.length > 0 ? "temporary" : "neutral"}>
          {requests.length + reopenings.length} items
        </Badge>
      </div>

      <div
        className="reopening-management__tabs"
        role="tablist"
        aria-label="Reopening management view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          aria-controls="pending-reopening-requests"
          className={activeTab === "pending" ? "is-active" : ""}
          onClick={() => onTabChange("pending")}
        >
          <Inbox size={16} aria-hidden="true" />
          Pending Requests
          <span>{requests.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "active"}
          aria-controls="active-reopening-access"
          className={activeTab === "active" ? "is-active" : ""}
          onClick={() => onTabChange("active")}
        >
          <Clock3 size={16} aria-hidden="true" />
          Active Access
          <span>{reopenings.length}</span>
        </button>
      </div>

      {activeTab === "pending" ? (
        <div id="pending-reopening-requests" role="tabpanel">
          <ReopeningRequests
            key={term.id}
            term={term}
            requests={requests}
            onReview={onReviewRequest}
            embedded
          />
        </div>
      ) : (
        <div id="active-reopening-access" role="tabpanel">
          <ActiveReopenings
            term={term}
            reopenings={reopenings}
            now={now}
            onViewActivity={onViewActivity}
            embedded
          />
        </div>
      )}
    </section>
  );
}
