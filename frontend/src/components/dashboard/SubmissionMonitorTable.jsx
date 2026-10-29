import { useState } from 'react';
import ProgressBar from '../common/ProgressBar';
import DropdownSelect from '../common/DropdownSelect';
import TablePagination from '../common/TablePagination';

const STATUS_CONFIG = { Pending: 'dept-pill-amber', Submitted: 'dept-pill-green', Overdue: 'dept-pill-red', 'Submitted late': 'dept-pill-amber', 'Not configured': 'dept-pill-neutral' };

export default function SubmissionMonitorTable({ data, loading, error, onRetry, term, onTermChange }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const safePage = Math.min(page, Math.max(1, Math.ceil(data.length / pageSize)));

  const termOptions = [
    { value: '1', label: 'Term 1' },
    { value: '2', label: 'Term 2' },
    { value: '3', label: 'Term 3' },
    { value: 'overall', label: 'All Terms' },
  ];

  const currentTermValue = term === '' ? 'overall' : (term || '1');

  return <section className="dept-card dept-submission-monitor">
    <div className="dept-card-header-row">
      <h2 className="dept-card-title">Submission Monitor</h2>
      <div className="dept-card-header-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {onTermChange && (
          <DropdownSelect
            label="Submission term"
            value={currentTermValue}
            options={termOptions}
            onChange={value => {
              onTermChange(value === 'overall' ? '' : value);
              setPage(1);
            }}
          />
        )}
        <DropdownSelect
          label="Submission rows"
          value={pageSize}
          options={[5, 10, 20].map(value => ({ value, label: value + ' rows' }))}
          onChange={value => { setPageSize(Number(value)); setPage(1); }}
        />
      </div>
    </div>
    {loading ? <div className="dept-skeleton-table" role="status" aria-label="Loading submissions" /> : error ? <div className="dept-error-banner" role="alert">
      <p>Couldn’t load submissions. Please try again.</p>
      <button type="button" onClick={onRetry}>Retry submissions</button>
    </div> : <>
      <div className="dept-table-wrap"><table className="dept-table">
        <thead><tr><th>Teacher</th><th>Grade/Section</th><th>Subject</th><th>Status</th><th>Submission Progress</th></tr></thead>
        <tbody>{!data.length && <tr><td colSpan={5} className="dept-no-data-row">No submissions match the selected filters.</td></tr>}
          {data.slice((safePage - 1) * pageSize, safePage * pageSize).map(row => <tr key={row.subjectOfferingId}>
            <td>{row.teacher}</td><td>{row.gradeSection}</td><td>{row.subject}</td>
            <td><span className={'dept-pill ' + (STATUS_CONFIG[row.status] || STATUS_CONFIG.Pending)}><span className="dept-pill-icon" aria-hidden="true">●</span>{row.status}</span></td>
            <td>{row.expectedTerms > 0 ? <>
              <div>{row.submittedTerms} of {row.expectedTerms} submitted</div>
              <div className="dept-progress-cell"><ProgressBar className="dept-progress-track" value={row.completion} ariaLabel={`${row.teacher} ${row.subject} submission progress`} /><span className="dept-progress-text">{row.completion}%</span></div>
              {row.overdueTerms > 0 && <small>{row.overdueTerms} overdue</small>}
              {row.lateTerms > 0 && <small> {row.lateTerms} submitted late</small>}
            </> : 'No configured terms'}</td>
          </tr>)}</tbody>
      </table></div>
      <TablePagination page={safePage} pageSize={pageSize} total={data.length} onPageChange={setPage} itemLabel="submission" />
    </>}
  </section>;
}
