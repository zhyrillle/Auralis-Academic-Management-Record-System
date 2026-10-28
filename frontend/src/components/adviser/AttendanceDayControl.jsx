import React, { useState } from 'react';
import { CalendarOff, Info, Trash2 } from 'lucide-react';
import OverlayPanel from '../common/OverlayPanel.jsx';
import DropdownSelect from '../common/DropdownSelect.jsx';
import { NO_CLASS_LABELS } from '../../utils/attendanceDays.js';

export default function AttendanceDayControl({ date, reason, disabled, saving, onSave }) {
  const [isOpen, setIsOpen] = useState(false);
  const [choice, setChoice] = useState('HOLIDAY');
  const [saveError, setSaveError] = useState('');

  const open = () => {
    setChoice(reason || 'HOLIDAY');
    setSaveError('');
    setIsOpen(true);
  };

  const close = () => {
    if (saving) return;
    setIsOpen(false);
    setSaveError('');
  };

  const save = async nextReason => {
    setSaveError('');
    const result = await onSave(nextReason);
    if (result === true) {
      setIsOpen(false);
    } else {
      setSaveError(typeof result === 'string' ? result : 'This date cannot be changed right now.');
    }
  };

  const formattedDate = date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : date;

  const isMarked = Boolean(reason);

  return (
    <>
      <button
        type="button"
        className={`att-day-button${isMarked ? ' is-marked' : ''}`}
        onClick={open}
        disabled={disabled || saving}
        aria-haspopup="dialog"
        title={disabled ? 'Only today’s day marker can be changed.' : (isMarked ? 'Edit no-class marker for today' : 'Mark today as having no classes')}
      >
        <CalendarOff size={15} aria-hidden="true" />
        <span>{isMarked ? 'Edit No-Class Marker' : 'Mark No Classes'}</span>
      </button>

      <OverlayPanel
        isOpen={isOpen}
        onClose={close}
        variant="modal"
        title={isMarked ? 'Edit No-Class Marker' : 'Mark No Classes'}
        eyebrow="School Form 2 (SF2)"
        description="Mark the entire section’s day as having no classes. Individual student attendance will be excluded from monthly totals while marked."
        busy={saving}
        error={saveError}
        className="att-day-overlay-modal"
        footer={
          <div className="att-day-modal-footer">
            {isMarked && (
              <button
                type="button"
                className="att-day-btn att-day-btn--danger"
                onClick={() => save(null)}
                disabled={saving}
              >
                <Trash2 size={14} />
                <span>Remove Marker</span>
              </button>
            )}
            <button
              type="button"
              className="att-day-btn att-day-btn--secondary"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="att-no-class-form"
              className="att-day-btn att-day-btn--primary"
              disabled={saving}
            >
              {saving ? 'Saving…' : (isMarked ? 'Save Changes' : 'Confirm No Classes')}
            </button>
          </div>
        }
      >
        <form
          id="att-no-class-form"
          className="att-day-modal-form"
          onSubmit={event => {
            event.preventDefault();
            save(choice);
          }}
        >
          <div className="att-day-modal-field">
            <div className="att-day-modal-label-row">
              <label className="att-day-modal-label">Reason for No Classes</label>
              <span className="att-day-modal-date-tag">{formattedDate}</span>
            </div>
            <DropdownSelect
              label="Select Reason"
              value={choice}
              onChange={setChoice}
              disabled={saving}
              options={Object.entries(NO_CLASS_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>

          <div className="att-day-info-card">
            <Info size={18} aria-hidden="true" />
            <div>
              <strong>Attendance Data Preservation</strong>
              <p>
                Existing attendance records and remarks remain securely saved, but are excluded from monthly SF2 calculations while this marker is active. Removing the marker immediately restores their contribution to attendance totals.
              </p>
            </div>
          </div>
        </form>
      </OverlayPanel>
    </>
  );
}
