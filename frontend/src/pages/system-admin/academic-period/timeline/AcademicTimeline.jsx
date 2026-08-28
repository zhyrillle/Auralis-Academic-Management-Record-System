import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Save,
} from "lucide-react";
import Badge from "../../../../components/common/Badge";
import {
  createTermTimeline,
  updateTermTimeline,
} from "../../../../services/gradingPeriodService";
import "../../../../styles/AcademicTimeline.css";

function formatPeriodRange(startDate, endDate) {
  if (!startDate || !endDate) return "Schedule not set";

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(`${startDate}T00:00:00Z`))} – ${formatter.format(
    new Date(`${endDate}T00:00:00Z`),
  )}`;
}

function createPeriodDraft(period) {
  return {
    periodLabel: formatPeriodRange(period?.startDate, period?.endDate),
    label: period?.label || "",
    startDate: period?.startDate || "",
    endDate: period?.endDate || "",
    deadlineDate: period?.deadlineDate || "",
    deadlineTime: period?.deadlineTime || "23:59",
  };
}

const toManilaTimestamp = (date, time = "00:00") =>
  date ? new Date(`${date}T${time}:00+08:00`).toISOString() : null;

const getStatusExplanation = (period) => {
  if (!period) return "";
  if (period.status === "finalized") {
    return "Completed periods are preserved as read-only historical records.";
  }
  if (period.status === "open") {
    return "The period structure is fixed while grading is ongoing, but its deadline may be extended.";
  }
  if (period.hasGradeSheets) {
    return "Prepared grading sheets prevent structural changes to this period.";
  }
  return "This upcoming period can still be configured.";
};

export default function AcademicTimeline({
  userId,
  schoolYearId,
  isReadOnly = false,
  periods,
  initialSelectedPeriodId,
  onSelectedPeriodChange,
  onRefresh,
  onToast,
}) {
  const initialPeriod =
    periods.find((period) => period.id === initialSelectedPeriodId) ||
    periods[0];
  const [selectedPeriodId, setSelectedPeriodId] = useState(
    initialPeriod?.id || null,
  );
  const [draft, setDraft] = useState(() => createPeriodDraft(initialPeriod));
  const [validationMessage, setValidationMessage] = useState("");

  const selectedPeriod =
    periods.find((period) => period.id === selectedPeriodId) || periods[0];

  const handleSelectPeriod = (periodId) => {
    const period = periods.find((item) => item.id === periodId);
    if (!period) return;

    setSelectedPeriodId(period.id);
    onSelectedPeriodChange(period.id);
    setDraft(createPeriodDraft(period));
    setValidationMessage("");
  };

  const handleDraftChange = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
    setValidationMessage("");
  };

  const handleReset = () => {
    setDraft(createPeriodDraft(selectedPeriod));
    setValidationMessage("");
  };

  const handleSave = async () => {
    if (isReadOnly) {
      onToast("Completed school-year timelines are read-only.", "error");
      return;
    }

    const trimmedLabel = draft.label.trim();
    const requiredFields = [
      trimmedLabel,
      draft.startDate,
      draft.endDate,
      draft.deadlineDate,
      draft.deadlineTime,
    ];

    if (requiredFields.some((value) => !value)) {
      setValidationMessage("Complete every period and deadline field.");
      return;
    }
    if (draft.startDate > draft.endDate) {
      setValidationMessage("The end date must be after the start date.");
      return;
    }
    if (draft.deadlineDate < draft.startDate) {
      setValidationMessage(
        "The submission deadline cannot be before the period starts.",
      );
      return;
    }
    if (!selectedPeriod || selectedPeriod.status === "finalized") return;

    const timelinePayload = {
      term_name: trimmedLabel,
      starts_at: toManilaTimestamp(draft.startDate),
      ends_at: toManilaTimestamp(draft.endDate, "23:59"),
      grade_submission_deadline_at: toManilaTimestamp(
        draft.deadlineDate,
        draft.deadlineTime,
      ),
    };

    try {
      if (selectedPeriod.isConfigured) {
        await updateTermTimeline(userId, selectedPeriod.id, timelinePayload);
      } else {
        await createTermTimeline(userId, {
          ...timelinePayload,
          school_year_id: schoolYearId,
        });
      }

      onToast("Academic period updated.");
      await onRefresh();
    } catch (error) {
      onToast(error.message, "error");
    }
  };

  const isCompleted = selectedPeriod?.status === "finalized";
  const isTimelineReadOnly = isReadOnly || isCompleted;
  const canEditStructure = selectedPeriod?.canEditStructure;
  const canEditDeadline = selectedPeriod?.canEditDeadline;
  const periodImpact = selectedPeriod?.impactSummary;

  return (
    <section className="grade-lock-settings-panel academic-timeline">
      <div className="grade-lock-settings-panel__heading">
        <div>
          <span className="grade-lock-settings-panel__eyebrow">
            School-wide schedule
          </span>
          <h2>Academic Timeline</h2>
          <p>
            Review the three regular terms and configure their grading
            deadlines.
          </p>
        </div>
      </div>

      <div className="academic-timeline__workspace">
        {/* Period list */}
        <div className="academic-period-list" aria-label="Academic periods">
          {periods.map((period) => (
            <button
              type="button"
              key={period.id}
              className={`academic-period-item ${
                selectedPeriod?.id === period.id
                  ? "academic-period-item--selected"
                  : ""
              }`}
              onClick={() => handleSelectPeriod(period.id)}
            >
              <span className="academic-period-item__icon" aria-hidden="true">
                <CalendarDays size={18} />
              </span>
              <span className="academic-period-item__copy">
                <strong>{period.label}</strong>
                <small>{period.periodLabel}</small>
              </span>
              <Badge variant={period.status}>{period.statusLabel}</Badge>
            </button>
          ))}
        </div>

        {/* Selected period editor */}
        <div className="academic-period-editor">
          <div className="academic-period-editor__heading">
            <div>
              <span>Term details</span>
              <h3>{selectedPeriod?.label}</h3>
            </div>
            {selectedPeriod && (
              <div className="academic-period-editor__status">
                {isTimelineReadOnly && (
                  <span className="academic-period-editor__readonly">
                    <LockKeyhole size={13} aria-hidden="true" />
                    Read-only
                  </span>
                )}
                <Badge variant={selectedPeriod.status}>
                  {selectedPeriod.statusLabel}
                </Badge>
              </div>
            )}
          </div>

          {selectedPeriod && (
            <div
              className={`academic-period-policy-note ${
                isTimelineReadOnly ? "academic-period-policy-note--locked" : ""
              }`}
            >
              {isTimelineReadOnly ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <AlertTriangle size={18} aria-hidden="true" />
              )}
              <p>
                {isReadOnly
                  ? "This completed school year's timeline is preserved and read-only."
                  : getStatusExplanation(selectedPeriod)}
              </p>
            </div>
          )}

          <div className="academic-period-editor__form">
            <label
              className={`grade-lock-field ${
                !canEditStructure || isTimelineReadOnly
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Period name</span>
              <input
                type="text"
                value={draft.label}
                disabled={!canEditStructure || isTimelineReadOnly}
                maxLength={80}
                onChange={(event) =>
                  handleDraftChange("label", event.target.value)
                }
                placeholder="e.g. Term 1"
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditStructure || isTimelineReadOnly
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Start date</span>
              <input
                type="date"
                value={draft.startDate}
                disabled={!canEditStructure || isTimelineReadOnly}
                onChange={(event) =>
                  handleDraftChange("startDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditStructure || isTimelineReadOnly
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>End date</span>
              <input
                type="date"
                value={draft.endDate}
                disabled={!canEditStructure || isTimelineReadOnly}
                onChange={(event) =>
                  handleDraftChange("endDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditDeadline || isTimelineReadOnly
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Submission deadline date</span>
              <input
                type="date"
                value={draft.deadlineDate}
                disabled={!canEditDeadline || isTimelineReadOnly}
                onChange={(event) =>
                  handleDraftChange("deadlineDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditDeadline || isTimelineReadOnly
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Submission deadline time</span>
              <input
                type="time"
                value={draft.deadlineTime}
                disabled={!canEditDeadline || isTimelineReadOnly}
                onChange={(event) =>
                  handleDraftChange("deadlineTime", event.target.value)
                }
              />
            </label>
          </div>

          {validationMessage && (
            <div className="academic-period-editor__error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {validationMessage}
            </div>
          )}

          {periodImpact && !isTimelineReadOnly && (
            <div className="academic-period-impact">
              <div>
                <AlertTriangle size={18} aria-hidden="true" />
                <span>
                  <strong>Review the impact before saving</strong>
                </span>
              </div>
              <dl>
                <div>
                  <dt>Subject offerings</dt>
                  <dd>{periodImpact.subjectOfferings}</dd>
                </div>
                <div>
                  <dt>Incomplete sheets</dt>
                  <dd>{periodImpact.incompleteGradeSheets}</dd>
                </div>
                <div>
                  <dt>Affected teachers</dt>
                  <dd>{periodImpact.affectedTeachers}</dd>
                </div>
              </dl>
            </div>
          )}

          {!isTimelineReadOnly && (
            <div className="academic-period-editor__actions">
              <button
                type="button"
                className="grade-lock-button grade-lock-button--secondary"
                onClick={handleReset}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
              <button
                type="button"
                className="grade-lock-button grade-lock-button--primary"
                onClick={handleSave}
              >
                <Save size={15} aria-hidden="true" />
                Save Term
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
