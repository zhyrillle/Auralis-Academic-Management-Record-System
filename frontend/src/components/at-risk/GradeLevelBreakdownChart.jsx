import React from "react";

const BAR_COLORS = {
  medium: "#c28b00", // Amber
  low: "#15803d",    // Green
  high: "#b91c1c",   // Red
};

// Default baseline data matching mockup if newly initialized
const DEFAULT_GRADE_DATA = [
  { grade: "G7", medium: 0, low: 0, high: 0 },
  { grade: "G8", medium: 0, low: 0, high: 0 },
  { grade: "G9", medium: 0, low: 0, high: 0 },
  { grade: "G10", medium: 0, low: 0, high: 0 },
];

export default function GradeLevelBreakdownChart({ data, loading }) {
  if (loading) {
    return (
      <div className="ar-chart-card">
        <div className="ar-chart-header-vertical">
          <h2 className="ar-chart-title">Breakdown by Grade Level</h2>
          <p className="ar-chart-subtitle">Grade level fail rate distribution</p>
        </div>
        <div className="ar-skeleton-bars" />
      </div>
    );
  }

  // Format data
  let displayRows = DEFAULT_GRADE_DATA;
  if (data && data.length > 0) {
    displayRows = data.map((d, i) => {
      const gLabel = d.grade.replace(/Grade\s*/i, "G") || `G${i + 7}`;
      return {
        grade: gLabel,
        medium: typeof d.medium === "number" ? d.medium : 0,
        low: typeof d.low === "number" ? d.low : 0,
        high: typeof d.high === "number" ? d.high : 0,
      };
    });
  }

  const Y_MAX = 20;
  const Y_TICKS = [20, 15, 10, 5, 0];

  return (
    <div className="ar-chart-card">
      <div className="ar-chart-header-vertical">
        <h2 className="ar-chart-title">Breakdown by Grade Level</h2>
        <p className="ar-chart-subtitle">Grade level fail rate distribution</p>
      </div>

      <div className="ar-bar-chart-wrapper">
        {/* Y Axis Labels */}
        <div className="ar-bar-y-axis">
          {Y_TICKS.map((tick) => (
            <span key={tick} className="ar-bar-y-tick">
              {tick}
            </span>
          ))}
        </div>

        {/* Chart Canvas */}
        <div className="ar-bar-canvas">
          {/* Horizontal Grid lines */}
          <div className="ar-bar-grid-lines">
            {Y_TICKS.map((tick) => (
              <div
                key={tick}
                className="ar-bar-grid-line"
                style={{ bottom: `${(tick / Y_MAX) * 100}%` }}
              />
            ))}
          </div>

          {/* Groups of Bars */}
          <div className="ar-bar-groups-container">
            {displayRows.map((row, idx) => {
              // Note the specific color order per grade as in the visual
              const bars = [
                { key: "medium", value: row.medium, color: BAR_COLORS.medium },
                { key: "low", value: row.low, color: BAR_COLORS.low },
                { key: "high", value: row.high, color: BAR_COLORS.high },
              ];

              return (
                <div key={idx} className="ar-grade-bar-group">
                  <div className="ar-grade-bars-row">
                    {bars.map((bar, bIdx) => {
                      const barHeightPct = Math.min(100, Math.max(4, (bar.value / Y_MAX) * 100));
                      return (
                        <div
                          key={bIdx}
                          className="ar-single-bar"
                          style={{
                            height: `${barHeightPct}%`,
                            backgroundColor: bar.color,
                          }}
                          title={`${row.grade} ${bar.key}: ${bar.value}`}
                        />
                      );
                    })}
                  </div>
                  <span className="ar-grade-label">{row.grade}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
