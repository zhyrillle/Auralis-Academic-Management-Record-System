import { ClipboardList, RotateCcwKey } from "lucide-react";
import ReopeningManagement from "./ReopeningManagement";
import SubmissionStatus from "./SubmissionStatus";
import TermCardsSection from "./TermCardsSection";

export default function GradingPeriodOverview({
  terms,
  selectedTermId,
  selectedTerm,
  schoolYearLabel,
  reopeningRequests,
  activeReopenings,
  selectedDepartments,
  selectedTermRequests,
  selectedTermReopenings,
  now,
  reopeningView,
  operationsView,
  reopeningSectionRef,
  nextActiveAccessEndLabel,
  onSelectTerm,
  onManageReopenings,
  onOpenActiveAccess,
  onReviewRequest,
  onViewActivity,
  onChangeReopeningView,
  onChangeOperationsView,
}) {
  return (
    <div className="grade-lock-view grade-lock-view--overview">
      {/* GRADING PERIOD CARDS */}
      <TermCardsSection
        terms={terms}
        selectedTermId={selectedTermId}
        schoolYearLabel={schoolYearLabel}
        reopeningRequests={reopeningRequests}
        activeReopenings={activeReopenings}
        nextActiveAccessEndLabel={nextActiveAccessEndLabel}
        onSelectTerm={onSelectTerm}
        onManageReopenings={onManageReopenings}
        onOpenActiveAccess={onOpenActiveAccess}
      />

      <section
        className="grading-operations-workspace"
        aria-labelledby="grading-operations-title"
        ref={reopeningSectionRef}
        tabIndex="-1"
      >
        <div className="grading-operations-workspace__heading">
          <div>
            <h2 id="grading-operations-title">Grading Operations</h2>
            <p>Review the selected term by submission progress or corrections.</p>
          </div>

          <nav
            className="grading-operations-nav"
            role="tablist"
            aria-label="Grading operations view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={operationsView === "submissions"}
              aria-controls="submission-status-panel"
              className={operationsView === "submissions" ? "is-active" : ""}
              onClick={() => onChangeOperationsView("submissions")}
            >
              <ClipboardList size={16} aria-hidden="true" />
              <span className="grading-operations-nav__label">
                Submission Status
                <small>{selectedDepartments.length} subjects</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={operationsView === "reopenings"}
              aria-controls="reopening-management-panel"
              className={operationsView === "reopenings" ? "is-active" : ""}
              onClick={() => onChangeOperationsView("reopenings")}
            >
              <RotateCcwKey size={16} aria-hidden="true" />
              <span className="grading-operations-nav__label">
                Reopening Management
                <small>
                  {selectedTermRequests.length + selectedTermReopenings.length}{" "}
                  corrections
                </small>
              </span>
            </button>
          </nav>
        </div>

        <div className="grading-operations-content">
          {operationsView === "submissions" ? (
            <div id="submission-status-panel" role="tabpanel">
              <SubmissionStatus
                term={selectedTerm}
                departments={selectedDepartments}
              />
            </div>
          ) : (
            <div id="reopening-management-panel" role="tabpanel">
              <ReopeningManagement
                term={selectedTerm}
                requests={selectedTermRequests}
                reopenings={selectedTermReopenings}
                activeTab={reopeningView}
                now={now}
                onTabChange={onChangeReopeningView}
                onReviewRequest={onReviewRequest}
                onViewActivity={onViewActivity}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
