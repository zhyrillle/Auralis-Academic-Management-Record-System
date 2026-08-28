import { CalendarPlus2, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { useState } from "react";
import {
  createTermTimeline,
  updateTermTimeline,
} from "../../../../services/gradingPeriodService";
import "../../../../styles/UpcomingSchoolYear.css";

const EDITABLE_FIELDS = [
  "startDate",
  "endDate",
  "deadlineDate",
  "deadlineTime",
];

const clonePeriods = (periods) => periods.map((period) => ({ ...period }));

const isPeriodAdjusted = (period, suggestedPeriod) =>
  EDITABLE_FIELDS.some((field) => period[field] !== suggestedPeriod?.[field]);

const toManilaTimestamp = (date, time = "00:00") =>
  date ? new Date(`${date}T${time}:00+08:00`).toISOString() : null;

export default function UpcomingSchoolYear({
  userId,
  activeSchoolYearId,
  schoolYear,
  periods,
  suggestedPeriods,
  onRefresh,
  onToast,
}) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [draftPeriods, setDraftPeriods] = useState(() => clonePeriods(periods));
  const [validationMessage, setValidationMessage] = useState("");

  const adjustedCount = draftPeriods.filter((period) =>
    isPeriodAdjusted(
      period,
      suggestedPeriods.find((item) => item.id === period.id),
    ),
  ).length;
  const unsavedCount = draftPeriods.filter((period) =>
    isPeriodAdjusted(
      period,
      periods.find((item) => item.id === period.id),
    ),
  ).length;

  const handleOpenReview = () => {
    setDraftPeriods(clonePeriods(periods));
    setValidationMessage("");
    setIsReviewing(true);
  };

  const handleCancel = () => {
    setDraftPeriods(clonePeriods(periods));
    setValidationMessage("");
    setIsReviewing(false);
  };

  const handlePeriodChange = (periodId, field, value) => {
    setDraftPeriods((currentPeriods) =>
      currentPeriods.map((period) =>
        period.id === periodId ? { ...period, [field]: value } : period,
      ),
    );
    setValidationMessage("");
  };

  const handleResetPeriod = (periodId) => {
    const suggestedPeriod = suggestedPeriods.find(
      (period) => period.id === periodId,
    );
    if (!suggestedPeriod) return;

    setDraftPeriods((currentPeriods) =>
      currentPeriods.map((period) =>
        period.id === periodId ? { ...suggestedPeriod } : period,
      ),
    );
    setValidationMessage("");
  };

  const handleUseCalendarSuggestions = () => {
    setDraftPeriods(clonePeriods(suggestedPeriods));
    setValidationMessage("");
  };

  const handleResetChanges = () => {
    setDraftPeriods(clonePeriods(periods));
    setValidationMessage("");
  };

  const handleSave = async () => {
    const hasEmptyField = draftPeriods.some((period) =>
      EDITABLE_FIELDS.some((field) => !period[field]),
    );

    if (hasEmptyField) {
      setValidationMessage("Complete every date and deadline field.");
      return;
    }

    const invalidPeriod = draftPeriods.find(
      (period) =>
        period.startDate > period.endDate ||
        period.deadlineDate < period.startDate,
    );

    if (invalidPeriod) {
      setValidationMessage(
        `${invalidPeriod.label} has an invalid date or submission deadline.`,
      );
      return;
    }

    if (!activeSchoolYearId) {
      onToast(
        "Upcoming timelines can only be edited from the current school year.",
        "error",
      );
      return;
    }

    try {
      await Promise.all(
        draftPeriods.map((period) => {
          const timelinePayload = {
            term_name: period.label,
            starts_at: toManilaTimestamp(period.startDate),
            ends_at: toManilaTimestamp(period.endDate, "23:59"),
            grade_submission_deadline_at: toManilaTimestamp(
              period.deadlineDate,
              period.deadlineTime,
            ),
          };

          return period.isConfigured
            ? updateTermTimeline(userId, period.id, timelinePayload)
            : createTermTimeline(userId, {
                ...timelinePayload,
                school_year_id: schoolYear.id,
              });
        }),
      );

      onToast("Upcoming school year timeline updated.");
      setIsReviewing(false);
      await onRefresh();
    } catch (error) {
      onToast(error.message, "error");
    }
  };

  return (
    <section
      className={`upcoming-school-year ${
        isReviewing ? "upcoming-school-year--reviewing" : ""
      }`}
      aria-labelledby="upcoming-school-year-title"
    >
      <header className="upcoming-school-year__header">
        <div className="upcoming-school-year__identity">
          <span className="upcoming-school-year__icon" aria-hidden="true">
            <CalendarPlus2 size={20} />
          </span>
          <div>
            <div className="upcoming-school-year__title-row">
              <h2 id="upcoming-school-year-title">Upcoming School Year</h2>
            </div>
            <p>
              A calendar-based draft is prepared automatically, then reviewed
              against the official DepEd calendar before confirmation.
            </p>
          </div>
        </div>

        {!isReviewing && (
          <button
            type="button"
            className="upcoming-school-year__review-button"
            onClick={handleOpenReview}
          >
            Review Timeline
          </button>
        )}
      </header>

      <div className="upcoming-school-year__summary">
        <div>
          <span>Prepared school year</span>
          <strong>{schoolYear.label}</strong>
        </div>
        <div>
          <span>Timeline source</span>
          <strong>{schoolYear.calendarRule?.label || "Calendar-based suggestion"}</strong>
        </div>
        <div>
          <span>Configuration state</span>
          <strong>{isReviewing ? `${adjustedCount} adjusted` : "Draft"}</strong>
        </div>
      </div>

      {isReviewing && (
        <div className="upcoming-school-year__editor">
          <div className="upcoming-school-year__notice">
            These dates are system suggestions, not an official DepEd calendar.
            Review and adjust them before saving.
          </div>

          <div className="upcoming-school-year__rules">
            <div>
              <Sparkles size={16} aria-hidden="true" />
              <strong>Suggestion rules</strong>
            </div>
            <ul>
              {schoolYear.calendarRule?.summary?.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
              <li>
                <strong>Seven-day reopening policy:</strong> Reopening requests
                open at the submission deadline and close seven days later.
              </li>
            </ul>
          </div>

          <div className="upcoming-school-year__periods">
            {draftPeriods.map((period) => {
              const suggestedPeriod = suggestedPeriods.find(
                (item) => item.id === period.id,
              );
              const isAdjusted = isPeriodAdjusted(period, suggestedPeriod);

              return (
                <article className="upcoming-period" key={period.id}>
                  <div className="upcoming-period__heading">
                    <div>
                      <h3>{period.label}</h3>
                      <span
                        className={`upcoming-period__state ${
                          isAdjusted ? "is-modified" : ""
                        }`}
                      >
                        {isAdjusted ? "Adjusted" : "System suggested"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="upcoming-period__reset"
                      onClick={() => handleResetPeriod(period.id)}
                      disabled={!isAdjusted}
                      aria-label={`Reset ${period.label} to calendar suggestions`}
                    >
                      <RotateCcw size={15} aria-hidden="true" />
                      Reset
                    </button>
                  </div>

                  <div className="upcoming-period__fields">
                    <label>
                      <span>Start date</span>
                      <input
                        type="date"
                        value={period.startDate}
                        onChange={(event) =>
                          handlePeriodChange(
                            period.id,
                            "startDate",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>End date</span>
                      <input
                        type="date"
                        value={period.endDate}
                        onChange={(event) =>
                          handlePeriodChange(
                            period.id,
                            "endDate",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>Submission deadline</span>
                      <input
                        type="date"
                        value={period.deadlineDate}
                        onChange={(event) =>
                          handlePeriodChange(
                            period.id,
                            "deadlineDate",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      <span>Deadline time</span>
                      <input
                        type="time"
                        value={period.deadlineTime}
                        onChange={(event) =>
                          handlePeriodChange(
                            period.id,
                            "deadlineTime",
                            event.target.value,
                          )
                        }
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>

          {validationMessage && (
            <p className="upcoming-school-year__validation" role="alert">
              {validationMessage}
            </p>
          )}

          <footer className="upcoming-school-year__actions">
            <div className="upcoming-school-year__utility-actions">
              <button
                type="button"
                onClick={handleUseCalendarSuggestions}
                disabled={adjustedCount === 0}
              >
                <Sparkles size={15} aria-hidden="true" />
                Use calendar suggestions
              </button>
              <button
                type="button"
                className="upcoming-school-year__reset-changes"
                onClick={handleResetChanges}
                disabled={unsavedCount === 0}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset changes
              </button>
            </div>
            <div className="upcoming-school-year__commit-actions">
              <button type="button" onClick={handleCancel}>
                <X size={15} aria-hidden="true" />
                Cancel
              </button>
              <button type="button" onClick={handleSave}>
                <Save size={15} aria-hidden="true" />
                Save Confirmed Timeline
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
