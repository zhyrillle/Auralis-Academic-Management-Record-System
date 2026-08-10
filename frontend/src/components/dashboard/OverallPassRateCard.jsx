/**
 * @typedef {Object} PassRateData
 * @property {number} passed
 * @property {number} failed
 * @property {number} total
 * @property {number} passRatePercentage
 */

/**
 * @typedef {Object} OverallPassRateCardProps
 * @property {PassRateData} data
 * @property {boolean} [loading]
 */

export default function OverallPassRateCard({ data, loading }) {
  if (loading) {
    return (
      <div className="dept-card dept-card-narrow">
        <h2 className="dept-card-title">Overall pass rate</h2>
        <div className="dept-skeleton-ring" />
      </div>
    );
  }

  const passedWidth = data.total > 0 ? (data.passed / data.total) * 100 : 0;
  const failedWidth = data.total > 0 ? (data.failed / data.total) * 100 : 0;

  return (
    <div className="dept-card dept-card-narrow">
      <h2 className="dept-card-title">Overall pass rate</h2>
      <div className="dept-pass-rate-body">
        <div className="dept-donut" aria-hidden="true">
          <svg viewBox="0 0 36 36" className="dept-donut-svg">
            <path
              className="dept-donut-bg"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className="dept-donut-pass"
              strokeDasharray={`${passedWidth}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="dept-donut-center">
            <span className="dept-donut-percent">{data.passRatePercentage}%</span>
          </div>
        </div>
        <p className="dept-pass-rate-subtitle">
          Pass rate {data.passed} / {data.total} students
        </p>
        <div className="dept-legend">
          <span className="dept-legend-item">
            <span className="dept-legend-dot dept-legend-green" />
            Passed
          </span>
          <span className="dept-legend-item">
            <span className="dept-legend-dot dept-legend-red" />
            Failed
          </span>
        </div>
      </div>
    </div>
  );
}
