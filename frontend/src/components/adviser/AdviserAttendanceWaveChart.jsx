import React, { useState } from "react";

export default function AdviserAttendanceWaveChart({
  data = [
    { week: "Week 1", count: 0 },
    { week: "Week 2", count: 0 },
    { week: "Week 3", count: 0 },
    { week: "Week 4", count: 0 },
    { week: "Week 5", count: 0 },
  ],
  loading = false,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const yTicks = [200, 150, 100, 50, 0];
  const chartHeight = 160;
  const chartWidth = 420;
  const leftPad = 35;
  const topPad = 20;

  const points = data.map((item, idx) => {
    const x =
      leftPad + (idx / Math.max(1, data.length - 1)) * (chartWidth - leftPad - 15);
    const count = Math.min(200, Math.max(0, item.count || 0));
    const y = topPad + ((200 - count) / 200) * chartHeight;
    return { x, y, count, label: item.week || `Week ${idx + 1}` };
  });

  const hasNonZero = points.some((p) => p.count > 0);

  const createSmoothPath = (pts) => {
    if (!pts.length) return "";
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const linePath = createSmoothPath(points);
  const bottomY = topPad + chartHeight;
  const areaPath = hasNonZero && points.length
    ? `${linePath} L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`
    : "";

  return (
    <div className="adviser-dashboard__chart-card">
      <div className="adviser-dashboard__chart-header">
        <h3 className="adviser-dashboard__chart-title">
          Attendance Trend Analysis
        </h3>
      </div>

      <div className="adviser-dashboard__attendance-chart-body">
        {loading ? (
          <div className="adviser-dashboard__skeleton-chart" />
        ) : (
          <svg
            viewBox="0 0 440 230"
            className="adviser-dashboard__wave-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="adviserWaveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4173B8" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#7FA5DC" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines and Y labels */}
            {yTicks.map((tick) => {
              const y = topPad + ((200 - tick) / 200) * chartHeight;
              return (
                <g key={tick}>
                  <text
                    x={leftPad - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="adviser-dashboard__chart-axis-label"
                  >
                    {tick}
                  </text>
                  <line
                    x1={leftPad}
                    y1={y}
                    x2={chartWidth}
                    y2={y}
                    stroke={tick === 0 ? "#4A5568" : "#EAEFF5"}
                    strokeWidth={tick === 0 ? "1.5" : "1"}
                  />
                </g>
              );
            })}

            {/* Area Fill only if non-zero */}
            {areaPath && (
              <path d={areaPath} fill="url(#adviserWaveGrad)" />
            )}

            {/* Flat / Smooth Stroke Line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#122A4E"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Data Points & X labels */}
            {points.map((pt, idx) => (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{ cursor: "pointer" }}
              >
                <text
                  x={pt.x}
                  y={bottomY + 16}
                  textAnchor="middle"
                  className="adviser-dashboard__chart-x-label"
                >
                  {pt.label}
                </text>

                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={hoveredIdx === idx ? "5.5" : "3.5"}
                  fill="#122A4E"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />

                {hoveredIdx === idx && (
                  <g>
                    <rect
                      x={pt.x - 24}
                      y={Math.max(5, pt.y - 28)}
                      width="48"
                      height="20"
                      rx="4"
                      fill="#1E293B"
                    />
                    <text
                      x={pt.x}
                      y={Math.max(5, pt.y - 28) + 14}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {pt.count}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
