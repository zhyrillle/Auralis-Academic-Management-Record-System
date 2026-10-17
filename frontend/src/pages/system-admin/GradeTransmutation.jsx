import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Info,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  Save,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { TRANSMUTATION_TABLE } from "../../utils/depedTransmutation";
import {
  getGradeTransmutationConfig,
  saveGradeTransmutationConfig,
} from "../../services/gradeTransmutationService";
import "../../styles/wsConfig.css";
import "../../styles/gradeTransmutation.css";

// Official DepEd MATATAG (SY 2026-2027) 42-tier transmutation table
const buildOfficialDepEdRanges = () => {
  return TRANSMUTATION_TABLE.map((row, index) => ({
    id: `default-${index}`,
    min: Number(row.min).toFixed(2),
    max: Number(row.max).toFixed(2),
    transmuted: String(row.transmuted !== undefined ? row.transmuted : row.grade),
    label: row.label || (row.isDefaultMinimum || (Number(row.min) === 0 && Number(row.max) === 24) ? "default minimum" : null),
  }));
};

const OFFICIAL_DEPED_RANGES = buildOfficialDepEdRanges();
const PASSING_GRADE = 75;

let rowIdCounter = 0;
const nextRowId = () => {
  rowIdCounter += 1;
  return `row-${Date.now()}-${rowIdCounter}`;
};

const cloneRanges = (ranges) => ranges.map((range) => ({ ...range }));

const toNumber = (value) =>
  value === "" || value === null || value === undefined ? NaN : Number(value);

// Client-side validation for immediate visual feedback
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

