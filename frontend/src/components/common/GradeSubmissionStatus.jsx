import { useState } from 'react';
import { ClipboardCheck, LoaderCircle, RefreshCw } from 'lucide-react';
import OverlayPanel from './OverlayPanel.jsx';
import { useGradeSubmissionStatus } from '../../services/gradeSubmissionStatus.js';
import '../../styles/gradeSubmissionStatus.css';

const labels = { SUBMITTED: 'Submitted', NOT_SUBMITTED: 'Not submitted', IN_CORRECTION: 'Correction in progress', UNAVAILABLE: 'Unavailable' };
const formatSubmissionTime = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value));
};
export function GradeSubmissionBadge({ record, term, loading, error, retry }) {
  const label = error ? 'Status unavailable' : loading ? 'Checking status…' : labels[record?.state] || 'Status unavailable';
  return <span className="grade-submission-status" aria-live="polite" aria-busy={Boolean(loading && !error)}>
    <span className={`grade-submission-badge grade-submission-badge--${error ? 'UNAVAILABLE' : record?.state || 'UNAVAILABLE'}`}
      title={record?.submittedAt ? `Last submitted by ${record.submittedBy?.name || 'Not recorded'} · ${formatSubmissionTime(record.submittedAt)}` : undefined}>
      {loading && !error && <LoaderCircle size={14} className="grade-submission-spinner" aria-hidden="true" />}
      {term ? `Term ${term.slice(1)} · ` : ''}{label}
    </span>
    {error && retry && <button type="button" className="grade-submission-retry" onClick={retry} aria-label="Retry submission status"><RefreshCw size={14} /></button>}
  </span>;
}
function SubmissionRows({ assignmentId, refreshKey }) {
  const { data, error, loading, retry } = useGradeSubmissionStatus({ adviserAssignmentId: assignmentId }, { refreshKey });
  if (error) return <div role="alert" className="grade-submission-feedback"><p>{error}</p><button type="button" onClick={retry}>Retry submission status</button></div>;
  if (loading) return <p role="status" className="grade-submission-loading">
    <LoaderCircle size={18} className="grade-submission-spinner" aria-hidden="true" />Loading submission status…
  </p>;
  if (!data.subjects.length) return <p>No subjects are configured for this section and school year.</p>;
  return <><p className="grade-submission-scroll-hint">Scroll horizontally to view all three terms.</p>
    <div className="grade-submission-table-wrap" role="region" aria-label="Subject submission statuses" tabIndex={0}>
    <table className="grade-submission-table">
      <thead><tr><th scope="col">Subject / assigned teacher</th>{[1, 2, 3].map(n => <th scope="col" key={n}>Term {n}</th>)}</tr></thead>
      <tbody>{data.subjects.map(subject => <tr key={subject.subjectOfferingId}>
        <th scope="row">{subject.subjectName}<small>{subject.assignedTeachers.join(', ') || 'Teacher not assigned'}</small></th>
        {subject.terms.map(record => <td key={record.term}>
          <GradeSubmissionBadge record={record} />
          {record.state !== 'NOT_SUBMITTED' && record.state !== 'UNAVAILABLE' && <div className="grade-submission-details">
            <span>{record.state === 'IN_CORRECTION' ? 'Last submitted by' : 'Submitted by'}: {record.submittedBy?.name || 'Not recorded'}</span>
            <time dateTime={record.submittedAt || undefined}>{formatSubmissionTime(record.submittedAt)}</time>
          </div>}
        </td>)}
      </tr>)}</tbody>
    </table>
  </div></>;
}
export default function GradeSubmissionStatusPanel({ adviserAssignmentId, disabled, refreshKey }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="grade-submission-open" onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog">
      <ClipboardCheck size={17} aria-hidden="true" />Submission status
    </button>
    <OverlayPanel isOpen={open} onClose={() => setOpen(false)} title="Submission status" variant="bottom" className="grade-submission-panel"
      description="Subject teacher submissions for this section and school year. Times are shown in Philippine time.">
      {open && <SubmissionRows key={adviserAssignmentId} assignmentId={adviserAssignmentId} refreshKey={refreshKey} />}
    </OverlayPanel>
  </>;
}
