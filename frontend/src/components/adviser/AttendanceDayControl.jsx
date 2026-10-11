import { useId, useRef, useState } from 'react';
import { CalendarOff, X } from 'lucide-react';
import DropdownSelect from '../common/DropdownSelect.jsx';
import { NO_CLASS_LABELS } from '../../utils/attendanceDays.js';

export default function AttendanceDayControl({ date, reason, disabled, saving, onSave }) {
  const dialog = useRef(null);
  const headingId = useId();
  const [choice, setChoice] = useState('HOLIDAY');
  const [saveError, setSaveError] = useState('');
  const open = () => {
    setChoice(reason || 'HOLIDAY');
    setSaveError('');
    dialog.current.showModal();
  };
  const save = async nextReason => {
    setSaveError('');
    const result = await onSave(nextReason);
    if (result === true) dialog.current.close();
    else setSaveError(typeof result === 'string' ? result : 'This date cannot be changed right now.');
  };
  return <>
    <button type="button" className={`att-day-button${reason ? ' is-marked' : ''}`} onClick={open}
      disabled={disabled || saving} aria-haspopup="dialog" title={disabled ? 'Only today’s day marker can be changed.' : undefined}>
      <CalendarOff size={16} aria-hidden="true" />
      {reason ? 'Edit no-class marker' : 'Mark no classes'}
    </button>
    <dialog ref={dialog} className="att-day-dialog" aria-labelledby={headingId}
      onCancel={event => { if (saving) event.preventDefault(); }}>
      <form onSubmit={event => { event.preventDefault(); save(choice); }}>
        <div className="att-day-dialog-header">
          <h2 id={headingId}>No classes · {date}</h2>
          <button type="button" onClick={() => dialog.current.close()} disabled={saving} aria-label="Close day marker"><X size={18} /></button>
        </div>
        <p>This marks the whole section’s day, not an individual learner’s attendance.</p>
        <DropdownSelect label="Reason" value={choice} onChange={setChoice} disabled={saving}
          options={Object.entries(NO_CLASS_LABELS).map(([value, label]) => ({ value, label }))} />
        <p className="att-day-preservation">Existing attendance and remarks will be kept, but excluded from totals while this marker is active. Removing the marker restores their contribution to totals.</p>
        {saveError && <p className="att-day-error" role="alert">{saveError}</p>}
        <div className="att-day-dialog-actions">
          {reason && <button type="button" className="att-day-remove" onClick={() => save(null)} disabled={saving}>Remove marker</button>}
          <button type="button" onClick={() => dialog.current.close()} disabled={saving}>Cancel</button>
          <button type="submit" className="att-save-btn" disabled={saving}>{saving ? 'Saving…' : 'Confirm no classes'}</button>
        </div>
      </form>
    </dialog>
  </>;
}
