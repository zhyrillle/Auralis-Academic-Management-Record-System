import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lock,
  Plus,
  RotateCcw,
  Save,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import "../../styles/wsConfig.css";
import "../../styles/gradeTransmutation.css";

// UI-only page: no backend calls yet. Defaults follow the DepEd Order No. 8, s. 2015
// transmutation table so the page renders a meaningful starting configuration.
const buildDefaultRanges = () => {
  const rows = [{ min: 100, max: 100, transmuted: 100 }];

  // 99 down to 75: 1.60-point bands from 98.40 down to 60.00.
  for (let grade = 99; grade >= 75; grade -= 1) {
    const min = 60 + (grade - 75) * 1.6;
    const max = grade === 99 ? 99.99 : min + 1.59;
    rows.push({ min, max, transmuted: grade });
  }

  // 74 down to 60: 4.00-point bands from 56.00 down to 0.
  for (let grade = 74; grade >= 60; grade -= 1) {
    const min = (grade - 60) * 4;
    rows.push({ min, max: min + 3.99, transmuted: grade });
  }

  return rows.map((row, index) => ({
    id: `default-${index}`,
    min: row.min.toFixed(2),
    max: row.max.toFixed(2),
    transmuted: String(row.transmuted),
  }));
};

const DEFAULT_RANGES = buildDefaultRanges();
const PASSING_GRADE = 75;

let rowIdCounter = 0;
const nextRowId = () => {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
};

const cloneRanges = (ranges) => ranges.map((range) => ({ ...range }));

const toNumber = (value) =>
  value === "" || value === null || value === undefined ? NaN : Number(value);

// Lightweight client-side validation so the UI can highlight problems.
const validateRanges = (ranges) => {
  const errors = {};

  ranges.forEach((range) => {
    const min = toNumber(range.min);
    const max = toNumber(range.max);
    const transmuted = toNumber(range.transmuted);

    if ([min, max, transmuted].some(Number.isNaN)) {
      errors[range.id] = "All fields are required.";
    } else if (min < 0 || max > 100) {
      errors[range.id] = "Initial grades must be between 0 and 100.";
    } else if (min > max) {
      errors[range.id] = "Minimum cannot be greater than maximum.";
    } else if (transmuted < 0 || transmuted > 100) {
      errors[range.id] = "Transmuted grade must be between 0 and 100.";
    }
  });

  const sorted = ranges
    .filter((range) => !errors[range.id])
    .map((range) => ({ ...range, minN: Number(range.min), maxN: Number(range.max) }))
    .sort((first, second) => first.minN - second.minN);

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.minN <= previous.maxN) {
      errors[current.id] = "Overlaps with another range.";
      errors[previous.id] = errors[previous.id] || "Overlaps with another range.";
    }
  }

  return errors;
};

const findTransmutedGrade = (ranges, initialGrade) => {
  const value = toNumber(initialGrade);
  if (Number.isNaN(value)) return null;
  const match = ranges.find(
    (range) => value >= Number(range.min) && value <= Number(range.max),
  );
  return match ? Number(match.transmuted) : null;
};

