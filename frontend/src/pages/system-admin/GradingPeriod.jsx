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
import GradingPeriodOverview from "./grading-period/overview/GradingPeriodOverview";
import GradingPeriodOverviewSkeleton from "./grading-period/overview/GradingPeriodOverviewSkeleton";
import GradingPeriodSettings from "./grading-period/timeline/GradingPeriodSettings";
import GradingPeriodTimelineSkeleton from "./grading-period/timeline/GradingPeriodTimelineSkeleton";
import ReopeningActivityDrawer from "./grading-period/ReopeningActivityDrawer";
import ReviewRequestDrawer from "./grading-period/ReviewRequestDrawer";
import {
  approveReopeningRequest,
  createTermTimeline,
  denyReopeningRequest,
  getGradingPeriodContext,
  getReopeningActivity,
  temporaryDurationOptions,
  updateTermTimeline,
} from "../../services/gradingPeriodService";
import "../../styles/GradingPeriod.css";

const MANILA_TIMEZONE = "Asia/Manila";

function formatClockTime(timestamp) {
  if (!timestamp) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIMEZONE,
  }).format(new Date(timestamp));
}

function isTimestampExpired(timestamp, now = Date.now()) {
  if (!timestamp) {
    return false;
  }

  const timestampMs = new Date(timestamp).getTime();
  return Number.isFinite(timestampMs) && timestampMs <= now;
}

const formatPeriodRange = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return "Schedule not set";
  }

  const formatShortDate = (dateValue) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateValue}T00:00:00Z`));

  return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`;
};

const createPeriodDraft = (period) => ({
  periodLabel: formatPeriodRange(period?.startDate, period?.endDate),
  label: period?.label || "",
  startDate: period?.startDate || "",
  endDate: period?.endDate || "",
  deadlineDate: period?.deadlineDate || "",
  deadlineTime: period?.deadlineTime || "23:59",
});

const toManilaTimestamp = (date, time = "00:00") =>
  date ? new Date(`${date}T${time}:00+08:00`).toISOString() : null;

const getDurationDetails = (
  durationValue,
  customDuration,
  customDurationUnit,
) => {
  const customDurationMultipliers = {
    minutes: 1,
    hours: 60,
    days: 1440,
  };
  const customDurationNumber = Number(customDuration);
  const customDurationMinutes =
    customDurationNumber * (customDurationMultipliers[customDurationUnit] || 1);
  const minutes =
    durationValue === "custom" ? customDurationMinutes : Number(durationValue);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 1440;
  const durationOption = temporaryDurationOptions.find(
    (option) => option.value === durationValue,
  );
  const reopenUntil = new Date(Date.now() + safeMinutes * 60 * 1000);

  return {
    minutes: safeMinutes,
    durationLabel:
      durationValue === "custom"
        ? `${customDurationNumber} ${
            customDurationNumber === 1
              ? customDurationUnit.replace(/s$/, "")
              : customDurationUnit
          }`
        : durationOption?.label || "24 hours",
    reopenUntil: reopenUntil.toISOString(),
  };
};

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
          Refreshing grading period data.
        </span>
      )}
      {children}
    </div>
  );
}

