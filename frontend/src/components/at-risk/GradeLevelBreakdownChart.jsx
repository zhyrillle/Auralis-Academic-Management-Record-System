/**
 * @typedef {Object} GradeLevelBreakdownItem
 * @property {string} grade
 * @property {number} high
 * @property {number} medium
 * @property {number} low
 */

/**
 * @typedef {Object} GradeLevelBreakdownProps
 * @property {GradeLevelBreakdownItem[]} data
 * @property {boolean} [loading]
 */

const BAR_COLORS = {
  high: "#EF4444",
  medium: "#F4B400",
  low: "#16A34A",
};

export default function GradeLevelBreakdownChart({ data, loading }) {
  if (loading) {
    return (
      <div className="ar-card">
        <h2 className="ar-card-title">Breakdown by Grade Level</h2>
        <p className="ar-card-subtitle">Grade level fail rate distribution</p>
        <div className="ar-skeleton-bars" />
      </div>
    );
  }

  const maxVal = data.length
    ? Math.max(...data.map((d) => Math.max(d.high, d.medium, d.low)))
    : 20;
  const yMax = Math.max(maxVal, 20);
  const gridSteps = [0, 5, 10, 15, 20].filter((n) => n <= yMax);

  return (
    <div className="ar-card">
      <h2 className="ar-card-title">Breakdown by Grade Level</h2>
      <p className="ar-card-subtitle">Grade level fail rate distribution</p>
      <div className="ar-bar-chart">
        <div className="ar-bar-y-axis">
          {gridSteps.map((n) => (
            <span key={n} className="ar-bar-y-label">{n}</span>
          ))}
        </div>
        <div className="ar-bar-chart-body">
          <div className="ar-bar-grid">
            {gridSteps.map((n) => (
              <div key={n} className="ar-bar-grid-line" style={{ bottom: `${(n / yMax) * 100}%` }}>
                <span className="ar-bar-grid-label">{n}</span>
              </div>
            ))}
          </div>
          <div className="ar-bar-groups">
            {data.length === 0 && (
              <div className="ar-no-data">No data provided yet</div>
            )}
            {data.map((row) => {
              const bars = [
                { key: "medium", value: row.medium },
                { key: "low", value: row.low },
                { key: "high", value: row.high },
              ];

              return (
                <div key={row.grade} className="ar-bar-group">
                  {bars.map((bar) => (
                    <div key={bar.key} className="ar-bar-group-bars">
                      <div
                        className="ar-bar"
                        style={{
                          height: `${(bar.value / yMax) * 100}%`,
                          background: BAR_COLORS[bar.key],
                        }}
                      />
                    </div>
                  ))}
                  <span className="ar-bar-group-label">{row.grade}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