// Lightweight "are you sure" dialog used by the toggle, discard, save and reset actions.
function ConfirmDialog({ config, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    // Focus Cancel by default so an accidental Enter doesn't confirm.
    cancelRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const isDanger = config.tone === "danger";
  const Icon = isDanger ? AlertTriangle : config.icon;

  return createPortal(
    <div
      className="gt-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className={`gt-confirm ${isDanger ? "gt-confirm--danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gt-confirm-title"
        aria-describedby="gt-confirm-message"
      >
        <span className="gt-confirm__icon" aria-hidden="true">
          <Icon size={24} />
        </span>
        <h2 id="gt-confirm-title">{config.title}</h2>
        <p id="gt-confirm-message">{config.message}</p>
        <div className="gt-confirm__actions">
          <button
            ref={cancelRef}
            type="button"
            id="gt-confirm-cancel"
            className="ws-config-button ws-config-button--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            id="gt-confirm-accept"
            className={`ws-config-button ${isDanger ? "gt-button--danger" : "ws-config-button--primary"}`}
            onClick={onConfirm}
          >
            {config.confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function GradeTransmutation() {
  const [isCustomEnabled, setIsCustomEnabled] = useState(false);
  const [savedRanges, setSavedRanges] = useState(() => cloneRanges(DEFAULT_RANGES));
  const [ranges, setRanges] = useState(() => cloneRanges(DEFAULT_RANGES));
  const [previewGrade, setPreviewGrade] = useState("");
  const [toast, setToast] = useState("");
  // Key of the action awaiting confirmation: "toggle" | "discard" | "save" | "reset" | null
  const [pendingAction, setPendingAction] = useState(null);

  const errors = useMemo(() => validateRanges(ranges), [ranges]);
  const errorCount = Object.keys(errors).length;
  const hasChanges = useMemo(
    () => JSON.stringify(ranges) !== JSON.stringify(savedRanges),
    [ranges, savedRanges],
  );
  const isDisabled = !isCustomEnabled;
  // When custom transmutation is off, the system falls back to the DepEd table.
  const activeRanges = isCustomEnabled ? ranges : DEFAULT_RANGES;

  const previewResult = useMemo(
    () => findTransmutedGrade(activeRanges, previewGrade),
    [activeRanges, previewGrade],
  );

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const handleToggle = () => {
    const turningOn = !isCustomEnabled;
    setIsCustomEnabled(turningOn);
    showToast(
      turningOn
        ? "Custom transmutation enabled."
        : "Custom transmutation disabled. DepEd default is now in use.",
    );
  };

  const handleFieldChange = (id, field, value) => {
    setRanges((current) =>
      current.map((range) => (range.id === id ? { ...range, [field]: value } : range)),
    );
  };

  const handleAddRange = () => {
    setRanges((current) => [
      ...current,
      { id: nextRowId(), min: "", max: "", transmuted: "" },
    ]);
  };

  const handleRemoveRange = (id) => {
    setRanges((current) => current.filter((range) => range.id !== id));
  };

  const handleResetDefaults = () => {
    setRanges(cloneRanges(DEFAULT_RANGES));
    showToast("Ranges reset to the DepEd default. Save to apply.");
  };

  const handleDiscard = () => {
    setRanges(cloneRanges(savedRanges));
    showToast("Unsaved changes discarded.");
  };

  const handleSave = () => {
    // Placeholder until the backend endpoint exists.
    setSavedRanges(cloneRanges(ranges));
    showToast("Transmutation table saved (preview only).");
  };

  const confirmConfigs = {
    toggle: isCustomEnabled
      ? {
          title: "Turn off custom transmutation?",
          message: hasChanges
            ? "The system will revert to the default DepEd transmutation table and the ranges table will be locked. You have unsaved changes that will remain unsaved."
            : "The system will revert to the default DepEd transmutation table and the ranges table will be locked.",
          confirmLabel: "Turn Off",
          tone: "danger",
          icon: ToggleRight,
          onConfirm: handleToggle,
        }
      : {
          title: "Turn on custom transmutation?",
          message:
            "Custom grade ranges will override the default DepEd transmutation table once saved.",
          confirmLabel: "Turn On",
          tone: "primary",
          icon: ToggleRight,
          onConfirm: handleToggle,
        },
    discard: {
      title: "Discard unsaved changes?",
      message: "All edits made since the last save will be lost. This cannot be undone.",
      confirmLabel: "Discard",
      tone: "danger",
      icon: X,
      onConfirm: handleDiscard,
    },
    save: {
      title: "Save transmutation table?",
      message: `This will apply ${ranges.length} grade range${ranges.length === 1 ? "" : "s"} to grades computed from now on.`,
      confirmLabel: "Save Changes",
      tone: "primary",
      icon: Save,
      onConfirm: handleSave,
    },
    reset: {
      title: "Reset to DepEd default?",
      message:
        "All current ranges will be replaced with the default DepEd transmutation table. You can still discard this before saving.",
      confirmLabel: "Reset",
      tone: "danger",
      icon: RotateCcw,
      onConfirm: handleResetDefaults,
    },
  };

  const activeConfirm = pendingAction ? confirmConfigs[pendingAction] : null;

  const closeConfirm = useCallback(() => setPendingAction(null), []);
  const runConfirm = () => {
    activeConfirm?.onConfirm();
    setPendingAction(null);
  };

  return (
    <div className="ws-config-page gt-page">
      <header className="ws-config-header">
        <div className="ws-config-header__copy">
          <h1>Grade Transmutation</h1>
          <p>
            Define how initial grades are converted into transmuted grades for
            report cards.
          </p>
        </div>
        <div className="ws-config-actions">
          <button
            type="button"
            className="ws-config-button ws-config-button--secondary"
            onClick={() => setPendingAction("discard")}
            disabled={isDisabled || !hasChanges}
          >
            <X size={17} aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            className="ws-config-button ws-config-button--primary"
            onClick={() => setPendingAction("save")}
            disabled={isDisabled || !hasChanges || errorCount > 0}
            title={errorCount > 0 ? "Fix the highlighted ranges before saving" : undefined}
          >
            <Save size={17} aria-hidden="true" />
            Save Changes
          </button>
        </div>
      </header>

      {toast && (
        <div className="ws-config-success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          {toast}
        </div>
      )}

      {/* Master toggle */}
      <section
        className={`gt-toggle-card ${isCustomEnabled ? "gt-toggle-card--on" : ""}`}
      >
        <div className="gt-toggle-card__copy">
          <span className="gt-toggle-card__icon" aria-hidden="true">
            {isCustomEnabled ? <CheckCircle2 size={20} /> : <Lock size={20} />}
          </span>
          <div>
            <h2 id="gt-toggle-label">Custom Transmutation</h2>
            <p>
              {isCustomEnabled
                ? "Custom ranges are enabled. Changes here will override the default DepEd transmutation table."
                : "Turned off. The system uses the default DepEd transmutation table and the ranges table is locked."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          id="gt-custom-toggle"
          aria-checked={isCustomEnabled}
          aria-labelledby="gt-toggle-label"
          className={`gt-switch ${isCustomEnabled ? "gt-switch--on" : ""}`}
          onClick={() => setPendingAction("toggle")}
        >
          <span className="gt-switch__thumb" />
          <span className="gt-switch__label">{isCustomEnabled ? "ON" : "OFF"}</span>
        </button>
      </section>

      <div className="gt-grid">
        {/* Ranges table — the only part locked by the toggle */}
        <fieldset className="gt-content" disabled={isDisabled} aria-disabled={isDisabled}>
          <section className="ws-config-panel gt-panel" aria-labelledby="gt-table-title">
            <div className="ws-config-panel__heading">
              <div>
                <h2 id="gt-table-title">Grade Ranges</h2>
                <p>Each initial grade range maps to a single transmuted grade.</p>
              </div>
              <div className="gt-panel-actions">
                <span className="ws-config-panel__count">{ranges.length} ranges</span>
                <button
                  type="button"
                  className="ws-config-button ws-config-button--secondary gt-small-button"
                  onClick={() => setPendingAction("reset")}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Reset to DepEd Default
                </button>
              </div>
            </div>

            {errorCount > 0 && !isDisabled && (
              <div className="gt-inline-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                {errorCount} range{errorCount > 1 ? "s need" : " needs"} attention.
              </div>
            )}

            <div className="gt-table-wrapper">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Initial Grade (Min)</th>
                    <th scope="col">Initial Grade (Max)</th>
                    <th scope="col">Transmuted Grade</th>
                    <th scope="col">Remarks</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ranges.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="ws-config-table-state">
                        No ranges defined. Add a range to get started.
                      </td>
                    </tr>
                  ) : (
                    ranges.map((range, index) => {
                      const rowError = errors[range.id];
                      const transmuted = toNumber(range.transmuted);
                      const isPassing = !Number.isNaN(transmuted) && transmuted >= PASSING_GRADE;

                      return (
                        <tr key={range.id} className={rowError ? "gt-row--invalid" : ""}>
                          <td className="gt-index">{index + 1}</td>
                          {["min", "max"].map((field) => (
                            <td key={field}>
                              <input
                                type="number"
                                className="gt-input"
                                min="0"
                                max="100"
                                step="0.01"
                                value={range[field]}
                                placeholder="0.00"
                                onChange={(event) =>
                                  handleFieldChange(range.id, field, event.target.value)
                                }
                                aria-label={`Range ${index + 1} ${field === "min" ? "minimum" : "maximum"} initial grade`}
                                aria-invalid={Boolean(rowError)}
                              />
                            </td>
                          ))}
                          <td>
                            <input
                              type="number"
                              className="gt-input gt-input--strong"
                              min="0"
                              max="100"
                              step="1"
                              value={range.transmuted}
                              placeholder="0"
                              onChange={(event) =>
                                handleFieldChange(range.id, "transmuted", event.target.value)
                              }
                              aria-label={`Range ${index + 1} transmuted grade`}
                              aria-invalid={Boolean(rowError)}
                            />
                          </td>
                          <td>
                            {rowError ? (
                              <span
                                className="ws-config-error-indicator gt-error-chip"
                                tabIndex={0}
                                data-error={rowError}
                                aria-label={rowError}
                              >
                                <AlertCircle size={14} aria-hidden="true" />
                                Invalid
                              </span>
                            ) : Number.isNaN(transmuted) ? (
                              <span className="gt-chip">—</span>
                            ) : (
                              <span className={`gt-chip ${isPassing ? "gt-chip--pass" : "gt-chip--fail"}`}>
                                {isPassing ? "Passed" : "Failed"}
                              </span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ws-config-row-action ws-config-row-action--clear"
                              onClick={() => handleRemoveRange(range.id)}
                              aria-label={`Remove range ${index + 1}`}
                              title="Remove range"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="gt-panel-footer">
              <button type="button" className="gt-add-button" onClick={handleAddRange}>
                <Plus size={16} aria-hidden="true" />
                Add Range
              </button>
            </div>
          </section>
        </fieldset>

        {/* Side column — always usable */}
        <aside className="gt-side">
          <section className="ws-config-panel gt-side-card">
            <h3>Test a Grade</h3>
            <p>
              Enter an initial grade to preview its transmuted value.
            </p>
            <input
              type="number"
              className="gt-input gt-input--wide"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 82.45"
              value={previewGrade}
              onChange={(event) => setPreviewGrade(event.target.value)}
              aria-label="Initial grade to preview"
            />
            <div className="gt-preview">
              <span>Transmuted Grade</span>
              <strong
                className={
                  previewResult === null
                    ? ""
                    : previewResult >= PASSING_GRADE
                      ? "gt-preview--pass"
                      : "gt-preview--fail"
                }
              >
                {previewGrade === "" ? "—" : previewResult ?? "No match"}
              </strong>
            </div>
          </section>

          <section className="ws-config-panel gt-side-card">
            <h3>Summary</h3>
            <dl className="gt-summary">
              <div>
                <dt>Total ranges</dt>
                <dd>{activeRanges.length}</dd>
              </div>
              <div>
                <dt>Passing grade</dt>
                <dd>{PASSING_GRADE}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {isDisabled ? "Default" : hasChanges ? "Unsaved changes" : "Saved"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="gt-note">
            <Info size={16} aria-hidden="true" />
            <p>
              Ranges must not overlap and should cover initial grades from 0 to
              100. Updates apply to grades computed after saving.
            </p>
          </section>
        </aside>
      </div>

      {activeConfirm && (
        <ConfirmDialog
          config={activeConfirm}
          onCancel={closeConfirm}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}
