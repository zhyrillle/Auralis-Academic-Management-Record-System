import { useMemo } from "react";

/**
 * @typedef {Object} ComparativeAnalysisItem
 * @property {string} gradeLevel
 * @property {number} aboveAverage
 * @property {number} fail
 * @property {number} passingRate
 */

/**
 * @typedef {Object} ComparativeAnalysisCardProps
 * @property {ComparativeAnalysisItem[]} data
 * @property {boolean} [loading]
 * @property {string} [error]
 */

export default function ComparativeAnalysisCard({ data, loading, error }) {
  const maxTotal = useMemo(() => {
    if (!data.length) return 100;
    return Math.max(...data.map((d) => d.aboveAverage + d.fail));
  }, [data]);

  if (loading) {
    return (
      <div className="dept-card dept-card-wide">
        <h2 className="dept-card-title">Comparative Analysis - English Department</h2>
        <div className="dept-skeleton-bar" />
        <div className="dept-skeleton-bar" />
        <div className="dept-skeleton-bar" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dept-card dept-card-wide">
        <h2 className="dept-card-title">Comparative Analysis - English Department</h2>
        <p className="dept-error-text">{error}</p>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="dept-card dept-card-wide">
        <h2 className="dept-card-title">Comparative Analysis - English Department</h2>
        <p className="dept-no-data">No data available</p>
      </div>
    );
  }

  return (
    <div className="dept-card dept-card-wide">
      <h2 className="dept-card-title">Comparative Analysis - English Department</h2>
      <div className="dept-comparative-list">
        {data.map((row) => {
          const total = row.aboveAverage + row.fail;
          const aboveWidth = total > 0 ? (row.aboveAverage / maxTotal) * 100 : 0;
          const failWidth = total > 0 ? (row.fail / maxTotal) * 100 : 0;

          return (
            <div key={row.gradeLevel} className="dept-comparative-row">
              <div className="dept-comparative-label">{row.gradeLevel}</div>
              <div className="dept-comparative-bar-track">
                <div className="dept-comparative-bar-above" style={{ width: `${aboveWidth}%` }} />
                <div className="dept-comparative-bar-fail" style={{ width: `${failWidth}%` }} />
              </div>
              <div className="dept-comparative-counts">
                <span className="dept-passed-count">{row.aboveAverage} passed</span>
                <span className="dept-failed-count">{row.fail} failed</span>
              </div>
              <div className="dept-comparative-rate">{row.passingRate}%</div>
            </div>
          );
        })}
      </div>
      <div className="dept-legend">
        <span className="dept-legend-item">
          <span className="dept-legend-dot dept-legend-green" />
          Above Average
        </span>
        <span className="dept-legend-item">
          <span className="dept-legend-dot dept-legend-red" />
          Fail
        </span>
      </div>
    </div>
  );
}


