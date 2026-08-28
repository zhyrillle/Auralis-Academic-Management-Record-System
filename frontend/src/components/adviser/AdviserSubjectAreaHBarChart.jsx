import React, { useState } from "react";

export default function AdviserSubjectAreaHBarChart({
  data = [],
  term = "T1",
  onTermChange,
  loading = false,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const terms = ["T1", "T2", "T3"];
  const xTicks = [0, 50, 100, 150, 200];

  const defaultData = [
    { subject: "Filipino", count: 75 },
    { subject: "English", count: 98 },
    { subject: "Mathematics", count: 65 },
    { subject: "Science", count: 122 },
    { subject: "AP", count: 99 },
    { subject: "TLE", count: 198 },
    { subject: "MAPEH", count: 55 },
  ];

  const items = data.length > 0 ? data : defaultData;

  const chartHeight = 220;
  const chartWidth = 460;
  const leftLabelPad = 95;
  const rightPad = 25;
  const topPad = 15;
  const bottomPad = 35;
  const plotWidth = chartWidth - leftLabelPad - rightPad;
  const plotHeight = chartHeight - topPad - bottomPad;

  return (
    <div className="adviser-dashboard__chart-card">
      <div className="adviser-dashboard__chart-header">
        <h3 className="adviser-dashboard__chart-title">
          Subject Area Performance Breakdown
        </h3>
        <div className="adviser-dashboard__term-pills">
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              className={`adviser-dashboard__term-pill ${term === t ? "active" : ""}`}
              onClick={() => onTermChange && onTermChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="adviser-dashboard__hbar-body">
        {loading ? (
          <div className="adviser-dashboard__skeleton-chart" />
        ) : (
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="adviser-dashboard__hbar-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Vertical grid lines and X-axis labels */}
            {xTicks.map((tick) => {
              const x = leftLabelPad + (tick / 200) * plotWidth;
              return (
                <g key={tick}>
                  <line
                    x1={x}
                    y1={topPad}
                    x2={x}
                    y2={topPad + plotHeight}
                    stroke={tick === 0 ? "#4A5568" : "#EAF0F6"}
                    strokeWidth={tick === 0 ? "1.5" : "1"}
                  />
                  <text
                    x={x}
                    y={topPad + plotHeight + 16}
                    textAnchor="middle"
                    className="adviser-dashboard__chart-axis-label"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Horizontal Bars */}
            {items.map((item, idx) => {
              const rowHeight = plotHeight / items.length;
              const barThickness = 14;
              const y = topPad + rowHeight * idx + (rowHeight - barThickness) / 2;
              const count = Math.min(200, Math.max(0, item.count || 0));
              const barWidth = (count / 200) * plotWidth;

              return (
                <g
                  key={item.subject || idx}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Subject Label */}
                  <text
                    x={leftLabelPad - 12}
                    y={y + barThickness / 2 + 4}
                    textAnchor="end"
                    className="adviser-dashboard__hbar-label"
                  >
                    {item.subject}
                  </text>

                  {/* Horizontal Bar */}
                  <rect
                    x={leftLabelPad}
                    y={y}
                    width={Math.max(barWidth, barThickness)}
                    height={barThickness}
                    rx={barThickness / 2}
                    ry={barThickness / 2}
                    fill={hoveredIdx === idx ? "#16345F" : "#2A5283"}
                    className="adviser-dashboard__hbar-pill"
                  />

                  {/* Hover tooltip */}
                  {hoveredIdx === idx && (
                    <g>
                      <rect
                        x={leftLabelPad + barWidth + 6}
                        y={y - 4}
                        width="36"
                        height="20"
                        rx="4"
                        fill="#1E293B"
                      />
                      <text
                        x={leftLabelPad + barWidth + 24}
                        y={y + 10}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {count}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

