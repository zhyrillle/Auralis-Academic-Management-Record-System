import React from "react";

export default function AdviserStatCard({
  title,
  value,
  subtitle,
  subtitleType = "default", // 'positive', 'warning', 'danger', 'default'
  accentColor,
  topBorderColor,
  loading = false,
  className = "",
}) {
  if (loading) {
    return (
      <div className={`adviser-dashboard__stat-card adviser-dashboard__stat-card--skeleton ${className}`}>
        <div className="adviser-dashboard__skeleton-line adviser-dashboard__skeleton-line--short" />
        <div className="adviser-dashboard__skeleton-line adviser-dashboard__skeleton-line--title" />
      </div>
    );
  }

  const cardStyle = topBorderColor
    ? { borderTop: `4px solid ${topBorderColor}` }
    : {};

  return (
    <div
      className={`adviser-dashboard__stat-card ${className}`}
      style={cardStyle}
    >
      <div className="adviser-dashboard__stat-label">{title}</div>
      <div
        className="adviser-dashboard__stat-value"
        style={accentColor ? { color: accentColor } : {}}
      >
        {value ?? "—"}
      </div>
      {subtitle && (
        <div
          className={`adviser-dashboard__stat-subtitle adviser-dashboard__stat-subtitle--${subtitleType}`}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