const findTransmutedMatch = (ranges, initialGrade) => {
  const value = toNumber(initialGrade);
  if (Number.isNaN(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  const match = ranges.find(
    (range) => rounded >= Number(range.min) && rounded <= Number(range.max),
  );
  if (!match) return null;
  return {
    transmuted: Number(match.transmuted),
    label: match.label || (Number(match.min) === 0 && Number(match.max) === 24 ? "default minimum" : null),
  };
};

function ConfirmDialog({ config, onCancel, onConfirm }) {
  const cancelRef = useRef(null);

  useEffect(() => {
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomEnabled, setIsCustomEnabled] = useState(false);
  const [savedCustomEnabled, setSavedCustomEnabled] = useState(false);
  const [defaultRanges, setDefaultRanges] = useState(OFFICIAL_DEPED_RANGES);
  const [savedRanges, setSavedRanges] = useState(() => cloneRanges(OFFICIAL_DEPED_RANGES));
  const [ranges, setRanges] = useState(() => cloneRanges(OFFICIAL_DEPED_RANGES));
  const [previewGrade, setPreviewGrade] = useState("");
  const [toast, setToast] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  // Independent table lock: lets admins lock the table while custom is still ON.
  const [isTableLocked, setIsTableLocked] = useState(false);
  // Drag-to-reorder: id of the row being dragged and the id being hovered over.
  const dragIdRef = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const errors = useMemo(() => validateRanges(ranges), [ranges]);
  const errorCount = Object.keys(errors).length;

  const hasChanges = useMemo(
    () =>
      isCustomEnabled !== savedCustomEnabled ||
      JSON.stringify(ranges) !== JSON.stringify(savedRanges),
    [isCustomEnabled, savedCustomEnabled, ranges, savedRanges],
  );

  const isDisabled = !isCustomEnabled;
  const activeRanges = isCustomEnabled ? ranges : defaultRanges;

  const previewResult = useMemo(
    () => findTransmutedMatch(activeRanges, previewGrade),
    [activeRanges, previewGrade],
  );

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  };

  // Fetch backend configuration on mount
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        setIsLoading(true);
        const data = await getGradeTransmutationConfig();
        if (!isMounted) return;

        const customEnabled = Boolean(data.is_custom_enabled);
        setIsCustomEnabled(customEnabled);
        setSavedCustomEnabled(customEnabled);

        const def = Array.isArray(data.default_ranges) && data.default_ranges.length > 0
          ? data.default_ranges
          : OFFICIAL_DEPED_RANGES;
        setDefaultRanges(def);

        const loadedRanges = Array.isArray(data.ranges) && data.ranges.length > 0
          ? data.ranges
          : def;
        const cloned = cloneRanges(loadedRanges);
        setRanges(cloned);
        setSavedRanges(cloned);
      } catch (err) {
        if (!isMounted) return;
        showToast(err.message || "Failed to load grade transmutation configuration.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = async () => {
    const turningOn = !isCustomEnabled;
    try {
      setIsSaving(true);
      const res = await saveGradeTransmutationConfig({
        is_custom_enabled: turningOn,
        ranges,
      });
      setIsCustomEnabled(turningOn);
      setSavedCustomEnabled(turningOn);
      if (res?.config?.ranges) {
        const cloned = cloneRanges(res.config.ranges);
        setRanges(cloned);
        setSavedRanges(cloned);
      }
      showToast(
        turningOn
          ? "Custom transmutation enabled and saved."
          : "Custom transmutation disabled. DepEd default is now in use.",
      );
    } catch (err) {
      showToast(err.message || "Failed to update custom transmutation status.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (id, field, value) => {
    setRanges((current) =>
      current.map((range) => (range.id === id ? { ...range, [field]: value } : range)),
    );
  };

  const handleAddRange = () => {
    setRanges((current) => [
      ...current,
      { id: nextRowId(), min: "", max: "", transmuted: "", label: null },
    ]);
  };

  const handleRemoveRange = (id) => {
    setRanges((current) => current.filter((range) => range.id !== id));
  };

  const handleTableLockToggle = () => setIsTableLocked((prev) => !prev);

  // ── Drag-to-reorder (native HTML5 DnD) ────────────────────────────────────
  const handleDragStart = (id) => {
    dragIdRef.current = id;
  };

  const handleDragOver = (event, overId) => {
    event.preventDefault(); // allow drop
    if (overId !== dragIdRef.current) setDragOverId(overId);
  };

  const handleDrop = (overId) => {
    const fromId = dragIdRef.current;
    if (!fromId || fromId === overId) {
      dragIdRef.current = null;
      setDragOverId(null);
      return;
    }
    setRanges((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((r) => r.id === fromId);
      const toIndex = next.findIndex((r) => r.id === overId);
      if (fromIndex === -1 || toIndex === -1) return current;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    dragIdRef.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragIdRef.current = null;
    setDragOverId(null);
  };
  const handleResetDefaults = () => {
    setRanges(cloneRanges(defaultRanges));
    showToast("Ranges reset to official DepEd SY 2026-2027 defaults. Click 'Save Changes' to apply.");
  };

  const handleDiscard = () => {
    setIsCustomEnabled(savedCustomEnabled);
    setRanges(cloneRanges(savedRanges));
    showToast("Unsaved changes discarded.");
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await saveGradeTransmutationConfig({
        is_custom_enabled: isCustomEnabled,
        ranges,
      });

      if (res?.config) {
        const nextCustom = Boolean(res.config.is_custom_enabled);
        setIsCustomEnabled(nextCustom);
        setSavedCustomEnabled(nextCustom);

        const loadedRanges = Array.isArray(res.config.ranges) && res.config.ranges.length > 0
          ? res.config.ranges
          : defaultRanges;
        const cloned = cloneRanges(loadedRanges);
        setRanges(cloned);
        setSavedRanges(cloned);
      } else {
        setSavedCustomEnabled(isCustomEnabled);
        setSavedRanges(cloneRanges(ranges));
      }

      showToast(res.message || "Transmutation table saved successfully.");
    } catch (err) {
      showToast(err.message || "Failed to save transmutation table.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmConfigs = {
    toggle: isCustomEnabled
      ? {
          title: "Turn off custom transmutation?",
          message:
            "The system will revert to the official DepEd default transmutation table and the ranges table will be locked.",
          confirmLabel: "Turn Off",
          tone: "danger",
          icon: ToggleRight,
          onConfirm: handleToggle,
        }
      : {
          title: "Turn on custom transmutation?",
          message:
            "Custom grade ranges will be enabled and will override the official DepEd default transmutation table.",
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
      message: isCustomEnabled
        ? `This will apply ${ranges.length} custom grade range${ranges.length === 1 ? "" : "s"} to all academic computations.`
        : "This will revert to the official DepEd SY 2026-2027 default transmutation table.",
      confirmLabel: "Save Changes",
      tone: "primary",
      icon: Save,
      onConfirm: handleSave,
    },
    reset: {
      title: "Reset to DepEd default?",
      message:
        "All current ranges will be replaced with the official DepEd SY 2026-2027 transmutation table (42 tiers including default minimum). You can still discard this before saving.",
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
            Define how initial grades are converted into transmuted grades for report cards
            (DepEd SY 2026–2027 MATATAG Standard).
          </p>
        </div>
        <div className="ws-config-actions">
          <button
            type="button"
            className="ws-config-button ws-config-button--secondary"
            onClick={() => setPendingAction("discard")}
            disabled={isLoading || isSaving || !hasChanges}
          >
            <X size={17} aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            className="ws-config-button ws-config-button--primary"
            onClick={() => setPendingAction("save")}
            disabled={isLoading || isSaving || !hasChanges || (isCustomEnabled && errorCount > 0)}
            title={errorCount > 0 ? "Fix the highlighted ranges before saving" : undefined}
          >
            {isSaving ? (
              <Loader2 size={17} className="ws-config-spinner" aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            {isSaving ? "Saving..." : "Save Changes"}
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
                ? "Custom ranges are enabled. Saved ranges override the official DepEd transmutation table."
                : "Turned off. The system uses the official DepEd SY 2026–2027 transmutation table and ranges are locked."}
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
          disabled={isLoading || isSaving}
        >
          <span className="gt-switch__thumb" />
          <span className="gt-switch__label">{isCustomEnabled ? "ON" : "OFF"}</span>
        </button>
      </section>

      <div className="gt-grid">
        {/* Ranges panel card — heading is OUTSIDE the fieldset so Lock/Unlock always works */}
        <section className="ws-config-panel gt-panel" aria-labelledby="gt-table-title">
          <div className="ws-config-panel__heading">
            <div>
              <h2 id="gt-table-title">Grade Ranges</h2>
              <p>Each initial grade range maps to an official transmuted grade.</p>
            </div>
            <div className="gt-panel-actions">
              <span className="ws-config-panel__count">{ranges.length} ranges</span>
              {/* Lock/Unlock button — visible only while custom transmutation is ON.
                  Rendered OUTSIDE the fieldset so locking never disables it. */}
              {!isDisabled && (
                <button
                  type="button"
                  className={`ws-config-button gt-small-button ${
                    isTableLocked
                      ? "ws-config-button--primary"
                      : "ws-config-button--secondary"
                  }`}
                  onClick={handleTableLockToggle}
                  title={isTableLocked ? "Unlock table for editing" : "Lock table to prevent accidental edits"}
                  aria-pressed={isTableLocked}
                >
                  {isTableLocked ? (
                    <>
                      <LockOpen size={15} aria-hidden="true" />
                      Unlock Table
                    </>
                  ) : (
                    <>
                      <Lock size={15} aria-hidden="true" />
                      Lock Table
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                className="ws-config-button ws-config-button--secondary gt-small-button"
                onClick={() => setPendingAction("reset")}
                disabled={isDisabled || isTableLocked || isLoading || isSaving}
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reset to DepEd Default
              </button>
            </div>
          </div>

          {/* fieldset wraps only the editable table area and footer */}
          <fieldset
            className="gt-content"
            disabled={isDisabled || isTableLocked || isLoading || isSaving}
            aria-disabled={isDisabled || isTableLocked || isLoading || isSaving}
          >
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
                    <th scope="col" className="gt-drag-col" aria-label="Drag to reorder"></th>
                    <th scope="col">#</th>
                    <th scope="col">Initial Grade (Min)</th>
                    <th scope="col">Initial Grade (Max)</th>
                    <th scope="col">Transmuted Grade</th>
                    <th scope="col">Remarks</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="ws-config-table-state">
                        Loading grade transmutation table...
                      </td>
                    </tr>
                  ) : ranges.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="ws-config-table-state">
                        No ranges defined. Add a range to get started.
                      </td>
                    </tr>
                  ) : (
                    ranges.map((range, index) => {
                      const rowError = errors[range.id];
                      const transmuted = toNumber(range.transmuted);
                      const isPassing = !Number.isNaN(transmuted) && transmuted >= PASSING_GRADE;
                      const isDefaultMin =
                        range.label === "default minimum" ||
                        (Number(range.min) === 0 && Number(range.max) === 24);
                      const isDragOver = dragOverId === range.id;
                      const canDrag = !isDisabled && !isTableLocked && !isLoading && !isSaving;

                      return (
                        <tr
                          key={range.id}
                          className={[
                            rowError ? "gt-row--invalid" : "",
                            isDragOver ? "gt-row--drag-over" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable={canDrag}
                          onDragStart={() => handleDragStart(range.id)}
                          onDragOver={(e) => handleDragOver(e, range.id)}
                          onDrop={() => handleDrop(range.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <td className="gt-drag-handle" aria-hidden="true">
                            <span
                              className={`gt-drag-grip ${
                                canDrag ? "gt-drag-grip--active" : ""
                              }`}
                            >
                              <GripVertical size={16} />
                            </span>
                          </td>
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
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <span className={`gt-chip ${isPassing ? "gt-chip--pass" : "gt-chip--fail"}`}>
                                  {isPassing ? "Passed" : "Failed"}
                                </span>
                                {isDefaultMin && (
                                  <span className="gt-chip gt-chip--default-min" title="Default minimum grade assigned for 0.00 - 24.00">
                                    Default Minimum
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ws-config-row-action ws-config-row-action--clear"
                              onClick={() => handleRemoveRange(range.id)}
                              aria-label={`Remove range ${index + 1}`}
                              title="Remove range"
                              disabled={isDisabled}
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
              <button
                type="button"
                className="gt-add-button"
                onClick={handleAddRange}
                disabled={isDisabled || isLoading || isSaving}
              >
                <Plus size={16} aria-hidden="true" />
                Add Range
              </button>
            </div>
          </fieldset>
        </section>

        {/* Side column — preview and summary */}
        <aside className="gt-side">
          <section className="ws-config-panel gt-side-card">
            <h3>Test a Grade</h3>
            <p>Enter an initial grade (0.00–100.00) to preview its transmuted value.</p>
            <input
              type="number"
              className="gt-input gt-input--wide"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 71.50"
              value={previewGrade}
              onChange={(event) => setPreviewGrade(event.target.value)}
              aria-label="Initial grade to preview"
            />
            <div className="gt-preview">
              <span>Transmuted Grade</span>
              <div style={{ textAlign: "right" }}>
                <strong
                  className={
                    previewResult === null
                      ? ""
                      : previewResult.transmuted >= PASSING_GRADE
                        ? "gt-preview--pass"
                        : "gt-preview--fail"
                  }
                >
                  {previewGrade === "" ? "—" : previewResult ? previewResult.transmuted : "No match"}
                </strong>
                {previewResult?.label && (
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
                    ({previewResult.label})
                  </div>
                )}
              </div>
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
                  {isDisabled ? "DepEd Default" : hasChanges ? "Unsaved changes" : "Custom Saved"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="gt-note">
            <Info size={16} aria-hidden="true" />
            <p>
              Under DepEd MATATAG (SY 2026–2027), the official passing grade is <strong>75</strong> (initial grade 70.00–72.99),
              and initial scores from 0.00 to 24.00 receive a <strong>60 (default minimum)</strong>.
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
