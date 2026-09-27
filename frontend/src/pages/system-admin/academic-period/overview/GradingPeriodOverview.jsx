import { useEffect, useRef, useState } from "react";
import { ClipboardList, RotateCcwKey } from "lucide-react";
import ReopeningManagement from "./ReopeningManagement";
import SubmissionStatus from "./SubmissionStatus";
import TermCardsSection from "./TermCardsSection";
import "../../../../styles/AcademicPeriodOverview.css";

const MANILA_TIMEZONE = "Asia/Manila";

function isTimestampExpired(timestamp, now) {
  if (!timestamp) return false;
  const timestampMs = new Date(timestamp).getTime();
  return Number.isFinite(timestampMs) && timestampMs <= now;
}

function formatClockTime(timestamp) {
  if (!timestamp) return "Not scheduled";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIMEZONE,
  }).format(new Date(timestamp));
}

export default function GradingPeriodOverview({
  terms,
  selectedTermId,
  schoolYearLabel,
  reopeningRequests,
  activeReopenings,
  departmentsByTerm,
  onSelectTerm,
  onViewTermTimeline,
  onReviewRequest,
  onViewActivity,
}) {
  const [operationsView, setOperationsView] = useState("submissions");
  const [reopeningTabRequest, setReopeningTabRequest] = useState({
    tab: "pending",
    version: 0,
  });
  const [now, setNow] = useState(() => Date.now());
  const reopeningSectionRef = useRef(null);

  useEffect(() => {
    if (activeReopenings.length === 0) return undefined;

    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clockTimer);
  }, [activeReopenings.length]);

  const selectedTerm =
    terms.find((term) => term.id === selectedTermId) || terms[0];
  const selectedDepartments = departmentsByTerm[selectedTermId] || [];
  const selectedTermRequests = reopeningRequests.filter(
    (request) =>
      request.termId === selectedTermId && request.status === "pending",
  );
  const currentActiveReopenings = activeReopenings.filter(
    (reopening) => !isTimestampExpired(reopening.reopenUntil, now),
  );
  const selectedTermReopenings = currentActiveReopenings.filter(
    (reopening) => reopening.termId === selectedTermId,
  );
  const nextActiveReopening = [...currentActiveReopenings].sort(
    (first, second) =>
      new Date(first.reopenUntil).getTime() -
      new Date(second.reopenUntil).getTime(),
  )[0];

  const openOperations = (termId, tab) => {
    onSelectTerm(termId);
    setOperationsView("reopenings");
    setReopeningTabRequest((currentRequest) => ({
      tab,
      version: currentRequest.version + 1,
    }));
    window.requestAnimationFrame(() => {
      reopeningSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      reopeningSectionRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSelectTerm = (termId) => {
    onSelectTerm(termId);
    setReopeningTabRequest((currentRequest) => ({
      tab: "pending",
      version: currentRequest.version + 1,
    }));
  };

  const handleManageReopenings = (termId) => {
    openOperations(termId, "pending");
  };

  const handleOpenActiveAccess = () => {
    if (!nextActiveReopening) return;
    openOperations(nextActiveReopening.termId, "active");
  };

  return (
    <div className="grade-lock-view grade-lock-view--overview">
      {/* Academic period cards */}
      <TermCardsSection
        terms={terms}
        selectedTermId={selectedTermId}
        schoolYearLabel={schoolYearLabel}
        reopeningRequests={reopeningRequests}
        activeReopenings={currentActiveReopenings}
        nextActiveAccessEndLabel={
          nextActiveReopening
            ? formatClockTime(nextActiveReopening.reopenUntil)
            : null
        }
        onSelectTerm={handleSelectTerm}
        onViewTermTimeline={onViewTermTimeline}
        onManageReopenings={handleManageReopenings}
        onOpenActiveAccess={handleOpenActiveAccess}
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
            <p>
              Review the selected term by submission progress or corrections.
            </p>
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
              onClick={() => setOperationsView("submissions")}
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
              onClick={() => setOperationsView("reopenings")}
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
                key={`${selectedTermId}-${reopeningTabRequest.version}`}
                term={selectedTerm}
                requests={selectedTermRequests}
                reopenings={selectedTermReopenings}
                initialTab={reopeningTabRequest.tab}
                now={now}
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
