import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  getSchoolYears,
  getSubjectWeightConfiguration,
  inheritSubjectWeightConfiguration,
  saveSubjectWeightConfiguration,
} from "../../services/wsConfigService";
import "../../styles/wsConfig.css";

const weightFields = ["writtenWork", "performanceTasks", "assessment"];
const componentFieldByCode = {
  WW: "writtenWork",
  PT: "performanceTasks",
  STE: "assessment",
};

const defaultWeightsBySubjectCode = {
  ENG: { writtenWork: 30, performanceTasks: 50, assessment: 20 },
  FIL: { writtenWork: 30, performanceTasks: 50, assessment: 20 },
  AP: { writtenWork: 30, performanceTasks: 50, assessment: 20 },
  ESP: { writtenWork: 20, performanceTasks: 60, assessment: 20 },
  MATH: { writtenWork: 40, performanceTasks: 40, assessment: 20 },
  SCI: { writtenWork: 40, performanceTasks: 40, assessment: 20 },
  MAPEH: { writtenWork: 20, performanceTasks: 60, assessment: 20 },
  TLE: { writtenWork: 20, performanceTasks: 60, assessment: 20 },
};

const getSubjectLabel = (subjectCode, subjectName) =>
  ["AP", "ESP", "MAPEH", "TLE"].includes(subjectCode)
    ? subjectCode
    : subjectName;

const mapConfigurationRows = (
  rows,
  { useDefaults = true, includeUnconfigured = true } = {},
) => {
  const subjects = new Map();

  rows.forEach((row) => {
    const subjectId = Number(row.subject_id);
    const componentField = componentFieldByCode[row.component_code];

    if (!componentField) {
      return;
    }

    if (!subjects.has(subjectId)) {
      const defaults = (useDefaults
        ? defaultWeightsBySubjectCode[row.subject_code]
        : null) || {
        writtenWork: "",
        performanceTasks: "",
        assessment: "",
      };

      subjects.set(subjectId, {
        id: String(subjectId),
        subjectId,
        subjectCode: row.subject_code,
        subject: getSubjectLabel(row.subject_code, row.subject_name),
        ...defaults,
        componentTypeIds: {},
        configuredPercentages: [],
      });
    }

    const subject = subjects.get(subjectId);
    subject.componentTypeIds[componentField] = Number(row.component_type_id);

    if (row.percentage !== null && row.percentage !== undefined) {
      subject.configuredPercentages.push({
        field: componentField,
        value: Number(row.percentage),
      });
    }
  });

  return Array.from(subjects.values())
    .map((subject) => {
      const configuredTotal = subject.configuredPercentages.reduce(
        (total, item) => total + item.value,
        0,
      );
      const fractionScale =
        subject.configuredPercentages.length > 0 && configuredTotal <= 1.001
          ? 100
          : 1;
      const mappedSubject = { ...subject };
      mappedSubject.needsInitialization =
        subject.configuredPercentages.length < weightFields.length;

      subject.configuredPercentages.forEach(({ field, value }) => {
        mappedSubject[field] = Math.round(value * fractionScale * 100) / 100;
      });

      delete mappedSubject.configuredPercentages;
      return mappedSubject;
    })
    .filter((subject) => includeUnconfigured || !subject.needsInitialization);
};

const selectCurrentSchoolYear = (schoolYears) =>
  [...schoolYears]
    .filter((schoolYear) =>
      ["ongoing", "active"].includes(String(schoolYear.status).toLowerCase()),
    )
    .sort(
      (first, second) =>
        Number(second.starts_on || 0) - Number(first.starts_on || 0),
    )[0];

const formatSchoolYear = (schoolYear) =>
  schoolYear ? `${schoolYear.starts_on}–${schoolYear.ends_on}` : "";

const fetchCurrentConfiguration = async () => {
  const schoolYears = await getSchoolYears();
  const currentSchoolYear = selectCurrentSchoolYear(schoolYears);

  if (!currentSchoolYear) {
    throw new Error(
      "No ongoing school year is available for WS configuration.",
    );
  }

  await inheritSubjectWeightConfiguration(currentSchoolYear.school_year_id);
  const configuration = await getSubjectWeightConfiguration(
    currentSchoolYear.school_year_id,
  );

  return { schoolYears, currentSchoolYear, configuration };
};

