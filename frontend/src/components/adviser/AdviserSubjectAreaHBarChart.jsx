import React, { useState } from "react";

export default function AdviserSubjectAreaHBarChart({
  data = null,
  term = "T1",
  onTermChange,
  loading = false,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const terms = ["T1", "T2", "T3"];
  const xTicks = [0, 50, 100, 150, 200];

  const defaultSubjects = [
    { subject: "Filipino", subjectName: "Filipino", count: 11, grade: 85.9 },
    { subject: "English", subjectName: "English", count: 11, grade: 85.9 },
    { subject: "Mathematics", subjectName: "Mathematics", count: 11, grade: 79.6 },
    { subject: "Science", subjectName: "Science", count: 11, grade: 85.9 },
    { subject: "AP", subjectName: "Araling Panlipunan", count: 11, grade: 85.9 },
    { subject: "TLE", subjectName: "Technology and Livelihood Education", count: 11, grade: 85.9 },
    { subject: "MAPEH", subjectName: "MAPEH", count: 11, grade: 85.9 },
    { subject: "ESP", subjectName: "Edukasyon sa Pagpapakatao", count: 11, grade: 85.9 },
  ];

  const items =
    data?.subjects && data.subjects.length > 0
      ? data.subjects
      : data?.adviserSectionSubjects && data.adviserSectionSubjects.length > 0
      ? data.adviserSectionSubjects
      : Array.isArray(data) && data.length > 0
      ? data
      : defaultSubjects;

  const sectionName = data?.sectionName || data?.advisorySectionName || "Mahogany";

  const chartWidth = 520;
  const rowHeight = 28;
  const topPad = 16;
  const bottomPad = 28;
  const chartHeight = topPad + items.length * rowHeight + bottomPad;
  const leftLabelPad = 95;
  const rightPad = 35;
  const plotWidth = chartWidth - leftLabelPad - rightPad;
  const plotHeight = items.length * rowHeight;

  return (
    <div className="adviser-dashboard__chart-card">
      <div className="adviser-dashboard__chart-header">
        <div>
          <h3 className="adviser-dashboard__chart-title">
            Subject Area Performance Breakdown
          </h3>
          {sectionName && (
            <span className="adviser-dashboard__hbar-section-subtitle">
              Section: <strong>{sectionName}</strong>
            </span>
          )}
        </div>
        <div className="adviser-dashboard__term-pills">
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              className={`adviser-dashboard__term-circle-pill ${term === t ? "active" : ""}`}
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
                    y={topPad + plotHeight + 18}
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
              const barThickness = 14;
              const y = topPad + rowHeight * idx + (rowHeight - barThickness) / 2;
              const scoreVal = Number(item.grade || item.count || 85);
              const barVal = item.grade ? Math.min(200, Math.round(scoreVal * 2)) : Math.min(200, scoreVal);
              const barWidth = (barVal / 200) * plotWidth;
              const isHovered = hoveredIndex === idx;

              return (
                <g
                  key={item.subject || idx}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
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
                    fill={isHovered ? "#16345F" : "#234B7C"}
                    className="adviser-dashboard__hbar-pill"
                  />

                  {/* Hover tooltip */}
                  {isHovered && (
                    <g>
                      <rect
                        x={Math.min(chartWidth - 110, leftLabelPad + barWidth + 8)}
                        y={y - 5}
                        width="100"
                        height="24"
                        rx="4"
                        fill="#1E293B"
                      />
                      <text
                        x={Math.min(chartWidth - 110, leftLabelPad + barWidth + 8) + 50}
                        y={y + 11}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {item.grade ? `Avg: ${item.grade}%` : `${item.count} students`}
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
