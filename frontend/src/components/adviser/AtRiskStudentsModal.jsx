import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users } from 'lucide-react';
import { getAtRiskStudents } from '../../services/adviserDashboardService';
import useCachedQuery from '../../services/useCachedQuery';
import { cacheKey } from '../../services/navigationCache';
import PageSkeleton from '../common/PageSkeleton';
import DropdownSelect from '../common/DropdownSelect';
import '../../styles/atRiskStudentsModal.css';

const labels = { high: 'High', medium: 'Medium', low: 'Low' };

function RiskModal({ onClose, userId, initialBand = 'high' }) {
  const [mode, setMode] = useState('monitoring');
  const [selectedBand, setSelectedBand] = useState(initialBand);
  const [section, setSection] = useState('all');
  const [search, setSearch] = useState('');
  const dialog = useRef(null);
  const predictHelpId = useId();
  const prediction = mode === 'prediction';
  const monitoring = useCachedQuery(cacheKey('adviser:dashboard-risk-v2', { userId, mode: 'monitoring' }),
    () => getAtRiskStudents(userId, { force: true }), { refreshInterval: 0, revalidateOnFocus: false });
  const forecast = useCachedQuery(cacheKey('adviser:dashboard-risk-v2', { userId, mode: 'prediction' }),
    () => getAtRiskStudents(userId, { mode: 'prediction', force: true }),
    { enabled: prediction, refreshInterval: 0, revalidateOnFocus: false });
  const query = prediction ? forecast : monitoring;
  const data = query.data;
  const readiness = monitoring.data?.predictionSections || [];
  const selectedReadiness = readiness.find(row => String(row.sectionId) === section);
  const canPredict = section === 'all' ? monitoring.data?.predictionReady : selectedReadiness?.ready;
  const unavailable = section === 'all' ? readiness.find(row => !row.ready) : selectedReadiness;
  const reason = unavailable?.reason || 'Prediction requires an assigned English class with a completed, submitted and finalized source term.';
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    const keyboard = event => {
      if (event.key === 'Escape' && !dialog.current.querySelector('.dropdown-select__trigger[aria-expanded="true"]')) onClose();
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.current.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [onClose]);
  const students = useMemo(() => data?.students || [], [data]);
  const sections = [...new Map([...(monitoring.data?.students || []), ...(monitoring.data?.unavailableStudents || [])]
    .map(student => [String(student.section_id), student.section_name])).entries()];
  const changeSection = value => {
    setSection(value);
    if (prediction && value !== 'all' && !readiness.find(row => String(row.sectionId) === value)?.ready) setMode('monitoring');
  };
  const matching = students.filter(student => (section === 'all' || String(student.section_id) === section)
    && `${student.name} ${student.lrn || ''} ${student.subjects.map(subject => subject.name).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const counts = { high: 0, medium: 0, low: 0 };
  matching.forEach(student => counts[student.risk_level]++);
  const visible = matching.filter(student => selectedBand === 'all' || student.risk_level === selectedBand);

  return createPortal(<div className="at-risk-modal__backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className="at-risk-modal__card risk-review" role="dialog" aria-modal="true" aria-labelledby="risk-review-title">
      <header className="at-risk-modal__header">
        <div><h2 id="risk-review-title" className="at-risk-modal__title">Student Risk Overview</h2>
          <p className="risk-review__context">{prediction ? 'English prediction' : 'Current-term monitoring'}{data && ` · ${data.targetTerm || data.term} · SY ${data.schoolYear}`}</p></div>
        <button type="button" className="at-risk-modal__close-btn" onClick={onClose} aria-label="Close risk overview"><X size={20} /></button>
      </header>
      <div className="risk-review__toolbar">
        <p>{prediction ? `Next-term English risk based on completed ${data?.sourceTerm || 'preceding-term'} records.`
          : 'Each learner appears once, under their highest current risk across your teaching subjects.'}</p>
        <div className="risk-review__prediction-control" tabIndex={!prediction && !canPredict ? 0 : undefined}
          aria-label={!prediction && !canPredict ? 'About next-term predictions' : undefined}
          aria-describedby={predictHelpId}>
        <button type="button" className="risk-review__predict" role="switch" aria-checked={prediction}
          aria-describedby={predictHelpId}
          disabled={!prediction && !canPredict}
          onClick={() => setMode(prediction ? 'monitoring' : 'prediction')}>
          <span aria-hidden="true" className="risk-review__switch" />Predict <span className="risk-review__english">English</span>
        </button>
        <span className="risk-review__predict-tooltip" role="tooltip" id={predictHelpId}>
          <strong>Predict next term</strong>
          <span>{monitoring.loading ? 'Please wait while this term’s records load.' : !canPredict && !prediction
            ? reason : prediction ? 'Turn Predict off to return to this term’s running performance.'
              : 'View the next-term English prediction using this term’s submitted records.'}</span>
        </span>
        </div>
      </div>
      <div className="risk-review__content">
        {query.loading ? <PageSkeleton label="Loading risk overview" layout="cards" rows={3} /> : query.error ? <div className="at-risk-modal__error" role="alert">
          <p>{String(query.error.message || query.error)}</p><button type="button" onClick={query.refresh}>Retry</button>
        </div> : <>
          <div className="risk-review__bands" aria-label="Filter risk level">
            {Object.entries(labels).map(([key, label]) => <button type="button" key={key}
              className={`risk-review__band risk-review__band--${key}`} aria-pressed={selectedBand === key} onClick={() => setSelectedBand(key)}>
              <span>{label} Risk</span><strong>{counts[key]}</strong>
            </button>)}
          </div>
          <div className="risk-review__filters">
            <input aria-label="Search learners" placeholder="Search name, LRN, or subject…" value={search} onChange={event => setSearch(event.target.value)} />
            <DropdownSelect label="Filter section" value={section} onChange={changeSection}
              className="risk-review__section-filter"
              options={[{ value: 'all', label: 'All sections' }, ...sections.map(([id, name]) => ({ value: id, label: name }))]} />
            <button type="button" aria-pressed={selectedBand === 'all'} onClick={() => setSelectedBand('all')}>All bands</button>
          </div>
          {data?.unavailableCount > 0 && <p className="risk-review__notice">{data.unavailableCount} learner(s) need records or review. They are excluded from the band counts.</p>}
          {data?.notices?.length > 0 && <details className="risk-review__notice"><summary>Availability notes</summary>{data.notices.map((notice, i) => <p key={i}>{notice}</p>)}</details>}
          <p className="risk-review__result-count" role="status">{visible.length} learner(s) shown</p>
          <div className="at-risk-modal__list">{visible.map(student => <article key={student.student_section_id}
            className={`risk-review__student risk-review__band--${student.risk_level}`}>
            <div className="at-risk-modal__student-card-top"><div><h3>{student.name}</h3>
              <p>{student.grade_level} · {student.section_name}{student.lrn && ` · LRN: ${student.lrn}`}</p></div>
              <span className="risk-review__pill">{labels[student.risk_level]} Risk</span></div>
            <ul className="risk-review__subjects">{student.subjects.map(subject => <li key={subject.name}>
              <span>{subject.name}</span><span>{subject.riskLevel ? `${labels[subject.riskLevel]} · ${prediction ? 'Submitted grade' : 'Grade preview'} ${subject.grade}`
                : 'Records needed / review'}</span>
            </li>)}</ul>
          </article>)}</div>
          {!visible.length && <div className="risk-review__empty"><Users size={20} /><div><h3>No matching learners</h3><p>Try another risk band, section, or search.</p></div></div>}
        </>}
      </div>
      <footer className="at-risk-modal__footer"><span className="at-risk-modal__footer-note">{prediction
        ? 'English model labels are preliminary. Review records before acting.' : 'High: below 75 · Medium: 75–79 · Low: 80 or above.'}</span>
        <button type="button" className="at-risk-modal__done-btn" onClick={onClose}>Done</button></footer>
    </section>
  </div>, document.body);
}

export default function AtRiskStudentsModal({ isOpen, ...props }) {
  return isOpen ? <RiskModal {...props} /> : null;
}
