import { useState } from 'react';
import ProgressBar from '../common/ProgressBar';
import DropdownSelect from '../common/DropdownSelect';
import TablePagination from '../common/TablePagination';

const STATUS_CONFIG = { Pending: 'dept-pill-amber', Submitted: 'dept-pill-green', Overdue: 'dept-pill-red' };

export default function SubmissionMonitorTable({ data, loading }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const safePage = Math.min(page, Math.max(1, Math.ceil(data.length / pageSize)));
  return <section className="dept-card dept-submission-monitor">
    <div className="dept-card-header-row"><h2 className="dept-card-title">Submission Monitor</h2>
      <DropdownSelect label="Submission rows" value={pageSize} options={[5, 10, 20].map(value => ({ value, label: value + ' rows' }))}
        onChange={value => { setPageSize(Number(value)); setPage(1); }} />
    </div>
    {loading ? <div className="dept-skeleton-table" role="status" aria-label="Loading submissions" /> : <>
      <div className="dept-table-wrap"><table className="dept-table">
        <thead><tr><th>Teacher</th><th>Grade/Section</th><th>Status</th><th>Completion</th></tr></thead>
        <tbody>{!data.length && <tr><td colSpan={4} className="dept-no-data-row">No data provided yet</td></tr>}
          {data.slice((safePage - 1) * pageSize, safePage * pageSize).map((row, index) => <tr key={index}>
            <td>{row.teacher}</td><td>{row.gradeSection}</td>
            <td><span className={'dept-pill ' + (STATUS_CONFIG[row.status] || STATUS_CONFIG.Pending)}><span className="dept-pill-icon" aria-hidden="true">●</span>{row.status}</span></td>
            <td><div className="dept-progress-cell"><ProgressBar className="dept-progress-track" value={row.completion} ariaLabel={row.teacher + ' submission completion'} /><span className="dept-progress-text">{row.completion}%</span></div></td>
          </tr>)}</tbody>
      </table></div>
      <TablePagination page={safePage} pageSize={pageSize} total={data.length} onPageChange={setPage} itemLabel="submission" />
    </>}
  </section>;
}
