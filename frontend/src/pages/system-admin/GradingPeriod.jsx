import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  Check,
  ChevronDown,
  LayoutDashboard,
  Settings2,
} from "lucide-react";
import Toast from "../../components/common/Toast";
import GradingPeriodOverview from "./grading-period/overview/GradingPeriodOverview";
import GradingPeriodSettings from "./grading-period/settings/GradingPeriodSettings";
import ReopeningActivityDrawer from "./grading-period/ReopeningActivityDrawer";
import ReviewRequestDrawer from "./grading-period/ReviewRequestDrawer";
import {
  gradeLockData,
  temporaryDurationOptions,
} from "../../data/gradeLockData";
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

const formatDateLabel = (dateValue) => {
  if (!dateValue) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateValue}T00:00:00Z`));
};

const formatTimeLabel = (timeValue) => {
  if (!timeValue) {
    return "";
  }

  const [hours, minutes] = timeValue.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2025, 0, 1, hours, minutes));
};

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

const shiftDateByOneYear = (dateValue) => {
  if (!dateValue) return "";

  const [year, month, day] = dateValue.split("-").map(Number);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year + 1, month, 0),
  ).getUTCDate();
  const safeDay = Math.min(day, lastDayOfTargetMonth);

  return `${year + 1}-${String(month).padStart(2, "0")}-${String(
    safeDay,
  ).padStart(2, "0")}`;
};

const createInheritedUpcomingPeriods = (periods) =>
  periods.map((period) => {
    const startDate = shiftDateByOneYear(period.startDate);
    const endDate = shiftDateByOneYear(period.endDate);
    const deadlineDate = shiftDateByOneYear(period.deadlineDate);

    return {
      ...period,
      id: `upcoming-${period.id}`,
      sourcePeriodId: period.id,
      status: "upcoming",
      statusLabel: "Upcoming",
      progress: 0,
      startDate,
      startDateLabel: formatDateLabel(startDate),
      endDate,
      endDateLabel: formatDateLabel(endDate),
      deadlineDate,
      deadlineDateLabel: formatDateLabel(deadlineDate),
      periodLabel: formatPeriodRange(startDate, endDate),
      hasGradeSheets: false,
      canEditStructure: true,
      canEditDeadline: true,
    };
  });

const createPeriodDraft = (period) => ({
  label: period?.label || "",
  startDate: period?.startDate || "",
  endDate: period?.endDate || "",
  deadlineDate: period?.deadlineDate || "",
  deadlineTime: period?.deadlineTime || "23:59",
});

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

export default function GradingPeriod() {

  // Page view, grading-period, and automation state

  const [activeView, setActiveView] = useState("overview");
  const [operationsView, setOperationsView] = useState("submissions");
  const [reopeningView, setReopeningView] = useState("pending");
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(
    gradeLockData.schoolYears[0].id,
  );
  const [isSchoolYearMenuOpen, setIsSchoolYearMenuOpen] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState(
    () => gradeLockData.terms[0]?.id || null,
  );
  const [terms, setTerms] = useState(() =>
    gradeLockData.terms.map((term) => ({ ...term })),
  );
  const [settingsPeriodId, setSettingsPeriodId] = useState(
    () => gradeLockData.terms[0]?.id || null,
  );
  const [periodDraft, setPeriodDraft] = useState(() =>
    createPeriodDraft(gradeLockData.terms[0]),
  );
  const [periodValidationMessage, setPeriodValidationMessage] = useState("");
  const [inheritedUpcomingPeriods] = useState(() =>
    createInheritedUpcomingPeriods(gradeLockData.terms),
  );
  const [upcomingPeriods, setUpcomingPeriods] = useState(() =>
    createInheritedUpcomingPeriods(gradeLockData.terms),
  );

  // Reopening request and activity state

  const [reopeningRequests, setReopeningRequests] = useState(() =>
    gradeLockData.reopeningRequests.map((request) => ({ ...request })),
  );
  const [activeReopenings, setActiveReopenings] = useState(() =>
    gradeLockData.activeReopenings.map((reopening) => ({ ...reopening })),
  );
  const [reopeningHistory, setReopeningHistory] = useState(() =>
    Object.fromEntries(
      Object.entries(gradeLockData.reopeningHistory).map(([id, events]) => [
        id,
        events.map((event) => ({ ...event })),
      ]),
    ),
  );
  const [durationValue, setDurationValue] = useState(
    () => gradeLockData.automation.defaultReopeningDurationMinutes,
  );
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

  const selectedSchoolYear =
    gradeLockData.schoolYears.find(
      (schoolYear) => schoolYear.id === selectedSchoolYearId,
    ) || gradeLockData.schoolYears[0];
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
  const selectedDepartments =
    gradeLockData.departmentSubmissionStatus[selectedTermId] || [];
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
    setDurationValue(gradeLockData.automation.defaultReopeningDurationMinutes);
    setCustomDurationMinutes("90");
    setCustomDurationUnit("minutes");
    setAdminNote("");
    setReviewRequestId(requestId);
  };

  // Approves temporary editing access for one grade submission
  const handleApproveReopening = (requestId, duration) => {
    const request = reopeningRequests.find((item) => item.id === requestId);

    if (!request) {
      return;
    }

    const durationDetails = getDurationDetails(
      duration,
      customDurationMinutes,
      customDurationUnit,
    );
    const reopeningId = `reopening-${Date.now()}`;
    const approvalTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    setReopeningRequests((currentRequests) =>
      currentRequests.map((item) =>
        item.id === requestId ? { ...item, status: "approved" } : item,
      ),
    );
    setActiveReopenings((currentReopenings) => [
      {
        id: reopeningId,
        requestId: request.id,
        termId: request.termId,
        teacherId: request.teacherId,
        teacherName: request.teacherName,
        subjectId: request.subjectId,
        subject: request.subject,
        gradeLevel: request.gradeLevel,
        sectionId: request.sectionId,
        section: request.section,
        reason: request.reason,
        reopenUntil: durationDetails.reopenUntil,
        status: "temporarily-unlocked",
        approvedBy: "Admin User",
        durationLabel: durationDetails.durationLabel,
        adminNote: adminNote.trim(),
      },
      ...currentReopenings,
    ]);
    setReopeningHistory((currentHistory) => ({
      ...currentHistory,
      [reopeningId]: [
        {
          id: `${reopeningId}-started`,
          time: approvalTime,
          label: "Temporary access started",
          state: "complete",
        },
        {
          id: `${reopeningId}-editing`,
          time: "Current Stage",
          label: "Correction in progress",
          state: "current",
        },
        {
          id: `${reopeningId}-adviser-review`,
          time: "Not submitted",
          label: "Waiting for adviser approval",
          state: "upcoming",
        },
        {
          id: `${reopeningId}-locked`,
          time: "Pending",
          label: "Correction approved and locked",
          state: "upcoming",
        },
      ],
    }));
    setReviewRequestId(null);
    setToastMessage("Temporary reopening approved.");
  };

  const handleDenyRequest = (requestId) => {
    setReopeningRequests((currentRequests) =>
      currentRequests.map((request) =>
        request.id === requestId ? { ...request, status: "denied" } : request,
      ),
    );
    setReviewRequestId(null);
    setToastMessage("Reopening request denied.");
  };

  const handleViewActivity = (reopeningId) => {
    setActivityReopeningId(reopeningId);
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

  const handleSavePeriod = () => {
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

    const formattedPeriod = {
      label: trimmedLabel,
      periodLabel: formatPeriodRange(
        periodDraft.startDate,
        periodDraft.endDate,
      ),
      startDate: periodDraft.startDate,
      startDateLabel: formatDateLabel(periodDraft.startDate),
      endDate: periodDraft.endDate,
      endDateLabel: formatDateLabel(periodDraft.endDate),
      deadlineDate: periodDraft.deadlineDate,
      deadlineDateLabel: formatDateLabel(periodDraft.deadlineDate),
      deadlineTime: periodDraft.deadlineTime,
      deadlineTimeLabel: formatTimeLabel(periodDraft.deadlineTime),
    };

    const periodToUpdate = terms.find(
      (period) => period.id === settingsPeriodId,
    );
    if (!periodToUpdate || periodToUpdate.status === "finalized") return;

    setTerms((currentPeriods) =>
      currentPeriods.map((period) =>
        period.id === settingsPeriodId
          ? {
              ...period,
              ...formattedPeriod,
            }
          : period,
      ),
    );
    setToastMessage("Grading period updated.");
  };

  const handleSaveUpcomingPeriods = (nextPeriods) => {
    setUpcomingPeriods(
      nextPeriods.map((period) => ({
        ...period,
        startDateLabel: formatDateLabel(period.startDate),
        endDateLabel: formatDateLabel(period.endDate),
        deadlineDateLabel: formatDateLabel(period.deadlineDate),
        deadlineTimeLabel: formatTimeLabel(period.deadlineTime),
        periodLabel: formatPeriodRange(period.startDate, period.endDate),
      })),
    );
    setToastMessage("Upcoming school year timeline updated.");
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
              {gradeLockData.schoolYears.map((schoolYear) => (
                <button
                  type="button"
                  className="grade-lock-school-year__option"
                  key={schoolYear.id}
                  role="option"
                  aria-selected={schoolYear.id === selectedSchoolYearId}
                  tabIndex={isSchoolYearMenuOpen ? 0 : -1}
                  onClick={() => {
                    setSelectedSchoolYearId(schoolYear.id);
                    setIsSchoolYearMenuOpen(false);
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

      {activeView === "overview" ? (
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
      ) : (
        <GradingPeriodSettings
          schoolYearLabel={selectedSchoolYear.label}
          periods={terms}
          selectedPeriod={settingsPeriod}
          periodDraft={periodDraft}
          validationMessage={periodValidationMessage}
          onSelectPeriod={handleSelectSettingsPeriod}
          onPeriodDraftChange={handlePeriodDraftChange}
          onSavePeriod={handleSavePeriod}
          onCancelPeriodEdit={handleCancelPeriodEdit}
          upcomingSchoolYear={gradeLockData.upcomingSchoolYear}
          upcomingPeriods={upcomingPeriods}
          inheritedUpcomingPeriods={inheritedUpcomingPeriods}
          onSaveUpcomingPeriods={handleSaveUpcomingPeriods}
        />
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

