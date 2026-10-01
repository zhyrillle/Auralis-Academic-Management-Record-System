import React, { useState } from "react";

export default function AdviserCoreValuesDonut({
  data = [],
  term = "T1",
  onTermChange,
  loading = false,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const terms = ["T1", "T2", "T3"];

  const defaultLegend = [
    { key: "maka_diyos", label: "Maka-Diyos", color: "#7B661F" },
    { key: "makatao", label: "Makatao", color: "#C19B26" },
    { key: "makakalikasan", label: "Makakalikasan", color: "#E8B82B" },
    { key: "makabansa", label: "Makabansa", color: "#F6D339" },
  ];

  const segments = Array.isArray(data) ? data : [];
  const total = segments.reduce((sum, s) => sum + (s.percent || 0), 0);
  const hasData = total > 0;

  // Donut SVG parameters
  const cx = 100;
  const cy = 100;
  const radius = 68;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const paths = segments.map((seg) => {
    const pct = hasData ? (seg.percent / total) * 100 : 0;
    const strokeDasharray = `${(pct / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((cumulativePercent / 100) * circumference);
    cumulativePercent += pct;
    return { ...seg, pct, strokeDasharray, strokeDashoffset };
  });

  return (
    <div className="adviser-dashboard__core-values-card">
      <h3 className="adviser-dashboard__core-values-heading">
        Core Values: Term Comparison
      </h3>

      {/* Legend */}
      <div className="adviser-dashboard__core-legend">
        {defaultLegend.map((item) => (
          <span key={item.key} className="adviser-dashboard__core-legend-item">
            <span
              className="adviser-dashboard__core-legend-dot"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {/* Donut Chart with Center Term Label */}
      <div className="adviser-dashboard__core-donut-wrap">
        {loading ? (
          <div className="adviser-dashboard__skeleton-circle" />
        ) : (
          <div className="adviser-dashboard__core-donut-inner">
            <svg
              viewBox="0 0 200 200"
              className="adviser-dashboard__core-donut-svg"
            >
              {hasData ? (
                <g transform="rotate(-90 100 100)">
                  {paths.map((p, idx) => (
                    <circle
                      key={p.key || idx}
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={hoveredIdx === idx ? strokeWidth + 4 : strokeWidth}
                      strokeDasharray={p.strokeDasharray}
                      strokeDashoffset={p.strokeDashoffset}
                      strokeLinecap="butt"
                      style={{
                        cursor: "pointer",
                        transition: "stroke-width 0.2s ease",
                      }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  ))}
                </g>
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke="rgba(216, 166, 42, 0.25)"
                  strokeWidth={strokeWidth}
                />
              )}
            </svg>

            {/* Center Label */}
            <div className="adviser-dashboard__core-donut-center">
              <span className="adviser-dashboard__core-center-term">{term}</span>
              {hasData && hoveredIdx !== null && (
                <span className="adviser-dashboard__core-center-sub">
                  {segments[hoveredIdx]?.percent}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Term Pills */}
      <div className="adviser-dashboard__core-term-pills">
        {terms.map((t) => (
          <button
            key={t}
            type="button"
            className={`adviser-dashboard__term-pill-gold ${term === t ? "active" : ""}`}
            onClick={() => onTermChange && onTermChange(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
