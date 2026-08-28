import React, { useState } from "react";

export default function AdviserSubjectBarChart({
  data = [],
  term = "T1",
  onTermChange,
  loading = false,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const terms = ["T1", "T2", "T3"];
  const yTicks = [100, 80, 60, 40, 20, 0];

  const hasData = data && data.length > 0;

  return (
    <div className="adviser-dashboard__chart-card">
      <div className="adviser-dashboard__chart-header">
        <h3 className="adviser-dashboard__chart-title">
          Subject Performance Breakdown
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

      <div className="adviser-dashboard__bar-chart-body">
        {loading ? (
          <div className="adviser-dashboard__skeleton-chart" />
        ) : (
          <div className="adviser-dashboard__vbar-container">
            <svg
              viewBox="0 0 460 220"
              className="adviser-dashboard__vbar-svg"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Grid Lines and Y-Axis Labels */}
              {yTicks.map((tick) => {
                const y = 20 + ((100 - tick) / 100) * 160;
                return (
                  <g key={tick}>
                    <text
                      x="25"
                      y={y + 4}
                      textAnchor="end"
                      className="adviser-dashboard__chart-axis-label"
                    >
                      {tick}
                    </text>
                    <line
                      x1="35"
                      y1={y}
                      x2="445"
                      y2={y}
                      stroke={tick === 0 ? "#4A5568" : "#E8ECF2"}
                      strokeWidth={tick === 0 ? "1.5" : "1"}
                    />
                  </g>
                );
              })}

              {!hasData ? (
                <text
                  x="240"
                  y="110"
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="13"
                  fontWeight="500"
                >
                  No performance data available yet
                </text>
              ) : (
                data.map((item, idx) => {
                  const barCount = data.length || 4;
                  const availableWidth = 400;
                  const slotWidth = availableWidth / barCount;
                  const barWidth = 26;
                  const x = 35 + slotWidth * idx + (slotWidth - barWidth) / 2;

                  const score = Math.min(100, Math.max(0, item.score || 0));
                  const barHeight = (score / 100) * 160;
                  const y = 180 - barHeight;

                  const maxScore = Math.max(...data.map((d) => d.score || 0));
                  const isHighest =
                    maxScore > 0 &&
                    (item.isHighlight ?? score === maxScore);

                  const fillColor = isHighest ? "#183256" : "#B3B8BF";

                  return (
                    <g
                      key={item.section || idx}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      style={{ cursor: "pointer" }}
                    >
                      {hoveredIndex === idx && (
                        <g>
                          <rect
                            x={x + barWidth / 2 - 25}
                            y={Math.max(5, y - 26)}
                            width="50"
                            height="20"
                            rx="4"
                            fill="#1E293B"
                          />
                          <text
                            x={x + barWidth / 2}
                            y={Math.max(5, y - 26) + 14}
                            textAnchor="middle"
                            fill="#FFFFFF"
                            fontSize="11"
                            fontWeight="600"
                          >
                            {score}%
                          </text>
                        </g>
                      )}

                      {score > 0 && (
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(barHeight, 8)}
                          rx={barWidth / 2}
                          ry={barWidth / 2}
                          fill={fillColor}
                          className="adviser-dashboard__bar-pill"
                        />
                      )}

                      <text
                        x={x + barWidth / 2}
                        y="202"
                        textAnchor="middle"
                        className="adviser-dashboard__chart-x-label"
                      >
                        {item.section}
                      </text>
                    </g>
                  );
                })
              )}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
