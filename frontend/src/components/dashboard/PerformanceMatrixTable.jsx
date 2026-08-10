/**
 * @typedef {Object} PerformanceMatrixItem
 * @property {string} section
 * @property {number} mean
 * @property {number} mps
 * @property {string} examDistribution - Below Average | Normal | Above Average
 */

/**
 * @typedef {Object} PerformanceMatrixTableProps
 * @property {PerformanceMatrixItem[]} data
 * @property {boolean} [loading]
 */

const EXAM_DISTRIBUTION_CONFIG = {
  "Below Average": "dept-pill-amber",
  Normal: "dept-pill-neutral",
  "Above Average": "dept-pill-green",
};

export default function PerformanceMatrixTable({ data, loading }) {
  if (loading) {
    return (
      <div className="dept-card">
        <h2 className="dept-card-title">Performance Analysis Matrix</h2>
        <div className="dept-skeleton-table" />
      </div>
    );
  }

  return (
    <div className="dept-card">
      <h2 className="dept-card-title">Performance Analysis Matrix</h2>
      <div className="dept-table-wrap">
        <table className="dept-table">
          <thead>
            <tr>
              <th>Section</th>
              <th>Mean</th>
              <th>MPS</th>
              <th>Exam Distribution</th>
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
              const examClass = EXAM_DISTRIBUTION_CONFIG[row.examDistribution] || "dept-pill-neutral";

              return (
                <tr key={idx}>
                  <td>{row.section}</td>
                  <td className="dept-text-green">{row.mean}</td>
                  <td>{row.mps}</td>
                  <td>
                    <span className={`dept-pill ${examClass}`}>{row.examDistribution}</span>
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
