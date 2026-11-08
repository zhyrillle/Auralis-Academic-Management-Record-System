import { SkeletonBlock } from '../common/PageSkeleton.jsx';
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
  onClick,
  clickable = false,
}) {
  if (loading) {
    return (
      <div className={`adviser-dashboard__stat-card adviser-dashboard__stat-card--skeleton ${className}`} role="status" aria-busy="true" aria-label={`Loading ${title}`}>
        <SkeletonBlock className="adviser-dashboard__skeleton-line adviser-dashboard__skeleton-line--short" />
        <SkeletonBlock className="adviser-dashboard__skeleton-line adviser-dashboard__skeleton-line--title" />
      </div>
    );
  }

  const isClickable = Boolean(onClick || clickable);

  const cardStyle = {
    ...(topBorderColor ? { borderTop: `4px solid ${topBorderColor}` } : {}),
    ...(isClickable ? { cursor: "pointer" } : {}),
  };

  const handleKeyDown = (e) => {
    if (isClickable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onClick?.(e);
    }
  };

  return (
    <div
      className={`adviser-dashboard__stat-card ${isClickable ? "adviser-dashboard__stat-card--clickable" : ""} ${className}`}
      style={cardStyle}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      aria-label={isClickable ? `${title}: ${value ?? "—"}. Click to view details.` : undefined}
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
