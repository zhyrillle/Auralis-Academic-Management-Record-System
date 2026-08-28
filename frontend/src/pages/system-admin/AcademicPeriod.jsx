import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  ChevronDown,
  CircleAlert,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  Settings2,
} from "lucide-react";
import Toast from "../../components/common/Toast";
import {
  approveReopeningRequest,
  denyReopeningRequest,
  getGradingPeriodContext,
} from "../../services/gradingPeriodService";
import ReopeningActivityDrawer from "./academic-period/ReopeningActivityDrawer";
import ReviewRequestDrawer from "./academic-period/ReviewRequestDrawer";
import GradingPeriodOverview from "./academic-period/overview/GradingPeriodOverview";
import GradingPeriodOverviewSkeleton from "./academic-period/overview/GradingPeriodOverviewSkeleton";
import GradingPeriodSettings from "./academic-period/timeline/GradingPeriodSettings";
import GradingPeriodTimelineSkeleton from "./academic-period/timeline/GradingPeriodTimelineSkeleton";
import "../../styles/AcademicPeriod.css";

function ContentLoadingFrame({ loadingMode, pendingLabel, children }) {
  const isYearChanging = loadingMode === "year-change";
  const isBackgroundLoading = loadingMode === "background";
  const isBusy = isYearChanging || isBackgroundLoading;

  return (
    <div
      className={`grade-lock-content-frame ${
        isYearChanging ? "grade-lock-content-frame--year-change" : ""
      } ${
        isBackgroundLoading ? "grade-lock-content-frame--background" : ""
      }`}
      aria-busy={isBusy}
    >
      {isYearChanging && (
        <div className="grade-lock-year-change-overlay" role="status">
          <LoaderCircle size={20} aria-hidden="true" />
          <span>Loading {pendingLabel || "school year"}</span>
        </div>
      )}
      {isBackgroundLoading && (
        <span className="grade-lock-sr-only" role="status" aria-live="polite">
          Refreshing academic period data.
        </span>
      )}
      {children}
    </div>
  );
}

