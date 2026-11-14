import { SkeletonBlock } from '../common/PageSkeleton.jsx';
import React from "react";
import { useDashboardInView, useProgressValue } from "./useDashboardProgressAnimation.js";

function AnimatedStatValue({ value }) {
  const [valueRef, isVisible] = useDashboardInView();
  const text = String(value ?? "—");
  const match = text.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  const target = match ? Number(match[2].replace(/,/g, "")) : 0;
  const animatedValue = useProgressValue(target, isVisible);
  const decimalPlaces = match?.[2].split(".")[1]?.length || 0;
  const displayValue = !match
    ? text
    : animatedValue >= target
      ? text
      : `${match[1]}${animatedValue.toFixed(decimalPlaces)}${match[3]}`;

  return <span ref={valueRef}>{displayValue}</span>;
}

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
  animateValue = false,
  animateSubtitle = false,
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
        {animateValue ? <AnimatedStatValue value={value} /> : value ?? "—"}
      </div>
      {subtitle && (
        <div
          className={`adviser-dashboard__stat-subtitle adviser-dashboard__stat-subtitle--${subtitleType}`}
        >
          {animateSubtitle ? <AnimatedStatValue value={subtitle} /> : subtitle}
        </div>
      )}
    </div>
  );
}