export default function GradingPeriod({ user }) {

  // Page view, grading-period, and automation state

  const [activeView, setActiveView] = useState("overview");
  const [operationsView, setOperationsView] = useState("submissions");
  const [reopeningView, setReopeningView] = useState("pending");
  const [schoolYears, setSchoolYears] = useState([]);
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState("");
  const [isSchoolYearMenuOpen, setIsSchoolYearMenuOpen] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [terms, setTerms] = useState([]);
  const [settingsPeriodId, setSettingsPeriodId] = useState(null);
  const [periodDraft, setPeriodDraft] = useState(() => createPeriodDraft());
  const [periodValidationMessage, setPeriodValidationMessage] = useState("");
  const [suggestedUpcomingPeriods, setSuggestedUpcomingPeriods] = useState([]);
  const [upcomingPeriods, setUpcomingPeriods] = useState([]);
  const [upcomingSchoolYear, setUpcomingSchoolYear] = useState(null);
  const [departmentsByTerm, setDepartmentsByTerm] = useState({});
  const [loadingMode, setLoadingMode] = useState("initial");
  const [pendingSchoolYearLabel, setPendingSchoolYearLabel] = useState("");
  const [pageError, setPageError] = useState("");

  // Reopening request and activity state

  const [reopeningRequests, setReopeningRequests] = useState([]);
  const [activeReopenings, setActiveReopenings] = useState([]);
  const [reopeningHistory, setReopeningHistory] = useState({});
  const [durationValue, setDurationValue] = useState("1440");
  const [customDurationMinutes, setCustomDurationMinutes] = useState("90");
  const [customDurationUnit, setCustomDurationUnit] = useState("minutes");
  const [adminNote, setAdminNote] = useState("");

  // Drawer, modal, and feedback state

  const [reviewRequestId, setReviewRequestId] = useState(null);
  const [activityReopeningId, setActivityReopeningId] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const reopeningSectionRef = useRef(null);
  const dialogSurfaceRef = useRef(null);
  const schoolYearMenuRef = useRef(null);
  const selectedTermIdRef = useRef(null);

  const loadContext = useCallback(async (
    schoolYearId,
    { mode = "background", pendingLabel = "" } = {},
  ) => {
    if (!user?.user_id) {
      setPageError("A signed-in user is required to load Grading Period data.");
      setLoadingMode("idle");
      return;
    }

    setLoadingMode(mode);
    setPendingSchoolYearLabel(mode === "year-change" ? pendingLabel : "");
    setPageError("");
    try {
      const context = await getGradingPeriodContext(user.user_id, schoolYearId);
      setSchoolYears(context.schoolYears);
      setSelectedSchoolYearId(context.selectedSchoolYearId);
      setTerms(context.terms);
      setDepartmentsByTerm(context.departmentsByTerm);
      setReopeningRequests(context.reopeningRequests);
      setActiveReopenings(context.activeReopenings);
      setUpcomingSchoolYear(context.upcomingSchoolYear);
      setUpcomingPeriods(context.upcomingPeriods);
      setSuggestedUpcomingPeriods(context.suggestedUpcomingPeriods);

      const currentTermId = context.terms.some((term) => term.id === selectedTermIdRef.current)
        ? selectedTermIdRef.current
        : context.terms[0]?.id || null;
      selectedTermIdRef.current = currentTermId;
      setSelectedTermId(currentTermId);
      setSettingsPeriodId((currentId) =>
        context.terms.some((term) => term.id === currentId)
          ? currentId
          : context.terms[0]?.id || null,
      );
      const settingsTerm = context.terms.find((term) => term.id === currentTermId)
        || context.terms[0];
      setPeriodDraft(createPeriodDraft(settingsTerm));
    } catch (error) {
      const message =
        error.message ||
        "Unable to load grading period data. Check the backend connection and try again.";
      if (mode === "initial") {
        setPageError(message);
      } else {
        setToastMessage(message);
      }
    } finally {
      setLoadingMode("idle");
      setPendingSchoolYearLabel("");
    }
  }, [user]);

  useEffect(() => {
    // The initial API synchronization intentionally populates page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadContext(undefined, { mode: "initial" });
  }, [loadContext]);

  const selectableSchoolYears = schoolYears.filter(
    (schoolYear) => schoolYear.status !== "upcoming",
  );
  const selectedSchoolYear =
    selectableSchoolYears.find(
      (schoolYear) => schoolYear.id === selectedSchoolYearId,
    ) || selectableSchoolYears[0] || { id: "", label: "" };
  const isSelectedSchoolYearActive = ["active", "ongoing"].includes(
    selectedSchoolYear.status,
  );
  const selectedTerm =
    terms.find((term) => term.id === selectedTermId) || terms[0];
  const selectedTermRequests = reopeningRequests.filter(
    (request) =>
      request.termId === selectedTermId && request.status === "pending",
  );
  const currentActiveReopenings = activeReopenings.filter(
    (reopening) => !isTimestampExpired(reopening.reopenUntil, now),
  );
  const nextActiveReopening = [...currentActiveReopenings].sort(
    (first, second) =>
      new Date(first.reopenUntil).getTime() -
      new Date(second.reopenUntil).getTime(),
  )[0];
  const selectedTermReopenings = currentActiveReopenings.filter(
    (reopening) => reopening.termId === selectedTermId,
  );
  const selectedDepartments = departmentsByTerm[selectedTermId] || [];
  const reviewedRequest = reopeningRequests.find(
    (request) => request.id === reviewRequestId,
  );
  const activityReopening = activeReopenings.find(
    (reopening) => reopening.id === activityReopeningId,
  );
  const settingsPeriod = terms.find((term) => term.id === settingsPeriodId);

  const hasOpenSurface = Boolean(
    reviewRequestId || activityReopeningId,
  );

  const closeAllSurfaces = useCallback(() => {
    setReviewRequestId(null);
    setActivityReopeningId(null);
  }, []);

  // Keeps modal and drawer interactions keyboard accessible
  useEffect(() => {
    if (!hasOpenSurface) {
      return undefined;
    }

    const previouslyFocusedElement = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      dialogSurfaceRef.current
        ?.querySelector(
          "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        )
        ?.focus();
    }, 0);

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeAllSurfaces();
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
      previouslyFocusedElement?.focus?.();
    };
  }, [closeAllSurfaces, hasOpenSurface]);

  // Clears lightweight toast feedback after a short delay
  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const toastTimer = window.setTimeout(() => setToastMessage(""), 3500);
    return () => window.clearTimeout(toastTimer);
  }, [toastMessage]);

  // Refreshes visible reopening countdowns without treating the client as authoritative
  useEffect(() => {
    if (activeReopenings.length === 0) {
      return undefined;
    }

    const clockTimer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clockTimer);
  }, [activeReopenings.length]);

  // Closes the school-year menu when focus moves outside the filter
  useEffect(() => {
    if (!isSchoolYearMenuOpen) {
      return undefined;
    }

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

  // Term selection and navigation handlers

  // Updates the currently selected academic term
  const handleSelectTerm = (termId) => {
    selectedTermIdRef.current = termId;
    setSelectedTermId(termId);
    setReopeningView("pending");
  };

  const handleManageReopenings = (termId) => {
    handleSelectTerm(termId);
    setOperationsView("reopenings");
    window.requestAnimationFrame(() => {
      reopeningSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      reopeningSectionRef.current?.focus({ preventScroll: true });
    });
  };

  const handleOpenActiveAccess = () => {
    if (!nextActiveReopening) return;

    setActiveView("overview");
    setSelectedTermId(nextActiveReopening.termId);
    setOperationsView("reopenings");
    setReopeningView("active");
    window.requestAnimationFrame(() => {
      reopeningSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      reopeningSectionRef.current?.focus({ preventScroll: true });
    });
  };

  // Reopening request handlers

  // Opens the selected reopening request for review
  const handleReviewRequest = (requestId) => {
    setDurationValue("1440");
    setCustomDurationMinutes("90");
    setCustomDurationUnit("minutes");
    setAdminNote("");
    setReviewRequestId(requestId);
  };

  // Approves temporary editing access for one grade submission
  const handleApproveReopening = async (requestId, duration) => {
    const request = reopeningRequests.find((item) => item.id === requestId);

    if (!request) {
      return;
    }

    const durationDetails = getDurationDetails(
      duration,
      customDurationMinutes,
      customDurationUnit,
    );
    try {
      await approveReopeningRequest(user.user_id, requestId, {
        duration_minutes: durationDetails.minutes,
        admin_note: adminNote.trim() || null,
      });
      setReviewRequestId(null);
      setToastMessage("Temporary reopening approved.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      setToastMessage(error.message);
    }
  };

  const handleDenyRequest = async (requestId) => {
    try {
      await denyReopeningRequest(user.user_id, requestId, {
        admin_note: adminNote.trim() || null,
      });
      setReviewRequestId(null);
      setToastMessage("Reopening request denied.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      setToastMessage(error.message);
    }
  };

  const handleViewActivity = async (reopeningId) => {
    setActivityReopeningId(reopeningId);
    if (reopeningHistory[reopeningId]) return;
    try {
      const events = await getReopeningActivity(user.user_id, reopeningId);
      setReopeningHistory((history) => ({ ...history, [reopeningId]: events }));
    } catch (error) {
      setToastMessage(error.message);
    }
  };

  // Page-state and academic timeline handlers

  const handleChangeView = (nextView) => {
    if (nextView === "settings") {
      const periodToEdit =
        terms.find((period) => period.id === settingsPeriodId) || terms[0];
      setSettingsPeriodId(periodToEdit?.id || null);
      setPeriodDraft(createPeriodDraft(periodToEdit));
      setPeriodValidationMessage("");
    }

    setIsSchoolYearMenuOpen(false);
    setActiveView(nextView);
  };

  const handleSelectSettingsPeriod = (periodId) => {
    const period = terms.find((item) => item.id === periodId);
    if (!period) return;

    setSettingsPeriodId(period.id);
    setPeriodDraft(createPeriodDraft(period));
    setPeriodValidationMessage("");
  };

  const handlePeriodDraftChange = (field, value) => {
    setPeriodDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
    setPeriodValidationMessage("");
  };

  const handleCancelPeriodEdit = () => {
    const fallbackPeriod =
      terms.find((period) => period.id === settingsPeriodId) || terms[0];
    setSettingsPeriodId(fallbackPeriod?.id || null);
    setPeriodDraft(createPeriodDraft(fallbackPeriod));
    setPeriodValidationMessage("");
  };

  const handleSavePeriod = async () => {
    if (!isSelectedSchoolYearActive) {
      setToastMessage("Completed school-year timelines are read-only.");
      return;
    }

    const trimmedLabel = periodDraft.label.trim();
    const requiredFields = [
      trimmedLabel,
      periodDraft.startDate,
      periodDraft.endDate,
      periodDraft.deadlineDate,
      periodDraft.deadlineTime,
    ];

    if (requiredFields.some((value) => !value)) {
      setPeriodValidationMessage("Complete every period and deadline field.");
      return;
    }

    if (periodDraft.startDate > periodDraft.endDate) {
      setPeriodValidationMessage("The end date must be after the start date.");
      return;
    }

    if (periodDraft.deadlineDate < periodDraft.startDate) {
      setPeriodValidationMessage(
        "The submission deadline cannot be before the period starts.",
      );
      return;
    }

    const periodToUpdate = terms.find(
      (period) => period.id === settingsPeriodId,
    );
    if (!periodToUpdate || periodToUpdate.status === "finalized") return;

    try {
      const timelinePayload = {
        term_name: trimmedLabel,
        starts_at: toManilaTimestamp(periodDraft.startDate),
        ends_at: toManilaTimestamp(periodDraft.endDate, "23:59"),
        grade_submission_deadline_at: toManilaTimestamp(
          periodDraft.deadlineDate,
          periodDraft.deadlineTime,
        ),
      };
      if (periodToUpdate.isConfigured) {
        await updateTermTimeline(user.user_id, settingsPeriodId, timelinePayload);
      } else {
        await createTermTimeline(user.user_id, {
          ...timelinePayload,
          school_year_id: selectedSchoolYearId,
        });
      }
      setToastMessage("Grading period updated.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      setPeriodValidationMessage(error.message);
    }
  };

  const handleSaveUpcomingPeriods = async (nextPeriods) => {
    if (!isSelectedSchoolYearActive) {
      setToastMessage(
        "Upcoming timelines can only be edited from the current school year.",
      );
      return;
    }

    if (!upcomingSchoolYear) {
      setToastMessage("No upcoming school year is available to configure.");
      return;
    }

    try {
      await Promise.all(nextPeriods.map((period) => {
        const timelinePayload = {
          term_name: period.label,
          starts_at: toManilaTimestamp(period.startDate),
          ends_at: toManilaTimestamp(period.endDate, "23:59"),
          grade_submission_deadline_at: toManilaTimestamp(period.deadlineDate, period.deadlineTime),
        };
        return period.isConfigured
          ? updateTermTimeline(user.user_id, period.id, timelinePayload)
          : createTermTimeline(user.user_id, {
              ...timelinePayload,
              school_year_id: upcomingSchoolYear.id,
            });
      }));
      setToastMessage("Upcoming school year timeline updated.");
      await loadContext(selectedSchoolYearId);
    } catch (error) {
      setToastMessage(error.message);
    }
  };

  return (
    <div className="grade-lock-page">
      {/* GRADING PERIOD PAGE HEADER */}
      <header className="grade-lock-header">
        <div className="grade-lock-header__copy">
          <div className="grade-lock-eyebrow">
            <CalendarRange size={14} aria-hidden="true" />
            Academic timeline and submission governance
          </div>
          <h1>Grading Periods &amp; Deadlines</h1>
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
              onClick={() =>
                setIsSchoolYearMenuOpen((isMenuOpen) => !isMenuOpen)
              }
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
                  onClick={() => {
                    setIsSchoolYearMenuOpen(false);
                    if (schoolYear.id === selectedSchoolYearId) return;
                    loadContext(schoolYear.id, {
                      mode: "year-change",
                      pendingLabel: schoolYear.label,
                    });
                  }}
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

      {/* PAGE VIEW SWITCHER */}
      <div className="grade-lock-view-toolbar">
        <nav
          className="grade-lock-view-switcher"
          aria-label="Grading period page sections"
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

      {loadingMode === "initial" ? (
        activeView === "settings" ? (
          <GradingPeriodTimelineSkeleton />
        ) : (
          <GradingPeriodOverviewSkeleton />
        )
      ) : pageError ? (
        <section className="grade-lock-feedback grade-lock-feedback--error" role="alert">
          <CircleAlert size={24} aria-hidden="true" />
          <div>
            <h2>Grading periods are temporarily unavailable</h2>
            <p>{pageError}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              loadContext(selectedSchoolYearId || undefined, { mode: "initial" })
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
                <h2>No grading periods configured yet</h2>
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
              selectedTerm={selectedTerm}
              schoolYearLabel={selectedSchoolYear.label}
              reopeningRequests={reopeningRequests}
              activeReopenings={currentActiveReopenings}
              selectedDepartments={selectedDepartments}
              selectedTermRequests={selectedTermRequests}
              selectedTermReopenings={selectedTermReopenings}
              now={now}
              reopeningView={reopeningView}
              operationsView={operationsView}
              reopeningSectionRef={reopeningSectionRef}
              nextActiveAccessEndLabel={
                nextActiveReopening
                  ? formatClockTime(nextActiveReopening.reopenUntil)
                  : null
              }
              onSelectTerm={handleSelectTerm}
              onManageReopenings={handleManageReopenings}
              onOpenActiveAccess={handleOpenActiveAccess}
              onReviewRequest={handleReviewRequest}
              onViewActivity={handleViewActivity}
              onChangeReopeningView={setReopeningView}
              onChangeOperationsView={setOperationsView}
            />
          ) : settingsPeriod ? (
            <GradingPeriodSettings
              schoolYearLabel={selectedSchoolYear.label}
              isReadOnly={!isSelectedSchoolYearActive}
              periods={terms}
              selectedPeriod={settingsPeriod}
              periodDraft={periodDraft}
              validationMessage={periodValidationMessage}
              onSelectPeriod={handleSelectSettingsPeriod}
              onPeriodDraftChange={handlePeriodDraftChange}
              onSavePeriod={handleSavePeriod}
              onCancelPeriodEdit={handleCancelPeriodEdit}
              upcomingSchoolYear={
                isSelectedSchoolYearActive ? upcomingSchoolYear : null
              }
              upcomingPeriods={
                isSelectedSchoolYearActive ? upcomingPeriods : []
              }
              suggestedUpcomingPeriods={
                isSelectedSchoolYearActive ? suggestedUpcomingPeriods : []
              }
              onSaveUpcomingPeriods={handleSaveUpcomingPeriods}
            />
          ) : null}
        </ContentLoadingFrame>
      )}

      {/* REVIEW REQUEST DRAWER */}
      <ReviewRequestDrawer
        request={reviewedRequest}
        durationOptions={temporaryDurationOptions}
        durationValue={durationValue}
        customDurationMinutes={customDurationMinutes}
        customDurationUnit={customDurationUnit}
        adminNote={adminNote}
        surfaceRef={dialogSurfaceRef}
        onDurationChange={setDurationValue}
        onCustomDurationChange={setCustomDurationMinutes}
        onCustomDurationUnitChange={(unit) => {
          setCustomDurationUnit(unit);
          setCustomDurationMinutes(
            unit === "minutes" ? "90" : unit === "hours" ? "2" : "1",
          );
        }}
        onAdminNoteChange={setAdminNote}
        onClose={() => setReviewRequestId(null)}
        onDeny={handleDenyRequest}
        onApprove={handleApproveReopening}
      />

      {/* REOPENING ACTIVITY DRAWER */}
      <ReopeningActivityDrawer
        reopening={activityReopening}
        events={
          activityReopening ? reopeningHistory[activityReopening.id] || [] : []
        }
        surfaceRef={dialogSurfaceRef}
        onClose={() => setActivityReopeningId(null)}
      />

      {/* SUCCESS TOAST */}
      <Toast
        message={toastMessage}
        onDismiss={() => setToastMessage("")}
      />
    </div>
  );
}

