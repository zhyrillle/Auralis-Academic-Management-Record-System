import { useMemo, useState } from "react";
import { CheckCircle2, Pencil, Save, X } from "lucide-react";
import "../../styles/wsConfig.css";

const initialSubjectWeights = [
  {
    id: "english",
    subject: "English",
    writtenWork: 30,
    performanceTasks: 50,
    assessment: 20,
  },
  {
    id: "filipino",
    subject: "Filipino",
    writtenWork: 30,
    performanceTasks: 50,
    assessment: 20,
  },
  {
    id: "ap",
    subject: "AP",
    writtenWork: 30,
    performanceTasks: 50,
    assessment: 20,
  },
  {
    id: "esp",
    subject: "EsP",
    writtenWork: 30,
    performanceTasks: 50,
    assessment: 20,
  },
  {
    id: "mathematics",
    subject: "Mathematics",
    writtenWork: 40,
    performanceTasks: 40,
    assessment: 20,
  },
  {
    id: "science",
    subject: "Science",
    writtenWork: 40,
    performanceTasks: 40,
    assessment: 20,
  },
  {
    id: "mapeh",
    subject: "MAPEH",
    writtenWork: 20,
    performanceTasks: 60,
    assessment: 20,
  },
  {
    id: "epp",
    subject: "EPP",
    writtenWork: 20,
    performanceTasks: 60,
    assessment: 20,
  },
  {
    id: "tle",
    subject: "TLE",
    writtenWork: 20,
    performanceTasks: 60,
    assessment: 20,
  },
];

const weightFields = ["writtenWork", "performanceTasks", "assessment"];

const copyWeights = (weights) => weights.map((weight) => ({ ...weight }));

const getRowTotal = (weight) =>
  weightFields.reduce((total, field) => total + Number(weight[field] || 0), 0);

const getRowError = (weight) => {
  const values = weightFields.map((field) => weight[field]);

  if (values.some((value) => value === "")) {
    return "All component weights are required.";
  }

  if (
    values.some(
      (value) =>
        !Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 100,
    )
  ) {
    return "Values must be between 0% and 100%.";
  }

  if (getRowTotal(weight) !== 100) {
    return "Component weights must total 100%.";
  }

  return "";
};

export default function WSConfig() {
  const [savedWeights, setSavedWeights] = useState(() =>
    copyWeights(initialSubjectWeights),
  );
  const [draftWeights, setDraftWeights] = useState(() =>
    copyWeights(initialSubjectWeights),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const hasChanges = useMemo(
    () => JSON.stringify(draftWeights) !== JSON.stringify(savedWeights),
    [draftWeights, savedWeights],
  );

  const hasInvalidRows = useMemo(
    () => draftWeights.some((weight) => Boolean(getRowError(weight))),
    [draftWeights],
  );

  const canSave = isEditing && hasChanges && !hasInvalidRows;
  const displayedWeights = isEditing ? draftWeights : savedWeights;

  const handleEdit = () => {
    setDraftWeights(copyWeights(savedWeights));
    setSuccessMessage("");
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftWeights(copyWeights(savedWeights));
    setSuccessMessage("");
    setIsEditing(false);
  };

  const handleWeightChange = (subjectId, field, value) => {
    const nextValue = value === "" ? "" : Number(value);

    setDraftWeights((currentWeights) =>
      currentWeights.map((weight) =>
        weight.id === subjectId ? { ...weight, [field]: nextValue } : weight,
      ),
    );
  };

  const handleSave = () => {
    if (!canSave) {
      return;
    }

    const normalizedWeights = draftWeights.map((weight) => ({
      ...weight,
      writtenWork: Number(weight.writtenWork),
      performanceTasks: Number(weight.performanceTasks),
      assessment: Number(weight.assessment),
    }));

    setSavedWeights(copyWeights(normalizedWeights));
    setDraftWeights(copyWeights(normalizedWeights));
    setIsEditing(false);
    setSuccessMessage("Component weights saved successfully.");
  };

  return (
    <div className="ws-config-page">
      <header className="ws-config-header">
        <div className="ws-config-header__copy">
          <h1>Weight of the Components for Grade 7–10</h1>
          <p>
            Configure the standard grading-component distribution for each
            subject.
          </p>
        </div>

        <div className="ws-config-actions">
          {isEditing ? (
            <>
              <button
                type="button"
                className="ws-config-button ws-config-button--secondary"
                onClick={handleCancel}
              >
                <X size={17} aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                className="ws-config-button ws-config-button--primary"
                onClick={handleSave}
                disabled={!canSave}
                title={!hasChanges ? "Make a change before saving" : undefined}
              >
                <Save size={17} aria-hidden="true" />
                Save Changes
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ws-config-button ws-config-button--primary"
              onClick={handleEdit}
            >
              <Pencil size={17} aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
      </header>

      {successMessage && (
        <div className="ws-config-success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          {successMessage}
        </div>
      )}

      <section
        className="ws-config-panel"
        aria-labelledby="ws-config-table-title"
      >
        <div className="ws-config-panel__heading">
          <div>
            <h2 id="ws-config-table-title">Subject Weight Distribution</h2>
            <p>Each subject’s component weights must add up to exactly 100%.</p>
          </div>
          <span className="ws-config-panel__count">
            {displayedWeights.length} subjects
          </span>
        </div>

        <div className="ws-config-table-wrapper">
          <table className="ws-config-table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Written Work</th>
                <th scope="col">Performance Tasks</th>
                <th scope="col">Assessment</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {displayedWeights.map((weight) => {
                const rowError = isEditing ? getRowError(weight) : "";
                const rowTotal = getRowTotal(weight);

                return (
                  <tr
                    key={weight.id}
                    className={rowError ? "ws-config-row--invalid" : ""}
                  >
                    <th scope="row" className="ws-config-subject">
                      {weight.subject}
                    </th>
                    {weightFields.map((field) => (
                      <td key={field} className="ws-config-number-cell">
                        {isEditing ? (
                          <label className="ws-config-input-wrapper">
                            <span className="sr-only">
                              {weight.subject} {field}
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={weight[field]}
                              onChange={(event) =>
                                handleWeightChange(
                                  weight.id,
                                  field,
                                  event.target.value,
                                )
                              }
                              aria-label={`${weight.subject} ${field} percentage`}
                              aria-invalid={Boolean(rowError)}
                            />
                            <span aria-hidden="true">%</span>
                          </label>
                        ) : (
                          <span className="ws-config-percentage">
                            {weight[field]}%
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="ws-config-total-cell">
                      <strong
                        className={rowError ? "ws-config-total--invalid" : ""}
                      >
                        {rowTotal}%
                      </strong>
                      {rowError && (
                        <span className="ws-config-error">{rowError}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
