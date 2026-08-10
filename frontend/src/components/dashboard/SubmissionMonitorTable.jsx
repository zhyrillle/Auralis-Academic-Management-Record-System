/**
 * @typedef {Object} SubmissionMonitorItem
 * @property {string} teacher
 * @property {string} gradeSection
 * @property {string} status - Pending | Submitted | Overdue
 * @property {number} completion
 */

/**
 * @typedef {Object} SubmissionMonitorTableProps
 * @property {SubmissionMonitorItem[]} data
 * @property {boolean} [loading]
 */

const STATUS_CONFIG = {
  Pending: {
    className: "dept-pill-amber",
    icon: "●",
  },
  Submitted: {
    className: "dept-pill-green",
    icon: "●",
  },
  Overdue: {
    className: "dept-pill-red",
    icon: "●",
  },
};

export default function SubmissionMonitorTable({ data, loading }) {
  if (loading) {
    return (
      <div className="dept-card">
        <h2 className="dept-card-title">Submission Monitor</h2>
        <div className="dept-skeleton-table" />
      </div>
    );
  }

  return (
    <div className="dept-card">
      <h2 className="dept-card-title">Submission Monitor</h2>
      <div className="dept-table-wrap">
        <table className="dept-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Grade/Section</th>
              <th>Status</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="dept-no-data-row">
                  No data provided yet
                </td>
              </tr>
            )}
            {data.map((row, idx) => {
              const statusCfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.Pending;

              return (
                <tr key={idx}>
                  <td>{row.teacher}</td>
                  <td>{row.gradeSection}</td>
                  <td>
                    <span className={`dept-pill ${statusCfg.className}`}>
                      <span className="dept-pill-icon">{statusCfg.icon}</span>
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <div className="dept-progress-cell">
                      <div className="dept-progress-track">
                        <div
                          className="dept-progress-fill"
                          style={{ width: `${row.completion}%` }}
                        />
                      </div>
                      <span className="dept-progress-text">{row.completion}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
