import { CalendarPlus2, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { useState } from "react";
import "../../../../styles/UpcomingSchoolYear.css";

const EDITABLE_FIELDS = [
  "startDate",
  "endDate",
  "deadlineDate",
  "deadlineTime",
];

const clonePeriods = (periods) => periods.map((period) => ({ ...period }));

const isPeriodModified = (period, inheritedPeriod) =>
  EDITABLE_FIELDS.some((field) => period[field] !== inheritedPeriod?.[field]);

export default function UpcomingSchoolYear({
  schoolYear,
  periods,
  inheritedPeriods,
  onSave,
}) {
  const [isReviewing, setIsReviewing] = useState(false);
  const [draftPeriods, setDraftPeriods] = useState(() => clonePeriods(periods));
  const [validationMessage, setValidationMessage] = useState("");

  const modifiedCount = draftPeriods.filter((period) =>
    isPeriodModified(
      period,
      inheritedPeriods.find((item) => item.id === period.id),
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
    const inheritedPeriod = inheritedPeriods.find(
      (period) => period.id === periodId,
    );
    if (!inheritedPeriod) return;

    setDraftPeriods((currentPeriods) =>
      currentPeriods.map((period) =>
        period.id === periodId ? { ...inheritedPeriod } : period,
      ),
    );
    setValidationMessage("");
  };

  const handleResetAll = () => {
    setDraftPeriods(clonePeriods(inheritedPeriods));
    setValidationMessage("");
  };

  const handleSave = () => {
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

    onSave(clonePeriods(draftPeriods));
    setIsReviewing(false);
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
              <span className="upcoming-school-year__badge">
                <Sparkles size={12} aria-hidden="true" />
                Auto-generated
              </span>
            </div>
            <p>
              A draft timeline is prepared from the most recent school year,
              then reviewed before it becomes active.
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
          <strong>Inherited from {schoolYear.inheritedFrom}</strong>
        </div>
        <div>
          <span>Configuration state</span>
          <strong>{isReviewing ? `${modifiedCount} modified` : "Draft"}</strong>
        </div>
      </div>

      {isReviewing && (
        <div className="upcoming-school-year__editor">
          <div className="upcoming-school-year__notice">
            Inherited dates are a starting point. Adjust only the terms affected
            by the next academic calendar.
          </div>

          <div className="upcoming-school-year__periods">
            {draftPeriods.map((period) => {
              const inheritedPeriod = inheritedPeriods.find(
                (item) => item.id === period.id,
              );
              const isModified = isPeriodModified(period, inheritedPeriod);

              return (
                <article className="upcoming-period" key={period.id}>
                  <div className="upcoming-period__heading">
                    <div>
                      <h3>{period.label}</h3>
                      <span
                        className={`upcoming-period__state ${
                          isModified ? "is-modified" : ""
                        }`}
                      >
                        {isModified ? "Modified" : "Inherited"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="upcoming-period__reset"
                      onClick={() => handleResetPeriod(period.id)}
                      disabled={!isModified}
                      aria-label={`Reset ${period.label} to inherited dates`}
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
            <button
              type="button"
              className="upcoming-school-year__reset-all"
              onClick={handleResetAll}
              disabled={modifiedCount === 0}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Reset to inherited dates
            </button>
            <div>
              <button type="button" onClick={handleCancel}>
                <X size={15} aria-hidden="true" />
                Cancel
              </button>
              <button type="button" onClick={handleSave}>
                <Save size={15} aria-hidden="true" />
                Save Changes
              </button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