const copyWeights = (weights) =>
  weights.map((weight) => ({
    ...weight,
    manualFields: [...(weight.manualFields || [])],
    suggestedValues: { ...(weight.suggestedValues || {}) },
  }));

const getDisplayedWeight = (weight, field) =>
  Object.prototype.hasOwnProperty.call(weight.suggestedValues || {}, field)
    ? weight.suggestedValues[field]
    : weight[field];

const getWeightSnapshot = (weights) =>
  weights.map((weight) => ({
    id: weight.id,
    writtenWork: getDisplayedWeight(weight, "writtenWork"),
    performanceTasks: getDisplayedWeight(weight, "performanceTasks"),
    assessment: getDisplayedWeight(weight, "assessment"),
  }));

const getRowTotal = (weight) =>
  weightFields.reduce(
    (total, field) => total + Number(getDisplayedWeight(weight, field) || 0),
    0,
  );

const getRowError = (weight) => {
  const values = weightFields.map((field) => getDisplayedWeight(weight, field));

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
  const [savedWeights, setSavedWeights] = useState([]);
  const [draftWeights, setDraftWeights] = useState([]);
  const [schoolYears, setSchoolYears] = useState([]);
  const [currentSchoolYear, setCurrentSchoolYear] = useState(null);
  const [schoolYearId, setSchoolYearId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySchoolYearId, setHistorySchoolYearId] = useState("");
  const [historyWeights, setHistoryWeights] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const completedSchoolYears = useMemo(
    () =>
      schoolYears
        .filter(
          (schoolYear) =>
            String(schoolYear.status).toLowerCase() === "completed",
        )
        .sort(
          (first, second) =>
            Number(second.starts_on || 0) - Number(first.starts_on || 0),
        ),
    [schoolYears],
  );

  const loadConfiguration = async () => {
    setIsLoading(true);
    setRequestError("");

    try {
      const result = await fetchCurrentConfiguration();
      const { configuration } = result;
      const mappedWeights = mapConfigurationRows(configuration.rows || []);

      setSchoolYears(result.schoolYears);
      setCurrentSchoolYear(result.currentSchoolYear);
      setSchoolYearId(Number(result.currentSchoolYear.school_year_id));
      setSavedWeights(copyWeights(mappedWeights));
      setDraftWeights(copyWeights(mappedWeights));
      setIsEditing(false);
    } catch (error) {
      setRequestError(error.message || "The request could not be completed.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    fetchCurrentConfiguration()
      .then((result) => {
        if (!isCurrent) {
          return;
        }

        const mappedWeights = mapConfigurationRows(
          result.configuration.rows || [],
        );
        setSchoolYears(result.schoolYears);
        setCurrentSchoolYear(result.currentSchoolYear);
        setSchoolYearId(Number(result.currentSchoolYear.school_year_id));
        setSavedWeights(copyWeights(mappedWeights));
        setDraftWeights(copyWeights(mappedWeights));
      })
      .catch((error) => {
        if (isCurrent) {
          setRequestError(
            error.message || "The request could not be completed.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!isHistoryOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsHistoryOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isHistoryOpen]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const dismissTimer = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3200);

    return () => window.clearTimeout(dismissTimer);
  }, [successMessage]);

  const hasChanges = useMemo(
    () =>
      JSON.stringify(getWeightSnapshot(draftWeights)) !==
      JSON.stringify(getWeightSnapshot(savedWeights)),
    [draftWeights, savedWeights],
  );

  const hasInvalidRows = useMemo(
    () => draftWeights.some((weight) => Boolean(getRowError(weight))),
    [draftWeights],
  );

  const hasUnpersistedDefaults = useMemo(
    () => savedWeights.some((weight) => weight.needsInitialization),
    [savedWeights],
  );

  const canSave =
    isEditing &&
    (hasChanges || hasUnpersistedDefaults) &&
    !hasInvalidRows &&
    !isSaving &&
    schoolYearId;
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
    setDraftWeights((currentWeights) =>
      currentWeights.map((weight) => {
        if (weight.id !== subjectId) {
          return weight;
        }

        if (value === "") {
          const remainingManualFields = (weight.manualFields || []).filter(
            (manualField) => manualField !== field,
          );

          return {
            ...weight,
            [field]: "",
            manualFields: remainingManualFields,
            // Clearing is an explicit action. Keep every other actual value
            // unchanged and remove suggestions that depended on this field.
            suggestedValues: {},
          };
        }

        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return weight;
        }

        const limitedValue = Math.min(
          100,
          Math.max(0, Math.round(numericValue)),
        );
        const manualFields = Array.from(
          new Set([...(weight.manualFields || []), field]),
        );
        const remainingFields = weightFields.filter(
          (weightField) => !manualFields.includes(weightField),
        );
        const nextWeight = {
          ...weight,
          [field]: limitedValue,
          manualFields,
          suggestedValues: {},
        };

        const manualTotal = manualFields.reduce(
          (total, manualField) => total + Number(nextWeight[manualField] || 0),
          0,
        );
        const remainingPercentage = 100 - manualTotal;

        if (remainingPercentage < 0) {
          return nextWeight;
        }

        if (remainingFields.length === 2 && remainingPercentage % 2 === 0) {
          const suggestedValue = remainingPercentage / 2;
          nextWeight.suggestedValues = {
            [remainingFields[0]]: suggestedValue,
            [remainingFields[1]]: suggestedValue,
          };
        } else if (remainingFields.length === 1) {
          nextWeight.suggestedValues = {
            [remainingFields[0]]: remainingPercentage,
          };
        }

        return nextWeight;
      }),
    );
  };

  const handleResetSubject = (subjectId) => {
    const savedWeight = savedWeights.find((weight) => weight.id === subjectId);

    if (!savedWeight) {
      return;
    }

    setDraftWeights((currentWeights) =>
      currentWeights.map((weight) =>
        weight.id === subjectId ? copyWeights([savedWeight])[0] : weight,
      ),
    );
  };

  const handleClearSubject = (subjectId) => {
    setDraftWeights((currentWeights) =>
      currentWeights.map((weight) =>
        weight.id === subjectId
          ? {
              ...weight,
              writtenWork: "",
              performanceTasks: "",
              assessment: "",
              manualFields: [],
              suggestedValues: {},
            }
          : weight,
      ),
    );
  };

  const loadHistoryConfiguration = async (selectedSchoolYearId) => {
    setHistorySchoolYearId(String(selectedSchoolYearId));
    setIsHistoryLoading(true);
    setHistoryError("");

    try {
      const configuration =
        await getSubjectWeightConfiguration(selectedSchoolYearId);
      setHistoryWeights(
        mapConfigurationRows(configuration.rows || [], {
          useDefaults: false,
          includeUnconfigured: false,
        }),
      );
    } catch (error) {
      setHistoryWeights([]);
      setHistoryError(
        error.message || "Historical weights could not be loaded.",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    setHistoryError("");

    if (completedSchoolYears.length > 0) {
      loadHistoryConfiguration(completedSchoolYears[0].school_year_id);
    } else {
      setHistorySchoolYearId("");
      setHistoryWeights([]);
    }
  };

  const handleCloseHistory = () => {
    setIsHistoryOpen(false);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    const normalizedWeights = draftWeights.map((weight) => ({
      ...weight,
      writtenWork: Number(getDisplayedWeight(weight, "writtenWork")),
      performanceTasks: Number(getDisplayedWeight(weight, "performanceTasks")),
      assessment: Number(getDisplayedWeight(weight, "assessment")),
      manualFields: [],
      suggestedValues: {},
    }));
    const payload = normalizedWeights.flatMap((weight) =>
      weightFields.map((field) => ({
        subject_id: weight.subjectId,
        component_type_id: weight.componentTypeIds[field],
        percentage: weight[field],
      })),
    );

    setIsSaving(true);
    setRequestError("");

    try {
      const response = await saveSubjectWeightConfiguration(
        schoolYearId,
        payload,
      );
      const mappedWeights = mapConfigurationRows(response.rows || []);

      setSavedWeights(copyWeights(mappedWeights));
      setDraftWeights(copyWeights(mappedWeights));
      setIsEditing(false);
      setSuccessMessage(
        response.message || "Component weights saved successfully.",
      );
    } catch (error) {
      setRequestError(error.message || "The request could not be completed.");
    } finally {
      setIsSaving(false);
    }
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
          {currentSchoolYear && (
            <div
              className="ws-config-current-year"
              aria-label="Current school year"
            >
              <span>{formatSchoolYear(currentSchoolYear)}</span>
              <small>Current</small>
            </div>
          )}
          {isEditing ? (
            <>
              <button
                type="button"
                className="ws-config-button ws-config-button--secondary"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X size={17} aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                className="ws-config-button ws-config-button--primary"
                onClick={handleSave}
                disabled={!canSave}
                title={
                  !hasChanges && !hasUnpersistedDefaults
                    ? "Make a change before saving"
                    : undefined
                }
              >
                <Save size={17} aria-hidden="true" />
                {isSaving ? (
                  <span className="ws-config-saving-label">
                    Saving
                    <span className="ws-config-saving-dots" aria-hidden="true">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </span>
                ) : (
                  "Save Changes"
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ws-config-button ws-config-button--secondary"
                onClick={handleOpenHistory}
                disabled={isLoading}
              >
                <History size={17} aria-hidden="true" />
                View History
              </button>
              <button
                type="button"
                className="ws-config-button ws-config-button--primary"
                onClick={handleEdit}
                disabled={
                  isLoading || Boolean(requestError) || !savedWeights.length
                }
              >
                <Pencil size={17} aria-hidden="true" />
                Edit
              </button>
            </>
          )}
        </div>
      </header>

      {successMessage && (
        <div className="ws-config-success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          {successMessage}
        </div>
      )}

      {requestError && (
        <div className="ws-config-request-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{requestError}</span>
          <button type="button" onClick={loadConfiguration}>
            Try Again
          </button>
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
                {isEditing && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    className="ws-config-table-state"
                    colSpan={isEditing ? 6 : 5}
                  >
                    Loading subject weights...
                  </td>
                </tr>
              ) : displayedWeights.length === 0 ? (
                <tr>
                  <td
                    className="ws-config-table-state"
                    colSpan={isEditing ? 6 : 5}
                  >
                    No active subjects or grading components are available.
                  </td>
                </tr>
              ) : (
                displayedWeights.map((weight) => {
                  const rowError = isEditing ? getRowError(weight) : "";
                  const rowTotal = getRowTotal(weight);
                  const savedWeight = savedWeights.find(
                    (savedWeightItem) => savedWeightItem.id === weight.id,
                  );
                  const rowHasChanges = Boolean(
                    savedWeight &&
                    weightFields.some(
                      (field) =>
                        getDisplayedWeight(weight, field) !==
                        getDisplayedWeight(savedWeight, field),
                    ),
                  );

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
                            <div
                              className={`ws-config-input-wrapper ${
                                Object.prototype.hasOwnProperty.call(
                                  weight.suggestedValues || {},
                                  field,
                                )
                                  ? "ws-config-input-wrapper--auto"
                                  : ""
                              }`}
                            >
                              <span className="ws-config-stepper">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleWeightChange(
                                      weight.id,
                                      field,
                                      String(
                                        Number(
                                          getDisplayedWeight(weight, field) ||
                                            0,
                                        ) + 1,
                                      ),
                                    )
                                  }
                                  aria-label={`Increase ${weight.subject} ${field} percentage`}
                                >
                                  <ChevronUp size={14} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleWeightChange(
                                      weight.id,
                                      field,
                                      String(
                                        Number(
                                          getDisplayedWeight(weight, field) ||
                                            0,
                                        ) - 1,
                                      ),
                                    )
                                  }
                                  aria-label={`Decrease ${weight.subject} ${field} percentage`}
                                >
                                  <ChevronDown size={14} aria-hidden="true" />
                                </button>
                              </span>
                              <span className="sr-only">
                                {weight.subject} {field}
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={getDisplayedWeight(weight, field)}
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
                            </div>
                          ) : (
                            <span className="ws-config-percentage">
                              {getDisplayedWeight(weight, field)}%
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
                          <span
                            className="ws-config-error-indicator"
                            tabIndex="0"
                            aria-label={rowError}
                            data-error={rowError}
                          >
                            <AlertCircle size={15} aria-hidden="true" />
                          </span>
                        )}
                      </td>
                      {isEditing && (
                        <td className="ws-config-action-cell">
                          <div className="ws-config-row-actions">
                            <button
                              type="button"
                              className="ws-config-row-action"
                              onClick={() => handleResetSubject(weight.id)}
                              disabled={!rowHasChanges}
                              aria-label={`Reset ${weight.subject} component weights`}
                              title={`Reset ${weight.subject} to saved values`}
                            >
                              <RotateCcw size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="ws-config-row-action ws-config-row-action--clear"
                              onClick={() => handleClearSubject(weight.id)}
                              disabled={weightFields.every(
                                (field) =>
                                  getDisplayedWeight(weight, field) === "",
                              )}
                              aria-label={`Clear ${weight.subject} component weights`}
                              title={`Clear all ${weight.subject} values`}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isHistoryOpen && (
        <div
          className="ws-config-history-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseHistory();
            }
          }}
        >
          <section
            className="ws-config-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-config-history-title"
          >
            <header className="ws-config-history-header">
              <div className="ws-config-history-heading">
                <span className="ws-config-history-icon" aria-hidden="true">
                  <History size={21} />
                </span>
                <div>
                  <h2 id="ws-config-history-title">Configuration History</h2>
                  <p>
                    Review the read-only component weights used in a completed
                    school year.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ws-config-history-close"
                onClick={handleCloseHistory}
                aria-label="Close configuration history"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            {completedSchoolYears.length > 0 ? (
              <>
                <div className="ws-config-history-toolbar">
                  <label>
                    <span>School Year</span>
                    <span className="ws-config-history-select-control">
                      <select
                        value={historySchoolYearId}
                        onChange={(event) =>
                          loadHistoryConfiguration(event.target.value)
                        }
                        disabled={isHistoryLoading}
                      >
                        {completedSchoolYears.map((schoolYear) => (
                          <option
                            key={schoolYear.school_year_id}
                            value={schoolYear.school_year_id}
                          >
                            {formatSchoolYear(schoolYear)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} aria-hidden="true" />
                    </span>
                  </label>
                  <span className="ws-config-history-badge">Read-only</span>
                </div>

                <div className="ws-config-history-table-wrapper">
                  {historyError ? (
                    <div className="ws-config-history-state ws-config-history-state--error">
                      <AlertCircle size={19} aria-hidden="true" />
                      <span>{historyError}</span>
                      <button
                        type="button"
                        onClick={() =>
                          loadHistoryConfiguration(historySchoolYearId)
                        }
                      >
                        Try Again
                      </button>
                    </div>
                  ) : isHistoryLoading ? (
                    <div className="ws-config-history-state">
                      Loading historical configuration...
                    </div>
                  ) : historyWeights.length === 0 ? (
                    <div className="ws-config-history-state">
                      No component weights were recorded for this school year.
                    </div>
                  ) : (
                    <table className="ws-config-history-table">
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
                        {historyWeights.map((weight) => {
                          const values = weightFields.map((field) =>
                            getDisplayedWeight(weight, field),
                          );
                          const isComplete = values.every(
                            (value) => value !== "",
                          );

                          return (
                            <tr key={weight.id}>
                              <th scope="row">{weight.subject}</th>
                              {values.map((value, index) => (
                                <td key={weightFields[index]}>
                                  {value === "" ? "—" : `${value}%`}
                                </td>
                              ))}
                              <td className="ws-config-history-total">
                                {isComplete ? `${getRowTotal(weight)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="ws-config-history-state ws-config-history-state--empty">
                <History size={28} aria-hidden="true" />
                <strong>No historical records yet</strong>
                <span>
                  Completed school years will appear here once their component
                  weights have been recorded.
                </span>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
