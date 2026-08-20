import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Save,
} from "lucide-react";
import Badge from "../../../../components/common/Badge";
import "../../../../styles/AcademicTimeline.css";

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
  periods,
  selectedPeriod,
  draft,
  validationMessage,
  onSelectPeriod,
  onDraftChange,
  onSave,
  onCancel,
}) {
  const isCompleted = selectedPeriod?.status === "finalized";
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
        {/* PERIOD LIST */}
        <div className="academic-period-list" aria-label="Grading periods">
          {periods.map((period) => (
            <button
              type="button"
              key={period.id}
              className={`academic-period-item ${
                selectedPeriod?.id === period.id
                  ? "academic-period-item--selected"
                  : ""
              }`}
              onClick={() => onSelectPeriod(period.id)}
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

        {/* SELECTED PERIOD EDITOR */}
        <div className="academic-period-editor">
          <div className="academic-period-editor__heading">
            <div>
              <span>Term details</span>
              <h3>{selectedPeriod?.label}</h3>
            </div>
            {selectedPeriod && (
              <div className="academic-period-editor__status">
                {isCompleted && (
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
                isCompleted ? "academic-period-policy-note--locked" : ""
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <AlertTriangle size={18} aria-hidden="true" />
              )}
              <p>{getStatusExplanation(selectedPeriod)}</p>
            </div>
          )}

          <div className="academic-period-editor__form">
            <label
              className={`grade-lock-field ${
                !canEditStructure || isCompleted
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Period name</span>
              <input
                type="text"
                value={draft.label}
                disabled={!canEditStructure || isCompleted}
                maxLength={80}
                onChange={(event) => onDraftChange("label", event.target.value)}
                placeholder="e.g. Term 1"
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditStructure || isCompleted
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Start date</span>
              <input
                type="date"
                value={draft.startDate}
                disabled={!canEditStructure || isCompleted}
                onChange={(event) =>
                  onDraftChange("startDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditStructure || isCompleted
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>End date</span>
              <input
                type="date"
                value={draft.endDate}
                disabled={!canEditStructure || isCompleted}
                onChange={(event) =>
                  onDraftChange("endDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditDeadline || isCompleted
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Submission deadline date</span>
              <input
                type="date"
                value={draft.deadlineDate}
                disabled={!canEditDeadline || isCompleted}
                onChange={(event) =>
                  onDraftChange("deadlineDate", event.target.value)
                }
              />
            </label>

            <label
              className={`grade-lock-field ${
                !canEditDeadline || isCompleted
                  ? "grade-lock-field--locked"
                  : ""
              }`}
            >
              <span>Submission deadline time</span>
              <input
                type="time"
                value={draft.deadlineTime}
                disabled={!canEditDeadline || isCompleted}
                onChange={(event) =>
                  onDraftChange("deadlineTime", event.target.value)
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

          {periodImpact && !isCompleted && (
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

          {!isCompleted && (
            <div className="academic-period-editor__actions">
              <button
                type="button"
                className="grade-lock-button grade-lock-button--secondary"
                onClick={onCancel}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset
              </button>
              <button
                type="button"
                className="grade-lock-button grade-lock-button--primary"
                onClick={onSave}
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