export default function AcademicPeriod({ user }) {
  const userId = user?.user_id;

  // Shared page navigation and school-year context
  const [activeView, setActiveView] = useState("overview");
  const [schoolYears, setSchoolYears] = useState([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [isSchoolYearMenuOpen, setIsSchoolYearMenuOpen] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [terms, setTerms] = useState([]);
  const [departmentsByTerm, setDepartmentsByTerm] = useState({});
  const [reopeningRequests, setReopeningRequests] = useState([]);
  const [activeReopenings, setActiveReopenings] = useState([]);
  const [upcomingSchoolYear, setUpcomingSchoolYear] = useState(null);
  const [upcomingPeriods, setUpcomingPeriods] = useState([]);
  const [suggestedUpcomingPeriods, setSuggestedUpcomingPeriods] = useState([]);

  // Shared request, feedback, and surface state
  const [loadingMode, setLoadingMode] = useState("initial");
  const [pendingSchoolYearLabel, setPendingSchoolYearLabel] = useState("");
  const [pageError, setPageError] = useState("");
  const [reviewRequestId, setReviewRequestId] = useState(null);
  const [activityReopeningId, setActivityReopeningId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVariant, setToastVariant] = useState("success");

  const schoolYearMenuRef = useRef(null);
  const selectedTermIdRef = useRef(null);

  const showToast = useCallback((message, variant = "success") => {
    setToastVariant(variant);
    setToastMessage(message || "The request could not be completed.");
  }, []);

  // Loads one school year's complete Academic Period context atomically.
  const loadContext = useCallback(
    async (
      schoolYearId,
      { mode = "background", pendingLabel = "" } = {},
    ) => {
      if (!userId) {
        setPageError("A signed-in user is required to load Academic Period data.");
        setLoadingMode("idle");
        return;
      }

      setLoadingMode(mode);
      setPendingSchoolYearLabel(mode === "year-change" ? pendingLabel : "");
      setPageError("");

      try {
        const context = await getGradingPeriodContext(userId, schoolYearId);
        setSchoolYears(context.schoolYears);
        setSelectedSchoolYearId(context.selectedSchoolYearId);
        setTerms(context.terms);
        setDepartmentsByTerm(context.departmentsByTerm);
        setReopeningRequests(context.reopeningRequests);
        setActiveReopenings(context.activeReopenings);
        setUpcomingSchoolYear(context.upcomingSchoolYear);
        setUpcomingPeriods(context.upcomingPeriods);
        setSuggestedUpcomingPeriods(context.suggestedUpcomingPeriods);

        const currentTermId = context.terms.some(
          (term) => term.id === selectedTermIdRef.current,
        )
          ? selectedTermIdRef.current
          : context.terms[0]?.id || null;

        selectedTermIdRef.current = currentTermId;
        setSelectedTermId(currentTermId);
      } catch (error) {
        const message =
          error.message ||
          "Unable to load academic period data. Check the backend connection and try again.";

        if (mode === "initial") {
          setPageError(message);
        } else {
          showToast(message, "error");
        }
      } finally {
        setLoadingMode("idle");
        setPendingSchoolYearLabel("");
      }
    },
    [showToast, userId],
  );

  useEffect(() => {
    // The initial API synchronization intentionally populates page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadContext(undefined, { mode: "initial" });
  }, [loadContext]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const toastTimer = window.setTimeout(() => setToastMessage(""), 3500);
    return () => window.clearTimeout(toastTimer);
  }, [toastMessage]);

  useEffect(() => {
    if (!isSchoolYearMenuOpen) return undefined;

    const handleOutsidePointer = (event) => {
      if (!schoolYearMenuRef.current?.contains(event.target)) {
        setIsSchoolYearMenuOpen(false);
      }
    };
    const handleSchoolYearEscape = (event) => {
      if (event.key === "Escape") {
        setIsSchoolYearMenuOpen(false);
        schoolYearMenuRef.current?.querySelector("button")?.focus();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleSchoolYearEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleSchoolYearEscape);
    };
  }, [isSchoolYearMenuOpen]);

  const selectableSchoolYears = schoolYears.filter(
    (schoolYear) => schoolYear.status !== "upcoming",
  );
  const selectedSchoolYear =
    selectableSchoolYears.find(
      (schoolYear) => schoolYear.id === selectedSchoolYearId,
    ) ||
    selectableSchoolYears[0] || { id: "", label: "" };
  const isSelectedSchoolYearActive = ["active", "ongoing"].includes(
    selectedSchoolYear.status,
  );
  const selectedTerm =
    terms.find((term) => term.id === selectedTermId) || terms[0];
  const reviewedRequest = reopeningRequests.find(
    (request) => request.id === reviewRequestId,
  );
  const activityReopening = activeReopenings.find(
    (reopening) => reopening.id === activityReopeningId,
  );

  const handleSelectSchoolYear = (schoolYear) => {
    setIsSchoolYearMenuOpen(false);
    if (schoolYear.id === selectedSchoolYearId) return;

    loadContext(schoolYear.id, {
      mode: "year-change",
      pendingLabel: schoolYear.label,
    });
  };

  const handleSelectTerm = (termId) => {
    selectedTermIdRef.current = termId;
    setSelectedTermId(termId);
  };

  const handleChangeView = (nextView) => {
    setIsSchoolYearMenuOpen(false);
    setActiveView(nextView);
  };

  const handleViewTermTimeline = (termId) => {
    handleSelectTerm(termId);
    setIsSchoolYearMenuOpen(false);
    setActiveView("settings");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleApproveReopening = async (requestId, payload) => {
    try {
      await approveReopeningRequest(userId, requestId, payload);
      setReviewRequestId(null);
      showToast("Temporary reopening approved.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  const handleDenyRequest = async (requestId, payload) => {
    try {
      await denyReopeningRequest(userId, requestId, payload);
      setReviewRequestId(null);
      showToast("Reopening request denied.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  return (
    <div className="grade-lock-page">
      {/* Academic Period page header */}
      <header className="grade-lock-header">
        <div className="grade-lock-header__copy">
          <div className="grade-lock-eyebrow">
            <CalendarRange size={14} aria-hidden="true" />
            Academic timeline and submission governance
          </div>
          <h1>Academic Periods &amp; Deadlines</h1>
          <p>
            Configure the academic timeline, monitor submissions, and manage
            post-deadline corrections.
          </p>
        </div>

        <div className="grade-lock-header__controls" aria-label="Page controls">
          <span className="grade-lock-header__filter-label">School year</span>
          {loadingMode === "initial" ? (
            <div className="grade-lock-school-year-skeleton" aria-hidden="true" />
          ) : (
            <div
              className={`grade-lock-school-year ${
                isSchoolYearMenuOpen ? "grade-lock-school-year--open" : ""
              }`}
              ref={schoolYearMenuRef}
            >
              <button
                type="button"
                className="grade-lock-school-year__trigger"
                aria-label="Filter by school year"
                aria-haspopup="listbox"
                aria-expanded={isSchoolYearMenuOpen}
                aria-controls="grade-lock-school-year-options"
                disabled={loadingMode === "year-change"}
                onClick={() => setIsSchoolYearMenuOpen((isOpen) => !isOpen)}
              >
                <span>{selectedSchoolYear.label}</span>
                <ChevronDown
                  className="grade-lock-school-year__chevron"
                  size={17}
                  aria-hidden="true"
                />
              </button>

              <div
                id="grade-lock-school-year-options"
                className="grade-lock-school-year__menu"
                role="listbox"
                aria-label="School year options"
                aria-hidden={!isSchoolYearMenuOpen}
              >
                {selectableSchoolYears.map((schoolYear) => (
                  <button
                    type="button"
                    className="grade-lock-school-year__option"
                    key={schoolYear.id}
                    role="option"
                    aria-selected={schoolYear.id === selectedSchoolYearId}
                    tabIndex={isSchoolYearMenuOpen ? 0 : -1}
                    onClick={() => handleSelectSchoolYear(schoolYear)}
                  >
                    <span>{schoolYear.label}</span>
                    {schoolYear.id === selectedSchoolYearId && (
                      <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Page view switcher */}
      <div className="grade-lock-view-toolbar">
        <nav
          className="grade-lock-view-switcher"
          aria-label="Academic period page sections"
        >
          <button
            type="button"
            className={activeView === "overview" ? "is-active" : ""}
            aria-current={activeView === "overview" ? "page" : undefined}
            onClick={() => handleChangeView("overview")}
          >
            <LayoutDashboard size={17} aria-hidden="true" />
            Overview
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "is-active" : ""}
            aria-current={activeView === "settings" ? "page" : undefined}
            onClick={() => handleChangeView("settings")}
          >
            <Settings2 size={17} aria-hidden="true" />
            Timeline &amp; Settings
          </button>
        </nav>
      </div>

      {/* Active view content */}
      {loadingMode === "initial" ? (
        activeView === "settings" ? (
          <GradingPeriodTimelineSkeleton />
        ) : (
          <GradingPeriodOverviewSkeleton />
        )
      ) : pageError ? (
        <section
          className="grade-lock-feedback grade-lock-feedback--error"
          role="alert"
        >
          <CircleAlert size={24} aria-hidden="true" />
          <div>
            <h2>Academic periods are temporarily unavailable</h2>
            <p>{pageError}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              loadContext(selectedSchoolYearId || undefined, {
                mode: "initial",
              })
            }
          >
            <RefreshCw size={16} aria-hidden="true" />
            Retry
          </button>
        </section>
      ) : (
        <ContentLoadingFrame
          loadingMode={loadingMode}
          pendingLabel={pendingSchoolYearLabel}
        >
          {terms.length === 0 ? (
            <section className="grade-lock-feedback grade-lock-feedback--empty">
              <CalendarRange size={28} aria-hidden="true" />
              <div>
                <h2>No academic periods configured yet</h2>
                <p>
                  Configure the Term 1–3 dates and submission deadlines for this
                  school year in Timeline &amp; Settings.
                </p>
              </div>
              <button type="button" onClick={() => handleChangeView("settings")}>
                <Settings2 size={16} aria-hidden="true" />
                Open Timeline &amp; Settings
              </button>
            </section>
          ) : activeView === "overview" && selectedTerm ? (
            <GradingPeriodOverview
              terms={terms}
              selectedTermId={selectedTermId}
              schoolYearLabel={selectedSchoolYear.label}
              reopeningRequests={reopeningRequests}
              activeReopenings={activeReopenings}
              departmentsByTerm={departmentsByTerm}
              onSelectTerm={handleSelectTerm}
              onViewTermTimeline={handleViewTermTimeline}
              onReviewRequest={setReviewRequestId}
              onViewActivity={setActivityReopeningId}
            />
          ) : (
            <GradingPeriodSettings
              key={selectedSchoolYearId}
              userId={userId}
              schoolYearId={selectedSchoolYearId}
              schoolYearLabel={selectedSchoolYear.label}
              isReadOnly={!isSelectedSchoolYearActive}
              periods={terms}
              initialSelectedPeriodId={selectedTermId}
              upcomingSchoolYear={
                isSelectedSchoolYearActive ? upcomingSchoolYear : null
              }
              upcomingPeriods={
                isSelectedSchoolYearActive ? upcomingPeriods : []
              }
              suggestedUpcomingPeriods={
                isSelectedSchoolYearActive ? suggestedUpcomingPeriods : []
              }
              onRefresh={() => loadContext(selectedSchoolYearId)}
              onToast={showToast}
            />
          )}
        </ContentLoadingFrame>
      )}

      {/* Reopening request surfaces */}
      <ReviewRequestDrawer
        key={reviewedRequest?.id || "closed-review-request"}
        request={reviewedRequest}
        onClose={() => setReviewRequestId(null)}
        onDeny={handleDenyRequest}
        onApprove={handleApproveReopening}
      />

      <ReopeningActivityDrawer
        key={activityReopening?.id || "closed-activity-drawer"}
        userId={userId}
        reopening={activityReopening}
        onError={(message) => showToast(message, "error")}
        onClose={() => setActivityReopeningId(null)}
      />

      {/* Page feedback */}
      <Toast
        message={toastMessage}
        variant={toastVariant}
        icon={toastVariant === "error" ? CircleAlert : undefined}
        onDismiss={() => setToastMessage("")}
      />
    </div>
  );
}
