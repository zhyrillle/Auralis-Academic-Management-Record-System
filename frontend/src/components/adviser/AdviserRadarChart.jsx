import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function AdviserRadarChart({
  data = [0, 0, 0, 0, 0],
  categories = ["60-74", "90-100", "85-89", "80-84", "75-79"],
  term = "T1",
  onTermChange,
  section = "All",
  onSectionChange,
  sections = ["All", "Gemelina", "Mahogany", "Narra", "Tanguile"],
  loading = false,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const terms = ["T1", "T2", "T3"];

  const cx = 160;
  const cy = 155;
  const maxRadius = 85;
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  const angles = [
    -Math.PI / 2, // 60-74 (Top)
    -Math.PI / 2 + (2 * Math.PI) / 5, // 90-100 (Top-Right)
    -Math.PI / 2 + (4 * Math.PI) / 5, // 85-89 (Bottom-Right)
    -Math.PI / 2 + (6 * Math.PI) / 5, // 80-84 (Bottom-Left)
    -Math.PI / 2 + (8 * Math.PI) / 5, // 75-79 (Top-Left)
  ];

  const getCoordinates = (angle, radius) => {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  const getPentagonPoints = (scale) => {
    return angles
      .map((angle) => {
        const pt = getCoordinates(angle, maxRadius * scale);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  };

  const safeData = Array.isArray(data) && data.length === 5 ? data : [0, 0, 0, 0, 0];
  const hasNonZero = safeData.some((v) => Number(v) > 0);

  const dataPoints = safeData.map((val, idx) => {
    const num = Number(val) || 0;
    const scale = num > 0 ? Math.min(1, Math.max(0.1, num / 100)) : 0;
    return getCoordinates(angles[idx], maxRadius * scale);
  });
  const dataPointsString = dataPoints.map((pt) => `${pt.x},${pt.y}`).join(" ");

  const labelOffsets = [
    { x: cx, y: cy - maxRadius - 16, anchor: "middle" }, // 60-74
    { x: cx + maxRadius + 24, y: cy - maxRadius * 0.3, anchor: "start" }, // 90-100
    { x: cx + maxRadius * 0.65, y: cy + maxRadius + 20, anchor: "middle" }, // 85-89
    { x: cx - maxRadius * 0.65, y: cy + maxRadius + 20, anchor: "middle" }, // 80-84
    { x: cx - maxRadius - 24, y: cy - maxRadius * 0.3, anchor: "end" }, // 75-79
  ];

  return (
    <div className="adviser-dashboard__radar-card">
      <div className="adviser-dashboard__radar-top-row">
        <h3 className="adviser-dashboard__radar-heading">
          Grade Range Distribution
        </h3>
      </div>

      <div className="adviser-dashboard__radar-controls-row">
        {/* Section Dropdown */}
        <div className="adviser-dashboard__radar-dropdown-wrap">
          <button
            type="button"
            className="adviser-dashboard__radar-dropdown-btn"
            onClick={() => setDropdownOpen((prev) => !prev)}
          >
            <span>{section === "All" ? "Section" : section}</span>
            <ChevronDown size={16} />
          </button>
          {dropdownOpen && (
            <div className="adviser-dashboard__radar-dropdown-menu">
              {sections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`adviser-dashboard__radar-dropdown-item ${section === sec ? "active" : ""}`}
                  onClick={() => {
                    onSectionChange && onSectionChange(sec);
                    setDropdownOpen(false);
                  }}
                >
                  {sec}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Term Pills */}
        <div className="adviser-dashboard__term-pills-gold">
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

      <div className="adviser-dashboard__radar-body">
        {loading ? (
          <div className="adviser-dashboard__skeleton-radar" />
        ) : (
          <svg
            viewBox="0 0 320 300"
            className="adviser-dashboard__radar-svg"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Concentric Pentagon Rings */}
            {rings.map((scale, i) => (
              <polygon
                key={i}
                points={getPentagonPoints(scale)}
                fill={i === 2 || i === 3 ? "rgba(224, 169, 38, 0.18)" : "none"}
                stroke="#D8A62A"
                strokeWidth="1.2"
              />
            ))}

            {/* Axis Radial Lines */}
            {angles.map((angle, i) => {
              const outerPt = getCoordinates(angle, maxRadius);
              return (
                <line
                  key={i}
                  x1={cx}
                  y1={cy}
                  x2={outerPt.x}
                  y2={outerPt.y}
                  stroke="#D8A62A"
                  strokeWidth="1"
                  strokeOpacity="0.8"
                />
              );
            })}

            {/* Filled data polygon only if data exists */}
            {hasNonZero ? (
              <>
                <polygon
                  points={dataPointsString}
                  fill="rgba(24, 50, 86, 0.08)"
                  stroke="#183256"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {dataPoints.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill="#183256"
                  />
                ))}
              </>
            ) : (
              <circle cx={cx} cy={cy} r="3" fill="#D8A62A" />
            )}

            {/* Category Labels */}
            {categories.map((cat, i) => {
              const offset = labelOffsets[i] || { x: cx, y: cy, anchor: "middle" };
              return (
                <text
                  key={cat}
                  x={offset.x}
                  y={offset.y}
                  textAnchor={offset.anchor}
                  className="adviser-dashboard__radar-label"
                >
                  {cat}
                </text>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
