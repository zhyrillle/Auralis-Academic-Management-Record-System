import React, { useState } from "react";

const SEGMENT_COLORS = {
  high: "#dc2626",    // Red
  medium: "#d97706",  // Amber / Gold
  low: "#16a34a",     // Green
};

const SEGMENT_LABELS = {
  high: "High Risk",
  medium: "Medium Risk",
  low: "Low Risk",
};

export default function OverallDistributionChart({ data, loading }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  if (loading) {
    return (
      <div className="ar-chart-card">
        <div className="ar-chart-header">
          <h2 className="ar-chart-title">OVERALL DISTRIBUTION</h2>
        </div>
        <div className="ar-skeleton-ring" />
      </div>
    );
  }

  const highCount = data?.high?.count || 0;
  const mediumCount = data?.medium?.count || 0;
  const lowCount = data?.low?.count || 0;
  const total = data?.totalFlagged || (highCount + mediumCount + lowCount);

  // Calculate percentages
  const highPct = total > 0 ? Math.round((highCount / total) * 100) : 0;
  const medPct = total > 0 ? Math.round((mediumCount / total) * 100) : 0;
  const lowPct = total > 0 ? Math.max(0, 100 - highPct - medPct) : 0;

  // Pie angles & sizing
  const SIZE = 260;
  const CENTER = SIZE / 2;
  const OUTER_R = 92;
  const INNER_R = 56;
  const GAP_DEG = 3; // gap between segments

  const toRad = (deg) => (deg * Math.PI) / 180;

  // Active segments definition
  const rawSegments = [
    { key: "medium", label: "Medium", count: mediumCount, percent: medPct, color: SEGMENT_COLORS.medium, badgeBg: "#d97706" },
    { key: "low", label: "Low", count: lowCount, percent: lowPct, color: SEGMENT_COLORS.low, badgeBg: "#16a34a" },
    { key: "high", label: "High", count: highCount, percent: highPct, color: SEGMENT_COLORS.high, badgeBg: "#dc2626" },
  ];

  // Distribute slice angles evenly if total is 0 or display actual proportional sweeps
  const displayTotal = rawSegments.reduce((sum, s) => sum + (s.percent > 0 ? s.percent : 0), 0);

  let currentAngle = -90;
  const paths = rawSegments.map((seg) => {
    const isHovered = hoveredKey === seg.key;
    const effectivePct = displayTotal > 0 ? (seg.percent > 0 ? seg.percent : 0) : 33.33;
    const sweep = Math.max(0, (effectivePct / (displayTotal || 100)) * 360 - (effectivePct > 0 ? GAP_DEG : 0));
    
    const start = currentAngle;
    const end = currentAngle + sweep;
    const mid = start + sweep / 2;
    currentAngle += (effectivePct / (displayTotal || 100)) * 360;

    const rOuter = isHovered ? OUTER_R + 6 : OUTER_R;
    const rInner = isHovered ? INNER_R - 2 : INNER_R;

    const sx = CENTER + rOuter * Math.cos(toRad(start));
    const sy = CENTER + rOuter * Math.sin(toRad(start));
    const ex = CENTER + rOuter * Math.cos(toRad(end));
    const ey = CENTER + rOuter * Math.sin(toRad(end));

    const ix1 = CENTER + rInner * Math.cos(toRad(start));
    const iy1 = CENTER + rInner * Math.sin(toRad(start));
    const ix2 = CENTER + rInner * Math.cos(toRad(end));
    const iy2 = CENTER + rInner * Math.sin(toRad(end));

    const large = sweep > 180 ? 1 : 0;

    let d = "";
    if (sweep > 0) {
      d = [
        `M ${ix1} ${iy1}`,
        `L ${sx} ${sy}`,
        `A ${rOuter} ${rOuter} 0 ${large} 1 ${ex} ${ey}`,
        `L ${ix2} ${iy2}`,
        `A ${rInner} ${rInner} 0 ${large} 0 ${ix1} ${iy1}`,
        "Z",
      ].join(" ");
    }

    // Outer badge position relative to slice midpoint
    const badgeR = OUTER_R + 24;
    const bx = CENTER + badgeR * Math.cos(toRad(mid));
    const by = CENTER + badgeR * Math.sin(toRad(mid));

    return { ...seg, d, bx, by, mid, isHovered };
  });

  const activeSegment = rawSegments.find((s) => s.key === hoveredKey);

  return (
    <div className="ar-chart-card">
      <div className="ar-chart-header">
        <h2 className="ar-chart-title">OVERALL DISTRIBUTION</h2>
        <div className="ar-chart-legend-top">
          {rawSegments.map((s) => (
            <span
              key={s.key}
              className={`ar-legend-dot-item ${hoveredKey === s.key ? "active-legend" : ""}`}
              onMouseEnter={() => setHoveredKey(s.key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{ cursor: "pointer" }}
            >
              <span className="ar-legend-dot-circle" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="ar-donut-chart-container">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ar-overall-donut-svg">
          {paths.map((p) => (
            p.d && (
              <path
                key={p.key}
                d={p.d}
                fill={p.color}
                className={`ar-donut-path-segment ${p.isHovered ? "segment-hovered" : ""}`}
                onMouseEnter={() => setHoveredKey(p.key)}
                onMouseLeave={() => setHoveredKey(null)}
                style={{
                  cursor: "pointer",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  filter: p.isHovered ? `drop-shadow(0 4px 10px ${p.color}88)` : "none",
                  opacity: hoveredKey && !p.isHovered ? 0.6 : 1,
                }}
              />
            )
          ))}
        </svg>

        {/* Outer Percentage Badges */}
        {paths.map((p) => (
          <div
            key={p.key}
            className={`ar-donut-badge-pill ar-badge-pos-${p.key} ${p.isHovered ? "badge-hovered" : ""}`}
            style={{
              backgroundColor: p.badgeBg,
              cursor: "pointer",
              transform: p.isHovered ? "scale(1.15)" : "scale(1)",
              boxShadow: p.isHovered ? `0 6px 16px ${p.badgeBg}99` : "0 3px 8px rgba(0,0,0,0.12)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={() => setHoveredKey(p.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            {p.percent}%
          </div>
        ))}

        {/* Center Text (Dynamic on Hover) */}
        <div className="ar-donut-center-content">
          {activeSegment ? (
            <>
              <span className="ar-donut-center-num" style={{ color: activeSegment.color }}>
                {activeSegment.count}
              </span>
              <span className="ar-donut-center-sub" style={{ fontWeight: 600, color: "#1e293b" }}>
                {SEGMENT_LABELS[activeSegment.key]}
              </span>
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                {activeSegment.percent}% of total
              </span>
            </>
          ) : (
            <>
              <span className="ar-donut-center-num">{total}</span>
              <span className="ar-donut-center-sub">flagged</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
